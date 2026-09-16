export type Point = { x: number; y: number; pressure: number }
export type Bounds = { x: number; y: number; width: number; height: number }
/** Source corners in top-left, top-right, bottom-right, bottom-left order. */
export type Quad = readonly [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
export type Selection =
  | { kind: 'rectangle' | 'ellipse'; bounds: Bounds }
  | { kind: 'lasso'; points: Point[] }
export type DrawingTool = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'rectangle' | 'ellipse' | 'select-rectangle' | 'select-ellipse' | 'lasso' | 'transform' | 'hand'
export type BrushKind = 'ink' | 'pencil' | 'marker' | 'airbrush' | 'flat'
export type BrushSettings = {
  kind: BrushKind
  color: string
  size: number
  opacity: number
  flow: number
  hardness: number
  spacing: number
  smoothing: number
  pressureSize: boolean
  pressureOpacity: boolean
}
export type BrushPreset = { id: BrushKind; name: string; description: string; settings: Omit<BrushSettings, 'color'> }
export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
export type DrawingLayer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  dataUrl: string | null
}
/** Layers are stored bottom to top. Pixel data is saved as lossless PNG. */
export type DrawingDocument = {
  version: 1
  name: string
  width: number
  height: number
  background: string | null
  activeLayerId: string
  layers: DrawingLayer[]
}
export type Transform = { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
export type EngineState = Omit<DrawingDocument, 'version'> & {
  selection: Selection | null
  canUndo: boolean
  canRedo: boolean
  revision: number
}
