import type { AnimeDocument, JointName, Pose, Vec3 } from './types'

export const JOINTS: readonly JointName[] = [
  'hips', 'spine', 'head', 'leftUpperArm', 'leftForearm', 'leftHand',
  'rightUpperArm', 'rightForearm', 'rightHand', 'leftThigh', 'leftShin', 'leftFoot',
  'rightThigh', 'rightShin', 'rightFoot',
]

export const JOINT_LABELS: Record<JointName, string> = {
  hips: 'Hips', spine: 'Spine', head: 'Head',
  leftUpperArm: 'Left upper arm', leftForearm: 'Left forearm', leftHand: 'Left hand',
  rightUpperArm: 'Right upper arm', rightForearm: 'Right forearm', rightHand: 'Right hand',
  leftThigh: 'Left thigh', leftShin: 'Left shin', leftFoot: 'Left foot',
  rightThigh: 'Right thigh', rightShin: 'Right shin', rightFoot: 'Right foot',
}

/** Limits apply before JSON parsing and before any imported geometry is rendered. */
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024
export const MAX_STROKES = 200
export const MAX_STROKE_POINTS = 40_000

export function createPose(): Pose {
  return Object.fromEntries(JOINTS.map(joint => [joint, [0, 0, 0]])) as Pose
}

function presetPose(overrides: Partial<Pose>): Pose {
  return { ...createPose(), ...overrides }
}

export const POSE_PRESETS: { id: string; name: string; pose: Pose }[] = [
  { id: 'neutral', name: 'Neutral', pose: createPose() },
  { id: 'wave', name: 'Wave', pose: presetPose({ leftUpperArm: [0, 0, 145], leftForearm: [0, 0, 25] }) },
  { id: 'turn', name: 'Turn', pose: presetPose({ leftUpperArm: [0, 0, 145], leftForearm: [0, 0, 25], leftHand: [0, -40, 20], head: [0, -10, 0] }) },
]

export function createDocument(name?: string, sample = false): AnimeDocument {
  const document: AnimeDocument = {
    version: 1,
    name: name?.trim() || (sample ? 'First wave' : 'Untitled shot'),
    fps: 24,
    duration: 24,
    character: { position: [0, 0, 0], rotation: 0, visible: true, locked: false },
    keys: sample
      ? POSE_PRESETS.map((preset, index) => ({ frame: index * 8 + 1, pose: clonePose(preset.pose) }))
      : [{ frame: 1, pose: createPose() }],
    strokes: [],
    camera: { position: [4, 2.8, 6], target: [0, 1.1, 0], fov: 38 },
    appearance: {
      background: '#eee8df', characterColor: '#826df2', celShading: true,
      outlines: true, ground: true, lightAzimuth: 35,
    },
    output: { width: 1280, height: 720, transparent: false },
  }
  return validateDocument(document)
}

function clonePose(pose: Pose): Pose {
  return Object.fromEntries(JOINTS.map(joint => [joint, [...pose[joint]]])) as Pose
}

function assertFrame(frame: number): void {
  if (!Number.isInteger(frame) || frame < 1 || frame > 24) throw new Error('Frame must be a whole number from 1 to 24.')
}

/** Keys hold until the next key; samples outside the clip clamp to its endpoints. */
export function evaluatePose(document: AnimeDocument, frame: number): Pose {
  if (!Number.isFinite(frame)) throw new Error('A finite frame is required.')
  const current = Math.min(24, Math.max(1, Math.floor(frame)))
  const key = document.keys.reduce((selected, candidate) =>
    candidate.frame <= current && candidate.frame > selected.frame ? candidate : selected, document.keys[0])
  return clonePose(key.pose)
}

export function setPoseKey(document: AnimeDocument, frame: number, pose: Pose): AnimeDocument {
  assertFrame(frame)
  const key = { frame, pose: validatePose(pose) }
  return { ...document, keys: [...document.keys.filter(existing => existing.frame !== frame), key].sort((a, b) => a.frame - b.frame) }
}

export function removePoseKey(document: AnimeDocument, frame: number): AnimeDocument {
  assertFrame(frame)
  if (frame === 1) throw new Error('Frame 1 is the base pose and cannot be removed. Reset the pose instead.')
  return { ...document, keys: document.keys.filter(key => key.frame !== frame) }
}

export function movePoseKey(document: AnimeDocument, from: number, to: number, replace = false): AnimeDocument {
  assertFrame(from)
  assertFrame(to)
  if (from === to) return { ...document, keys: [...document.keys] }
  if (from === 1) throw new Error('Frame 1 is the base pose and cannot be moved.')
  const moving = document.keys.find(key => key.frame === from)
  if (!moving) throw new Error(`There is no pose key at frame ${from}.`)
  if (document.keys.some(key => key.frame === to) && !replace) throw new Error(`Frame ${to} is occupied. Choose Replace to overwrite that key.`)
  return { ...document, keys: [...document.keys.filter(key => key.frame !== from && key.frame !== to), { frame: to, pose: clonePose(moving.pose) }].sort((a, b) => a.frame - b.frame) }
}

function invalid(message: string): never {
  throw new Error(`Invalid Anime 3D project: ${message}`)
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(`${label} must be a finite number from ${min} to ${max}.`)
  return value
}

