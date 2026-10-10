import { describe, expect, it } from 'vitest'
import { cameraView, createSceneDocument, createSceneObject, FIGURE_JOINTS, mirrorPose, POSE_PRESETS, validateDocument, validateEmbeddedGlb, validateEmbeddedPng } from './model'
import type { SceneDocument } from './types'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwH4YZkDkAm34L9XKwuTwAAAAASUVORK5CYII='

function imageScene(): SceneDocument {
  const document = createSceneDocument('Image planes')
  document.assets = [{ id: 'photo', name: 'Photo', dataUrl: PNG, bones: [], image: { width: 3, height: 2 } }]
  document.objects.push({ ...createSceneObject('image'), assetId: 'photo' })
  return document
}

function glb(json: object = { asset: { version: '2.0' } }): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json))
  const padded = Math.ceil(bytes.length / 4) * 4
  const buffer = new Uint8Array(20 + padded).fill(32)
  const view = new DataView(buffer.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, buffer.length, true)
  view.setUint32(12, padded, true)
  view.setUint32(16, 0x4e4f534a, true)
  buffer.set(bytes, 20)
  return `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...buffer))}`
}

function importedScene(): SceneDocument {
  const document = createSceneDocument('Rig import')
  document.assets = [{ id: 'rig', name: 'Character.glb', dataUrl: glb(), bones: ['Spine', 'Arm'] }]
  document.objects.push({ ...createSceneObject('imported'), assetId: 'rig', pose: { Arm: [-.5, 0, 0] } })
  document.savedPoses = [{ id: 'gesture', name: 'Gesture', assetId: 'rig', pose: { Spine: [.1, 0, 0] } }]
  return document
}

