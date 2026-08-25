import { nanoid } from 'nanoid'
import {
  isColorProperty,
  isTransformProperty,
  mixHex,
  TRANSFORM_PROPERTIES,
  writeChannel,
  type KeyframeValue,
} from './channels'
import { findNode, walkNodes } from './scene'
import type {
  AnimatableProperty,
  AnimationTrack,
  DocumentAnimation,
  EditorNode,
  Keyframe,
  KeyframeEase,
  Transform,
} from './types'

export { TRANSFORM_PROPERTIES }

export const ANIMATABLE_PROPERTIES = TRANSFORM_PROPERTIES

export const DEFAULT_ANIMATION_DURATION = 3

export const defaultAnimation = (): DocumentAnimation => ({
  duration: DEFAULT_ANIMATION_DURATION,
  tracks: [],
})

export const propertyLabel = (property: AnimatableProperty) => {
  switch (property) {
    case 'position.x':
      return 'Position X'
    case 'position.y':
      return 'Position Y'
    case 'rotation':
      return 'Rotation'
    case 'scale.x':
      return 'Scale X'
    case 'scale.y':
      return 'Scale Y'
    case 'skew.x':
      return 'Skew X'
    case 'skew.y':
      return 'Skew Y'
    case 'opacity':
      return 'Opacity'
    case 'fill':
      return 'Fill'
    case 'stroke':
      return 'Stroke'
    case 'strokeWidth':
      return 'Stroke width'
    case 'width':
      return 'Width'
    case 'height':
      return 'Height'
    case 'rx':
      return 'Radius X'
    case 'ry':
      return 'Radius Y'
    case 'fontSize':
      return 'Font size'
    case 'letterSpacing':
      return 'Letter spacing'
    case 'fontWeight':
      return 'Weight'
    case 'pencil.size':
      return 'Brush size'
    case 'pencil.color':
      return 'Brush color'
    case 'brightness':
      return 'Brightness'
    case 'contrast':
      return 'Contrast'
    case 'saturation':
      return 'Saturation'
    case 'chroma.color':
      return 'Key color'
    case 'chroma.tolerance':
      return 'Tolerance'
    case 'chroma.feather':
      return 'Feather'
    case 'crop.x':
      return 'Crop X'
    case 'crop.y':
      return 'Crop Y'
    case 'crop.width':
      return 'Crop W'
    case 'crop.height':
      return 'Crop H'
    default: {
      if (property.endsWith('.offset.x')) return 'Effect offset X'
      if (property.endsWith('.offset.y')) return 'Effect offset Y'
      if (property.endsWith('.opacity')) return 'Effect opacity'
      if (property.endsWith('.color')) return 'Effect color'
      if (property.endsWith('.radius')) return 'Effect radius'
      return property
    }
  }
}

export function restValue(transform: Transform, property: AnimatableProperty): number {
  switch (property) {
    case 'position.x':
      return transform.position.x
    case 'position.y':
      return transform.position.y
    case 'rotation':
      return transform.rotation
    case 'scale.x':
      return transform.scale.x
    case 'scale.y':
      return transform.scale.y
    case 'skew.x':
      return transform.skew.x
    case 'skew.y':
      return transform.skew.y
    case 'opacity':
      return transform.opacity
    default:
      return 0
  }
}

export function setRestValue(
  transform: Transform,
  property: AnimatableProperty,
  value: number,
): Transform {
  switch (property) {
    case 'position.x':
      return { ...transform, position: { ...transform.position, x: value } }
    case 'position.y':
      return { ...transform, position: { ...transform.position, y: value } }
    case 'rotation':
      return { ...transform, rotation: value }
    case 'scale.x':
      return { ...transform, scale: { ...transform.scale, x: value } }
    case 'scale.y':
      return { ...transform, scale: { ...transform.scale, y: value } }
    case 'skew.x':
      return { ...transform, skew: { ...transform.skew, x: value } }
    case 'skew.y':
      return { ...transform, skew: { ...transform.skew, y: value } }
    case 'opacity':
      return { ...transform, opacity: value }
    default:
      return transform
  }
}

export function trackKey(nodeId: string, property: AnimatableProperty) {
  return `${nodeId}:${property}`
}

