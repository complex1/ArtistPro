import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { SceneAsset, SceneObject } from './types'
import { disposeObject, type StageObject } from './rig'
import { MAX_ASSET_BYTES, validateEmbeddedGlb } from './model'

/** Validate before invoking a loader so importing never fetches external resources. */
export function validateGlb(buffer: ArrayBuffer): void {
  if (buffer.byteLength > MAX_ASSET_BYTES) throw new Error('Use a GLB smaller than 30 MB for a responsive workspace.')
  if (buffer.byteLength < 20) throw new Error('This file is not a valid GLB model.')
  const header = new DataView(buffer)
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) {
    throw new Error('Choose a glTF 2.0 binary (.glb) file.')
  }
  const jsonLength = header.getUint32(12, true)
  if (header.getUint32(16, true) !== 0x4e4f534a || jsonLength > buffer.byteLength - 20) throw new Error('The GLB has an invalid scene description.')
  let json: { buffers?: { uri?: string }[]; images?: { uri?: string }[]; extensionsRequired?: string[] }
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) }
  catch { throw new Error('The GLB scene description could not be read.') }
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (item.uri && !item.uri.startsWith('data:')) throw new Error('This GLB references external files. Export a self-contained GLB with embedded textures.')
  }
  const unsupported = json.extensionsRequired?.filter(name => ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(name))
  if (unsupported?.length) throw new Error('This model uses compressed geometry or textures. Re-export a GLB without Draco, Meshopt, or KTX2 compression.')
}

export function boneLabel(identifier: string): string {
  return identifier.replace(/^\d+:/, '')
}

function collectBones(root: THREE.Object3D) {
  const joints: StageObject['joints'] = new Map()
  let index = 0
  root.traverse(node => {
    if (!(node instanceof THREE.Bone)) return
    const key = `${index++}:${(node.name || 'Bone').slice(0, 180)}`
    node.userData.jointName = key
    joints.set(key, { node, rest: node.quaternion.clone() })
  })
  return joints
}

async function parse(buffer: ArrayBuffer): Promise<StageObject> {
  validateGlb(buffer)
  const manager = new THREE.LoadingManager()
  manager.setURLModifier(url => {
    if (!url.startsWith('data:') && !url.startsWith('blob:')) throw new Error('External asset URLs are not supported. Embed all resources in the GLB.')
    return url
  })
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, '')
  gltf.scene.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(gltf.scene, true)
  if (bounds.isEmpty()) {
    disposeObject(gltf.scene)
    throw new Error('This GLB has no visible geometry.')
  }
  const size = bounds.getSize(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(maxDimension) || maxDimension < .000001) {
    disposeObject(gltf.scene)
    throw new Error('This model has invalid dimensions.')
  }
  const normalization = 1.8 / (size.y > .00001 ? size.y : maxDimension)
  const normalized = new THREE.Group()
  const centered = new THREE.Group()
  centered.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2)
  centered.add(gltf.scene)
  normalized.scale.setScalar(normalization)
  normalized.add(centered)
  const root = new THREE.Group()
  root.add(normalized)
  root.traverse(node => {
    if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true }
  })
  return { root, joints: collectBones(gltf.scene) }
}

export async function loadGlbAsset(asset: SceneAsset): Promise<StageObject> {
  if (!/^data:[^,]*;base64,/.test(asset.dataUrl)) throw new Error('The saved model has invalid embedded GLB data.')
  const encoded = asset.dataUrl.slice(asset.dataUrl.indexOf(',') + 1)
  if (encoded.length > MAX_ASSET_BYTES * 1.38) throw new Error('This saved model exceeds the 30 MB asset limit.')
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return parse(bytes.buffer)
}

export async function importGlb(file: File): Promise<{ asset: SceneAsset; object: SceneObject }> {
  if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('Choose a self-contained .glb model.')
  if (file.size > MAX_ASSET_BYTES) throw new Error('Choose a GLB smaller than 30 MB.')
  const buffer = await file.arrayBuffer()
  const model = await parse(buffer)
  const bones = [...model.joints.keys()]
  disposeObject(model.root)
  if (bones.length > 512) throw new Error('This skeleton has more than 512 bones. Export a simplified rig for this reference workspace.')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, 'data:model/gltf-binary;base64,'))
    reader.onerror = () => reject(new Error('The model file could not be read.'))
    reader.readAsDataURL(file)
  })
  validateEmbeddedGlb(dataUrl)
  const name = file.name.replace(/\.glb$/i, '').slice(0, 180) || 'Imported model'
  const asset: SceneAsset = { id: crypto.randomUUID(), name, dataUrl, bones }
  const object: SceneObject = {
    id: crypto.randomUUID(), name, kind: 'imported', position: [0, 0, 0], rotation: [0, 0, 0],
    scale: [1, 1, 1], color: '#9fbdbb', visible: true, locked: false, pose: {}, assetId: asset.id,
  }
  return { asset, object }
}
