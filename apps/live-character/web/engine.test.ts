import { describe, expect, it } from 'vitest'
import {
  autoWeightLayer,
  boneWorldTransforms,
  createCharacterDocument,
  createLayer,
  deformLayerVertices,
  evaluateDocument,
  generateMesh,
  getLayerWorldTransform,
  identityTransform,
  meshVertexLocalPosition,
  transformPoint,
  upsertKeyframe,
  upsertMeshKeyframe,
  validateDocument,
} from './engine'
import type { CharacterDocument, Keyframe, Layer, TransformKeyframe } from './model'

function transformValue(keyframe: Keyframe) {
  if (keyframe.targetType === 'mesh') throw new Error('Expected a transform keyframe.')
  return keyframe.value
}

function withLayer(): { document: CharacterDocument; layer: Layer } {
  const document = createCharacterDocument()
  const layer = createLayer('rectangle')
  document.layers.push(layer)
  return { document, layer }
}

function chain(): CharacterDocument {
  const document = createCharacterDocument()
  document.bones = [
    {
      id: 'upper',
      name: 'Upper arm',
      parentId: null,
      x: 200,
      y: 100,
      rotation: 0,
      length: 100,
    },
    {
      id: 'lower',
      name: 'Forearm',
      parentId: 'upper',
      x: 0,
      y: 0,
      rotation: 0,
      length: 100,
    },
  ]
  document.controllers = [
    {
      id: 'hand',
      name: 'Hand IK',
      kind: 'ik',
      boneId: 'lower',
      x: 300,
      y: 200,
      chainLength: 2,
      bend: 1,
    },
  ]
  return document
}

describe('character animation', () => {
  it('interpolates all transform channels without mutating the rest pose', () => {
    const { document, layer } = withLayer()
    document.keyframes = [
      {
        id: 'a',
        targetId: layer.id,
        targetType: 'layer',
        frame: 0,
        easing: 'linear',
        value: identityTransform(),
      },
      {
        id: 'b',
        targetId: layer.id,
        targetType: 'layer',
        frame: 20,
        easing: 'linear',
        value: { x: 100, y: 40, rotation: 180, scaleX: 3, scaleY: 0.5 },
      },
    ]
    const saved = structuredClone(document)
    expect(evaluateDocument(document, 10).layers[0].transform).toEqual({
      x: 50,
      y: 20,
      rotation: 90,
      scaleX: 2,
      scaleY: 0.75,
    })
    expect(evaluateDocument(document, 30).layers[0].transform).toEqual(
      transformValue(document.keyframes[1]),
    )
    expect(document).toEqual(saved)
  })

  it('uses the outgoing key easing and holds step keys until the next pose', () => {
    const { document, layer } = withLayer()
    document.keyframes = [
      {
        id: 'a',
        targetId: layer.id,
        targetType: 'layer',
        frame: 0,
        easing: 'ease-in',
        value: identityTransform(),
      },
      {
        id: 'b',
        targetId: layer.id,
        targetType: 'layer',
        frame: 20,
        easing: 'linear',
        value: { ...identityTransform(), x: 100 },
      },
    ]
    expect(evaluateDocument(document, 10).layers[0].transform.x).toBe(25)
    document.keyframes[0].easing = 'step'
    expect(evaluateDocument(document, 19).layers[0].transform.x).toBe(0)
    expect(evaluateDocument(document, 20).layers[0].transform.x).toBe(100)
  })

  it('replaces a key on the same target/frame and keeps other tracks', () => {
    const { document, layer } = withLayer()
    const key: Omit<TransformKeyframe, 'id'> = {
      targetId: layer.id,
      targetType: 'layer',
      frame: 12,
      easing: 'linear',
      value: identityTransform(),
    }
    const first = upsertKeyframe(document, key)
    const second = upsertKeyframe(first, {
      ...key,
      value: { ...key.value, x: 90 },
    })
    expect(second.keyframes).toHaveLength(2)
    expect(second.keyframes[1].id).toBe(first.keyframes[1].id)
    expect(transformValue(second.keyframes[1]).x).toBe(90)
    expect(transformValue(first.keyframes[1]).x).toBe(0)
    expect(document.keyframes).toHaveLength(0)
  })

  it('preserves frame zero when the first pose is created later in the timeline', () => {
    const { document, layer } = withLayer()
    layer.transform.x = 20
    const result = upsertKeyframe(document, {
      targetId: layer.id,
      targetType: 'layer',
      frame: 24,
      easing: 'linear',
      value: { ...identityTransform(), x: 140 },
    })
    expect(result.keyframes.map((key) => key.frame)).toEqual([0, 24])
    expect(evaluateDocument(result, 0).layers[0].transform.x).toBe(20)
    expect(evaluateDocument(result, 12).layers[0].transform.x).toBe(80)
    expect(evaluateDocument(result, 24).layers[0].transform.x).toBe(140)
    expect(document.keyframes).toEqual([])
  })

  it('records bone and controller bind values as the initial pose', () => {
    const document = chain()
    const boneTrack = upsertKeyframe(document, {
      targetId: 'upper',
      targetType: 'bone',
      frame: 12,
      easing: 'linear',
      value: { ...identityTransform(), x: 250, y: 120, rotation: 45 },
    })
    expect(transformValue(boneTrack.keyframes[0])).toEqual({
      ...identityTransform(),
      x: 200,
      y: 100,
      rotation: 0,
    })
    const controllerTrack = upsertKeyframe(document, {
      targetId: 'hand',
      targetType: 'controller',
      frame: 12,
      easing: 'linear',
      value: { ...identityTransform(), x: 350, y: 150 },
    })
    expect(transformValue(controllerTrack.keyframes[0])).toEqual({
      ...identityTransform(),
      x: 300,
      y: 200,
    })
  })
})

