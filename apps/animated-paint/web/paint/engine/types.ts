export type RendererId =
  | 'line'
  | 'stamp'
  | 'ribbon'
  | 'particle'
  | 'nature'
  | 'aura'

export type AnimationId =
  | 'none'
  | 'wiggle'
  | 'wave'
  | 'jitter'
  | 'bounce'
  | 'sway'
  | 'flutter'
  | 'ripple'
  | 'elastic'
  | 'stretch'
  | 'squash'
  | 'drift'
  | 'pulse'
  | 'breathing'
  | 'flicker'
  | 'rainbow'
  | 'flow'
  | 'crawl'
  | 'twinkle'
  | 'twist'
  | 'rise'
  | 'float'
  | 'orbit'
  | 'fall'
  | 'sequence'
  | 'drawOn'
  | 'eraseOut'
  | 'trimStart'
  | 'trimEnd'
  | 'centerReveal'
  | 'bothEnds'
  | 'fadePath'
  | 'grow'

export type StrokePoint = {
  x: number
  y: number
  pressure: number
}

export type BrushContext = {
  x: number
  y: number
  index: number
  progress: number
  time: number
  speed: number
  amount: number
  pressure: number
  seed: number
}

export type BrushExpressions = {
  x?: string
  y?: string
  size?: string
  rotation?: string
  opacity?: string
  hue?: string
  saturation?: string
  lightness?: string
  blur?: string
  glow?: string
  shadowX?: string
  shadowY?: string
  shadowBlur?: string
  shadowOpacity?: string
}

export type AnimatedBrushPoint = StrokePoint & {
  size: number
  rotation: number
  opacity: number
  hue: number
  saturation: number
  lightness: number
  blur: number
  glow: number
  shadowX: number
  shadowY: number
  shadowBlur: number
  shadowOpacity: number
}

export type SampledPoint = StrokePoint & {
  angle: number
  index: number
}

export type BrushPreset = {
  id: string
  name: string
  group: string
  renderer: RendererId
  animation: AnimationId
  stamp?: string
  particle?: string
  nature?: string
  opacity?: number
  glow?: number
  spacing?: number
  density?: number
  widthScale?: number
  dash?: number[]
  expressions?: BrushExpressions
}

export type PaintStroke = {
  id: string
  presetId: string
  renderer: RendererId
  animation: AnimationId
  stamp?: string
  particle?: string
  nature?: string
  color: string
  size: number
  motion: number
  speed: number
  opacity: number
  glow: number
  spacing: number
  density: number
  widthScale: number
  dash: number[] | null
  expressions?: BrushExpressions
  points: StrokePoint[]
  seed: number
}

export type PaintLayer = {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: PaintBlendMode
  groupId?: string
  rasterDataUrl: string | null
  strokes: PaintStroke[]
}

export type PaintBlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'

export type PaintDocument = {
  version: 1
  name: string
  width: number
  height: number
  background: string
  layers: PaintLayer[]
  activeLayerId: string
}
