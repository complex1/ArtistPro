import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { loadGlbAsset } from './assets'
import { loadImagePlane } from './imagePlane'
import { hasLockedDescendant, isEffectivelyLocked, isEffectivelyVisible } from './groups'
import { getFloorPosition, getVisibleBounds } from './stageGeometry'
import { applyPose, createFigure, createProp, disposeObject, readPose, solveTwoBoneIK, type StageObject } from './rig'
import type { NavigationMode, SceneDocument, SceneObject, ShotCamera, TransformMode, Vec3, WorkspaceMode } from './types'

export interface SceneStageHandle {
  isTransforming: () => boolean
  exportPng: () => Promise<string>
  captureCamera: () => ShotCamera
  frameSelected: () => void
  resetView: () => void
  setView: (view: 'front' | 'side' | 'top' | 'perspective' | 'camera') => void
  placeOnFloor: () => void
}

export interface SceneStageProps {
  document: SceneDocument
  selectedId: string | null
  selectedBone: string | null
  mode: WorkspaceMode
  transformMode: TransformMode
  navigationMode: NavigationMode
  onSelect: (id: string | null, bone?: string | null) => void
  onCommitObject: (id: string, patch: Partial<SceneObject>) => void
  onError?: (message: string) => void
}

type View = Parameters<SceneStageHandle['setView']>[0]
type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera
interface Entry {
  model: StageObject
  signature: string
  originals: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
  clay: THREE.MeshStandardMaterial
  silhouette: THREE.MeshBasicMaterial
}

const DEFAULT_POSITION: Vec3 = [3.3, 2.7, 4.3]
const DEFAULT_TARGET: Vec3 = [0, .85, 0]

function makeCamera(camera: ShotCamera, aspect: number): Camera {
  const result = camera.projection === 'orthographic'
    ? new THREE.OrthographicCamera(-camera.orthoSize * aspect / 2, camera.orthoSize * aspect / 2, camera.orthoSize / 2, -camera.orthoSize / 2, .01, 500)
    : new THREE.PerspectiveCamera(camera.fov, aspect, .01, 500)
  result.position.fromArray(camera.position)
  const target = new THREE.Vector3().fromArray(camera.target)
  const backward = result.position.clone().sub(target).normalize()
  result.up.applyAxisAngle(backward, camera.roll)
  result.lookAt(target)
  result.updateMatrixWorld(true)
  return result
}

class StageRuntime implements SceneStageHandle {
  readonly host: HTMLDivElement
  props: SceneStageProps
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  content = new THREE.Group()
  helpers = new THREE.Group()
  markers = new THREE.Group()
  editor: Camera = new THREE.PerspectiveCamera(40, 1, .01, 500)
  shot: Camera
  orbit: OrbitControls<Camera>
  transform: TransformControls
  floor: THREE.Mesh
  grid: THREE.GridHelper
  keyLight = new THREE.DirectionalLight('#fff9ed', 3)
  ambient = new THREE.HemisphereLight('#ffffff', '#77818b', 1.6)
  entries = new Map<string, Entry>()
  pending = new Map<string, string>()
  failedAssets = new Set<string>()
  selection: THREE.Box3Helper
  ikTarget = new THREE.Object3D()
  ikChain: { upper: THREE.Object3D; middle: THREE.Object3D; end: THREE.Object3D; pole: THREE.Vector3 } | null = null
  gesture: { id: string; object: SceneObject } | null = null
  resizeObserver: ResizeObserver
  width = 1
  height = 1
  preview = { x: 0, y: 0, width: 0, height: 0 }
  frame = 0
  disposed = false
  moved = false
  pointerStart: { x: number; y: number; gizmo: boolean } | null = null