describe('mesh and hierarchy', () => {
  it.each([1, 4, 8, 20])(
    'generates a valid density %i grid including artwork bounds',
    (density) => {
      const layer = createLayer('ellipse')
      layer.width = 120
      layer.height = 80
      const mesh = generateMesh(layer, density)
      expect(mesh.vertices).toHaveLength((density + 1) ** 2)
      expect(mesh.triangles).toHaveLength(density ** 2 * 2)
      expect(mesh.weights).toHaveLength(mesh.vertices.length)
      expect(mesh.vertices[0]).toEqual({ x: -60, y: -40 })
      expect(mesh.vertices.at(-1)).toEqual({ x: 60, y: 40 })
      expect(
        mesh.triangles.every((triangle) =>
          triangle.every((index) => index >= 0 && index < mesh.vertices.length),
        ),
      ).toBe(true)
    },
  )

  it('bounds a drawn path using its actual local points', () => {
    const layer = createLayer('path')
    layer.path = [
      { x: 100, y: 200 },
      { x: 160, y: 210 },
    ]
    layer.strokeWidth = 10
    const mesh = generateMesh(layer, 1)
    expect(mesh.vertices[0]).toEqual({ x: 95, y: 195 })
    expect(mesh.vertices.at(-1)).toEqual({ x: 165, y: 215 })
  })

  it('composes parent rotation, scaling and local translation', () => {
    const { document, layer } = withLayer()
    const parent = createLayer('rectangle')
    parent.transform = { x: 100, y: 200, rotation: 90, scaleX: 2, scaleY: 2 }
    layer.parentId = parent.id
    layer.transform.x = 10
    document.layers.push(parent)
    const position = transformPoint(
      getLayerWorldTransform(document, layer.id),
      { x: 5, y: 0 },
    )
    expect(position.x).toBeCloseTo(100)
    expect(position.y).toBeCloseTo(230)
  })

  it('rotates skinned vertices around a bone and keeps unweighted layer movement', () => {
    const { document, layer } = withLayer()
    layer.mesh = {
      vertices: [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      triangles: [],
      weights: [{ root: 1 }, {}],
    }
    document.bones = [
      {
        id: 'root',
        name: 'Root',
        parentId: null,
        x: 0,
        y: 0,
        length: 100,
        rotation: 0,
      },
    ]
    const pose = structuredClone(document)
    pose.bones[0].rotation = 90
    pose.layers[0].transform.x = 5
    const vertices = deformLayerVertices(document, pose, layer.id)
    expect(vertices[0].x).toBeCloseTo(5)
    expect(vertices[0].y).toBeCloseTo(10)
    expect(vertices[1]).toEqual({ x: 25, y: 0 })
  })

  it('applies a parent layer translation after skeletal posing without changing limb rotation', () => {
    const { document, layer } = withLayer()
    const parent = createLayer('rectangle')
    parent.transform = { ...identityTransform(), x: 100, y: 200 }
    layer.parentId = parent.id
    layer.mesh = {
      vertices: [
        { x: 20, y: 0 },
        { x: 40, y: 0 },
      ],
      triangles: [],
      weights: [{ root: 1 }, { root: 1 }],
    }
    document.layers.push(parent)
    document.bones = [
      {
        id: 'root',
        name: 'Root',
        parentId: null,
        x: 100,
        y: 200,
        length: 80,
        rotation: 0,
      },
    ]
    const pose = structuredClone(document)
    pose.bones[0].rotation = 90
    pose.layers[1].transform.x += 50
    const vertices = deformLayerVertices(document, pose, layer.id)
    expect(vertices[0].x).toBeCloseTo(150)
    expect(vertices[0].y).toBeCloseTo(220)
    expect(vertices[1].x).toBeCloseTo(150)
    expect(vertices[1].y).toBeCloseTo(240)
  })

  it('applies bind translations and normalizes generated weight influences', () => {
    const document = chain()
    const layer = createLayer('rectangle')
    layer.transform = { ...identityTransform(), x: 250, y: 100 }
    layer.mesh = generateMesh(layer, 2)
    document.layers.push(layer)
    const mesh = autoWeightLayer(document, layer.id)!
    expect(
      mesh.weights.every(
        (influences) =>
          Math.abs(
            Object.values(influences).reduce((sum, weight) => sum + weight, 0) -
              1,
          ) < 1e-9,
      ),
    ).toBe(true)
    layer.mesh.weights = layer.mesh.vertices.map(() => ({ upper: 1 }))
    const posed = structuredClone(document)
    posed.bones[0].x += 40
    posed.bones[0].y += 30
    const original = deformLayerVertices(document, document, layer.id)
    const moved = deformLayerVertices(document, posed, layer.id)
    expect(moved[0].x - original[0].x).toBeCloseTo(40)
    expect(moved[0].y - original[0].y).toBeCloseTo(30)
  })
})

describe('mesh animation', () => {
  it('creates a bind-mesh baseline before a later first pose and keeps snapshots isolated', () => {
    const { document, layer } = withLayer()
    layer.mesh = generateMesh(layer, 1)
    const original = structuredClone(document)
    const vertices = layer.mesh.vertices.map(({ x, y }) => ({ x: x + 40, y: y - 20 }))
    const animated = upsertMeshKeyframe(document, {
      targetId: layer.id,
      frame: 20,
      easing: 'linear',
      vertices,
    })
    expect(animated.keyframes.map((key) => key.frame)).toEqual([0, 20])
    expect(evaluateDocument(animated, 0).layers[0].mesh!.vertices).toEqual(layer.mesh.vertices)
    expect(evaluateDocument(animated, 10).layers[0].mesh!.vertices[0]).toEqual({ x: -40, y: -70 })
    expect(evaluateDocument(animated, 50).layers[0].mesh!.vertices).toEqual(vertices)
    expect(document).toEqual(original)
    const saved = structuredClone(animated)
    const pose = evaluateDocument(animated, 20)
    pose.layers[0].mesh!.vertices[0].x = 999
    vertices[0].x = 888
    expect(animated).toEqual(saved)
  })

  it.each([
    ['linear', 0.5],
    ['ease-in', 0.25],
    ['ease-out', 0.75],
    ['ease-in-out', 0.5],
    ['step', 0],
  ] as const)('uses outgoing %s easing on vertex motion', (easing, progress) => {
    const { document, layer } = withLayer()
    layer.mesh = generateMesh(layer, 1)
    const animated = upsertMeshKeyframe(document, {
      targetId: layer.id,
      frame: 20,
      easing,
      vertices: layer.mesh.vertices.map(({ x, y }) => ({ x: x + 100, y: y + 40 })),
    })
    expect(evaluateDocument(animated, 10).layers[0].mesh!.vertices[0]).toEqual({
      x: -60 + 100 * progress,
      y: -60 + 40 * progress,
    })
    expect(evaluateDocument(animated, 20).layers[0].mesh!.vertices[0]).toEqual({ x: 40, y: -20 })
  })

  it('replaces mesh keys while preserving their IDs and independent layer keys', () => {
    const { document, layer } = withLayer()
    layer.mesh = generateMesh(layer, 1)
    const transformed = upsertKeyframe(document, {
      targetType: 'layer', targetId: layer.id, frame: 0,
      easing: 'linear', value: { ...identityTransform(), x: 50 },
    })
    const first = upsertMeshKeyframe(transformed, {
      targetId: layer.id, frame: 0, easing: 'linear', vertices: layer.mesh.vertices,
    })
    const second = upsertMeshKeyframe(first, {
      id: 'ignored', targetId: layer.id, frame: 0, easing: 'ease-in',
      vertices: layer.mesh.vertices.map(({ x, y }) => ({ x: x + 30, y })),
    })
    expect(second.keyframes).toHaveLength(2)
    expect(second.keyframes.find((key) => key.targetType === 'mesh')!.id)
      .toBe(first.keyframes.find((key) => key.targetType === 'mesh')!.id)
    expect(evaluateDocument(second, 0).layers[0].transform.x).toBe(50)
    expect(evaluateDocument(second, 0).layers[0].mesh!.vertices[0].x).toBe(-30)
    expect(layer.mesh.vertices[0].x).toBe(-60)
  })

  it('combines mesh poses with bone skinning and layer transform tracks', () => {
    const { document, layer } = withLayer()
    layer.mesh = { vertices: [{ x: 10, y: 0 }], triangles: [], weights: [{ root: 1 }] }
    document.bones = [{ id: 'root', name: 'Root', parentId: null, x: 0, y: 0, length: 100, rotation: 0 }]
    let animated = upsertMeshKeyframe(document, {
      targetId: layer.id, frame: 20, easing: 'linear', vertices: [{ x: 30, y: 0 }],
    })
    animated = upsertKeyframe(animated, {
      targetType: 'bone', targetId: 'root', frame: 20, easing: 'linear',
      value: { ...identityTransform(), rotation: 90 },
    })
    animated = upsertKeyframe(animated, {
      targetType: 'layer', targetId: layer.id, frame: 20, easing: 'linear',
      value: { ...identityTransform(), x: 5 },
    })
    const pose = evaluateDocument(animated, 20)
    const deformed = deformLayerVertices(animated, pose, layer.id)[0]
    expect(deformed.x).toBeCloseTo(5)
    expect(deformed.y).toBeCloseTo(30)
    expect(layer.mesh.vertices[0]).toEqual({ x: 10, y: 0 })
  })

  it.each([0, 0.25, 1, 2])('inverts weighted skinning with weight %s and parented layer transforms', (weight) => {
    const { document, layer } = withLayer()
    const parent = createLayer('rectangle')
    parent.transform = { x: 100, y: 200, rotation: 35, scaleX: 1.5, scaleY: 0.75 }
    layer.parentId = parent.id
    layer.transform = { x: 20, y: -10, rotation: -20, scaleX: 0.8, scaleY: 1.2 }
    layer.mesh = { vertices: [{ x: 10, y: 15 }], triangles: [], weights: [{ root: weight }] }
    document.layers.push(parent)
    document.bones = [{ id: 'root', name: 'Root', parentId: null, x: 50, y: 100, length: 100, rotation: 20 }]
    const pose = structuredClone(document)
    pose.bones[0].rotation += 90
    pose.bones[0].x += 35
    pose.layers[1].transform.x += 70
    pose.layers[1].transform.rotation -= 15
    pose.layers[0].transform.scaleX = 1.1
    const pointer = { x: 260, y: 360 }
    const local = meshVertexLocalPosition(document, pose, layer.id, 0, pointer)
    expect(local).not.toBeNull()
    pose.layers[0].mesh!.vertices[0] = local!
    const actual = deformLayerVertices(document, pose, layer.id)[0]
    expect(actual.x).toBeCloseTo(pointer.x)
    expect(actual.y).toBeCloseTo(pointer.y)
  })

  it('returns null when blended bone influences or a layer scale collapse the mesh', () => {
    const { document, layer } = withLayer()
    layer.mesh = { vertices: [{ x: 10, y: 0 }], triangles: [], weights: [{ left: 0.5, right: 0.5 }] }
    document.bones = ['left', 'right'].map((id) => ({ id, name: id, parentId: null, x: 0, y: 0, length: 100, rotation: 0 }))
    const pose = structuredClone(document)
    pose.bones[0].rotation = 90
    pose.bones[1].rotation = -90
    expect(meshVertexLocalPosition(document, pose, layer.id, 0, { x: 100, y: 100 })).toBeNull()
    pose.bones[0].rotation = 0
    pose.bones[1].rotation = 0
    pose.layers[0].transform.scaleX = 0
    expect(meshVertexLocalPosition(document, pose, layer.id, 0, { x: 100, y: 100 })).toBeNull()
    expect(meshVertexLocalPosition(document, document, layer.id, 2, { x: 100, y: 100 })).toBeNull()
  })

  it('inverts mixed influences from an IK-posed parent and child bone', () => {
    const document = chain()
    const layer = createLayer('rectangle')
    layer.transform = { ...identityTransform(), x: 250, y: 100, rotation: 15 }
    layer.mesh = { vertices: [{ x: 5, y: 20 }], triangles: [], weights: [{ upper: 0.35, lower: 0.65 }] }
    document.layers.push(layer)
    const pose = evaluateDocument(document, 0)
    const pointer = { x: 275, y: 165 }
    const local = meshVertexLocalPosition(document, pose, layer.id, 0, pointer)
    expect(local).not.toBeNull()
    pose.layers[0].mesh = { ...pose.layers[0].mesh!, vertices: [local!] }
    const actual = deformLayerVertices(document, pose, layer.id)[0]
    expect(actual.x).toBeCloseTo(pointer.x)
    expect(actual.y).toBeCloseTo(pointer.y)
  })

  it('refuses to record vertex snapshots without matching finite mesh coordinates', () => {
    const { document, layer } = withLayer()
    const input = { targetId: layer.id, frame: 0, easing: 'linear' as const, vertices: [] }
    expect(() => upsertMeshKeyframe(document, input)).toThrow(/requires a layer with a mesh/)
    layer.mesh = generateMesh(layer, 1)
    expect(() => upsertMeshKeyframe(document, input)).toThrow(/must match/)
    const invalid = layer.mesh.vertices.map((point) => ({ ...point, x: Infinity }))
    expect(() => upsertMeshKeyframe(document, { ...input, vertices: invalid })).toThrow(/finite vertex/)
  })
})

describe('two-bone IK', () => {
  it('reaches a target while preserving both segment lengths', () => {
    const document = chain()
    const posed = evaluateDocument(document, 0)
    const world = boneWorldTransforms(posed)
    expect(world.lower.end.x).toBeCloseTo(300)
    expect(world.lower.end.y).toBeCloseTo(200)
    expect(
      Math.hypot(
        world.upper.end.x - world.upper.start.x,
        world.upper.end.y - world.upper.start.y,
      ),
    ).toBeCloseTo(100)
    expect(document.bones[0].rotation).toBe(0)
  })

  it('clamps unreachable targets to the chain reach', () => {
    const document = chain()
    document.controllers[0].x = 700
    document.controllers[0].y = 100
    const world = boneWorldTransforms(evaluateDocument(document, 0))
    expect(world.lower.end.x).toBeCloseTo(400)
    expect(world.lower.end.y).toBeCloseTo(100)
  })

  it('supports parent rotation, child offsets and opposite bend directions', () => {
    const document = chain()
    document.bones.unshift({
      id: 'torso',
      name: 'Torso',
      parentId: null,
      x: 20,
      y: 20,
      length: 50,
      rotation: 90,
    })
    document.bones[1].parentId = 'torso'
    document.bones[1].x = 0
    document.bones[1].y = 0
    document.bones[2].x = 20
    document.bones[2].y = 10
    document.controllers[0].x = 130
    document.controllers[0].y = 180
    const first = boneWorldTransforms(evaluateDocument(document, 0))
    document.controllers[0].bend = -1
    const second = boneWorldTransforms(evaluateDocument(document, 0))
    expect(first.lower.end.x).toBeCloseTo(130)
    expect(first.lower.end.y).toBeCloseTo(180)
    expect(second.lower.end.x).toBeCloseTo(130)
    expect(second.lower.end.y).toBeCloseTo(180)
    expect(first.upper.end.x).not.toBeCloseTo(second.upper.end.x)
  })

  it('interpolates controller keys before solving the chain', () => {
    const document = chain()
    document.keyframes = [
      {
        id: 'a',
        targetId: 'hand',
        targetType: 'controller',
        frame: 0,
        easing: 'linear',
        value: { ...identityTransform(), x: 300, y: 100 },
      },
      {
        id: 'b',
        targetId: 'hand',
        targetType: 'controller',
        frame: 20,
        easing: 'linear',
        value: { ...identityTransform(), x: 300, y: 200 },
      },
    ]
    const world = boneWorldTransforms(evaluateDocument(document, 10))
    expect(world.lower.end.x).toBeCloseTo(300)
    expect(world.lower.end.y).toBeCloseTo(150)
  })
})

describe('project validation', () => {
  it('round-trips mesh keys alongside transform tracks', () => {
    const { document, layer } = withLayer()
    layer.mesh = generateMesh(layer, 2)
    let animated = upsertMeshKeyframe(document, {
      targetId: layer.id, frame: 24, easing: 'ease-in-out',
      vertices: layer.mesh.vertices.map(({ x, y }) => ({ x: x * 0.8, y: y + 20 })),
    })
    animated = upsertKeyframe(animated, {
      targetType: 'layer', targetId: layer.id, frame: 24, easing: 'linear',
      value: { ...identityTransform(), x: 15 },
    })
    expect(validateDocument(JSON.parse(JSON.stringify(animated)))).toEqual(animated)
  })

  it('rejects missing mesh snapshots, changed topology, and non-finite vertex keys', () => {
    const { document, layer } = withLayer()
    layer.mesh = generateMesh(layer, 1)
    const animated = upsertMeshKeyframe(document, {
      targetId: layer.id, frame: 0, easing: 'linear', vertices: layer.mesh.vertices,
    })
    const missing = JSON.parse(JSON.stringify(animated))
    delete missing.keyframes[0].vertices
    missing.keyframes[0].value = identityTransform()
    expect(() => validateDocument(missing)).toThrow(/mesh keyframe vertices/)
    const topology = structuredClone(animated)
    topology.layers[0].mesh = generateMesh(layer, 2)
    expect(() => validateDocument(topology)).toThrow(/topology/)
    const nonfinite = structuredClone(animated)
    if (nonfinite.keyframes[0].targetType === 'mesh') nonfinite.keyframes[0].vertices[0].x = NaN
    expect(() => validateDocument(nonfinite)).toThrow(/finite number/)
    const meshless = structuredClone(animated)
    meshless.layers[0].mesh = null
    expect(() => validateDocument(meshless)).toThrow(/missing its mesh/)
    const duplicate = structuredClone(animated)
    duplicate.keyframes.push({ ...duplicate.keyframes[0], id: 'another-key' })
    expect(() => validateDocument(duplicate)).toThrow(/multiple keyframes/)
  })

  it('continues requiring transform values on ordinary keyframes', () => {
    const { document, layer } = withLayer()
    const animated = upsertKeyframe(document, {
      targetType: 'layer', targetId: layer.id, frame: 0, easing: 'linear', value: identityTransform(),
    })
    const missing = JSON.parse(JSON.stringify(animated))
    delete missing.keyframes[0].value
    missing.keyframes[0].vertices = []
    expect(() => validateDocument(missing)).toThrow(/keyframe value/)
  })

  it('round-trips both empty and complete starter projects', () => {
    for (const starter of [false, true]) {
      const document = createCharacterDocument('Luna', starter)
      expect(validateDocument(JSON.parse(JSON.stringify(document)))).toEqual(
        document,
      )
    }
  })

  it('rejects cyclic or missing parents before evaluation', () => {
    const { document, layer } = withLayer()
    layer.parentId = layer.id
    expect(() => validateDocument(document)).toThrow(/cycle/)
    layer.parentId = 'missing'
    expect(() => validateDocument(document)).toThrow(/missing parent/)
    const rig = chain()
    rig.bones[0].parentId = 'lower'
    expect(() => validateDocument(rig)).toThrow(/cycle/)
  })

  it('rejects non-finite values, malformed mesh indices and external assets', () => {
    const { document, layer } = withLayer()
    layer.transform.x = Infinity
    expect(() => validateDocument(document)).toThrow(/finite number/)
    layer.transform.x = 0
    layer.mesh = generateMesh(layer, 1)
    layer.mesh.triangles[0][2] = 900
    expect(() => validateDocument(document)).toThrow(/triangle vertex/)
    layer.mesh = null
    layer.kind = 'image'
    layer.src = 'https://example.com/image.png'
    expect(() => validateDocument(document)).toThrow(/external image/)
    layer.src = 'data:image/svg+xml;base64,PHN2Zz4='
    expect(() => validateDocument(document)).toThrow(/embedded raster/)
    layer.src = 'data:image/png;base64,aGVsbG8='
    expect(validateDocument(document).layers[0].src).toBe(layer.src)
  })

  it('rejects missing animation targets and duplicate track positions', () => {
    const document = createCharacterDocument('Starter', true)
    document.keyframes.push({ ...document.keyframes[0], id: 'duplicate' })
    expect(() => validateDocument(document)).toThrow(/multiple keyframes/)
    document.keyframes.pop()
    document.keyframes[0].targetId = 'missing'
    expect(() => validateDocument(document)).toThrow(/missing target/)
  })
})
