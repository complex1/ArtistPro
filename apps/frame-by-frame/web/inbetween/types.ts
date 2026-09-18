export type PixelPoint = { x: number; y: number }
export type AnchorPair = { id: string; from: PixelPoint; to: PixelPoint; manual?: boolean; confidence?: number }
export type Raster = { width: number; height: number; data: Uint8ClampedArray }
export type Spacing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
/**
 * `adaptive` fits a small radial-basis motion model from the key drawings and
 * the editable guide pairs for the current request. It never sends artwork or
 * depends on a downloaded checkpoint.
 */
export type MotionRefinement = 'guided' | 'adaptive'
export type AnalysisOptions = { threshold: number; removeSpecks: boolean }
export type AnalysisResult = { pairs: AnchorPair[]; warnings: string[]; confidence: number }
export type GenerationOptions = AnalysisOptions & { pairs: AnchorPair[]; count: number; spacing: Spacing; refinement?: MotionRefinement }
export type GeneratedDrawing = { dataUrl: string; thumbnail: string }
export type GenerationResult = { drawings: GeneratedDrawing[]; refinement: MotionRefinement }
export type WorkerRequest = { id: number; kind: 'analyze'; from: Raster; to: Raster; options: AnalysisOptions }
  | { id: number; kind: 'generate'; from: Raster; to: Raster; options: GenerationOptions }
export type WorkerReply = { id: number; kind: 'analysis'; result: AnalysisResult }
  | { id: number; kind: 'frame'; index: number; raster: Raster }
  | { id: number; kind: 'progress'; value: number }
  | { id: number; kind: 'done'; refinement: MotionRefinement }
  | { id: number; kind: 'error'; message: string }

export const MAX_INBETWEENS = 24
export const MAX_ANCHORS = 48
export const MAX_GENERATED_PIXELS = 48 * 1024 * 1024
