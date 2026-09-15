import type {
  Bone,
  BoneWorldTransform,
  CharacterDocument,
  Controller,
  Easing,
  Keyframe,
  Layer,
  LayerKind,
  Matrix,
  Mesh,
  MeshKeyframe,
  Transform,
  TransformKeyframe,
  Vec2,
} from './model'

const DEG = Math.PI / 180
const identityMatrix = (): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
export const identityTransform = (): Transform => ({
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})
export const createId = (prefix = 'item'): string =>
  `${prefix}-${globalThis.crypto.randomUUID()}`

export function transformPoint(matrix: Matrix, point: Vec2): Vec2 {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

export function invertMatrix(matrix: Matrix): Matrix {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (Math.abs(determinant) < 1e-12)
    throw new Error('A zero-scale transform cannot be inverted.')
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  }
}

export function transformMatrix(transform: Transform): Matrix {
  const cosine = Math.cos(transform.rotation * DEG)
  const sine = Math.sin(transform.rotation * DEG)
  return {
    a: cosine * transform.scaleX,
    b: sine * transform.scaleX,
    c: -sine * transform.scaleY,
    d: cosine * transform.scaleY,
    e: transform.x,
    f: transform.y,
  }
}

export function getLayerWorldTransform(
  document: CharacterDocument,
  layerId: string,
): Matrix {
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]))
  const visiting = new Set<string>()
  const resolve = (id: string): Matrix => {
    const layer = layers.get(id)
    if (!layer) return identityMatrix()
    if (visiting.has(id)) throw new Error('Layer hierarchy contains a cycle.')
    visiting.add(id)
    const parent = layer.parentId ? resolve(layer.parentId) : identityMatrix()
    const result = multiplyMatrices(parent, transformMatrix(layer.transform))
    visiting.delete(id)
    return result
  }
  return resolve(layerId)
}

export function boneWorldTransforms(
  document: CharacterDocument,
): Record<string, BoneWorldTransform> {
  const bones = new Map(document.bones.map((bone) => [bone.id, bone]))
  const result: Record<string, BoneWorldTransform> = Object.create(null)
  const visiting = new Set<string>()
  const resolve = (id: string): BoneWorldTransform => {
    if (result[id]) return result[id]
    if (visiting.has(id)) throw new Error('Bone hierarchy contains a cycle.')
    const bone = bones.get(id)
    if (!bone) throw new Error(`Missing bone: ${id}.`)
    visiting.add(id)
    const parent = bone.parentId ? resolve(bone.parentId) : null
    const parentAngle = (parent?.rotation ?? 0) * DEG
    const start = {
      x:
        (parent?.end.x ?? 0) +
        bone.x * Math.cos(parentAngle) -
        bone.y * Math.sin(parentAngle),
      y:
        (parent?.end.y ?? 0) +
        bone.x * Math.sin(parentAngle) +
        bone.y * Math.cos(parentAngle),
    }
    const rotation = (parent?.rotation ?? 0) + bone.rotation
    result[id] = {
      start,
      end: {
        x: start.x + bone.length * Math.cos(rotation * DEG),
        y: start.y + bone.length * Math.sin(rotation * DEG),
      },
      rotation,
    }
    visiting.delete(id)
    return result[id]
  }
  for (const bone of document.bones) resolve(bone.id)
  return result
}

export function createLayer(kind: LayerKind, name?: string): Layer {
  return {
    id: createId('layer'),
    name:
      name ??
      {
        ellipse: 'Circle',
        rectangle: 'Rectangle',
        path: 'Drawing',
        image: 'Image',
      }[kind],
    parentId: null,
    visible: true,
    locked: false,
    kind,
    fill: '#b4a1ff',
    stroke: '#302950',
    strokeWidth: 0,
    width: 120,
    height: 120,
    transform: identityTransform(),
    mesh: null,
    ...(kind === 'path' ? { path: [] } : {}),
  }
}

/** A regular grid supports density editing and texture deformation for every artwork type. */
export function generateMesh(layer: Layer, density: number): Mesh {
  const subdivisions = Math.max(
    1,
    Math.min(20, Math.round(Number.isFinite(density) ? density : 4)),
  )
  let left = -layer.width / 2
  let top = -layer.height / 2
  let width = layer.width
  let height = layer.height
  if (layer.kind === 'path' && layer.path?.length) {
    const xs = layer.path.map((point) => point.x)
    const ys = layer.path.map((point) => point.y)
    left = Math.min(...xs) - layer.strokeWidth / 2
    top = Math.min(...ys) - layer.strokeWidth / 2
    width = Math.max(1, Math.max(...xs) - left + layer.strokeWidth / 2)
    height = Math.max(1, Math.max(...ys) - top + layer.strokeWidth / 2)
  }
  const vertices: Vec2[] = []
  const triangles: [number, number, number][] = []
  for (let row = 0; row <= subdivisions; row++) {
    for (let col = 0; col <= subdivisions; col++) {
      vertices.push({
        x: left + (col * width) / subdivisions,
        y: top + (row * height) / subdivisions,
      })
    }
  }
  for (let row = 0; row < subdivisions; row++) {
    for (let col = 0; col < subdivisions; col++) {
      const a = row * (subdivisions + 1) + col
      const b = a + 1
      const c = a + subdivisions + 1
      triangles.push([a, b, c], [b, c + 1, c])
    }
  }
  return { vertices, triangles, weights: vertices.map(() => ({})) }
}

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
        ),
      )
    : 0
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy)
}

