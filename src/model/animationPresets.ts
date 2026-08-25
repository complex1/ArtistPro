import { nanoid } from 'nanoid'
import { readChannel } from './channels'
import type {
  AnimatableProperty,
  AnimationTrack,
  DocumentAnimation,
  EditorNode,
  Keyframe,
  KeyframeEase,
} from './types'

export type AnimationPresetId =
  | 'fade-in'
  | 'slide-in'
  | 'scale-in'
  | 'spin'
  | 'bounce'
  | 'pulse'

export type SlideDirection = 'left' | 'right' | 'up' | 'down'
export type SpinDirection = 'clockwise' | 'counterclockwise'

export type AnimationPresetConfig = {
  duration: number
  easing: KeyframeEase
  slideDirection: SlideDirection
  distance: number
  startScale: number
  spinDirection: SpinDirection
  turns: number
  bounceHeight: number
  bounceCount: number
  pulseScale: number
  pulseCount: number
}

export type AnimationPreset = {
  id: AnimationPresetId
  name: string
  description: string
  properties: AnimatableProperty[]
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    id: 'fade-in',
    name: 'Fade in',
    description: 'Reveal the layer from transparent.',
    properties: ['opacity'],
  },
  {
    id: 'slide-in',
    name: 'Slide in',
    description: 'Move the layer into its resting position.',
    properties: ['position.x', 'position.y'],
  },
  {
    id: 'scale-in',
    name: 'Scale in',
    description: 'Grow the layer into its resting scale.',
    properties: ['scale.x', 'scale.y'],
  },
  {
    id: 'spin',
    name: 'Spin',
    description: 'Rotate the layer into place.',
    properties: ['rotation'],
  },
  {
    id: 'bounce',
    name: 'Bounce',
    description: 'Bounce vertically above the resting position.',
    properties: ['position.y'],
  },
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Pulse the layer scale repeatedly.',
    properties: ['scale.x', 'scale.y'],
  },
]

export const DEFAULT_PRESET_CONFIG: AnimationPresetConfig = {
  duration: 1,
  easing: 'power2.inOut',
  slideDirection: 'left',
  distance: 120,
  startScale: 0,
  spinDirection: 'clockwise',
  turns: 1,
  bounceHeight: 80,
  bounceCount: 2,
  pulseScale: 1.2,
  pulseCount: 2,
}

const numberChannel = (
  node: EditorNode,
  property: AnimatableProperty,
  fallback: number,
) => {
  const value = readChannel(node, property)
  return typeof value === 'number' ? value : fallback
}

const key = (
  time: number,
  value: number,
  easing: KeyframeEase,
): Keyframe => ({
  id: nanoid(),
  time,
  value,
  easing,
})

const track = (
  nodeId: string,
  property: AnimatableProperty,
  keys: Keyframe[],
): AnimationTrack => ({ nodeId, property, keys })

const entranceKeys = (
  start: number,
  end: number,
  startValue: number,
  restValue: number,
  easing: KeyframeEase,
) => [
  ...(start > 0
    ? [key(Math.max(0, start - 0.001), restValue, 'linear')]
    : []),
  key(start, startValue, easing),
  key(end, restValue, easing),
]

export function presetById(id: AnimationPresetId) {
  return ANIMATION_PRESETS.find((preset) => preset.id === id)!
}

export function presetAffectedProperties(
  id: AnimationPresetId,
  config: AnimationPresetConfig,
): AnimatableProperty[] {
  if (id !== 'slide-in') return [...presetById(id).properties]
  return config.slideDirection === 'left' || config.slideDirection === 'right'
    ? ['position.x']
    : ['position.y']
}

export function buildPresetTracks(
  node: EditorNode,
  id: AnimationPresetId,
  config: AnimationPresetConfig,
  startTime: number,
): AnimationTrack[] {
  const duration = Math.max(0.1, config.duration)
  const start = Math.max(0, startTime)
  const end = start + duration
  const easing = config.easing

  if (id === 'fade-in') {
    const rest = numberChannel(node, 'opacity', 1)
    return [
      track(node.id, 'opacity', entranceKeys(start, end, 0, rest, easing)),
    ]
  }

  if (id === 'slide-in') {
    const horizontal =
      config.slideDirection === 'left' || config.slideDirection === 'right'
    const property: AnimatableProperty = horizontal ? 'position.x' : 'position.y'
    const rest = numberChannel(node, property, 0)
    const negative =
      config.slideDirection === 'left' || config.slideDirection === 'up'
    const offset = Math.max(0, config.distance) * (negative ? -1 : 1)
    return [
      track(
        node.id,
        property,
        entranceKeys(start, end, rest + offset, rest, easing),
      ),
    ]
  }

  if (id === 'scale-in') {
    return (['scale.x', 'scale.y'] as const).map((property) => {
      const rest = numberChannel(node, property, 1)
      return track(
        node.id,
        property,
        entranceKeys(
          start,
          end,
          rest * Math.max(0, config.startScale),
          rest,
          easing,
        ),
      )
    })
  }

  if (id === 'spin') {
    const rest = numberChannel(node, 'rotation', 0)
    const direction = config.spinDirection === 'clockwise' ? -1 : 1
    const angle = Math.max(0, config.turns) * 360 * direction
    return [
      track(
        node.id,
        'rotation',
        entranceKeys(start, end, rest + angle, rest, easing),
      ),
    ]
  }

  if (id === 'bounce') {
    const rest = numberChannel(node, 'position.y', 0)
    const count = Math.max(1, Math.round(config.bounceCount))
    const keys = [key(start, rest, easing)]
    for (let index = 0; index < count; index += 1) {
      const segment = duration / count
      const height = Math.max(0, config.bounceHeight) * (1 - index / (count * 1.5))
      keys.push(
        key(start + segment * (index + 0.5), rest - height, easing),
        key(start + segment * (index + 1), rest, easing),
      )
    }
    return [track(node.id, 'position.y', keys)]
  }

  const count = Math.max(1, Math.round(config.pulseCount))
  return (['scale.x', 'scale.y'] as const).map((property) => {
    const rest = numberChannel(node, property, 1)
    const keys = [key(start, rest, easing)]
    for (let index = 0; index < count; index += 1) {
      const segment = duration / count
      keys.push(
        key(
          start + segment * (index + 0.5),
          rest * Math.max(0, config.pulseScale),
          easing,
        ),
        key(start + segment * (index + 1), rest, easing),
      )
    }
    return track(node.id, property, keys)
  })
}

export function presetConflicts(
  animation: DocumentAnimation,
  nodeId: string,
  id: AnimationPresetId,
  config: AnimationPresetConfig,
): AnimatableProperty[] {
  const affected = new Set(presetAffectedProperties(id, config))
  return animation.tracks
    .filter((item) => item.nodeId === nodeId && affected.has(item.property))
    .map((item) => item.property)
}

export function applyPreset(
  animation: DocumentAnimation,
  node: EditorNode,
  id: AnimationPresetId,
  config: AnimationPresetConfig,
  startTime: number,
): DocumentAnimation {
  const affected = new Set(presetAffectedProperties(id, config))
  const generated = buildPresetTracks(node, id, config, startTime)
  return {
    duration: Math.max(
      animation.duration,
      Math.max(0, startTime) + Math.max(0.1, config.duration),
    ),
    tracks: [
      ...animation.tracks.filter(
        (item) => item.nodeId !== node.id || !affected.has(item.property),
      ),
      ...generated,
    ],
  }
}
