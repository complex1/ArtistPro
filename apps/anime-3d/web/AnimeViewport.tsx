import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { evaluatePose } from './model'
import { applyRigPose, createAnimeRig, disposeRig, disposeTree, getIKChain, readRigPose, RIG_JOINTS, setRigAppearance, solveTwoBoneIK } from './rig'
import type { AnimeDocument, JointName, Pose, ShotCamera, Stroke, Vec3 } from './types'

export interface AnimeViewportHandle {
  captureCamera(): ShotCamera
  resetView(view?: 'front' | 'side' | 'top' | 'perspective'): void
  frameCharacter(): void
  exportPng(): Promise<Blob>
}

export interface AnimeViewportProps {
  document: AnimeDocument
  frame: number
  workflow: 'Build' | 'Pose' | 'Draw' | 'Animate' | 'Camera' | 'Render'
  view: 'explore' | 'shot'
  selectedJoint: JointName
  interactive?: boolean
  drawSettings: { plane: 'front' | 'side' | 'top' | 'view'; depth: number; color: string; width: number }
  onPoseCommit(pose: Pose): void
  onStrokeCommit(stroke: Stroke): void
  onJointSelect(joint: JointName): void
  onError(message: string): void
}

interface PoseGesture {
  kind: 'pose'
  id: number
  joint: JointName
  original: Pose
  start: THREE.Vector2
  plane: THREE.Plane
  pole: THREE.Vector3
  changed: boolean
}
interface DrawGesture {
  kind: 'draw'
  id: number
  plane: THREE.Plane
  points: THREE.Vector3[]
  color: string
  width: number
}
type Gesture = PoseGesture | DrawGesture