export function findTrack(
  animation: DocumentAnimation,
  nodeId: string,
  property: AnimatableProperty,
): AnimationTrack | undefined {
  return animation.tracks.find(
    (track) => track.nodeId === nodeId && track.property === property,
  )
}

export function isArmed(
  animation: DocumentAnimation,
  nodeId: string,
  property: AnimatableProperty,
) {
  return Boolean(findTrack(animation, nodeId, property))
}

const clampTime = (time: number, duration: number) =>
  Math.min(Math.max(time, 0), Math.max(duration, 0))

function easeAt(progress: number, easing: KeyframeEase) {
  const t = Math.min(1, Math.max(0, progress))
  if (easing === 'linear' || t === 0 || t === 1) return t
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function mixValues(
  from: KeyframeValue,
  to: KeyframeValue,
  progress: number,
  property: AnimatableProperty,
): KeyframeValue {
  if (typeof from === 'string' || typeof to === 'string' || isColorProperty(property)) {
    return mixHex(String(from), String(to), progress)
  }
  return from + (to - from) * progress
}

function interpolate(
  keys: Keyframe[],
  time: number,
  property: AnimatableProperty,
): KeyframeValue {
  const sorted = [...keys].sort((a, b) => a.time - b.time)
  if (sorted.length === 0) return isColorProperty(property) ? '#000000' : 0
  if (time <= sorted[0].time) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (time >= last.time) return last.value

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index]
    const to = sorted[index + 1]
    if (time > to.time) continue
    const span = to.time - from.time
    const progress = span <= 1e-9 ? 1 : (time - from.time) / span
    return mixValues(
      from.value,
      to.value,
      easeAt(progress, from.easing),
      property,
    )
  }
  return last.value
}

export function evaluateTransform(
  transform: Transform,
  animation: DocumentAnimation,
  nodeId: string,
  time: number,
): Transform {
  let next = transform
  for (const property of TRANSFORM_PROPERTIES) {
    const track = findTrack(animation, nodeId, property)
    if (!track || track.keys.length === 0) continue
    const value = interpolate(track.keys, time, property)
    next = setRestValue(next, property, typeof value === 'number' ? value : Number(value))
  }
  return next
}

export function evaluateNodeAtTime(
  node: EditorNode,
  animation: DocumentAnimation,
  time: number,
): EditorNode {
  let next: EditorNode = {
    ...node,
    transform: evaluateTransform(node.transform, animation, node.id, time),
  }
  for (const track of animation.tracks) {
    if (track.nodeId !== node.id || track.keys.length === 0) continue
    if (isTransformProperty(track.property)) continue
    next = writeChannel(
      next,
      track.property,
      interpolate(track.keys, time, track.property),
    )
  }
  if (next.type === 'group') {
    return {
      ...next,
      children: next.children.map((child) =>
        evaluateNodeAtTime(child, animation, time),
      ),
    }
  }
  return next
}

export function evaluateScene(
  nodes: EditorNode[],
  animation: DocumentAnimation,
  time: number,
): EditorNode[] {
  const t = clampTime(time, animation.duration)
  return nodes.map((node) => evaluateNodeAtTime(node, animation, t))
}

function sortKeys(keys: Keyframe[]) {
  return [...keys].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
}

export function upsertKeyframe(
  animation: DocumentAnimation,
  nodeId: string,
  property: AnimatableProperty,
  time: number,
  value: KeyframeValue,
  easing: KeyframeEase = 'power2.inOut',
): DocumentAnimation {
  const t = clampTime(time, animation.duration)
  const tracks = animation.tracks.map((track) => ({
    ...track,
    keys: track.keys.map((key) => ({ ...key })),
  }))
  let track = tracks.find(
    (item) => item.nodeId === nodeId && item.property === property,
  )
  if (!track) {
    track = { nodeId, property, keys: [] }
    tracks.push(track)
  }
  const existing = track.keys.find((key) => Math.abs(key.time - t) < 1e-4)
  if (existing) {
    existing.value = value
    existing.time = t
  } else {
    track.keys.push({ id: nanoid(), time: t, value, easing })
  }
  track.keys = sortKeys(track.keys)
  return { ...animation, tracks }
}

/**
 * Arms a property. Always seeds a key at t=0 from the rest pose so motion has
 * a start. If the playhead is later, a second key is written there too.
 */