export function autoWeightLayer(
  document: CharacterDocument,
  layerId: string,
): Mesh | null {
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer?.mesh) return null
  const matrix = getLayerWorldTransform(document, layerId)
  const bones = Object.entries(boneWorldTransforms(document))
  const weights = layer.mesh.vertices.map((vertex) => {
    const world = transformPoint(matrix, vertex)
    const nearest = bones
      .map(([id, bone]) => ({
        id,
        distance: distanceToSegment(world, bone.start, bone.end),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
    const influences = nearest.map((bone) => ({
      id: bone.id,
      weight: 1 / Math.max(1, bone.distance) ** 2,
    }))
    const total = influences.reduce((sum, bone) => sum + bone.weight, 0)
    return Object.fromEntries(
      influences.map((bone) => [bone.id, bone.weight / total]),
    )
  })
  return { ...layer.mesh, weights }
}

function boneMatrix(bone: BoneWorldTransform): Matrix {
  return transformMatrix({
    ...identityTransform(),
    ...bone.start,
    rotation: bone.rotation,
  })
}

/** The same per-vertex affine map is used for drawing and inverse pointer edits. */
function meshDeformation(
  restDocument: CharacterDocument,
  posedDocument: CharacterDocument,
  layerId: string,
): { vertices: Vec2[]; matrixAt: (index: number) => Matrix } | null {
  const restLayer = restDocument.layers.find((layer) => layer.id === layerId)
  const posedLayer = posedDocument.layers.find((layer) => layer.id === layerId)
  if (!restLayer?.mesh || !posedLayer) return null
  const restMatrix = getLayerWorldTransform(restDocument, layerId)
  const posedMatrix = getLayerWorldTransform(posedDocument, layerId)
  const invertible =
    Math.abs(restMatrix.a * restMatrix.d - restMatrix.b * restMatrix.c) >= 1e-12
  // Artwork transform tracks act after skinning so dragging a posed limb follows
  // the pointer in stage space, even when the bound bone is rotated.
  const layerDelta = invertible
    ? multiplyMatrices(posedMatrix, invertMatrix(restMatrix))
    : identityMatrix()
  const layerMatrix = invertible ? restMatrix : posedMatrix
  const restBones = boneWorldTransforms(restDocument)
  const posedBones = boneWorldTransforms(posedDocument)
  const deltas: Record<string, Matrix> = Object.create(null)
  for (const [id, bone] of Object.entries(restBones)) {
    if (posedBones[id])
      deltas[id] = multiplyMatrices(
        boneMatrix(posedBones[id]),
        invertMatrix(boneMatrix(bone)),
      )
  }
  return {
    vertices: posedLayer.mesh?.vertices ?? restLayer.mesh.vertices,
    matrixAt: (index) => {
      const weights =
        posedLayer.mesh?.weights[index] ?? restLayer.mesh!.weights[index] ?? {}
      const skin: Matrix = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }
      let total = 0
      for (const [id, weight] of Object.entries(weights)) {
        if (!deltas[id] || weight <= 0 || !Number.isFinite(weight)) continue
        for (const channel of ['a', 'b', 'c', 'd', 'e', 'f'] as const)
          skin[channel] += deltas[id][channel] * weight
        total += weight
      }
      // Partial weights retain the unbound influence; overweighted vertices normalize.
      if (total < 1) {
        skin.a += 1 - total
        skin.d += 1 - total
      }
      for (const channel of ['a', 'b', 'c', 'd', 'e', 'f'] as const)
        skin[channel] /= Math.max(1, total)
      return multiplyMatrices(layerDelta, multiplyMatrices(skin, layerMatrix))
    },
  }
}

export function deformLayerVertices(
  restDocument: CharacterDocument,
  posedDocument: CharacterDocument,
  layerId: string,
): Vec2[] {
  const deformation = meshDeformation(restDocument, posedDocument, layerId)
  if (!deformation) return []
  return deformation.vertices.map((vertex, index) =>
    transformPoint(deformation.matrixAt(index), vertex),
  )
}

/** Convert a dragged stage point into the mesh's local animated coordinates. */
export function meshVertexLocalPosition(
  restDocument: CharacterDocument,
  posedDocument: CharacterDocument,
  layerId: string,
  index: number,
  worldPoint: Vec2,
): Vec2 | null {
  const deformation = meshDeformation(restDocument, posedDocument, layerId)
  if (
    !deformation ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= deformation.vertices.length ||
    !Number.isFinite(worldPoint.x) ||
    !Number.isFinite(worldPoint.y)
  )
    return null
  const matrix = deformation.matrixAt(index)
  if (Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12) return null
  const local = transformPoint(invertMatrix(matrix), worldPoint)
  return Number.isFinite(local.x) && Number.isFinite(local.y) ? local : null
}

export const clampFrame = (
  document: CharacterDocument,
  frame: number,
): number =>
  Math.max(0, Math.min(document.duration, Number.isFinite(frame) ? frame : 0))

export function applyEasing(progress: number, easing: Easing): number {
  switch (easing) {
    case 'step':
      return progress < 1 ? 0 : 1
    case 'ease-in':
      return progress * progress
    case 'ease-out':
      return 1 - (1 - progress) ** 2
    case 'ease-in-out':
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - (-2 * progress + 2) ** 2 / 2
    default:
      return progress
  }
}

function interpolate(
  left: Transform,
  right: Transform,
  progress: number,
): Transform {
  return {
    x: left.x + (right.x - left.x) * progress,
    y: left.y + (right.y - left.y) * progress,
    rotation: left.rotation + (right.rotation - left.rotation) * progress,
    scaleX: left.scaleX + (right.scaleX - left.scaleX) * progress,
    scaleY: left.scaleY + (right.scaleY - left.scaleY) * progress,
  }
}

function solveIK(document: CharacterDocument, controller: Controller): void {
  const lower = document.bones.find((bone) => bone.id === controller.boneId)
  const upper = document.bones.find((bone) => bone.id === lower?.parentId)
  if (!upper || !lower) return
  const world = boneWorldTransforms(document)
  const origin = world[upper.id].start
  const dx = controller.x - origin.x
  const dy = controller.y - origin.y
  // A child offset extends the first segment and changes its local direction.
  const segmentX = upper.length + lower.x
  const segmentY = lower.y
  const firstLength = Math.hypot(segmentX, segmentY)
  const secondLength = lower.length
  if (firstLength <= 1e-8 || secondLength <= 1e-8) return
  const offsetAngle = Math.atan2(segmentY, segmentX)
  const distance = Math.max(
    1e-8,
    Math.min(
      firstLength + secondLength,
      Math.max(Math.abs(firstLength - secondLength), Math.hypot(dx, dy)),
    ),
  )
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (distance * distance -
        firstLength * firstLength -
        secondLength * secondLength) /
        (2 * firstLength * secondLength),
    ),
  )
  const elbow = Math.acos(cosine) * controller.bend
  const shoulder =
    Math.atan2(dy, dx) -
    Math.atan2(
      secondLength * Math.sin(elbow),
      firstLength + secondLength * Math.cos(elbow),
    )
  const parentRotation = upper.parentId ? world[upper.parentId].rotation : 0
  upper.rotation = shoulder / DEG - offsetAngle / DEG - parentRotation
  lower.rotation = elbow / DEG + offsetAngle / DEG
}