function vector(value: unknown, label: string, bound = 1000): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) invalid(`${label} must contain exactly three numbers.`)
  return [number(value[0], label, -bound, bound), number(value[1], label, -bound, bound), number(value[2], label, -bound, bound)]
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be true or false.`)
  return value
}

function color(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid(`${label} must be a six-digit hexadecimal color.`)
  return value
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(`${label} must contain 1–${max} printable characters.`)
  return value.trim()
}

function validatePose(value: unknown): Pose {
  const input = object(value, 'pose')
  const keys = Object.keys(input)
  if (keys.length !== JOINTS.length || keys.some(key => !JOINTS.includes(key as JointName))) invalid('pose must contain exactly the supported joints.')
  return Object.fromEntries(JOINTS.map(joint => [joint, vector(input[joint], `${JOINT_LABELS[joint]} rotation`, 180)])) as Pose
}

/** Rebuild a bounded, known-shape document. Unrecognized payload fields never survive. */
export function validateDocument(value: unknown): AnimeDocument {
  const input = object(value, 'document')
  if (input.version !== 1) invalid('unsupported document version. This editor accepts version 1.')
  if (input.fps !== 24 || input.duration !== 24) invalid('the shot must contain 24 frames at 24 fps.')
  const character = object(input.character, 'character')
  const camera = object(input.camera, 'camera')
  const appearance = object(input.appearance, 'appearance')
  const output = object(input.output, 'output')
  if (output.width !== 1280 || output.height !== 720) invalid('output must be 1280 × 720.')
  if (!Array.isArray(input.keys) || input.keys.length < 1 || input.keys.length > 24) invalid('the shot must contain 1–24 pose keys.')
  const frames = new Set<number>()
  const keys = input.keys.map(value => {
    const key = object(value, 'pose key')
    const frame = number(key.frame, 'key frame', 1, 24)
    if (!Number.isInteger(frame) || frames.has(frame)) invalid('pose key frames must be unique whole numbers from 1 to 24.')
    frames.add(frame)
    return { frame, pose: validatePose(key.pose) }
  }).sort((a, b) => a.frame - b.frame)
  if (!frames.has(1)) invalid('the initial pose key at frame 1 is required.')
  if (!Array.isArray(input.strokes) || input.strokes.length > MAX_STROKES) invalid(`a shot can contain at most ${MAX_STROKES} strokes.`)
  let pointCount = 0
  const strokeIds = new Set<string>()
  const strokes = input.strokes.map(value => {
    const stroke = object(value, 'stroke')
    const id = text(stroke.id, 'stroke ID', 120)
    if (strokeIds.has(id)) invalid('stroke IDs must be unique.')
    strokeIds.add(id)
    if (!Array.isArray(stroke.points) || stroke.points.length < 2) invalid('a stroke needs at least two points.')
    pointCount += stroke.points.length
    if (pointCount > MAX_STROKE_POINTS) invalid(`a shot can contain at most ${MAX_STROKE_POINTS} stroke points in total.`)
    return { id, points: stroke.points.map(point => vector(point, 'stroke point')), color: color(stroke.color, 'stroke color'), width: number(stroke.width, 'stroke width', 0.002, 0.5) }
  })
  const position = vector(camera.position, 'camera position')
  const target = vector(camera.target, 'camera target')
  if (Math.hypot(...position.map((component, index) => component - target[index])) < 0.01) invalid('camera position and target must be separated by at least 0.01 units.')
  return {
    version: 1, name: text(input.name, 'project name', 120), fps: 24, duration: 24,
    character: { position: vector(character.position, 'character position'), rotation: number(character.rotation, 'character rotation', -360, 360), visible: boolean(character.visible, 'character visibility'), locked: boolean(character.locked, 'character lock') },
    keys, strokes,
    camera: { position, target, fov: number(camera.fov, 'camera field of view', 10, 100) },
    appearance: {
      background: color(appearance.background, 'background color'), characterColor: color(appearance.characterColor, 'character color'),
      celShading: boolean(appearance.celShading, 'cel shading'), outlines: boolean(appearance.outlines, 'outlines'),
      ground: boolean(appearance.ground, 'ground visibility'), lightAzimuth: number(appearance.lightAzimuth, 'light azimuth', -360, 360),
    },
    output: { width: 1280, height: 720, transparent: boolean(output.transparent, 'transparent background') },
  }
}

export function serializeProject(document: AnimeDocument): string {
  const serialized = JSON.stringify(validateDocument(document), null, 2)
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROJECT_BYTES) invalid('project file exceeds the 8 MiB size limit.')
  return serialized
}

/** Portable imports are JSON documents, limited to 8 MiB of UTF-8 before parsing. */
export function parseProject(serialized: string): AnimeDocument {
  if (typeof serialized !== 'string') invalid('project file must contain JSON text.')
  if (serialized.length > MAX_PROJECT_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_PROJECT_BYTES) invalid('project file exceeds the 8 MiB size limit.')
  let parsed: unknown
  try { parsed = JSON.parse(serialized) } catch { invalid('project file is not valid JSON.') }
  const candidate = object(parsed, 'project file')
  return validateDocument(Object.hasOwn(candidate, 'document') ? candidate.document : candidate)
}