export function armProperty(
  animation: DocumentAnimation,
  nodeId: string,
  property: AnimatableProperty,
  rest: KeyframeValue,
  playhead: number,
): DocumentAnimation {
  if (findTrack(animation, nodeId, property)) {
    return upsertKeyframe(animation, nodeId, property, playhead, rest)
  }
  let next = upsertKeyframe(animation, nodeId, property, 0, rest)
  if (playhead > 1e-4) {
    next = upsertKeyframe(next, nodeId, property, playhead, rest)
  }
  return next
}

export function disarmProperty(
  animation: DocumentAnimation,
  nodeId: string,
  property: AnimatableProperty,
): DocumentAnimation {
  return {
    ...animation,
    tracks: animation.tracks.filter(
      (track) => !(track.nodeId === nodeId && track.property === property),
    ),
  }
}

export function removeKeys(
  animation: DocumentAnimation,
  keyIds: string[],
): DocumentAnimation {
  const drop = new Set(keyIds)
  return {
    ...animation,
    tracks: animation.tracks
      .map((track) => ({
        ...track,
        keys: track.keys.filter((key) => !drop.has(key.id)),
      }))
      .filter((track) => track.keys.length > 0),
  }
}

export function retimeKey(
  animation: DocumentAnimation,
  keyId: string,
  time: number,
): DocumentAnimation {
  const t = clampTime(time, animation.duration)
  return {
    ...animation,
    tracks: animation.tracks.map((track) => {
      const key = track.keys.find((item) => item.id === keyId)
      if (!key) return track
      // A key dragged onto a neighbour absorbs it. The dragged id has to
      // survive, otherwise the pointer loses the key it is still holding.
      const others = track.keys.filter(
        (item) => item.id !== keyId && Math.abs(item.time - t) >= 1e-4,
      )
      return { ...track, keys: sortKeys([...others, { ...key, time: t }]) }
    }),
  }
}

export function setAnimationDuration(
  animation: DocumentAnimation,
  duration: number,
): DocumentAnimation {
  const next = Math.max(0.1, duration)
  return {
    duration: next,
    tracks: animation.tracks.map((track) => ({
      ...track,
      keys: sortKeys(
        track.keys.map((key) => ({
          ...key,
          time: Math.min(key.time, next),
        })),
      ),
    })),
  }
}

export function pruneAnimation(
  animation: DocumentAnimation,
  nodes: EditorNode[],
): DocumentAnimation {
  const live = new Set<string>()
  walkNodes(nodes, (node) => {
    live.add(node.id)
  })
  return {
    ...animation,
    tracks: animation.tracks.filter((track) => live.has(track.nodeId)),
  }
}

export function remapAnimation(
  animation: DocumentAnimation,
  idMap: Map<string, string>,
): AnimationTrack[] {
  const copies: AnimationTrack[] = []
  for (const track of animation.tracks) {
    const nodeId = idMap.get(track.nodeId)
    if (!nodeId) continue
    copies.push({
      nodeId,
      property: track.property,
      keys: track.keys.map((key) => ({ ...key, id: nanoid() })),
    })
  }
  return copies
}

export function collectNodeIds(node: EditorNode, into = new Map<string, string>()) {
  into.set(node.id, node.id)
  if (node.type === 'group') {
    for (const child of node.children) collectNodeIds(child, into)
  }
  return into
}

export function formatTimecode(seconds: number) {
  // Round to hundredths first, otherwise 1.999s reads as 1.100 instead of 2.00.
  const hundredths = Math.round(Math.max(0, seconds) * 100)
  const whole = Math.floor(hundredths / 100)
  const minutes = Math.floor(whole / 60)
  const secs = whole % 60
  const frames = hundredths % 100
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(frames).padStart(2, '0')}`
}

export function nodeHasTracks(
  animation: DocumentAnimation,
  nodeId: string,
) {
  return animation.tracks.some((track) => track.nodeId === nodeId)
}

export function tracksForNode(
  animation: DocumentAnimation,
  nodeId: string,
) {
  return animation.tracks.filter((track) => track.nodeId === nodeId)
}

export function findNodeInTree(nodes: EditorNode[], id: string) {
  return findNode(nodes, id)
}