/** Evaluation copies animated objects and never changes the bind pose or keyframes. */
export function evaluateDocument(
  document: CharacterDocument,
  frame: number,
): CharacterDocument {
  const time = clampFrame(document, frame)
  const result: CharacterDocument = {
    ...document,
    layers: document.layers.map((layer) => ({
      ...layer,
      transform: { ...layer.transform },
    })),
    bones: document.bones.map((bone) => ({ ...bone })),
    controllers: document.controllers.map((controller) => ({ ...controller })),
  }
  const tracks = new Map<string, Keyframe[]>()
  for (const keyframe of document.keyframes) {
    const trackId = `${keyframe.targetType}:${keyframe.targetId}`
    const track = tracks.get(trackId) ?? []
    track.push(keyframe)
    tracks.set(trackId, track)
  }
  for (const track of tracks.values()) {
    track.sort((left, right) => left.frame - right.frame)
    let left = track[0]
    let right = track[track.length - 1]
    for (const keyframe of track) {
      if (keyframe.frame <= time) left = keyframe
      if (keyframe.frame >= time) {
        right = keyframe
        break
      }
    }
    const progress =
      right.frame === left.frame
        ? 0
        : Math.max(
            0,
            Math.min(1, (time - left.frame) / (right.frame - left.frame)),
          )
    const eased = applyEasing(progress, left.easing)
    if (left.targetType === 'mesh' && right.targetType === 'mesh') {
      const layer = result.layers.find(
        (candidate) => candidate.id === left.targetId,
      )
      if (
        layer?.mesh &&
        left.vertices.length === layer.mesh.vertices.length &&
        right.vertices.length === layer.mesh.vertices.length
      )
        layer.mesh = {
          ...layer.mesh,
          vertices: left.vertices.map((vertex, index) => ({
            x: vertex.x + (right.vertices[index].x - vertex.x) * eased,
            y: vertex.y + (right.vertices[index].y - vertex.y) * eased,
          })),
        }
      continue
    }
    if (left.targetType === 'mesh' || right.targetType === 'mesh') continue
    const value = interpolate(left.value, right.value, eased)
    if (left.targetType === 'layer') {
      const layer = result.layers.find(
        (candidate) => candidate.id === left.targetId,
      )
      if (layer) layer.transform = value
    } else if (left.targetType === 'bone') {
      const bone = result.bones.find(
        (candidate) => candidate.id === left.targetId,
      )
      if (bone) {
        bone.x = value.x
        bone.y = value.y
        bone.rotation = value.rotation
      }
    } else {
      const controller = result.controllers.find(
        (candidate) => candidate.id === left.targetId,
      )
      if (controller) {
        controller.x = value.x
        controller.y = value.y
      }
    }
  }
  for (const controller of result.controllers)
    if (controller.kind === 'ik') solveIK(result, controller)
  return result
}

