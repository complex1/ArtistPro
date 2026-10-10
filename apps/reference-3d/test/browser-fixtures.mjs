/** Test-only fixtures, loaded by Vite inside the isolated Chromium renderer. */
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { SceneStage } from '../web/SceneStage'

export async function createModelFile(skinned = false) {
  const scene = new THREE.Scene()
  const geometry = new THREE.BoxGeometry(.5, 1.4, .35, 1, 2, 1)
  geometry.translate(0, .7, 0)
  const material = new THREE.MeshStandardMaterial({ color: '#d7754c' })
  if (skinned) {
    const positions = geometry.getAttribute('position')
    const indices = [], weights = []
    for (let i = 0; i < positions.count; i++) {
      indices.push(positions.getY(i) > .7 ? 1 : 0, 0, 0, 0)
      weights.push(1, 0, 0, 0)
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
    const rootBone = new THREE.Bone(), tip = new THREE.Bone()
    rootBone.name = 'Root'; tip.name = 'Tip'; tip.position.y = .7
    rootBone.add(tip)
    const mesh = new THREE.SkinnedMesh(geometry, material)
    mesh.add(rootBone); mesh.bind(new THREE.Skeleton([rootBone, tip])); scene.add(mesh)
  } else scene.add(new THREE.Mesh(geometry, material))
  const buffer = await new GLTFExporter().parseAsync(scene, { binary: true })
  geometry.dispose(); material.dispose()
  return new File([buffer], skinned ? 'Two bone figure.glb' : 'Static block.glb', { type: 'model/gltf-binary' })
}

export async function createImageFile(type = 'image/png') {
  const canvas = window.document.createElement('canvas')
  canvas.width = 96; canvas.height = 48
  const context = canvas.getContext('2d')
  context.fillStyle = '#f03020'; context.fillRect(0, 0, 48, 48)
  context.fillStyle = '#2050f0'; context.fillRect(48, 0, 48, 48)
  context.clearRect(36, 16, 24, 16)
  context.clearRect(8, 4, 16, 8)
  context.fillStyle = 'rgba(240, 48, 32, 0.5)'; context.fillRect(8, 4, 16, 8)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type, .95))
  const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'
  return new File([blob], 'Color cutout.' + extension, { type })
}

export function mountStage(document) {
  const host = window.document.createElement('div')
  host.id = 'reference-test-stage'
  host.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#26333a'
  window.document.body.append(host)
  const root = createRoot(host), ref = createRef(), errors = [], commits = []
  let props = { document, selectedId: document.objects[0]?.id ?? null, selectedBone: 'leftHand', mode: 'pose', transformMode: 'translate', navigationMode: 'orbit', onSelect: () => {}, onCommitObject: (id, patch) => commits.push({ id, patch }), onError: error => errors.push(error) }
  const render = () => flushSync(() => root.render(createElement(SceneStage, { ...props, ref })))
  render()
  return {
    get handle() { return ref.current }, errors, commits,
    update(patch) { props = { ...props, ...patch }; render() },
    destroy() { flushSync(() => root.unmount()); host.remove() },
  }
}

export async function pngPixels(dataUrl) {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const canvas = window.document.createElement('canvas')
  canvas.width = image.width; canvas.height = image.height
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0); image.close()
  return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data }
}

/** Independent test-side world transform calculation for before/after hierarchy assertions. */
export function objectWorldMatrix(objects, id) {
  const object = objects.find(candidate => candidate.id === id)
  if (!object) throw new Error('Test object does not exist: ' + id)
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...object.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation)),
    new THREE.Vector3(...object.scale),
  )
  if (!object.parentId) return local.elements
  return new THREE.Matrix4().fromArray(objectWorldMatrix(objects, object.parentId)).multiply(local).elements
}