  constructor(host: HTMLDivElement, props: SceneStageProps) {
    this.host = host
    this.props = props
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none'
    this.renderer.domElement.tabIndex = 0
    this.renderer.domElement.setAttribute('aria-label', '3D scene viewport. Drag to orbit, scroll to zoom, click a subject to select it.')
    host.append(this.renderer.domElement)
    this.scene.add(this.content, this.helpers, this.keyLight, this.ambient, this.keyLight.target)
    this.helpers.add(this.markers, this.ikTarget)
    this.editor.position.fromArray(DEFAULT_POSITION)
    this.orbit = new OrbitControls(this.editor, this.renderer.domElement)
    this.orbit.target.fromArray(DEFAULT_TARGET)
    this.orbit.minDistance = .25
    this.orbit.maxDistance = 70
    this.orbit.maxPolarAngle = Math.PI * .97
    this.orbit.enableDamping = false
    this.orbit.update()
    this.orbit.addEventListener('change', this.invalidate)
    this.transform = new TransformControls(this.editor, this.renderer.domElement)
    this.transform.setSize(.82)
    this.helpers.add(this.transform.getHelper())
    this.transform.addEventListener('change', this.invalidate)
    this.transform.addEventListener('dragging-changed', event => { this.orbit.enabled = !event.value })
    this.transform.addEventListener('mouseDown', this.beginGesture)
    this.transform.addEventListener('objectChange', this.objectChanged)
    this.transform.addEventListener('mouseUp', this.endGesture)
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: props.document.floor.color, roughness: 1 }))
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -.006
    this.floor.receiveShadow = true
    this.scene.add(this.floor)
    this.grid = new THREE.GridHelper(20, 40, '#6e8c8b', '#a0adaa')
    this.grid.position.y = -.004
    for (const material of Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]) { material.transparent = true; material.opacity = .24 }
    this.helpers.add(this.grid)
    this.selection = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#6be3cc'))
    this.helpers.add(this.selection)
    this.keyLight.shadow.mapSize.set(2048, 2048)
    this.keyLight.shadow.camera.left = -6
    this.keyLight.shadow.camera.right = 6
    this.keyLight.shadow.camera.top = 6
    this.keyLight.shadow.camera.bottom = -6
    this.keyLight.shadow.camera.near = .5
    this.keyLight.shadow.camera.far = 35
    this.keyLight.shadow.normalBias = .025
    this.keyLight.shadow.bias = -.0001
    this.shot = makeCamera(props.document.camera, props.document.width / props.document.height)
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(host)
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp)
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost)
    window.addEventListener('keydown', this.keyDown, true)
    this.sync(props)
    this.resize()
  }

  resize = () => {
    this.width = Math.max(1, this.host.clientWidth)
    this.height = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(this.width, this.height, false)
    const aspect = this.width / this.height
    if (this.editor instanceof THREE.PerspectiveCamera) this.editor.aspect = aspect
    else { const half = (this.editor.top - this.editor.bottom) / 2; this.editor.left = -half * aspect; this.editor.right = half * aspect }
    this.editor.updateProjectionMatrix()
    this.invalidate()
  }

  invalidate = () => {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(this.render)
  }

  render = () => {
    this.frame = 0
    if (this.disposed) return
    this.updateMarkers()
    const selected = this.entries.get(this.props.selectedId ?? '')
    if (selected && this.selection.visible) {
      this.selection.box.copy(getVisibleBounds(selected.model.root))
      this.selection.visible = !this.selection.box.isEmpty()
    }
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.width, this.height)
    this.renderer.render(this.scene, this.editor)
    const aspect = this.props.document.width / this.props.document.height
    const previewWidth = Math.min(208, this.width * .28, (this.height * .27) * aspect)
    const previewHeight = previewWidth / aspect
    if (previewWidth < 70 || previewHeight < 40) { this.preview.width = 0; return }
    const x = this.width - previewWidth - 18, y = 18
    this.preview = { x, y, width: previewWidth, height: previewHeight }
    this.renderer.setScissorTest(true)
    this.renderer.setScissor(x - 2, y - 2, previewWidth + 4, previewHeight + 4)
    this.renderer.setClearColor('#80cabc', 1)
    this.renderer.clear()
    this.renderer.setScissor(x, y, previewWidth, previewHeight)
    this.renderer.setViewport(x, y, previewWidth, previewHeight)
    this.helpers.visible = false
    this.renderer.render(this.scene, this.shot)
    this.helpers.visible = true
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.width, this.height)
  }

  sync(props: SceneStageProps) {
    const previous = this.props
    this.props = props
    const doc = props.document
    this.scene.background = new THREE.Color(doc.background)
    this.floor.visible = doc.floor.visible
    ;(this.floor.material as THREE.MeshStandardMaterial).color.set(doc.floor.color)
    this.grid.visible = doc.floor.grid && doc.floor.visible
    const azimuth = THREE.MathUtils.degToRad(doc.light.azimuth)
    const elevation = THREE.MathUtils.degToRad(doc.light.elevation)
    this.keyLight.position.set(8 * Math.sin(azimuth) * Math.cos(elevation), 8 * Math.sin(elevation), 8 * Math.cos(azimuth) * Math.cos(elevation))
    this.keyLight.target.position.set(0, .7, 0)
    this.keyLight.intensity = doc.light.intensity
    this.keyLight.color.set(doc.light.color)
    this.keyLight.castShadow = doc.light.shadows
    this.ambient.intensity = doc.light.ambient
    this.shot = makeCamera(doc.camera, doc.width / doc.height)
    this.orbit.mouseButtons.LEFT = props.navigationMode === 'pan' ? THREE.MOUSE.PAN : props.navigationMode === 'zoom' ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE
    for (const [id, entry] of this.entries) {
      if (!doc.objects.some(object => object.id === id)) { this.destroyEntry(entry); this.entries.delete(id) }
    }
    for (const id of this.pending.keys()) if (!doc.objects.some(object => object.id === id)) this.pending.delete(id)
    for (const object of doc.objects) {
      const usesAsset = object.kind === 'imported' || object.kind === 'image'
      const signature = `${object.kind}:${object.assetId ?? ''}:${usesAsset || object.kind === 'group' ? '' : object.color}`
      let entry = this.entries.get(object.id)
      if (entry && entry.signature !== signature) { this.destroyEntry(entry); this.entries.delete(object.id); entry = undefined }
      if (!entry) {
        if (usesAsset) {
          const asset = doc.assets.find(item => item.id === object.assetId)
          if (asset && !this.failedAssets.has(`${object.id}:${signature}`) && this.pending.get(object.id) !== signature) {
            this.pending.set(object.id, signature)
            const loading = object.kind === 'image' ? loadImagePlane(asset) : loadGlbAsset(asset)
            void loading.then(model => {
              if (this.disposed || this.pending.get(object.id) !== signature || !this.props.document.objects.some(item => item.id === object.id)) { disposeObject(model.root); return }
              if (this.pending.get(object.id) === signature) this.pending.delete(object.id)
              this.entries.set(object.id, this.createEntry(model, signature, object.id, object.color))
              this.sync(this.props)
            }).catch(error => {
              if (this.pending.get(object.id) !== signature) return
              this.pending.delete(object.id)
              this.failedAssets.add(`${object.id}:${signature}`)
              if (!this.disposed) this.props.onError?.(`Could not load ${object.name}: ${error instanceof Error ? error.message : 'Invalid asset.'}`)
            })
          }
          continue
        }
        const model = object.kind === 'group' ? { root: new THREE.Group(), joints: new Map() }
          : object.kind === 'figure' ? createFigure(object.color) : createProp(object.kind, object.color)
        entry = this.createEntry(model, signature, object.id, object.color)
        this.entries.set(object.id, entry)
      }
      if (!this.gesture || this.gesture.id !== object.id) {
        entry.model.root.position.fromArray(object.position)
        entry.model.root.rotation.set(...object.rotation)
        entry.model.root.scale.fromArray(object.scale)
        applyPose(entry.model, object.pose)
      }
      entry.model.root.visible = object.visible
      entry.clay.color.set(object.color)
      for (const [mesh, original] of entry.originals) mesh.material = object.kind === 'image' ? original : doc.displayStyle === 'silhouette' ? entry.silhouette : object.kind === 'imported' && doc.displayStyle === 'clay' ? entry.clay : original
    }
    // Apply parent links after every root exists; document transforms are already local.
    for (const object of doc.objects) {
      const entry = this.entries.get(object.id)
      if (!entry) continue
      const parent = object.parentId ? this.entries.get(object.parentId)?.model.root : this.content
      if (parent && entry.model.root.parent !== parent) parent.add(entry.model.root)
    }
    this.content.updateMatrixWorld(true)
    if (!this.gesture || previous.selectedId !== props.selectedId || previous.selectedBone !== props.selectedBone || previous.mode !== props.mode || previous.transformMode !== props.transformMode) this.updateSelection()
    this.invalidate()
  }

  createEntry(model: StageObject, signature: string, id: string, color: string): Entry {
    model.root.userData.objectId = id
    this.content.add(model.root)
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    model.root.traverse(node => { if (node instanceof THREE.Mesh) originals.set(node, node.material) })
    return { model, signature, originals, clay: new THREE.MeshStandardMaterial({ color, roughness: .72 }), silhouette: new THREE.MeshBasicMaterial({ color: '#172126' }) }
  }

  destroyEntry(entry: Entry) {
    if (this.transform.object && isDescendant(this.transform.object, entry.model.root)) this.transform.detach()
    // A group owns its transform, not the resources of the scene objects inside it.
    for (const child of [...entry.model.root.children]) {
      if (this.entries.get(child.userData.objectId)?.model.root === child) this.content.add(child)
    }
    entry.model.root.removeFromParent()
    for (const [mesh, original] of entry.originals) mesh.material = original
    disposeObject(entry.model.root)
    entry.clay.dispose()
    entry.silhouette.dispose()
  }

  updateSelection() {
    this.transform.detach()
    this.ikChain = null
    this.selection.visible = false
    disposeObject(this.markers)
    this.markers.clear()
    const entry = this.entries.get(this.props.selectedId ?? '')
    const object = this.props.document.objects.find(item => item.id === this.props.selectedId)
    if (!entry || !object || !isEffectivelyVisible(this.props.document.objects, object.id)) return
    this.selection.visible = this.props.mode === 'arrange' && !getVisibleBounds(entry.model.root).isEmpty()
    if (this.props.mode === 'pose') {
      for (const [name] of entry.model.joints) {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(name === this.props.selectedBone ? .026 : .018, 12, 8), new THREE.MeshBasicMaterial({ color: name === this.props.selectedBone ? '#ffdb80' : '#8cebd9', depthTest: false }))
        marker.userData.jointName = name
        marker.userData.objectId = object.id
        marker.renderOrder = 1000
        this.markers.add(marker)
      }
    }
    if (isEffectivelyLocked(this.props.document.objects, object.id) || (object.kind === 'group' && hasLockedDescendant(this.props.document.objects, object.id)) || (this.props.mode !== 'arrange' && this.props.mode !== 'pose')) return
    if (this.props.mode === 'arrange') {
      this.transform.setMode(this.props.transformMode)
      this.transform.setSpace(this.props.transformMode === 'translate' ? 'world' : 'local')
      this.transform.attach(entry.model.root)
      return
    }
    const name = this.props.selectedBone
    if (object.kind === 'group') return
    const joint = name ? entry.model.joints.get(name) : undefined
    if (!joint) return
    if (object.kind === 'figure' && this.props.transformMode === 'translate' && name && /(Hand|Foot)$/.test(name)) {
      const side = name.startsWith('left') ? 'left' : 'right'
      const isHand = name.endsWith('Hand')
      const upper = entry.model.joints.get(`${side}${isHand ? 'UpperArm' : 'Thigh'}`)!.node
      const middle = entry.model.joints.get(`${side}${isHand ? 'Forearm' : 'Shin'}`)!.node
      this.ikTarget.position.copy(joint.node.getWorldPosition(new THREE.Vector3()))
      const pole = entry.model.root.localToWorld(new THREE.Vector3(side === 'left' ? -.32 : .32, isHand ? 1.0 : .5, isHand ? .8 : 1))
      this.ikChain = { upper, middle, end: joint.node, pole }
      this.transform.setMode('translate')
      this.transform.setSpace('world')
      this.transform.attach(this.ikTarget)
    } else {
      this.transform.setMode('rotate')
      this.transform.setSpace('local')
      this.transform.attach(joint.node)
    }
  }

  updateMarkers() {
    const entry = this.entries.get(this.props.selectedId ?? '')
    if (!entry) return
    entry.model.root.updateWorldMatrix(true, true)
    for (const marker of this.markers.children) {
      const node = entry.model.joints.get(marker.userData.jointName)?.node
      if (node) marker.position.copy(node.getWorldPosition(new THREE.Vector3()))
    }
  }

  beginGesture = () => {
    const object = this.props.document.objects.find(item => item.id === this.props.selectedId)
    if (object && !isEffectivelyLocked(this.props.document.objects, object.id) && !(object.kind === 'group' && hasLockedDescendant(this.props.document.objects, object.id))) this.gesture = { id: object.id, object: structuredClone(object) }
    this.moved = false
  }

  objectChanged = () => {
    if (!this.gesture) return
    this.moved = true
    if (this.gesture.object.kind === 'group' && this.props.mode === 'arrange' && this.props.transformMode === 'scale') {
      const root = this.entries.get(this.gesture.id)?.model.root
      if (root) {
        const axis = this.transform.axis
        const value = axis?.includes('X') ? root.scale.x : axis?.includes('Y') ? root.scale.y : axis?.includes('Z') ? root.scale.z : root.scale.x
        root.scale.setScalar(THREE.MathUtils.clamp(value, .001, 1000))
      }
    }
    if (this.ikChain) {
      const { upper, middle, end, pole } = this.ikChain
      solveTwoBoneIK(upper, middle, end, this.ikTarget.position, pole)
    }
    this.invalidate()
  }

  endGesture = () => {
    const gesture = this.gesture
    this.gesture = null
    if (!gesture || !this.moved) return
    const entry = this.entries.get(gesture.id)
    if (!entry) return
    if (this.props.mode === 'pose') this.props.onCommitObject(gesture.id, { pose: readPose(entry.model) })
    else {
      const root = entry.model.root
      const scale = root.scale.toArray() as Vec3
      if (this.props.transformMode === 'scale') for (let index = 0; index < 3; index++) scale[index] = THREE.MathUtils.clamp(Math.abs(scale[index]), .001, 1000)
      this.props.onCommitObject(gesture.id, { position: root.position.toArray() as Vec3, rotation: [root.rotation.x, root.rotation.y, root.rotation.z], scale })
    }
    this.invalidate()
  }

  keyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.gesture) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const { id, object } = this.gesture
    this.gesture = null
    this.transform.reset()
    const entry = this.entries.get(id)
    if (entry) {
      entry.model.root.position.fromArray(object.position)
      entry.model.root.rotation.set(...object.rotation)
      entry.model.root.scale.fromArray(object.scale)
      applyPose(entry.model, object.pose)
    }
    this.transform.detach()
    this.orbit.enabled = true
    this.updateSelection()
    this.invalidate()
  }

  pointerDown = (event: PointerEvent) => {
    this.pointerStart = { x: event.clientX, y: event.clientY, gizmo: !!this.transform.axis || this.transform.dragging }
  }

  pointerUp = (event: PointerEvent) => {
    const start = this.pointerStart
    this.pointerStart = null
    if (!start || event.button !== 0 || start.gizmo || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = event.clientX - rect.left, y = this.height - (event.clientY - rect.top)
    if (this.preview.width && x >= this.preview.x && x <= this.preview.x + this.preview.width && y >= this.preview.y && y <= this.preview.y + this.preview.height) { this.setView('camera'); return }
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(x / this.width * 2 - 1, (y / this.height) * 2 - 1), this.editor)
    const markers = raycaster.intersectObjects(this.markers.children, true)
    if (this.props.mode === 'pose' && markers[0]) {
      this.props.onSelect(markers[0].object.userData.objectId, markers[0].object.userData.jointName)
      return
    }
    for (const hit of raycaster.intersectObjects(this.content.children, true)) {
      let node: THREE.Object3D | null = hit.object
      let bone: string | null = null
      let id: string | null = null
      let visible = true
      while (node) {
        if (!node.visible) visible = false
        if (!bone && node.userData.jointName) bone = node.userData.jointName
        if (!id && this.entries.get(node.userData.objectId)?.model.root === node) id = node.userData.objectId
        node = node.parent
      }
      if (id && visible) { this.props.onSelect(id, this.props.mode === 'pose' ? bone : null); return }
    }
    this.props.onSelect(null)
  }

  captureCamera = (): ShotCamera => {
    const neutral = new THREE.PerspectiveCamera()
    neutral.position.copy(this.editor.position)
    neutral.lookAt(this.orbit.target)
    const difference = neutral.quaternion.invert().multiply(this.editor.quaternion)
    return {
      position: this.editor.position.toArray() as Vec3,
      target: this.orbit.target.toArray() as Vec3,
      projection: this.editor instanceof THREE.PerspectiveCamera ? 'perspective' : 'orthographic',
      fov: this.editor instanceof THREE.PerspectiveCamera ? this.editor.fov : this.props.document.camera.fov,
      orthoSize: this.editor instanceof THREE.OrthographicCamera ? (this.editor.top - this.editor.bottom) / this.editor.zoom : this.props.document.camera.orthoSize,
      roll: new THREE.Euler().setFromQuaternion(difference, 'XYZ').z,
    }
  }

  isTransforming = () => this.transform.dragging || !!this.gesture

  useEditor(camera: Camera, target: THREE.Vector3) {
    this.editor = camera
    this.orbit.object = camera
    this.transform.camera = camera
    this.orbit.target.copy(target)
    this.orbit.update()
    this.resize()
  }

  frameSelected = () => {
    if (this.props.selectedId && !isEffectivelyVisible(this.props.document.objects, this.props.selectedId)) return
    const root = this.entries.get(this.props.selectedId ?? '')?.model.root ?? this.content
    root.updateWorldMatrix(true, true)
    const bounds = getVisibleBounds(root)
    if (bounds.isEmpty()) return
    const center = bounds.getCenter(new THREE.Vector3())
    const size = Math.max(.6, bounds.getSize(new THREE.Vector3()).length())
    const direction = this.editor.position.clone().sub(this.orbit.target).normalize()
    const camera = new THREE.PerspectiveCamera(40, this.width / this.height, .01, 500)
    const fov = THREE.MathUtils.degToRad(40)
    camera.position.copy(center).addScaledVector(direction, size / (2 * Math.sin(fov / 2)) * 1.15)
    this.useEditor(camera, center)
  }

  resetView = () => {
    const camera = new THREE.PerspectiveCamera(40, this.width / this.height, .01, 500)
    camera.position.fromArray(DEFAULT_POSITION)
    this.useEditor(camera, new THREE.Vector3().fromArray(DEFAULT_TARGET))
  }

  setView = (view: View) => {
    if (view === 'perspective') { this.resetView(); return }
    if (view === 'camera') {
      const camera = makeCamera(this.props.document.camera, this.width / this.height)
      this.useEditor(camera, new THREE.Vector3().fromArray(this.props.document.camera.target))
      return
    }
    const target = this.orbit.target.clone()
    const distance = Math.max(2, this.editor.position.distanceTo(target))
    const halfHeight = Math.max(1.3, distance * .35)
    const aspect = this.width / this.height
    const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, .01, 500)
    camera.position.copy(target).add(new THREE.Vector3(...(view === 'front' ? [0, 0, distance] as const : view === 'side' ? [distance, 0, 0] as const : [0, distance, .001] as const)))
    this.useEditor(camera, target)
  }

  placeOnFloor = () => {
    const object = this.props.document.objects.find(item => item.id === this.props.selectedId)
    const entry = this.entries.get(this.props.selectedId ?? '')
    if (!object || !entry || !isEffectivelyVisible(this.props.document.objects, object.id) || isEffectivelyLocked(this.props.document.objects, object.id) || (object.kind === 'group' && hasLockedDescendant(this.props.document.objects, object.id))) return
    const clearance = object.kind === 'image' ? .005 : 0
    const position = getFloorPosition(entry.model.root, clearance)
    if (position) this.props.onCommitObject(object.id, { position })
  }

  exportPng = async (): Promise<string> => {
    const doc = this.props.document
    if (doc.objects.some(object => this.pending.has(object.id) && isEffectivelyVisible(doc.objects, object.id))) throw new Error('Please wait for imported assets to finish loading before exporting.')
    if (doc.objects.some(object => isEffectivelyVisible(doc.objects, object.id) && (object.kind === 'imported' || object.kind === 'image') && !this.entries.has(object.id))) throw new Error('An imported asset could not load. Remove it or hide it before exporting.')
    const background = this.scene.background
    const oldSize = this.renderer.getSize(new THREE.Vector2())
    const oldPixelRatio = this.renderer.getPixelRatio()
    const oldClear = this.renderer.getClearColor(new THREE.Color())
    const oldAlpha = this.renderer.getClearAlpha()
    try {
      this.helpers.visible = false
      this.scene.background = doc.transparent ? null : background
      this.renderer.setClearColor(doc.background, doc.transparent ? 0 : 1)
      this.renderer.setScissorTest(false)
      // Export through the canvas so the browser encodes straight-alpha PNG pixels.
      // Render-target readback contains linear-premultiplied colors and bypasses
      // Three's display tone mapping, which changes translucent images and shading.
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(doc.width, doc.height, false)
      this.renderer.setViewport(0, 0, doc.width, doc.height)
      this.renderer.render(this.scene, this.shot)
      return this.renderer.domElement.toDataURL('image/png')
    } finally {
      this.helpers.visible = true
      this.scene.background = background
      this.renderer.setPixelRatio(oldPixelRatio)
      this.renderer.setSize(oldSize.x, oldSize.y, false)
      this.renderer.setViewport(0, 0, this.width, this.height)
      this.renderer.setClearColor(oldClear, oldAlpha)
      this.invalidate()
    }
  }

  contextLost = (event: Event) => {
    event.preventDefault()
    this.props.onError?.('The 3D graphics context was interrupted. Save or export your project, then reopen the scene to restart the viewport.')
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    window.removeEventListener('keydown', this.keyDown, true)
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.pointerUp)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost)
    this.orbit.dispose()
    this.transform.dispose()
    for (const entry of this.entries.values()) this.destroyEntry(entry)
    disposeObject(this.markers)
    disposeObject(this.floor)
    this.grid.geometry.dispose()
    for (const material of Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]) material.dispose()
    this.selection.geometry.dispose()
    ;(this.selection.material as THREE.Material).dispose()
    this.keyLight.shadow.map?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