describe('3D Reference scene documents', () => {
  it('creates a complete starter and independent object/camera instances', () => {
    const scene = createSceneDocument('  Study  ', 1080, 1920)
    expect(scene.name).toBe('Study')
    expect(scene.objects).toHaveLength(1)
    expect(scene.objects[0].kind).toBe('figure')
    expect(validateDocument(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
    scene.objects[0].position[0] = 5
    expect(createSceneDocument().objects[0].position).toEqual([0, 0, 0])
    const front = cameraView('front')
    front.position[0] = 500
    expect(cameraView('front').position[0]).toBe(0)
    expect(createSceneDocument(' ', 1600, 1200, false).objects).toEqual([])
    expect(createSceneDocument('Large output', 4096, 4096).width).toBe(4096)
  })

  it('accepts every built-in preset and mirrors the complete pose without mutation', () => {
    const jointNames = new Set(FIGURE_JOINTS.map((joint) => joint.id))
    for (const preset of POSE_PRESETS) {
      const scene = createSceneDocument()
      scene.objects[0].pose = preset.pose
      expect(validateDocument(scene).objects[0].pose).toEqual(preset.pose)
      expect(Object.keys(preset.pose).every((key) => jointNames.has(key as typeof FIGURE_JOINTS[number]['id']))).toBe(true)
      expect(mirrorPose(mirrorPose(preset.pose))).toEqual(preset.pose)
    }
    const pose = { leftForearm: [-1, .2, .3] as [number, number, number], head: [.1, .2, .3] as [number, number, number] }
    const mirrored = mirrorPose(pose)
    expect(mirrored).toEqual({ rightForearm: [-1, -.2, -.3], head: [.1, -.2, -.3] })
    mirrored.rightForearm[0] = 5
    expect(pose.leftForearm[0]).toBe(-1)
  })

  it('round-trips cameras, lighting, floor, object transforms, and saved imported poses', () => {
    const scene = importedScene()
    scene.objects[1].position = [-2, .25, 4]
    scene.objects[1].rotation = [.1, -.2, .3]
    scene.objects[1].scale = [.5, .5, .5]
    scene.camera = { ...cameraView('side'), projection: 'orthographic', orthoSize: 4, roll: .2 }
    scene.savedViews = [{ id: 'detail', name: 'Overhead', camera: cameraView('top') }]
    scene.light.azimuth = -35
    scene.floor.grid = false
    scene.transparent = true
    const roundTrip = validateDocument(JSON.parse(JSON.stringify(scene)))
    expect(roundTrip).toEqual(scene)
    roundTrip.objects[1].pose.Arm[0] = 99
    expect(scene.objects[1].pose.Arm[0]).toBe(-.5)
  })

  it('deduplicates embedded models and rewrites both object and saved-pose references', () => {
    const scene = importedScene()
    scene.assets.push({ ...scene.assets[0], id: 'duplicate' })
    scene.objects[1].assetId = 'duplicate'
    scene.savedPoses[0].assetId = 'duplicate'
    const validated = validateDocument(scene)
    expect(validated.assets).toHaveLength(1)
    expect(validated.objects[1].assetId).toBe('rig')
    expect(validated.savedPoses[0].assetId).toBe('rig')
    expect(scene.assets).toHaveLength(2)
    scene.assets[1].bones = ['Other']
    expect(() => validateDocument(scene)).toThrow('inconsistent bone names')
  })

  it('rejects missing references, duplicate IDs, and unknown joints', () => {
    const missing = importedScene()
    missing.assets = []
    expect(() => validateDocument(missing)).toThrow('missing asset')
    const duplicate = createSceneDocument()
    duplicate.objects.push({ ...duplicate.objects[0] })
    expect(() => validateDocument(duplicate)).toThrow('duplicate IDs')
    const joint = createSceneDocument()
    joint.objects[0].pose = { imaginaryJoint: [0, 0, 0] }
    expect(() => validateDocument(joint)).toThrow('unknown joint')
    const importedJoint = importedScene()
    importedJoint.savedPoses[0].pose = { missingBone: [0, 0, 0] }
    expect(() => validateDocument(importedJoint)).toThrow('unknown joint')
  })

  it.each([
    ['non-finite position', (scene: SceneDocument) => { scene.objects[0].position[0] = Infinity }],
    ['zero scale', (scene: SceneDocument) => { scene.objects[0].scale[1] = 0 }],
    ['fractional dimensions', (scene: SceneDocument) => { scene.width = 100.5 }],
    ['excessive output pixels', (scene: SceneDocument) => { scene.width = 4097; scene.height = 4096 }],
    ['coincident camera', (scene: SceneDocument) => { scene.camera.position = [...scene.camera.target] }],
    ['invalid color', (scene: SceneDocument) => { scene.background = 'url(https://example.com)' }],
    ['too many objects', (scene: SceneDocument) => { scene.objects = Array.from({ length: 65 }, () => createSceneObject('cube')) }],
    ['unsupported version', (scene: SceneDocument) => { Object.assign(scene, { version: 2 }) }],
  ])('rejects %s', (_name, mutate) => {
    const scene = createSceneDocument()
    mutate(scene)
    expect(() => validateDocument(scene)).toThrow('Invalid 3D Reference project')
  })

  it('drops unrecognized input fields rather than preserving foreign payloads', () => {
    const scene = createSceneDocument()
    const validated = validateDocument({ ...scene, callback: 'run me', objects: [{ ...scene.objects[0], foreign: { surprise: true } }] })
    expect(validated).not.toHaveProperty('callback')
    expect(validated.objects[0]).not.toHaveProperty('foreign')
  })
})

describe('portable GLB validation', () => {
  it('accepts a self-contained GLB and an embedded texture data URI', () => {
    expect(validateEmbeddedGlb(glb())).toBeGreaterThan(20)
    expect(() => validateEmbeddedGlb(glb({ asset: { version: '2.0' }, images: [{ uri: 'data:image/png;base64,YQ==' }] }))).not.toThrow()
  })

  it('rejects malformed headers and truncated binary payloads', () => {
    expect(() => validateEmbeddedGlb('data:model/gltf-binary;base64,YQ==')).toThrow('size')
    const complete = glb()
    const binary = atob(complete.split(',')[1])
    const truncated = `data:model/gltf-binary;base64,${btoa(binary.slice(0, -4))}`
    expect(() => validateEmbeddedGlb(truncated)).toThrow('complete GLB')
    expect(() => validateEmbeddedGlb('https://example.com/model.glb')).toThrow('embedded base64')
  })

  it('rejects external buffer and texture resources before any loader is invoked', () => {
    expect(() => validateEmbeddedGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri: 'https://example.com/buffer.bin' }] }))).toThrow('external resources')
    expect(() => validateEmbeddedGlb(glb({ asset: { version: '2.0' }, images: [{ uri: '../texture.png' }] }))).toThrow('external resources')
    expect(() => validateEmbeddedGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }))).toThrow('binary buffer is missing')
  })
})

