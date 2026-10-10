import { nanoid } from 'nanoid'
import type { ObjectKind, SceneAsset, SceneDocument, SceneObject, ShotCamera, Vec3 } from './types'

export const FIGURE_JOINTS = [
  { id: 'hips', label: 'Hips' },
  { id: 'head', label: 'Head' },
  { id: 'chest', label: 'Chest' },
  { id: 'leftUpperArm', label: 'Left upper arm' },
  { id: 'leftForearm', label: 'Left forearm' },
  { id: 'leftHand', label: 'Left hand' },
  { id: 'rightUpperArm', label: 'Right upper arm' },
  { id: 'rightForearm', label: 'Right forearm' },
  { id: 'rightHand', label: 'Right hand' },
  { id: 'leftThigh', label: 'Left thigh' },
  { id: 'leftShin', label: 'Left shin' },
  { id: 'leftFoot', label: 'Left foot' },
  { id: 'rightThigh', label: 'Right thigh' },
  { id: 'rightShin', label: 'Right shin' },
  { id: 'rightFoot', label: 'Right foot' },
] as const

const figureJointIds = new Set<string>(FIGURE_JOINTS.map((joint) => joint.id))
const kinds: ObjectKind[] = ['figure', 'cube', 'sphere', 'cylinder', 'chair', 'platform', 'imported', 'image', 'group']
const names: Record<ObjectKind, string> = {
  figure: 'Drawing figure', cube: 'Box', sphere: 'Sphere', cylinder: 'Cylinder',
  chair: 'Chair', platform: 'Platform', imported: 'Imported model', image: 'Image plane', group: 'Folder',
}

/** Figures face +Z; limbs hang down in their rest pose. All angles are radians. */
export const POSE_PRESETS: { id: string; name: string; description: string; pose: Record<string, Vec3> }[] = [
  { id: 'standing', name: 'Standing', description: 'A neutral starting pose.', pose: {} },
  { id: 'relaxed', name: 'Relaxed', description: 'An easy stance with a slight head tilt.', pose: {
    head: [0, -.14, -.08], chest: [0, .07, .035], leftUpperArm: [0, 0, -.12], rightUpperArm: [.05, 0, .1],
    leftForearm: [-.18, 0, 0], rightForearm: [-.12, 0, 0], leftThigh: [0, 0, -.08], rightThigh: [.06, 0, .06],
  } },
  { id: 'walking', name: 'Walking', description: 'Opposite arms and legs move forward.', pose: {
    leftThigh: [-.48, 0, -.03], rightThigh: [.34, 0, .03], leftShin: [.08, 0, 0], rightShin: [.45, 0, 0],
    leftUpperArm: [.35, 0, -.07], rightUpperArm: [-.4, 0, .07], leftForearm: [-.15, 0, 0], rightForearm: [-.32, 0, 0],
    chest: [.04, -.1, 0],
  } },
  { id: 'running', name: 'Running', description: 'A raised knee and bent elbows suggest motion.', pose: {
    chest: [.16, -.12, 0], leftThigh: [-1.05, 0, -.06], leftShin: [1.15, 0, 0], rightThigh: [.5, 0, .06], rightShin: [1.45, 0, 0],
    leftUpperArm: [.5, 0, -.12], leftForearm: [-1.5, 0, 0], rightUpperArm: [-.6, 0, .12], rightForearm: [-1.4, 0, 0],
  } },
  { id: 'sitting', name: 'Sitting', description: 'Move the figure down to meet the chair seat.', pose: {
    leftThigh: [-Math.PI / 2, 0, -.07], rightThigh: [-Math.PI / 2, 0, .07],
    leftShin: [Math.PI / 2, 0, 0], rightShin: [Math.PI / 2, 0, 0],
    leftUpperArm: [-.15, 0, -.07], rightUpperArm: [-.15, 0, .07], leftForearm: [-1.25, 0, 0], rightForearm: [-1.25, 0, 0],
  } },
  { id: 'wave', name: 'Wave', description: 'One arm raised in greeting.', pose: {
    leftUpperArm: [-.18, 0, -2.3], leftForearm: [-.65, 0, 0], leftHand: [0, 0, -.16], head: [0, .12, .06],
    rightUpperArm: [0, 0, .12], rightForearm: [-.12, 0, 0],
  } },
  { id: 'reach', name: 'Reach forward', description: 'Both hands reach out in front.', pose: {
    leftUpperArm: [-1.4, 0, -.13], rightUpperArm: [-1.4, 0, .13], leftForearm: [-.12, 0, 0], rightForearm: [-.12, 0, 0],
    chest: [.1, 0, 0], head: [-.1, 0, 0],
  } },
  { id: 'overhead', name: 'Arms overhead', description: 'An open, extended silhouette.', pose: {
    leftUpperArm: [-.1, 0, -2.75], rightUpperArm: [-.1, 0, 2.75], leftForearm: [-.2, 0, 0], rightForearm: [-.2, 0, 0],
    head: [-.15, 0, 0], leftThigh: [0, 0, -.12], rightThigh: [0, 0, .12],
  } },
  { id: 'hands-hips', name: 'Hands on hips', description: 'Elbows out with hands angled toward the waist.', pose: {
    leftUpperArm: [.12, -.4, -.55], rightUpperArm: [.12, .4, .55],
    leftForearm: [-1.45, -.35, .45], rightForearm: [-1.45, .35, -.45],
    leftThigh: [0, 0, -.1], rightThigh: [0, 0, .1],
  } },
  { id: 'kneeling', name: 'Kneeling', description: 'Lower the figure until its knees meet the floor.', pose: {
    leftShin: [Math.PI / 2, 0, 0], rightShin: [Math.PI / 2, 0, 0], leftFoot: [.65, 0, 0], rightFoot: [.65, 0, 0],
    leftUpperArm: [-.2, 0, -.08], rightUpperArm: [-.2, 0, .08], leftForearm: [-.6, 0, 0], rightForearm: [-.6, 0, 0],
  } },
]

