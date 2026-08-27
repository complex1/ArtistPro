export const PAINT_DOCUMENT_V2_VERSION = 2 as const

export type RendererIdV2 = 'stamp' | 'line' | 'ribbon' | 'particle'
export type RotationMode = 'fixed' | 'followPath' | 'random'
export type BlendModeV2 =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
export type DrawItemKind = 'stamp' | 'particle' | 'segment'

export type ShadowConfig = {
  offsetX: number
  offsetY: number
  blur: number
  color: string
  opacity: number
}

export type ScatterConfig = {
  along: number
  across: number
  seed: number
}

export type ParticleConfig = {
  count: number
  lifetime: number
  velocity: number
  gravity: number
  spawn: number
}

export type StrokePointV2 = {
  x: number
  y: number
  t: number
  pressure: number
  tiltX: number
  tiltY: number
  altitude: number
  velocity: number
}

export type BrushV2 = {
  id: string
  version: number
  name: string
  category: string
  preview?: string
  renderer: RendererIdV2
  animated: boolean
  size: number
  color: string
  opacity: number
  stamps: string[]
  spacing: number
  scatter: ScatterConfig
  stability: number
  blurRadius: number
  glow: number
  shadow: ShadowConfig
  rotation: RotationMode
  rotationDegrees: number
  stampsPerPoint: number
  drift: number
  distortion: number
  blendMode: BlendModeV2
  hardness: number
  particle: ParticleConfig
  speed: number
  seed: number
  animationJs: string
  legacy?: Record<string, unknown>
}

export type StrokeV2 = {
  id: string
  layerId: string
  brushSnapshot: BrushV2
  points: StrokePointV2[]
  seed: number
  createdAt: number
}

export type LayerV2 = {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: BlendModeV2
  groupId?: string
  rasterDataUrl: string | null
  strokes: StrokeV2[]
}

export type PaintDocumentV2 = {
  version: 2
  name: string
  width: number
  height: number
  background: string
  layers: LayerV2[]
  activeLayerId: string
}

export type DrawItem = {
  x: number
  y: number
  size: number
  rotation: number
  opacity: number
  color: string
  stampIndex: number
  blur: number
  glow: number
  shadow: ShadowConfig
  kind: DrawItemKind
  life?: number
  vx?: number
  vy?: number
  scaleX?: number
  scaleY?: number
}

export type EngineDiagnostic = {
  code: string
  message: string
  strokeId?: string
}

export type EngineBudgets = {
  maxSourcePoints: number
  maxSampledPoints: number
  maxDrawItems: number
  maxBlurRadius: number
  animationBudgetMs: number
}

export const DEFAULT_BUDGETS: EngineBudgets = {
  maxSourcePoints: 8_000,
  maxSampledPoints: 4_000,
  maxDrawItems: 12_000,
  maxBlurRadius: 64,
  animationBudgetMs: 24,
}

export type PackedDrawList = {
  items: Float32Array
  count: number
  stride: number
}
