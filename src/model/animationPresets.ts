import { nanoid } from 'nanoid'
import { readChannel } from './channels'
import catalog from './animationPresets.json'
import type {
  AnimatableProperty,
  AnimationTrack,
  DocumentAnimation,
  EditorNode,
  Keyframe,
  KeyframeEase,
  KeyframeValue,
} from './types'

export type AnimationPresetId = string
export type SlideDirection = 'left' | 'right' | 'up' | 'down'
export type SpinDirection = 'clockwise' | 'counterclockwise'
export type PresetCategoryId =
  | 'entrance'
  | 'exit'
  | 'emphasis'
  | 'transform'
  | 'loop'
  | 'svg'
  | 'text'
  | 'ui'
  | 'advanced'

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

type ValueMode = 'absolute' | 'offset' | 'multiply' | 'rest'
type ConfigKey = keyof AnimationPresetConfig

type ChannelRecipe = {
  property: AnimatableProperty
  fromMode?: ValueMode
  toMode?: ValueMode
  from?: number | string
  to?: number | string
  fromConfig?: ConfigKey
  toConfig?: ConfigKey
  fromScale?: number
  toScale?: number
  mode?: ValueMode
  keys?: Array<number | string>
}

type Recipe = {
  kind:
    | 'entrance'
    | 'exit'
    | 'cycle'
    | 'timeline'
    | 'slide-in'
    | 'bounce-in'
    | 'bounce-out'
    | 'bounce'
    | 'planned'
  channels?: ChannelRecipe[]
  properties?: AnimatableProperty[]
  peakMode?: ValueMode
  peak?: number
  peakConfig?: ConfigKey
  peakScale?: number
  count?: number
  countConfig?: ConfigKey
  alternate?: boolean
  holdRest?: boolean
  loopToStart?: boolean
}

export type AnimationPreset = {
  id: AnimationPresetId
  name: string
  category: PresetCategoryId
  description: string
  recipe: Recipe
  controls?: string[]
  defaults?: Partial<AnimationPresetConfig>
  requires?: Array<'path' | 'text'>
  planned?: boolean
  properties?: AnimatableProperty[]
}

export type PresetCategory = {
  id: PresetCategoryId
  name: string
}

const loaded = catalog as {
  defaults: AnimationPresetConfig
  categories: PresetCategory[]
  presets: AnimationPreset[]
}

export const PRESET_CATEGORIES: PresetCategory[] = loaded.categories
export const ANIMATION_PRESETS: AnimationPreset[] = loaded.presets
export const DEFAULT_PRESET_CONFIG: AnimationPresetConfig = {
  ...loaded.defaults,
  easing: loaded.defaults.easing as KeyframeEase,
  slideDirection: loaded.defaults.slideDirection as SlideDirection,
  spinDirection: loaded.defaults.spinDirection as SpinDirection,
}

export function presetById(id: AnimationPresetId) {
  return ANIMATION_PRESETS.find((preset) => preset.id === id)
}

export function configForPreset(id: AnimationPresetId): AnimationPresetConfig {
  const preset = presetById(id)
  return { ...DEFAULT_PRESET_CONFIG, ...preset?.defaults }
}

export function presetIsReady(preset: AnimationPreset, node: EditorNode) {
  if (preset.planned || preset.recipe.kind === 'planned') return false
  if (preset.requires?.includes('path') && node.type !== 'path') return false
  if (preset.requires?.includes('text') && node.type !== 'text') return false
  return true
}

const fallbackRest = (property: AnimatableProperty): KeyframeValue => {
  if (property === 'opacity' || property.startsWith('scale.')) return 1
  if (property === 'path.trimEnd') return 1
  if (property === 'fill' || property === 'stroke') return '#4f8cff'
  return 0
}

const restValue = (node: EditorNode, property: AnimatableProperty): KeyframeValue => {
  const value = readChannel(node, property)
  return value === undefined ? fallbackRest(property) : value
}

const configNumber = (
  config: AnimationPresetConfig,
  key: ConfigKey | undefined,
  explicit: number | string | undefined,
  scale = 1,
) => {
  const raw = key ? Number(config[key]) : Number(explicit ?? 0)
  return raw * scale
}

const spinScale = (config: AnimationPresetConfig, scale = 1) =>
  scale * (config.spinDirection === 'clockwise' ? 1 : -1)