export function mirrorPose(pose: Record<string, Vec3>): Record<string, Vec3> {
  return Object.fromEntries(Object.entries(pose).map(([id, [x, y, z]]) => [
    id.startsWith('left') ? `right${id.slice(4)}` : id.startsWith('right') ? `left${id.slice(5)}` : id,
    [x, -y, -z] as Vec3,
  ]))
}

export function cameraView(view: 'front' | 'side' | 'top' | 'perspective'): ShotCamera {
  const positions: Record<typeof view, Vec3> = {
    front: [0, 1.2, 5], side: [5, 1.2, 0], top: [0, 6, .001], perspective: [3.2, 2.4, 5],
  }
  return { position: [...positions[view]], target: [0, .9, 0], projection: 'perspective', fov: 40, orthoSize: 3, roll: 0 }
}

export function createSceneObject(kind: ObjectKind, name?: string): SceneObject {
  if (!kinds.includes(kind)) invalid('Unknown object kind.')
  return {
    id: nanoid(), name: name?.trim() || names[kind], kind,
    position: [0, 0, 0],
    rotation: [0, 0, 0], scale: [1, 1, 1], color: kind === 'figure' ? '#d5bca7' : kind === 'image' ? '#ffffff' : '#9babb3',
    visible: true, locked: false, pose: {},
  }
}

export function createSceneDocument(name = 'Untitled scene', width = 1600, height = 1200, starter = true): SceneDocument {
  return validateDocument({
    version: 1, name: name.trim() || 'Untitled scene', width, height,
    objects: starter ? [createSceneObject('figure')] : [], assets: [], camera: cameraView('perspective'),
    light: { azimuth: 45, elevation: 50, intensity: 2.5, ambient: .8, color: '#fff4e7', shadows: true },
    floor: { visible: true, grid: true, color: '#e2e5e7' }, background: '#eef0f2', displayStyle: 'clay', transparent: false,
    savedViews: [], savedPoses: [],
  })
}

export const MAX_ASSET_BYTES = 30 * 1024 * 1024
export const MAX_PROJECT_ASSET_BYTES = 64 * 1024 * 1024
const MAX_JSON_BYTES = 4 * 1024 * 1024