export function upsertKeyframe(
  document: CharacterDocument,
  keyframe: Omit<TransformKeyframe, 'id'> & { id?: string },
): CharacterDocument {
  const frame = Math.round(clampFrame(document, keyframe.frame))
  const track = document.keyframes.filter(
    (key) =>
      key.targetId === keyframe.targetId &&
      key.targetType === keyframe.targetType,
  )
  const previous = track.find((key) => key.frame === frame)
  const next: TransformKeyframe = {
    ...keyframe,
    frame,
    id: previous?.id ?? keyframe.id ?? createId('key'),
    value: { ...keyframe.value },
  }
  const baseline: TransformKeyframe[] = []
  if (frame > 0 && track.length === 0) {
    let value: Transform | undefined
    if (keyframe.targetType === 'layer')
      value = document.layers.find(
        (layer) => layer.id === keyframe.targetId,
      )?.transform
    else if (keyframe.targetType === 'bone') {
      const bone = document.bones.find((bone) => bone.id === keyframe.targetId)
      if (bone)
        value = {
          ...identityTransform(),
          x: bone.x,
          y: bone.y,
          rotation: bone.rotation,
        }
    } else {
      const controller = document.controllers.find(
        (controller) => controller.id === keyframe.targetId,
      )
      if (controller)
        value = { ...identityTransform(), x: controller.x, y: controller.y }
    }
    if (value)
      baseline.push({
        ...next,
        id: createId('key'),
        frame: 0,
        value: { ...value },
      })
  }
  return {
    ...document,
    keyframes: [
      ...document.keyframes.filter(
        (key) =>
          !(
            key.targetId === next.targetId &&
            key.targetType === next.targetType &&
            key.frame === frame
          ),
      ),
      ...baseline,
      next,
    ].sort((left, right) => left.frame - right.frame),
  }
}

export function upsertMeshKeyframe(
  document: CharacterDocument,
  keyframe: Omit<MeshKeyframe, 'id' | 'targetType'> & { id?: string },
): CharacterDocument {
  const mesh = document.layers.find(
    (layer) => layer.id === keyframe.targetId,
  )?.mesh
  if (!mesh) throw new Error('Mesh animation requires a layer with a mesh.')
  if (
    keyframe.vertices.length !== mesh.vertices.length ||
    keyframe.vertices.some(
      (vertex) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y),
    )
  )
    throw new Error(
      'Mesh keyframes must match the mesh with finite vertex positions.',
    )
  const frame = Math.round(clampFrame(document, keyframe.frame))
  const track = document.keyframes.filter(
    (key) => key.targetType === 'mesh' && key.targetId === keyframe.targetId,
  )
  const previous = track.find((key) => key.frame === frame)
  const next: MeshKeyframe = {
    ...keyframe,
    targetType: 'mesh',
    frame,
    id: previous?.id ?? keyframe.id ?? createId('key'),
    vertices: keyframe.vertices.map((vertex) => ({ ...vertex })),
  }
  const baseline: MeshKeyframe[] =
    frame > 0 && track.length === 0
      ? [
          {
            ...next,
            id: createId('key'),
            frame: 0,
            vertices: mesh.vertices.map((vertex) => ({ ...vertex })),
          },
        ]
      : []
  return {
    ...document,
    keyframes: [
      ...document.keyframes.filter(
        (key) =>
          !(
            key.targetType === 'mesh' &&
            key.targetId === next.targetId &&
            key.frame === frame
          ),
      ),
      ...baseline,
      next,
    ].sort((left, right) => left.frame - right.frame),
  }
}

