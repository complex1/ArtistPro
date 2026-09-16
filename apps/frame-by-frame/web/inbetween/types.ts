export type PixelPoint = { x: number; y: number }
export type AnchorPair = { id: string; from: PixelPoint; to: PixelPoint; manual?: boolean; confidence?: number }
export type Raster = { width: number; height: number; data: Uint8ClampedArray }
export type Spacing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export type AnalysisOptions = { threshold: number; removeSpecks: boolean }
export type AnalysisResult = { pairs: AnchorPair[]; warnings: string[]; confidence: number }
export type GenerationOptions = AnalysisOptions & { pairs: AnchorPair[]; count: number; spacing: Spacing }
export type GeneratedDrawing = { dataUrl: string; thumbnail: string }
export type WorkerRequest = { id: number; kind: 'analyze'; from: Raster; to: Raster; options: AnalysisOptions }
  | { id: number; kind: 'generate'; from: Raster; to: Raster; options: GenerationOptions }
export type WorkerReply = { id: number; kind: 'analysis'; result: AnalysisResult }
  | { id: number; kind: 'frame'; index: number; raster: Raster }
  | { id: number; kind: 'progress'; value: number }
  | { id: number; kind: 'done' }
  | { id: number; kind: 'error'; message: string }

export const MAX_INBETWEENS = 24
export const MAX_ANCHORS = 48
export const MAX_GENERATED_PIXELS = 48 * 1024 * 1024