class AnimeRuntime implements AnimeViewportHandle {
  host: HTMLDivElement
  props: AnimeViewportProps
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  rig = createAnimeRig()
  editor = new THREE.PerspectiveCamera(38, 1, .02, 5000)
  shot = new THREE.PerspectiveCamera(38, 16 / 9, .02, 5000)
  orbit: OrbitControls
  helpers = new THREE.Group()
  markers = new THREE.Group()
  strokeGroup = new THREE.Group()
  strokeMeshes = new Map<string, { stroke: Stroke; mesh: THREE.Mesh }>()
  floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#e3e3e0', roughness: 1 }))
  grid = new THREE.GridHelper(12, 48, '#8993a6', '#b9bec8')
  planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: '#81a9ee', opacity: .1, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
  planeEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(4, 4)), new THREE.LineBasicMaterial({ color: '#8299c0', opacity: .65, transparent: true }))
  cursor = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), new THREE.MeshBasicMaterial({ color: '#8cb4ff', depthTest: false }))
  ghost = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#487ccd', depthTest: true }))
  keyLight = new THREE.DirectionalLight('#ffefe0', 2.6)
  fill = new THREE.HemisphereLight('#ffffff', '#7e879c', 1.45)
  raycaster = new THREE.Raycaster()
  markerMap = new Map<JointName, THREE.Mesh>()
  resizeObserver: ResizeObserver
  gesture: Gesture | null = null
  width = 1
  height = 1
  region = { x: 0, y: 0, width: 1, height: 1 }
  request = 0
  disposed = false
  lost = false
  appearanceSignature = ''
  status: (message: string) => void

  constructor(host: HTMLDivElement, props: AnimeViewportProps, status: (message: string) => void) {
    this.host = host
    this.props = props
    this.status = status
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const canvas = this.renderer.domElement
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-3px'
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Anime 3D viewport. Drag to orbit in Explore. In Pose, drag hand or foot handles. In Draw, drag to draw. Hold Alt to navigate. Escape cancels a gesture.')
    host.append(canvas)
    this.scene.add(this.rig.root, this.strokeGroup, this.floor, this.helpers, this.keyLight, this.fill, this.keyLight.target)
    this.helpers.add(this.grid, this.markers, this.planeMesh, this.planeEdge, this.cursor, this.ghost)
    this.cursor.renderOrder = 20
    this.cursor.visible = false
    this.ghost.visible = false
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -.025
    this.floor.receiveShadow = true
    this.grid.position.y = -.022
    for (const material of Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]) {
      material.transparent = true
      material.opacity = .3
    }
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(1024, 1024)
    Object.assign(this.keyLight.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 20 })
    this.keyLight.shadow.normalBias = .025
    this.keyLight.shadow.bias = -.0002
    this.editor.position.set(4, 2.8, 6)
    this.orbit = new OrbitControls(this.editor, canvas)
    this.orbit.target.set(0, 1.1, 0)
    this.orbit.enableDamping = false
    this.orbit.minDistance = .5
    this.orbit.maxDistance = 45
    this.orbit.maxPolarAngle = Math.PI - .03
    this.orbit.update()
    this.orbit.addEventListener('change', this.orbitChanged)
    const sphere = new THREE.SphereGeometry(.037, 12, 8)
    for (const name of RIG_JOINTS) {
      const marker = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: '#ecf1ff', depthTest: false, transparent: true, opacity: .8 }))
      marker.userData.joint = name
      marker.renderOrder = 10
      this.markers.add(marker)
      this.markerMap.set(name, marker)
    }
    canvas.addEventListener('pointerdown', this.pointerDown, true)
    canvas.addEventListener('pointermove', this.pointerMove, true)
    canvas.addEventListener('pointerup', this.pointerUp, true)
    canvas.addEventListener('pointercancel', this.pointerCancel, true)
    canvas.addEventListener('lostpointercapture', this.pointerCancel, true)
    canvas.addEventListener('pointerleave', this.pointerLeave)
    canvas.addEventListener('webglcontextlost', this.contextLost)
    canvas.addEventListener('webglcontextrestored', this.contextRestored)
    canvas.addEventListener('keydown', this.keyDown)
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(host)
    this.sync(props)
    this.resize()
  }

  get isShot() { return this.props.view === 'shot' || this.props.workflow === 'Render' }
  get camera() { return this.isShot ? this.shot : this.editor }

  sync(props: AnimeViewportProps) {
    if (props.workflow !== this.props.workflow || props.view !== this.props.view) this.status('')
    if (this.gesture && (props.interactive === false || props.document !== this.props.document || props.frame !== this.props.frame || props.workflow !== this.props.workflow || props.view !== this.props.view)) this.cancelGesture()
    this.props = props
    const doc = props.document
    this.rig.root.position.fromArray(doc.character.position)
    this.rig.root.rotation.y = THREE.MathUtils.degToRad(doc.character.rotation)
    this.rig.root.visible = doc.character.visible
    if (!this.gesture || this.gesture.kind !== 'pose') applyRigPose(this.rig, evaluatePose(doc, props.frame))
    const signature = JSON.stringify(doc.appearance)
    if (signature !== this.appearanceSignature) {
      setRigAppearance(this.rig, doc.appearance.characterColor, doc.appearance.celShading, doc.appearance.outlines)
      this.scene.background = new THREE.Color(doc.appearance.background)
      this.floor.material.color.set(doc.appearance.background).multiplyScalar(.91)
      const angle = THREE.MathUtils.degToRad(doc.appearance.lightAzimuth)
      this.keyLight.position.set(Math.sin(angle) * 5, 6, Math.cos(angle) * 5)
      this.keyLight.target.position.set(0, 1, 0)
      this.appearanceSignature = signature
    }
    this.floor.visible = doc.appearance.ground
    this.grid.visible = !this.isShot && doc.appearance.ground
    this.shot.position.fromArray(doc.camera.position)
    this.shot.up.set(0, 1, 0)
    this.shot.fov = doc.camera.fov
    this.shot.lookAt(new THREE.Vector3().fromArray(doc.camera.target))
    this.shot.updateProjectionMatrix()
    this.shot.updateMatrixWorld(true)
    this.orbit.enabled = !this.isShot && !this.gesture && props.interactive !== false
    this.markers.visible = (props.workflow === 'Pose' || props.workflow === 'Animate') && doc.character.visible && !doc.character.locked
    const drawing = props.workflow === 'Draw'
    this.planeMesh.visible = drawing
    this.planeEdge.visible = drawing
    if (!drawing || props.interactive === false) this.cursor.visible = false
    this.updatePlane()
    this.syncStrokes(doc.strokes)
    this.updateMarkers()
    this.invalidate()
  }

  syncStrokes(strokes: Stroke[]) {
    const ids = new Set(strokes.map(stroke => stroke.id))
    for (const [id, entry] of this.strokeMeshes) {
      if (!ids.has(id)) { this.strokeGroup.remove(entry.mesh); disposeTree(entry.mesh); this.strokeMeshes.delete(id) }
    }
    for (const stroke of strokes) {
      const existing = this.strokeMeshes.get(stroke.id)
      if (existing?.stroke === stroke) continue
      if (existing) { this.strokeGroup.remove(existing.mesh); disposeTree(existing.mesh) }
      if (stroke.points.length < 2) continue
      const points = stroke.points.map(point => new THREE.Vector3().fromArray(point))
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(900, Math.max(4, points.length * 2)), stroke.width / 2, 6, false), new THREE.MeshBasicMaterial({ color: stroke.color }))
      mesh.name = `Stroke ${stroke.id}`
      this.strokeGroup.add(mesh)
      this.strokeMeshes.set(stroke.id, { stroke, mesh })
    }
  }

  updateMarkers() {
    this.rig.root.updateMatrixWorld(true)
    for (const [name, marker] of this.markerMap) {
      this.rig.joints[name].node.getWorldPosition(marker.position)
      const selected = name === this.props.selectedJoint
      const material = marker.material as THREE.MeshBasicMaterial
      material.color.set(selected ? '#5999ff' : getIKChain(this.rig, name) ? '#92badc' : '#f1f3f7')
      material.opacity = selected ? 1 : .8
      const distance = this.camera.position.distanceTo(marker.position)
      marker.scale.setScalar(Math.max(.75, distance * .2) * (selected ? 1.35 : 1))
    }
  }

  drawingPlane() {
    const { plane, depth } = this.props.drawSettings
    const normal = plane === 'front' ? new THREE.Vector3(0, 0, 1) : plane === 'side' ? new THREE.Vector3(1, 0, 0) : plane === 'top' ? new THREE.Vector3(0, 1, 0) : this.camera.getWorldDirection(new THREE.Vector3()).negate()
    const center = new THREE.Vector3().fromArray(this.props.document.character.position).add(new THREE.Vector3(0, 1, 0)).addScaledVector(normal, depth)
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center)
  }

  updatePlane() {
    if (this.props.workflow !== 'Draw') return
    const plane = this.gesture?.kind === 'draw' ? this.gesture.plane : this.drawingPlane()
    const center = new THREE.Vector3().fromArray(this.props.document.character.position).add(new THREE.Vector3(0, 1, 0))
    plane.projectPoint(center, center)
    this.planeMesh.position.copy(center)
    this.planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal)
    this.planeEdge.position.copy(center)
    this.planeEdge.quaternion.copy(this.planeMesh.quaternion)
    this.cursor.material.color.set(this.props.drawSettings.color)
  }

  resize = () => {
    if (this.disposed) return
    this.width = Math.max(1, this.host.clientWidth)
    this.height = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(this.width, this.height, false)
    this.editor.aspect = this.width / this.height
    this.editor.updateProjectionMatrix()
    this.invalidate()
  }

  orbitChanged = () => { this.updatePlane(); this.invalidate() }
  invalidate = () => { if (!this.request && !this.disposed && !this.lost) this.request = requestAnimationFrame(this.render) }

  render = () => {
    this.request = 0
    if (this.disposed || this.lost) return
    this.updateMarkers()
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.width, this.height)
    this.renderer.setClearColor('#171b24', 1)
    this.renderer.clear()
    if (this.isShot) {
      const width = Math.min(this.width, this.height * 16 / 9)
      const height = width * 9 / 16
      const x = (this.width - width) / 2, y = (this.height - height) / 2
      this.region = { x, y, width, height }
      this.renderer.setViewport(x, y, width, height)
      this.renderer.setScissor(x, y, width, height)
      this.renderer.setScissorTest(true)
    } else this.region = { x: 0, y: 0, width: this.width, height: this.height }
    this.renderer.render(this.scene, this.camera)
    this.renderer.setScissorTest(false)
  }

  updateRay(event: PointerEvent) {
    const box = this.renderer.domElement.getBoundingClientRect()
    const x = event.clientX - box.left - this.region.x
    const y = event.clientY - box.top - this.region.y
    if (x < 0 || y < 0 || x > this.region.width || y > this.region.height) return false
    this.camera.updateMatrixWorld(true)
    this.raycaster.setFromCamera(new THREE.Vector2(x / this.region.width * 2 - 1, 1 - y / this.region.height * 2), this.camera)
    return true
  }

  hitPlane(plane: THREE.Plane) {
    if (Math.abs(plane.normal.dot(this.raycaster.ray.direction)) < .015) return null
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    return hit && hit.length() < 1000 ? hit : null
  }

  pointerDown = (event: PointerEvent) => {
    if (this.props.interactive === false || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || this.gesture || this.lost) return
    if (!this.updateRay(event)) return
    if (this.props.workflow === 'Draw') {
      const plane = this.drawingPlane()
      const point = this.hitPlane(plane)
      event.stopImmediatePropagation()
      event.preventDefault()
      if (!point) { this.props.onError('The drawing plane is edge-on or behind this view. Orbit the view or choose a different plane.'); return }
      this.gesture = { kind: 'draw', id: event.pointerId, plane, points: [point], color: this.props.drawSettings.color, width: this.props.drawSettings.width }
      this.ghost.material.color.set(this.props.drawSettings.color)
      this.status('Drawing on a frozen world plane · release to commit · Esc to cancel')
    } else if ((this.props.workflow === 'Pose' || this.props.workflow === 'Animate') && this.markers.visible) {
      const hit = this.raycaster.intersectObjects(this.markers.children, false)[0]
      if (!hit) return
      const joint = hit.object.userData.joint as JointName
      const position = this.rig.joints[joint].node.getWorldPosition(new THREE.Vector3())
      const chain = getIKChain(this.rig, joint)
      const pole = chain ? chain.middle.getWorldPosition(new THREE.Vector3()) : position.clone()
      // A stable bend direction remains well-defined in the straight neutral pose.
      pole.add(new THREE.Vector3(0, 0, joint.endsWith('Foot') ? 1 : .5).applyQuaternion(this.rig.root.quaternion))
      this.gesture = { kind: 'pose', id: event.pointerId, joint, original: readRigPose(this.rig), start: new THREE.Vector2(event.clientX, event.clientY), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), position), pole, changed: false }
      this.props.onJointSelect(joint)
      this.status(chain ? 'Drag IK handle · release to auto-key · Esc to cancel' : 'Drag to rotate this joint · release to auto-key · Esc to cancel')
      event.stopImmediatePropagation()
      event.preventDefault()
    } else return
    this.orbit.enabled = false
    this.renderer.domElement.focus({ preventScroll: true })
    this.renderer.domElement.setPointerCapture(event.pointerId)
    this.invalidate()
  }

  pointerMove = (event: PointerEvent) => {
    if (!this.updateRay(event)) return
    const gesture = this.gesture
    if (!gesture) {
      if (this.props.workflow === 'Draw' && this.props.interactive !== false) {
        const point = this.hitPlane(this.drawingPlane())
        this.cursor.visible = !!point && !event.altKey
        if (point) this.cursor.position.copy(point)
        this.invalidate()
      }
      return
    }
    if (gesture.id !== event.pointerId) return
    event.stopImmediatePropagation()
    event.preventDefault()
    if (gesture.kind === 'draw') {
      const point = this.hitPlane(gesture.plane)
      if (!point) return
      const last = gesture.points[gesture.points.length - 1]
      if (last.distanceToSquared(point) < .000016 || gesture.points.length >= 2500) return
      gesture.points.push(point)
      this.ghost.geometry.dispose()
      this.ghost.geometry = new THREE.BufferGeometry().setFromPoints(gesture.points)
      this.ghost.visible = true
      this.cursor.position.copy(point)
    } else {
      if (gesture.start.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 2) return
      applyRigPose(this.rig, gesture.original)
      const chain = getIKChain(this.rig, gesture.joint)
      if (chain) {
        const target = this.hitPlane(gesture.plane)
        if (!target) return
        solveTwoBoneIK(chain.upper, chain.middle, chain.end, target, gesture.pole)
      } else {
        const pose = structuredClone(gesture.original)
        const rotation = pose[gesture.joint]
        rotation[0] = THREE.MathUtils.clamp(rotation[0] + (event.clientY - gesture.start.y) * .5, -180, 180)
        rotation[1] = THREE.MathUtils.clamp(rotation[1] + (event.clientX - gesture.start.x) * .5, -180, 180)
        applyRigPose(this.rig, pose)
      }
      gesture.changed = true
    }
    this.invalidate()
  }

  pointerUp = (event: PointerEvent) => {
    const gesture = this.gesture
    if (!gesture || gesture.id !== event.pointerId) return
    event.stopImmediatePropagation()
    event.preventDefault()
    this.gesture = null
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId)
    this.orbit.enabled = !this.isShot && this.props.interactive !== false
    this.ghost.visible = false
    if (gesture.kind === 'draw' && gesture.points.length > 1) {
      this.props.onStrokeCommit({ id: crypto.randomUUID(), points: gesture.points.map(point => point.toArray() as Vec3), color: gesture.color, width: gesture.width })
      this.status('Stroke committed in world space')
    } else if (gesture.kind === 'pose' && gesture.changed) {
      this.props.onPoseCommit(readRigPose(this.rig))
      this.status(`Pose auto-keyed at frame ${this.props.frame}`)
    } else this.status('')
    this.invalidate()
  }

  cancelGesture() {
    const gesture = this.gesture
    if (!gesture) return
    this.gesture = null
    if (gesture.kind === 'pose') applyRigPose(this.rig, gesture.original)
    this.ghost.visible = false
    if (this.renderer.domElement.hasPointerCapture(gesture.id)) this.renderer.domElement.releasePointerCapture(gesture.id)
    this.orbit.enabled = !this.isShot && this.props.interactive !== false
    this.status('Gesture cancelled')
    this.invalidate()
  }
  pointerCancel = (event: PointerEvent) => { if (this.gesture?.id === event.pointerId) this.cancelGesture() }
  pointerLeave = () => { if (!this.gesture) { this.cursor.visible = false; this.invalidate() } }
  keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && this.gesture) { event.preventDefault(); event.stopPropagation(); this.cancelGesture() } }
  contextLost = (event: Event) => {
    event.preventDefault()
    this.lost = true
    this.cancelGesture()
    this.props.onError('The graphics context was interrupted. Your project is preserved; the viewport will resume when graphics recover.')
  }
  contextRestored = () => { this.lost = false; this.status('Graphics restored'); this.sync(this.props); this.invalidate() }

  captureCamera(): ShotCamera {
    return { position: this.editor.position.toArray() as Vec3, target: this.orbit.target.toArray() as Vec3, fov: this.editor.fov }
  }

  resetView(view: 'front' | 'side' | 'top' | 'perspective' = 'perspective') {
    this.cancelGesture()
    const center = new THREE.Vector3().fromArray(this.props.document.character.position).add(new THREE.Vector3(0, 1, 0))
    const direction = view === 'front' ? new THREE.Vector3(0, 0, 5) : view === 'side' ? new THREE.Vector3(5, 0, 0) : view === 'top' ? new THREE.Vector3(0, 5, .001) : new THREE.Vector3(3, 1.5, 5)
    this.editor.up.set(0, 1, 0)
    this.editor.position.copy(center).add(direction)
    this.orbit.target.copy(center)
    this.orbit.update()
    this.updatePlane()
    this.invalidate()
  }

  frameCharacter() {
    this.cancelGesture()
    const bounds = new THREE.Box3().setFromObject(this.rig.root)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const direction = this.editor.position.clone().sub(this.orbit.target).normalize()
    const distance = Math.max(size.y, size.x / this.editor.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(this.editor.fov / 2))) * 1.35
    this.editor.position.copy(center).addScaledVector(direction, Math.max(1, distance))
    this.orbit.target.copy(center)
    this.orbit.update()
    this.invalidate()
  }

  async exportPng(): Promise<Blob> {
    if (this.lost || this.disposed) throw new Error('The viewport is unavailable. Wait for graphics to recover and retry.')
    this.cancelGesture()
    const { width, height, transparent } = this.props.document.output
    const target = new THREE.WebGLRenderTarget(width, height, { samples: Math.min(4, this.renderer.capabilities.maxSamples) })
    target.texture.colorSpace = THREE.SRGBColorSpace
    const oldTarget = this.renderer.getRenderTarget()
    const background = this.scene.background
    const helperVisibility = this.helpers.visible
    const viewport = this.renderer.getViewport(new THREE.Vector4())
    const scissor = this.renderer.getScissor(new THREE.Vector4())
    const scissorTest = this.renderer.getScissorTest()
    const clear = this.renderer.getClearColor(new THREE.Color())
    const alpha = this.renderer.getClearAlpha()
    try {
      applyRigPose(this.rig, evaluatePose(this.props.document, this.props.frame))
      this.helpers.visible = false
      if (transparent) this.scene.background = null
      this.renderer.setRenderTarget(target)
      this.renderer.setViewport(0, 0, width, height)
      this.renderer.setScissorTest(false)
      this.renderer.setClearColor(this.props.document.appearance.background, transparent ? 0 : 1)
      this.renderer.clear()
      this.renderer.render(this.scene, this.shot)
      const pixels = new Uint8Array(width * height * 4)
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
      const canvas = window.document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not prepare the PNG image.')
      const data = context.createImageData(width, height)
      for (let y = 0; y < height; y++) data.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4)
      context.putImageData(data, 0, 0)
      return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed. Retry the export.')), 'image/png'))
    } finally {
      this.renderer.setRenderTarget(oldTarget)
      this.renderer.setViewport(viewport)
      this.renderer.setScissor(scissor)
      this.renderer.setScissorTest(scissorTest)
      this.renderer.setClearColor(clear, alpha)
      this.scene.background = background
      this.helpers.visible = helperVisibility
      target.dispose()
      this.invalidate()
    }
  }

  dispose() {
    this.disposed = true
    if (this.request) cancelAnimationFrame(this.request)
    this.resizeObserver.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.pointerDown, true)
    canvas.removeEventListener('pointermove', this.pointerMove, true)
    canvas.removeEventListener('pointerup', this.pointerUp, true)
    canvas.removeEventListener('pointercancel', this.pointerCancel, true)
    canvas.removeEventListener('lostpointercapture', this.pointerCancel, true)
    canvas.removeEventListener('pointerleave', this.pointerLeave)
    canvas.removeEventListener('webglcontextlost', this.contextLost)
    canvas.removeEventListener('webglcontextrestored', this.contextRestored)
    canvas.removeEventListener('keydown', this.keyDown)
    this.orbit.removeEventListener('change', this.orbitChanged)
    this.orbit.dispose()
    disposeRig(this.rig)
    disposeTree(this.helpers)
    disposeTree(this.strokeGroup)
    disposeTree(this.floor)
    this.keyLight.shadow.map?.dispose()
    this.renderer.dispose()
    canvas.remove()
  }
}