export function createCharacterDocument(
  name = 'Untitled character',
  starter = false,
): CharacterDocument {
  const document: CharacterDocument = {
    version: 1,
    name,
    width: 960,
    height: 720,
    fps: 24,
    duration: 72,
    layers: [],
    bones: [],
    controllers: [],
    keyframes: [],
  }
  if (!starter) return document
  document.bones = [
    {
      id: 'body',
      name: 'Body',
      parentId: null,
      x: 480,
      y: 470,
      length: 125,
      rotation: -90,
    },
    {
      id: 'head',
      name: 'Head',
      parentId: 'body',
      x: 0,
      y: 0,
      length: 90,
      rotation: 0,
    },
    {
      id: 'arm-left',
      name: 'Left upper arm',
      parentId: 'body',
      x: -8,
      y: -73,
      length: 82,
      rotation: 238,
    },
    {
      id: 'hand-left',
      name: 'Left forearm',
      parentId: 'arm-left',
      x: 0,
      y: 0,
      length: 73,
      rotation: -20,
    },
    {
      id: 'arm-right',
      name: 'Right upper arm',
      parentId: 'body',
      x: -8,
      y: 73,
      length: 82,
      rotation: 67,
    },
    {
      id: 'hand-right',
      name: 'Right forearm',
      parentId: 'arm-right',
      x: 0,
      y: 0,
      length: 73,
      rotation: -70,
    },
    {
      id: 'leg-left',
      name: 'Left thigh',
      parentId: 'body',
      x: -125,
      y: -38,
      length: 74,
      rotation: 186,
    },
    {
      id: 'foot-left',
      name: 'Left shin',
      parentId: 'leg-left',
      x: 0,
      y: 0,
      length: 70,
      rotation: -6,
    },
    {
      id: 'leg-right',
      name: 'Right thigh',
      parentId: 'body',
      x: -125,
      y: 38,
      length: 74,
      rotation: 174,
    },
    {
      id: 'foot-right',
      name: 'Right shin',
      parentId: 'leg-right',
      x: 0,
      y: 0,
      length: 70,
      rotation: 6,
    },
  ]
  const worlds = boneWorldTransforms(document)
  const part = (
    id: string,
    label: string,
    kind: LayerKind,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    boneId: string,
    rotation = 0,
    stroke = '#252535',
    strokeWidth = 4,
  ): Layer => {
    const layer: Layer = {
      ...createLayer(kind, label),
      id,
      width,
      height,
      fill,
      stroke,
      strokeWidth,
      transform: { ...identityTransform(), x, y, rotation },
    }
    layer.mesh = generateMesh(layer, 3)
    layer.mesh.weights = layer.mesh.vertices.map(() => ({ [boneId]: 1 }))
    document.layers.push(layer)
    return layer
  }
  const limb = (id: string, width: number, fill: string): void => {
    const bone = worlds[id]
    const length = document.bones.find(
      (candidate) => candidate.id === id,
    )!.length
    part(
      `art-${id}`,
      document.bones.find((candidate) => candidate.id === id)!.name,
      'ellipse',
      (bone.start.x + bone.end.x) / 2,
      (bone.start.y + bone.end.y) / 2,
      length + 26,
      width,
      fill,
      id,
      bone.rotation,
    )
  }
  limb('leg-left', 42, '#afa4e8')
  limb('leg-right', 42, '#afa4e8')
  limb('foot-left', 38, '#e5dfff')
  limb('foot-right', 38, '#e5dfff')
  part(
    'boot-left',
    'Left boot',
    'ellipse',
    worlds['foot-left'].end.x - 10,
    worlds['foot-left'].end.y,
    67,
    32,
    '#7365b6',
    'foot-left',
  )
  part(
    'boot-right',
    'Right boot',
    'ellipse',
    worlds['foot-right'].end.x + 10,
    worlds['foot-right'].end.y,
    67,
    32,
    '#7365b6',
    'foot-right',
  )
  limb('arm-left', 41, '#afa4e8')
  limb('arm-right', 41, '#afa4e8')
  limb('hand-left', 36, '#e5dfff')
  limb('hand-right', 36, '#e5dfff')
  part(
    'glove-left',
    'Left glove',
    'ellipse',
    worlds['hand-left'].end.x,
    worlds['hand-left'].end.y,
    44,
    44,
    '#f7c972',
    'hand-left',
  )
  part(
    'glove-right',
    'Right glove',
    'ellipse',
    worlds['hand-right'].end.x,
    worlds['hand-right'].end.y,
    44,
    44,
    '#f7c972',
    'hand-right',
  )
  part('torso', 'Space suit', 'ellipse', 480, 404, 149, 156, '#e5dfff', 'body')
  part(
    'belt',
    'Suit belt',
    'rectangle',
    480,
    460,
    112,
    19,
    '#7365b6',
    'body',
    0,
    '#252535',
    3,
  )
  part(
    'chest-panel',
    'Chest panel',
    'rectangle',
    480,
    401,
    65,
    51,
    '#afa4e8',
    'body',
    0,
    '#252535',
    3,
  )
  part(
    'chest-light',
    'Status light',
    'ellipse',
    461,
    394,
    12,
    12,
    '#9ee7c9',
    'body',
    0,
    'none',
    0,
  )
  part(
    'chest-button',
    'Suit button',
    'ellipse',
    485,
    394,
    9,
    9,
    '#f7c972',
    'body',
    0,
    'none',
    0,
  )
  part('neck', 'Helmet collar', 'ellipse', 480, 333, 92, 33, '#7365b6', 'head')
  part('helmet', 'Helmet', 'ellipse', 480, 264, 199, 163, '#e5dfff', 'head')
  part(
    'visor',
    'Visor',
    'ellipse',
    480,
    269,
    155,
    113,
    '#393553',
    'head',
    0,
    '#252535',
    4,
  )
  part(
    'eye-left',
    'Left eye',
    'ellipse',
    451,
    264,
    12,
    21,
    '#c7f8df',
    'head',
    0,
    'none',
    0,
  )
  part(
    'eye-right',
    'Right eye',
    'ellipse',
    509,
    264,
    12,
    21,
    '#c7f8df',
    'head',
    0,
    'none',
    0,
  )
  part(
    'blush-left',
    'Left cheek',
    'ellipse',
    433,
    284,
    22,
    9,
    '#8c80bb',
    'head',
    0,
    'none',
    0,
  )
  part(
    'blush-right',
    'Right cheek',
    'ellipse',
    527,
    284,
    22,
    9,
    '#8c80bb',
    'head',
    0,
    'none',
    0,
  )
  const smile = part(
    'smile',
    'Smile',
    'path',
    480,
    281,
    26,
    12,
    'none',
    'head',
    0,
    '#c7f8df',
    4,
  )
  smile.path = [
    { x: -12, y: 0 },
    { x: -8, y: 5 },
    { x: 0, y: 7 },
    { x: 8, y: 5 },
    { x: 12, y: 0 },
  ]
  smile.mesh = generateMesh(smile, 3)
  smile.mesh.weights = smile.mesh.vertices.map(() => ({ head: 1 }))
  part(
    'helmet-shine',
    'Helmet reflection',
    'ellipse',
    430,
    224,
    28,
    12,
    '#fffaff',
    'head',
    -30,
    'none',
    0,
  )
  document.controllers = [
    {
      id: 'control-head',
      name: 'Head tilt',
      kind: 'bone',
      boneId: 'head',
      ...worlds.head.end,
      chainLength: 2,
      bend: 1,
    },
    {
      id: 'control-left-hand',
      name: 'Left hand',
      kind: 'bone',
      boneId: 'hand-left',
      ...worlds['hand-left'].end,
      chainLength: 2,
      bend: 1,
    },
    {
      id: 'control-right-hand',
      name: 'Wave',
      kind: 'bone',
      boneId: 'hand-right',
      ...worlds['hand-right'].end,
      chainLength: 2,
      bend: -1,
    },
  ]
  for (const [frame, rotation] of [
    [0, -70],
    [18, -112],
    [36, -50],
    [54, -112],
    [72, -70],
  ]) {
    document.keyframes.push({
      id: createId('key'),
      targetType: 'bone',
      targetId: 'hand-right',
      frame,
      value: { ...identityTransform(), rotation },
      easing: 'ease-in-out',
    })
  }
  for (const [frame, rotation] of [
    [0, 0],
    [36, 7],
    [72, 0],
  ]) {
    document.keyframes.push({
      id: createId('key'),
      targetType: 'bone',
      targetId: 'head',
      frame,
      value: { ...identityTransform(), rotation },
      easing: 'ease-in-out',
    })
  }
  return document
}