function invalid(message: string): never { throw new Error(`Invalid 3D Reference project: ${message}`) }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object.`)
  return value as Record<string, unknown>
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(`${label} must contain at most ${max} entries.`)
  return value
}
function string(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${label} must be nonempty text of at most ${max} characters.`)
  return value.trim()
}
function id(value: unknown, label: string): string {
  const result = string(value, label, 200)
  if (['__proto__', 'prototype', 'constructor'].includes(result)) invalid(`${label} is reserved.`)
  return result
}
function finite(value: unknown, label: string, min = -10000, max = 10000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(`${label} must be a finite number from ${min} to ${max}.`)
  return value
}
function integer(value: unknown, label: string, min: number, max: number): number {
  const result = finite(value, label, min, max)
  if (!Number.isInteger(result)) invalid(`${label} must be a whole number.`)
  return result
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be true or false.`)
  return value
}
function color(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) invalid(`${label} must be a six-digit hex color.`)
  return value
}
function vector(value: unknown, label: string, min = -10000, max = 10000): Vec3 {
  const items = array(value, label, 3)
  if (items.length !== 3) invalid(`${label} must have three coordinates.`)
  return items.map((entry) => finite(entry, label, min, max)) as Vec3
}
function unique<T extends { id: string }>(values: T[], label: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const value of values) {
    if (result.has(value.id)) invalid(`${label} contains duplicate IDs.`)
    result.set(value.id, value)
  }
  return result
}
function pose(value: unknown, allowed: ReadonlySet<string>, label: string): Record<string, Vec3> {
  const entries = Object.entries(record(value, label))
  if (entries.length > 512) invalid(`${label} has too many joints.`)
  return Object.fromEntries(entries.map(([joint, rotation]) => {
    if (!allowed.has(joint)) invalid(`${label} references an unknown joint: ${joint}.`)
    return [joint, vector(rotation, `${label} rotation`, -Math.PI * 8, Math.PI * 8)]
  }))
}
function camera(value: unknown): ShotCamera {
  const source = record(value, 'camera')
  if (source.projection !== 'perspective' && source.projection !== 'orthographic') invalid('Camera projection is unsupported.')
  const result: ShotCamera = {
    position: vector(source.position, 'camera position'), target: vector(source.target, 'camera target'),
    projection: source.projection, fov: finite(source.fov, 'camera field of view', 5, 140),
    orthoSize: finite(source.orthoSize, 'orthographic size', .05, 10000), roll: finite(source.roll, 'camera roll', -Math.PI * 8, Math.PI * 8),
  }
  if (Math.hypot(...result.position.map((v, i) => v - result.target[i])) < .001) invalid('Camera position and target must be different.')
  return result
}

/** Reject external resources before a loader can issue network requests. This is container validation, not a full glTF schema validator. */
export function validateEmbeddedGlb(dataUrl: unknown): number {
  if (typeof dataUrl !== 'string') invalid('Model data must be an embedded GLB.')
  if (dataUrl.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 64) invalid('A model exceeds the 30 MiB asset limit.')
  const match = /^data:(?:model\/gltf-binary|application\/octet-stream);base64,([a-z\d+/]*={0,2})$/i.exec(dataUrl)
  if (!match || match[1].length % 4 !== 0) invalid('Models must contain embedded base64 GLB data.')
  let binary: string
  try { binary = atob(match[1]) } catch { invalid('Model base64 data is malformed.') }
  const length = binary.length
  if (length < 20 || length > MAX_ASSET_BYTES) invalid('Model size is invalid or exceeds 30 MiB.')
  const uint32 = (offset: number) => (binary.charCodeAt(offset) | binary.charCodeAt(offset + 1) << 8 | binary.charCodeAt(offset + 2) << 16 | binary.charCodeAt(offset + 3) << 24) >>> 0
  if (binary.slice(0, 4) !== 'glTF' || uint32(4) !== 2 || uint32(8) !== length) invalid('Model must be a complete GLB version 2 file.')
  let json: Record<string, unknown> | undefined
  let binLength: number | undefined
  for (let offset = 12; offset < length;) {
    if (offset + 8 > length) invalid('Model chunk header is truncated.')
    const chunkLength = uint32(offset)
    const chunkType = uint32(offset + 4)
    const end = offset + 8 + chunkLength
    if (chunkLength % 4 !== 0 || end > length) invalid('Model chunk size is invalid.')
    if (offset === 12 && chunkType !== 0x4e4f534a) invalid('Model must begin with a JSON chunk.')
    if (chunkType === 0x4e4f534a) {
      if (json || chunkLength > MAX_JSON_BYTES) invalid('Model JSON is duplicated or exceeds 4 MiB.')
      try {
        const bytes = Uint8Array.from(binary.slice(offset + 8, end), (c) => c.charCodeAt(0))
        json = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), 'model JSON')
      } catch { invalid('Model JSON is malformed.') }
    } else if (chunkType === 0x004e4942) {
      if (binLength !== undefined) invalid('Model contains duplicate binary chunks.')
      binLength = chunkLength
    } else invalid('Model contains an unsupported chunk type.')
    offset = end
  }
  if (!json || record(json.asset, 'model metadata').version !== '2.0') invalid('Model must use glTF 2.0.')
  const buffers = json.buffers === undefined ? [] : array(json.buffers, 'model buffers', 128)
  buffers.forEach((entry, index) => {
    const buffer = record(entry, 'model buffer')
    const byteLength = integer(buffer.byteLength, 'model buffer length', 1, MAX_ASSET_BYTES)
    if (buffer.uri === undefined) {
      if (index !== 0 || binLength === undefined || byteLength > binLength || binLength - byteLength > 3) invalid('Model binary buffer is missing or has the wrong size.')
    } else if (typeof buffer.uri !== 'string' || !/^data:application\/(?:octet-stream|gltf-buffer);base64,[a-z\d+/]*={0,2}$/i.test(buffer.uri)) invalid('Model buffers must be embedded; external resources are unsupported.')
  })
  const images = json.images === undefined ? [] : array(json.images, 'model textures', 128)
  images.forEach((entry) => {
    const image = record(entry, 'model image')
    if (image.uri !== undefined && (typeof image.uri !== 'string' || !/^data:image\/(?:png|jpeg|webp|ktx2);base64,[a-z\d+/]*={0,2}$/i.test(image.uri))) invalid('Model textures must be embedded; external resources are unsupported.')
  })
  return length
}

/** Read the PNG container without decoding pixel data or allocating its full raster. */
export function validateEmbeddedPng(dataUrl: unknown): { width: number; height: number; bytes: number } {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 64) invalid('Image data is missing or exceeds the 30 MiB asset limit.')
  const match = /^data:image\/png;base64,([a-z\d+/]*={0,2})$/i.exec(dataUrl)
  if (!match || match[1].length % 4 !== 0) invalid('Image planes must contain embedded base64 PNG data.')
  let binary: string
  try { binary = atob(match[1]) } catch { invalid('Image base64 data is malformed.') }
  if (binary.length < 57 || binary.length > MAX_ASSET_BYTES || binary.slice(0, 8) !== '\x89PNG\r\n\x1a\n') invalid('Image data must contain a complete PNG file.')
  const uint32 = (offset: number) => ((binary.charCodeAt(offset) << 24) | (binary.charCodeAt(offset + 1) << 16) | (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3)) >>> 0
  if (uint32(8) !== 13 || binary.slice(12, 16) !== 'IHDR') invalid('PNG image header is invalid.')
  const width = integer(uint32(16), 'image width', 1, 4096)
  const height = integer(uint32(20), 'image height', 1, 4096)
  if (width * height > 16 * 1024 * 1024) invalid('Image dimensions exceed 16 megapixels.')
  const depth = binary.charCodeAt(24), type = binary.charCodeAt(25)
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
  if (!depths[type]?.includes(depth) || binary.charCodeAt(26) !== 0 || binary.charCodeAt(27) !== 0 || binary.charCodeAt(28) > 1) invalid('PNG image encoding is unsupported.')
  let imageData = false, complete = false
  for (let offset = 8; offset < binary.length;) {
    if (offset + 12 > binary.length) invalid('PNG image chunk is truncated.')
    const size = uint32(offset), kind = binary.slice(offset + 4, offset + 8)
    const end = offset + 12 + size
    if (end > binary.length) invalid('PNG image chunk size is invalid.')
    if (kind === 'IHDR' && offset !== 8) invalid('PNG image contains duplicate headers.')
    if (kind === 'IDAT') imageData = true
    if (kind === 'IEND') {
      if (size !== 0 || !imageData || end !== binary.length) invalid('PNG image is incomplete or contains trailing data.')
      complete = true
    }
    offset = end
  }
  if (!complete) invalid('PNG image is incomplete.')
  return { width, height, bytes: binary.length }
}

/** Rebuild imports field-by-field and ensure every object/pose asset reference resolves. */
export function validateDocument(value: unknown): SceneDocument {
  const input = record(value, 'project')
  if (input.version !== 1) invalid('Unsupported project version.')
  const assets: SceneAsset[] = []
  const assetAliases = new Map<string, string>()
  const dataAssets = new Map<string, SceneAsset>()
  const assetIds = new Set<string>()
  let totalBytes = 0
  for (const value of array(input.assets, 'assets', 24)) {
    const item = record(value, 'asset')
    const assetId = id(item.id, 'asset ID')
    if (assetIds.has(assetId)) invalid('Assets contain duplicate IDs.')
    assetIds.add(assetId)
    const name = string(item.name, 'asset name')
    const bones = array(item.bones, 'asset bones', 512).map((bone) => id(bone, 'bone name'))
    if (new Set(bones).size !== bones.length) invalid('An asset has duplicate bone names.')
    let image: SceneAsset['image']
    if (item.image !== undefined) {
      const metadata = record(item.image, 'image dimensions')
      image = { width: integer(metadata.width, 'image width', 1, 4096), height: integer(metadata.height, 'image height', 1, 4096) }
      if (bones.length) invalid('Image assets cannot contain bones.')
    }
    if (typeof item.dataUrl !== 'string') invalid('Asset data must be embedded.')
    const existing = dataAssets.get(item.dataUrl)
    if (existing) {
      if (existing.bones.length !== bones.length || existing.bones.some((bone, i) => bone !== bones[i])) invalid('Identical model data has inconsistent bone names.')
      if (existing.image?.width !== image?.width || existing.image?.height !== image?.height) invalid('Identical image data has inconsistent dimensions or asset types.')
      assetAliases.set(assetId, existing.id)
      continue
    }
    if (image) {
      const png = validateEmbeddedPng(item.dataUrl)
      if (png.width !== image.width || png.height !== image.height) invalid('Image dimensions do not match its PNG data.')
      totalBytes += png.bytes
    } else totalBytes += validateEmbeddedGlb(item.dataUrl)
    if (totalBytes > MAX_PROJECT_ASSET_BYTES) invalid('Embedded assets exceed the 64 MiB project limit.')
    const asset: SceneAsset = { id: assetId, name, bones, dataUrl: item.dataUrl, ...(image ? { image } : {}) }
    assets.push(asset)
    dataAssets.set(item.dataUrl, asset)
    assetAliases.set(assetId, assetId)
  }
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  function assetReference(value: unknown): string {
    const result = assetAliases.get(id(value, 'asset reference'))
    if (!result) invalid('An object or pose references a missing asset.')
    return result
  }
  const objects = array(input.objects, 'objects', 64).map((value): SceneObject => {
    const item = record(value, 'scene object')
    if (!kinds.includes(item.kind as ObjectKind)) invalid('Unknown scene object kind.')
    const kind = item.kind as ObjectKind
    const assetId = kind === 'imported' || kind === 'image' ? assetReference(item.assetId) : undefined
    if (kind !== 'imported' && kind !== 'image' && item.assetId !== undefined) invalid('Only imported objects and image planes may reference an asset.')
    if (assetId && (kind === 'image') !== !!assetsById.get(assetId)!.image) invalid('Object kind does not match its asset type.')
    let scale = vector(item.scale, 'object scale', .001, 1000)
    if (kind === 'group') {
      const uniform = (scale[0] + scale[1] + scale[2]) / 3
      if (scale.some(component => Math.abs(component - uniform) > Math.max(1, uniform) * 1e-6)) invalid('Folders must use uniform scale on all axes.')
      scale = [uniform, uniform, uniform]
    }
    const parentId = item.parentId === undefined ? undefined : id(item.parentId, 'parent folder ID')
    return {
      id: id(item.id, 'object ID'), name: string(item.name, 'object name'), kind,
      position: vector(item.position, 'object position'), rotation: vector(item.rotation, 'object rotation', -Math.PI * 8, Math.PI * 8),
      scale, color: color(item.color, 'object color'),
      visible: bool(item.visible, 'object visibility'), locked: bool(item.locked, 'object lock'),
      pose: pose(item.pose, assetId ? new Set(assetsById.get(assetId)!.bones) : kind === 'figure' ? figureJointIds : new Set(), 'object pose'),
      ...(assetId ? { assetId } : {}),
      ...(parentId ? { parentId } : {}),
    }
  })
  const objectsById = unique(objects, 'Objects')
  for (const object of objects) {
    const visited = new Set([object.id])
    let parentId = object.parentId
    while (parentId !== undefined) {
      const parent = objectsById.get(parentId)
      if (!parent) invalid('An object references a missing parent folder.')
      if (parent.kind !== 'group') invalid('Objects may only be parented to folders.')
      if (visited.has(parentId)) invalid('Folder hierarchy contains a cycle.')
      visited.add(parentId)
      parentId = parent.parentId
    }
  }
  const light = record(input.light, 'light')
  const floor = record(input.floor, 'floor')
  if (!['clay', 'materials', 'silhouette'].includes(input.displayStyle as string)) invalid('Unknown display style.')
  const savedViews = array(input.savedViews, 'saved views', 24).map((entry) => {
    const item = record(entry, 'saved view')
    return { id: id(item.id, 'saved view ID'), name: string(item.name, 'saved view name'), camera: camera(item.camera) }
  })
  unique(savedViews, 'Saved views')
  const savedPoses = array(input.savedPoses, 'saved poses', 64).map((entry) => {
    const item = record(entry, 'saved pose')
    const assetId = item.assetId === undefined ? undefined : assetReference(item.assetId)
    if (assetId && assetsById.get(assetId)!.image) invalid('Image assets cannot have saved poses.')
    return {
      id: id(item.id, 'saved pose ID'), name: string(item.name, 'saved pose name'),
      pose: pose(item.pose, assetId ? new Set(assetsById.get(assetId)!.bones) : figureJointIds, 'saved pose'),
      ...(assetId ? { assetId } : {}),
    }
  })
  unique(savedPoses, 'Saved poses')
  const width = integer(input.width, 'output width', 64, 4096)
  const height = integer(input.height, 'output height', 64, 4096)
  if (width * height > 16 * 1024 * 1024) invalid('Output dimensions exceed 16 megapixels.')
  return {
    version: 1, name: string(input.name, 'project name'), width, height, objects, assets, camera: camera(input.camera),
    light: {
      azimuth: finite(light.azimuth, 'light azimuth', -360, 360), elevation: finite(light.elevation, 'light elevation', 0, 90),
      intensity: finite(light.intensity, 'light intensity', 0, 10), ambient: finite(light.ambient, 'ambient intensity', 0, 5),
      color: color(light.color, 'light color'), shadows: bool(light.shadows, 'light shadows'),
    },
    floor: { visible: bool(floor.visible, 'floor visibility'), grid: bool(floor.grid, 'floor grid'), color: color(floor.color, 'floor color') },
    background: color(input.background, 'background color'), displayStyle: input.displayStyle as SceneDocument['displayStyle'],
    transparent: bool(input.transparent, 'transparent output'), savedViews, savedPoses,
  }
}
