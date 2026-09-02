export const DRAW_DOCUMENT_VERSION = 1 as const
export const MAX_DOCUMENT_SIZE = 4096
export const MIN_DOCUMENT_SIZE = 8
export const TILE_SIZE = 64

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'erase'

export type RotationMode = 'fixed' | 'followPath' | 'random'
export type TipKind = 'round' | 'oval' | 'grain' | 'stamp'
export type ToolId =
  | 'brush'
  | 'lasso'
  | 'fill'
  | 'transform'
  | 'liquify'

export type TransformMode =
  | 'move'
  | 'resize'
  | 'free'
  | 'perspective'
  | 'wrap'

export type PointerPoint = {
  x: number
  y: number
  t: number
  pressure: number
  tiltX: number
  tiltY: number
  altitude: number
  velocity: number
}

export type PressureMaps = {
  size: number
  opacity: number
  flow: number
}

export type StampImage = {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export type BrushConfig = {
  id: string
  version: number
  name: string
  category: string
  preset: 'pen' | 'pencil' | 'marker' | 'eraser' | 'brush' | 'stamp' | 'soft' | 'custom'
  tip: TipKind
  size: number
  minSize: number
  color: string
  opacity: number
  flow: number
  hardness: number
  spacing: number
  scatter: { along: number; across: number; seed: number }
  stability: number
  rotation: RotationMode
  rotationDegrees: number
  blendMode: BlendMode
  pressure: PressureMaps
  stamps: string[]
  stampImages: StampImage[]
  seed: number
}

export type DrawLayer = {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: BlendMode
}

export type DrawDocument = {
  version: typeof DRAW_DOCUMENT_VERSION
  name: string
  width: number
  height: number
  background: string
  layers: DrawLayer[]
  activeLayerId: string
}

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type Rgba = {
  r: number
  g: number
  b: number
  a: number
}

export type SurfaceId = string

export type Dab = {
  x: number
  y: number
  size: number
  rotation: number
  hardness: number
  flow: number
  opacity: number
  color: Rgba
  erase: boolean
  tip: TipKind
  stamp?: StampImage
  seed: number
}

export type FillOptions = {
  tolerance: number
}

export type AffineTransform = {
  scaleX: number
  scaleY: number
  rotation: number
  tx: number
  ty: number
}

export type PerspectiveCorners = {
  x: number
  y: number
}[]

export type WrapGrid = {
  cols: number
  rows: number
  points: { x: number; y: number }[]
}

export type LiquifyMode = 'push' | 'twirl' | 'pinch'

export type EngineBudgets = {
  maxSourcePoints: number
  maxSampledPoints: number
}

export const DEFAULT_BUDGETS: EngineBudgets = {
  maxSourcePoints: 8_000,
  maxSampledPoints: 4_000,
}