describe('portable image plane validation', () => {
  it('validates PNG dimensions and round-trips an image plane without changing GLB format', () => {
    expect(validateEmbeddedPng(PNG)).toMatchObject({ width: 3, height: 2 })
    const scene = imageScene()
    const validated = validateDocument(JSON.parse(JSON.stringify(scene)))
    expect(validated).toEqual(scene)
    expect(validated.objects[1]).toMatchObject({ kind: 'image', color: '#ffffff', position: [0, 0, 0], pose: {} })
    expect(validateDocument(importedScene()).assets[0]).not.toHaveProperty('image')
  })

  it('shares identical image assets while keeping object transforms independent', () => {
    const scene = imageScene()
    scene.assets.push({ ...scene.assets[0], id: 'copy' })
    scene.objects.push({ ...createSceneObject('image'), assetId: 'copy', position: [2, 0, 0] })
    const validated = validateDocument(scene)
    expect(validated.assets).toHaveLength(1)
    expect(validated.objects[2].assetId).toBe('photo')
    expect(validated.objects[1].position).toEqual([0, 0, 0])
    expect(validated.objects[2].position).toEqual([2, 0, 0])
    scene.assets[1].image = { width: 2, height: 3 }
    expect(() => validateDocument(scene)).toThrow('inconsistent dimensions')
  })

  it('rejects mismatched metadata, wrong asset types, bones, and pose references', () => {
    const wrongSize = imageScene()
    wrongSize.assets[0].image!.width = 4
    expect(() => validateDocument(wrongSize)).toThrow('dimensions do not match')
    const wrongObject = imageScene()
    wrongObject.objects[1].kind = 'imported'
    expect(() => validateDocument(wrongObject)).toThrow('asset type')
    const wrongAsset = importedScene()
    wrongAsset.objects[1].kind = 'image'
    expect(() => validateDocument(wrongAsset)).toThrow('asset type')
    const bones = imageScene()
    bones.assets[0].bones = ['arm']
    expect(() => validateDocument(bones)).toThrow('cannot contain bones')
    const pose = imageScene()
    pose.objects[1].pose = { head: [0, 0, 0] }
    expect(() => validateDocument(pose)).toThrow('unknown joint')
    const savedPose = imageScene()
    savedPose.savedPoses.push({ id: 'pose', name: 'Invalid pose', assetId: 'photo', pose: {} })
    expect(() => validateDocument(savedPose)).toThrow('cannot have saved poses')
  })

  it('rejects external URLs, mislabeled data, oversized dimensions, and truncated PNG containers', () => {
    expect(() => validateEmbeddedPng('https://example.com/image.png')).toThrow('embedded base64 PNG')
    expect(() => validateEmbeddedPng(glb())).toThrow('embedded base64 PNG')
    const bytes = Uint8Array.from(atob(PNG.split(',')[1]), c => c.charCodeAt(0))
    const dataUrl = (value: Uint8Array) => `data:image/png;base64,${btoa(String.fromCharCode(...value))}`
    expect(() => validateEmbeddedPng(dataUrl(bytes.slice(0, -4)))).toThrow('truncated')
    new DataView(bytes.buffer).setUint32(16, 4097)
    expect(() => validateEmbeddedPng(dataUrl(bytes))).toThrow('image width')
  })
})

describe('folder document validation', () => {
  it('round-trips nested folders while preserving legacy root-level objects', () => {
    const scene = createSceneDocument('Nested composition')
    const outer = { ...createSceneObject('group'), id: 'outer', position: [1, 0, 0] as [number, number, number] }
    const inner = { ...createSceneObject('group'), id: 'inner', parentId: 'outer', scale: [2, 2, 2] as [number, number, number] }
    scene.objects[0].parentId = 'inner'
    scene.objects.push(outer, inner, createSceneObject('chair'))
    expect(validateDocument(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
    expect(validateDocument(createSceneDocument()).objects[0]).not.toHaveProperty('parentId')
    inner.scale = [2, 2.0000001, 2]
    const normalized = validateDocument(scene).objects.find(object => object.id === 'inner')!
    expect(normalized.scale[0]).toBe(normalized.scale[1])
    expect(normalized.scale[1]).toBe(normalized.scale[2])
  })

  it('rejects cycles, missing or non-folder parents, nonuniform scales and folder rigs/assets', () => {
    const scene = createSceneDocument()
    const group = { ...createSceneObject('group'), id: 'folder' }
    scene.objects.push(group)
    scene.objects[0].parentId = 'missing'
    expect(() => validateDocument(scene)).toThrow('missing parent')
    scene.objects[0].parentId = scene.objects[0].id
    expect(() => validateDocument(scene)).toThrow('only be parented to folders')
    scene.objects[0].parentId = group.id
    group.parentId = group.id
    expect(() => validateDocument(scene)).toThrow('cycle')
    const nested = { ...createSceneObject('group'), id: 'nested', parentId: group.id }
    scene.objects.push(nested)
    group.parentId = nested.id
    expect(() => validateDocument(scene)).toThrow('cycle')
    delete group.parentId
    group.scale = [1, 2, 1]
    expect(() => validateDocument(scene)).toThrow('uniform scale')
    group.scale = [1, 1, 1]
    group.pose = { head: [0, 0, 0] }
    expect(() => validateDocument(scene)).toThrow('unknown joint')
    group.pose = {}
    group.assetId = 'not-an-asset'
    expect(() => validateDocument(scene)).toThrow('Only imported objects')
  })
})