function invalid(message: string): never {
  throw new Error(`Invalid character project: ${message}`)
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${label} must be an object.`)
  return value as Record<string, unknown>
}
function finite(value: unknown, label: string, min = -1e7, max = 1e7): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    invalid(`${label} must be a finite number between ${min} and ${max}.`)
  return value
}
function string(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || value.length > max)
    invalid(`${label} must be text of at most ${max} characters.`)
  return value
}
function identifier(value: unknown, label: string): string {
  const result = string(value, label)
  if (!result || ['__proto__', 'prototype', 'constructor'].includes(result))
    invalid(`${label} is not a valid identifier.`)
  return result
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    invalid(`${label} must be an array with at most ${max} entries.`)
  return value
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be true or false.`)
  return value
}
function point(value: unknown, label: string): Vec2 {
  const input = record(value, label)
  return { x: finite(input.x, `${label}.x`), y: finite(input.y, `${label}.y`) }
}
function transform(value: unknown, label: string): Transform {
  const input = record(value, label)
  return {
    ...point(input, label),
    rotation: finite(input.rotation, `${label}.rotation`),
    scaleX: finite(input.scaleX, `${label}.scaleX`, -1000, 1000),
    scaleY: finite(input.scaleY, `${label}.scaleY`, -1000, 1000),
  }
}
function parent(value: unknown, label: string): string | null {
  return value === null ? null : identifier(value, label)
}
function color(value: unknown, label: string): string {
  const result = string(value, label, 100)
  if (
    !/^(?:none|transparent|[a-z]+|#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%+-]+\))$/i.test(
      result,
    )
  )
    invalid(`${label} must be a color.`)
  return result
}
function hierarchy(
  items: { id: string; parentId: string | null }[],
  label: string,
): Set<string> {
  const ids = new Set(items.map((item) => item.id))
  if (ids.size !== items.length) invalid(`${label} contain duplicate IDs.`)
  const parents = new Map(items.map((item) => [item.id, item.parentId]))
  for (const item of items) {
    const seen = new Set<string>()
    let current: string | null = item.id
    while (current !== null) {
      if (!ids.has(current)) invalid(`${label} reference a missing parent.`)
      if (seen.has(current)) invalid(`${label} hierarchy contains a cycle.`)
      seen.add(current)
      current = parents.get(current) ?? null
    }
  }
  return ids
}