export const AnimeViewport = forwardRef<AnimeViewportHandle, AnimeViewportProps>(function AnimeViewport(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const runtime = useRef<AnimeRuntime | null>(null)
  const latest = useRef(props)
  const [status, setStatus] = useState('')
  const [failed, setFailed] = useState(false)
  latest.current = props
  useImperativeHandle(ref, () => ({
    captureCamera: () => runtime.current?.captureCamera() ?? structuredClone(latest.current.document.camera),
    resetView: view => runtime.current?.resetView(view),
    frameCharacter: () => runtime.current?.frameCharacter(),
    exportPng: () => runtime.current?.exportPng() ?? Promise.reject(new Error('The 3D viewport is not ready.')),
  }), [])
  useEffect(() => {
    if (!host.current) return
    try { runtime.current = new AnimeRuntime(host.current, latest.current, setStatus); setFailed(false) }
    catch (error) { setFailed(true); latest.current.onError(error instanceof Error ? error.message : 'WebGL is unavailable on this device.') }
    return () => { runtime.current?.dispose(); runtime.current = null }
  }, [])
  useEffect(() => { runtime.current?.sync(props) }, [props])
  const navigation = props.view === 'shot' ? 'shot camera fixed' : 'Alt + drag to orbit'
  const help = props.workflow === 'Draw' ? `Drag to draw · ${navigation} · Esc cancels` : props.workflow === 'Pose' || props.workflow === 'Animate' ? `Drag hands / feet for IK · other handles rotate · ${navigation}` : props.view === 'shot' || props.workflow === 'Render' ? 'Shot camera · output framing locked' : 'Drag to orbit · right drag to pan · scroll to zoom'
  return <div className="anime-viewport" style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
    <div ref={host} data-testid="anime-3d-canvas-host" style={{ position: 'absolute', inset: 0 }} />
    {failed && <div role="alert" style={{ position: 'absolute', inset: 20, display: 'grid', placeContent: 'center', color: 'var(--text-primary, #e9edf4)' }}>The 3D viewport could not start. Your project remains available. Reload to retry graphics initialization.</div>}
    <div aria-live="polite" style={{ position: 'absolute', bottom: 10, left: 12, right: 12, pointerEvents: 'none', color: '#f3f5fa', background: '#202736d9', borderRadius: 5, padding: '5px 9px', fontSize: 11, width: 'fit-content', maxWidth: 'calc(100% - 24px)' }}>{status || help}</div>
  </div>
})