const resolveRelative = (
  node: EditorNode,
  property: AnimatableProperty,
  mode: ValueMode | undefined,
  config: AnimationPresetConfig,
  explicit: number | string | undefined,
  configKey: ConfigKey | undefined,
  scale: number | undefined,
): KeyframeValue => {
  const rest = restValue(node, property)
  const amount = configNumber(
    config,
    configKey,
    explicit,
    property === 'rotation' && configKey === 'turns'
      ? spinScale(config, scale ?? 1)
      : (scale ?? 1),
  )
  if (mode === 'rest' || mode === undefined) return rest
  if (typeof rest === 'string') return String(explicit ?? rest)
  if (typeof rest !== 'number') return rest
  if (mode === 'absolute') return amount
  if (mode === 'multiply') return rest * amount
  return rest + amount
}

const key = (
  time: number,
  value: KeyframeValue,
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

const holdThen = (
  start: number,
  rest: KeyframeValue,
  keys: Keyframe[],
): Keyframe[] =>
  start > 0 ? [key(Math.max(0, start - 0.001), rest, 'linear'), ...keys] : keys

const tweenKeys = (
  start: number,
  end: number,
  from: KeyframeValue,
  to: KeyframeValue,
  rest: KeyframeValue,
  easing: KeyframeEase,
) => holdThen(start, rest, [key(start, from, easing), key(end, to, easing)])

const slideProperty = (
  direction: SlideDirection,
): AnimatableProperty =>
  direction === 'left' || direction === 'right' ? 'position.x' : 'position.y'

const slideSign = (direction: SlideDirection) =>
  direction === 'left' || direction === 'up' ? -1 : 1

const collectProperties = (preset: AnimationPreset, config: AnimationPresetConfig) => {
  const recipe = preset.recipe
  if (recipe.kind === 'slide-in') return [slideProperty(config.slideDirection)]
  if (recipe.kind === 'bounce-in' || recipe.kind === 'bounce-out') {
    return ['position.y', 'opacity'] as AnimatableProperty[]
  }
  if (recipe.kind === 'bounce') {
    return ['position.y'] as AnimatableProperty[]
  }
  if (recipe.kind === 'cycle') return [...(recipe.properties ?? [])]
  const properties = new Set<AnimatableProperty>()
  for (const channel of recipe.channels ?? []) properties.add(channel.property)
  return [...properties]
}

export function presetAffectedProperties(
  id: AnimationPresetId,
  config: AnimationPresetConfig,
): AnimatableProperty[] {
  const preset = presetById(id)
  if (!preset) return []
  return collectProperties(preset, config)
}

const buildChannelTween = (
  node: EditorNode,
  channel: ChannelRecipe,
  config: AnimationPresetConfig,
  start: number,
  end: number,
  easing: KeyframeEase,
  fromMode: ValueMode,
  toMode: ValueMode,
) => {
  const rest = restValue(node, channel.property)
  const from = resolveRelative(
    node,
    channel.property,
    fromMode,
    config,
    channel.from,
    channel.fromConfig,
    channel.fromScale,
  )
  const to = resolveRelative(
    node,
    channel.property,
    toMode,
    config,
    channel.to,
    channel.toConfig,
    channel.toScale,
  )
  return track(
    node.id,
    channel.property,
    tweenKeys(start, end, from, to, rest, easing),
  )
}

const buildCycleTracks = (
  node: EditorNode,
  recipe: Recipe,
  config: AnimationPresetConfig,
  start: number,
  duration: number,
  easing: KeyframeEase,
): AnimationTrack[] => {
  const properties = recipe.properties ?? []
  const count = Math.max(
    1,
    Math.round(configNumber(config, recipe.countConfig, recipe.count ?? 2)),
  )
    const alternate = Boolean(recipe.alternate)
    return properties.map((property) => {
    const rest = restValue(node, property)
    const peak = resolveRelative(
      node,
      property,
      recipe.peakMode ?? 'offset',
      config,
      recipe.peak,
      recipe.peakConfig,
      recipe.peakScale,
    )
    const keys: Keyframe[] = []
    const push = (time: number, value: KeyframeValue) => {
      keys.push(key(start + time, value, easing))
    }
    push(0, rest)
    for (let index = 0; index < count; index += 1) {
      const segment = duration / count
      const sign = alternate && index % 2 === 1 ? -1 : 1
      const peakValue =
        typeof peak === 'number' && typeof rest === 'number' && alternate
          ? rest + (peak - rest) * sign
          : peak
      if (recipe.loopToStart) {
        push(segment * (index + 1), peakValue)
      } else {
        push(segment * (index + 0.5), peakValue)
        push(segment * (index + 1), rest)
      }
    }
    return track(node.id, property, holdThen(start, rest, keys))
  })
}

const buildTimelineTracks = (
  node: EditorNode,
  channels: ChannelRecipe[],
  config: AnimationPresetConfig,
  start: number,
  duration: number,
  easing: KeyframeEase,
) =>
  channels.map((channel) => {
    const rest = restValue(node, channel.property)
    const values = channel.keys ?? [0, 1]
    const keys = values.map((value, index) => {
      const at = start + (duration * index) / Math.max(1, values.length - 1)
      const resolved = resolveRelative(
        node,
        channel.property,
        channel.mode ?? 'absolute',
        config,
        value,
        undefined,
        1,
      )
      return key(at, resolved, easing)
    })
    return track(node.id, channel.property, holdThen(start, rest, keys))
  })

const bounceTracks = (
  node: EditorNode,
  config: AnimationPresetConfig,
  start: number,
  duration: number,
  easing: KeyframeEase,
  mode: 'in' | 'out' | 'emphasis',
) => {
  const restY = Number(restValue(node, 'position.y'))
  const restOpacity = Number(restValue(node, 'opacity'))
  const count = Math.max(1, Math.round(config.bounceCount))
  const height = Math.max(0, config.bounceHeight)
  const yKeys: Keyframe[] = []
  const opacityKeys: Keyframe[] = []
  const pushY = (time: number, value: number) =>
    yKeys.push(key(start + time, value, easing))
  if (mode === 'in') {
    pushY(0, restY - height)
    opacityKeys.push(key(start, 0, easing), key(start + duration * 0.2, restOpacity, easing))
  } else {
    pushY(0, restY)
  }
  const usable = mode === 'emphasis' ? duration : duration * 0.8
  const origin = mode === 'in' ? duration * 0.2 : 0
  const cycles = mode === 'out' ? count : count
  for (let index = 0; index < cycles; index += 1) {
    const segment = usable / cycles
    const decay = 1 - index / (cycles * 1.5)
    pushY(origin + segment * (index + 0.5), restY - height * decay)
    pushY(origin + segment * (index + 1), restY)
  }
  if (mode === 'out') {
    pushY(duration, restY - height)
    opacityKeys.push(
      key(start + duration * 0.7, restOpacity, easing),
      key(start + duration, 0, easing),
    )
  }
  const tracks = [
    track(node.id, 'position.y', holdThen(start, restY, yKeys)),
  ]
  if (opacityKeys.length > 0) {
    tracks.push(
      track(node.id, 'opacity', holdThen(start, restOpacity, opacityKeys)),
    )
  }
  return tracks
}

export function buildPresetTracks(
  node: EditorNode,
  id: AnimationPresetId,
  config: AnimationPresetConfig,
  startTime: number,
): AnimationTrack[] {
  const preset = presetById(id)
  if (!preset || !presetIsReady(preset, node)) return []
  const duration = Math.max(0.1, config.duration)
  const start = Math.max(0, startTime)
  const end = start + duration
  const easing = config.easing
  const recipe = preset.recipe

  if (recipe.kind === 'slide-in') {
    const property = slideProperty(config.slideDirection)
    const rest = Number(restValue(node, property))
    const from = rest + Math.max(0, config.distance) * slideSign(config.slideDirection)
    return [
      track(node.id, property, tweenKeys(start, end, from, rest, rest, easing)),
    ]
  }

  if (recipe.kind === 'bounce-in') {
    return bounceTracks(node, config, start, duration, easing, 'in')
  }
  if (recipe.kind === 'bounce-out') {
    return bounceTracks(node, config, start, duration, easing, 'out')
  }
  if (recipe.kind === 'bounce') {
    return bounceTracks(node, config, start, duration, easing, 'emphasis').filter(
      (item) => item.property === 'position.y',
    )
  }

  if (recipe.kind === 'cycle') {
    return buildCycleTracks(node, recipe, config, start, duration, easing)
  }

  if (recipe.kind === 'timeline') {
    return buildTimelineTracks(
      node,
      recipe.channels ?? [],
      config,
      start,
      duration,
      easing,
    )
  }

  if (recipe.kind === 'entrance' || recipe.kind === 'exit') {
    return (recipe.channels ?? []).map((channel) =>
      buildChannelTween(
        node,
        channel,
        config,
        start,
        end,
        easing,
        recipe.kind === 'entrance' ? (channel.fromMode ?? 'absolute') : (channel.fromMode ?? 'rest'),
        recipe.kind === 'entrance' ? (channel.toMode ?? 'rest') : (channel.toMode ?? 'absolute'),
      ),
    )
  }

  return []
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
  if (generated.length === 0) return animation
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