/** Imports are rebuilt field by field, and never retain unknown or executable fields. */
export function validateDocument(value: unknown): CharacterDocument {
  const input = record(value, 'project')
  if (input.version !== 1) invalid('unsupported project version.')
  const document: CharacterDocument = {
    version: 1,
    name: string(input.name, 'name'),
    width: finite(input.width, 'width', 1, 8192),
    height: finite(input.height, 'height', 1, 8192),
    fps: finite(input.fps, 'fps', 1, 120),
    duration: finite(input.duration, 'duration', 1, 36000),
    layers: [],
    bones: [],
    controllers: [],
    keyframes: [],
  }
  if (!Number.isInteger(document.fps) || !Number.isInteger(document.duration))
    invalid('frame rate and duration must be whole numbers.')
  document.bones = array(input.bones, 'bones', 500).map(
    (entry, index): Bone => {
      const bone = record(entry, `bone ${index + 1}`)
      return {
        id: identifier(bone.id, 'bone ID'),
        name: string(bone.name, 'bone name'),
        parentId: parent(bone.parentId, 'bone parent'),
        ...point(bone, 'bone'),
        length: finite(bone.length, 'bone length', 0.01, 10000),
        rotation: finite(bone.rotation, 'bone rotation'),
      }
    },
  )
  const boneIds = hierarchy(document.bones, 'Bones')
  document.layers = array(input.layers, 'layers', 500).map(
    (entry, index): Layer => {
      const layer = record(entry, `layer ${index + 1}`)
      if (
        !['ellipse', 'rectangle', 'path', 'image'].includes(
          layer.kind as string,
        )
      )
        invalid('unknown artwork type.')
      const result: Layer = {
        id: identifier(layer.id, 'layer ID'),
        name: string(layer.name, 'layer name'),
        parentId: parent(layer.parentId, 'layer parent'),
        visible: boolean(layer.visible, 'layer visibility'),
        locked: boolean(layer.locked, 'layer lock'),
        kind: layer.kind as LayerKind,
        fill: color(layer.fill, 'layer fill'),
        stroke: color(layer.stroke, 'layer stroke'),
        strokeWidth: finite(layer.strokeWidth, 'stroke width', 0, 1000),
        width: finite(layer.width, 'layer width', 0.01, 16384),
        height: finite(layer.height, 'layer height', 0.01, 16384),
        transform: transform(layer.transform, 'layer transform'),
        mesh: null,
      }
      if (layer.path !== undefined)
        result.path = array(layer.path, 'drawing points', 100000).map(
          (value, index) => point(value, `drawing point ${index + 1}`),
        )
      if (result.kind === 'path' && !result.path)
        invalid('a drawing layer is missing its points.')
      if (layer.src !== undefined) {
        const src = string(layer.src, 'image data', 30_000_000)
        if (
          !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(
            src,
          )
        )
          invalid(
            'images must contain embedded raster data; external image URLs are not allowed.',
          )
        result.src = src
      }
      if (result.kind === 'image' && !result.src)
        invalid('an image layer is missing its embedded image data.')
      if (layer.mesh !== null) {
        const mesh = record(layer.mesh, 'mesh')
        const vertices = array(mesh.vertices, 'mesh vertices', 10000).map(
          (vertex, index) => point(vertex, `mesh vertex ${index + 1}`),
        )
        const triangles = array(mesh.triangles, 'mesh triangles', 20000).map(
          (triangle): [number, number, number] => {
            const values = array(triangle, 'triangle', 3)
            if (values.length !== 3)
              invalid('triangles need exactly three vertex indices.')
            const indices = values.map((value) =>
              finite(value, 'triangle vertex index', 0, vertices.length - 1),
            )
            if (
              indices.some((value) => !Number.isInteger(value)) ||
              new Set(indices).size !== 3
            )
              invalid('triangle indices must be three distinct whole numbers.')
            return indices as [number, number, number]
          },
        )
        const weights = array(mesh.weights, 'vertex weights', 10000).map(
          (value) => {
            const influences = record(value, 'vertex influences')
            const entries = Object.entries(influences)
            if (entries.length > 500)
              invalid('a vertex has too many bone influences.')
            return Object.fromEntries(
              entries.map(([id, weight]) => {
                if (!boneIds.has(id))
                  invalid('mesh weights reference a missing bone.')
                return [id, finite(weight, 'bone influence', 0, 1)]
              }),
            )
          },
        )
        if (weights.length !== vertices.length)
          invalid('each mesh vertex needs a weight entry.')
        result.mesh = { vertices, triangles, weights }
      }
      return result
    },
  )
  const layerIds = hierarchy(document.layers, 'Layers')
  document.controllers = array(input.controllers, 'controllers', 500).map(
    (entry): Controller => {
      const controller = record(entry, 'controller')
      if (controller.kind !== 'bone' && controller.kind !== 'ik')
        invalid('unknown controller type.')
      if (
        controller.chainLength !== 2 ||
        (controller.bend !== 1 && controller.bend !== -1)
      )
        invalid(
          'controllers require a two-bone chain and a valid bend direction.',
        )
      const boneId = parent(controller.boneId, 'controller bone')
      if (boneId !== null && !boneIds.has(boneId))
        invalid('a controller references a missing bone.')
      if (
        controller.kind === 'ik' &&
        !document.bones.find((bone) => bone.id === boneId)?.parentId
      )
        invalid('an IK controller needs an end bone with a parent.')
      return {
        id: identifier(controller.id, 'controller ID'),
        name: string(controller.name, 'controller name'),
        kind: controller.kind,
        boneId,
        ...point(controller, 'controller'),
        chainLength: 2,
        bend: controller.bend,
      }
    },
  )
  const controllerIds = new Set(
    document.controllers.map((controller) => controller.id),
  )
  if (controllerIds.size !== document.controllers.length)
    invalid('controllers contain duplicate IDs.')
  const keyIds = new Set<string>()
  const positions = new Set<string>()
  document.keyframes = array(input.keyframes, 'keyframes', 100000).map(
    (entry): Keyframe => {
      const key = record(entry, 'keyframe')
      if (
        !['layer', 'bone', 'controller', 'mesh'].includes(key.targetType as string)
      )
        invalid('unknown keyframe target type.')
      const targetType = key.targetType as Keyframe['targetType']
      const targetId = identifier(key.targetId, 'keyframe target')
      if (
        !(
          targetType === 'layer' || targetType === 'mesh'
            ? layerIds
            : targetType === 'bone'
              ? boneIds
              : controllerIds
        ).has(targetId)
      )
        invalid('a keyframe references a missing target.')
      if (
        !['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step'].includes(
          key.easing as string,
        )
      )
        invalid('unknown keyframe easing.')
      const id = identifier(key.id, 'keyframe ID')
      if (keyIds.has(id)) invalid('keyframes contain duplicate IDs.')
      keyIds.add(id)
      const frame = finite(key.frame, 'keyframe position', 0, document.duration)
      if (!Number.isInteger(frame))
        invalid('keyframe positions must be whole frames.')
      const position = `${targetType}:${targetId}:${frame}`
      if (positions.has(position))
        invalid('a target has multiple keyframes at the same frame.')
      positions.add(position)
      if (targetType === 'mesh') {
        const mesh = document.layers.find(
          (layer) => layer.id === targetId,
        )?.mesh
        if (!mesh) invalid('a mesh keyframe target is missing its mesh.')
        const vertices = array(
          key.vertices,
          'mesh keyframe vertices',
          10000,
        ).map(
          (vertex, index) => point(vertex, `mesh keyframe vertex ${index + 1}`),
        )
        if (vertices.length !== mesh.vertices.length)
          invalid('mesh keyframe vertices must match the target mesh topology.')
        return {
          id,
          targetId,
          targetType,
          frame,
          vertices,
          easing: key.easing as Easing,
        }
      }
      return {
        id,
        targetId,
        targetType,
        frame,
        value: transform(key.value, 'keyframe value'),
        easing: key.easing as Easing,
      }
    },
  )
  return document
}