function isDescendant(node: THREE.Object3D, parent: THREE.Object3D) {
  let current: THREE.Object3D | null = node
  while (current) { if (current === parent) return true; current = current.parent }
  return false
}

export const SceneStage = forwardRef<SceneStageHandle, SceneStageProps>(function SceneStage(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const runtime = useRef<StageRuntime | null>(null)
  const initialProps = useRef(props)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => {
    if (!host.current) return
    try { runtime.current = new StageRuntime(host.current, initialProps.current) }
    catch (error) {
      const message = `3D rendering is unavailable: ${error instanceof Error ? error.message : 'WebGL could not start.'}`
      // Graphics initialization is an external system and may fail after the host mounts.
      // oxlint-disable-next-line react/set-state-in-effect
      setFailure(message)
      initialProps.current.onError?.(message)
    }
    return () => { runtime.current?.dispose(); runtime.current = null }
  }, [])
  useEffect(() => { runtime.current?.sync(props) }, [props])
  useImperativeHandle(ref, () => ({
    isTransforming: () => runtime.current?.isTransforming() ?? false,
    exportPng: () => runtime.current?.exportPng() ?? Promise.reject(new Error('The 3D viewport is not ready.')),
    captureCamera: () => runtime.current?.captureCamera() ?? props.document.camera,
    frameSelected: () => runtime.current?.frameSelected(),
    resetView: () => runtime.current?.resetView(),
    setView: view => runtime.current?.setView(view),
    placeOnFloor: () => runtime.current?.placeOnFloor(),
  }), [props.document.camera])
  return <div className="reference3d-stage" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 240 }}>
    <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    {failure && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center', background: '#172127', color: '#e4eeee' }}>{failure}</div>}
    {!failure && <div aria-hidden="true" style={{ position: 'absolute', right: 22, bottom: 23, padding: '3px 7px', borderRadius: 4, background: '#132322b8', color: '#fff', font: '9px Inter, sans-serif', pointerEvents: 'none', letterSpacing: '.09em' }}>SHOT PREVIEW · CLICK TO VIEW</div>}
  </div>
})
