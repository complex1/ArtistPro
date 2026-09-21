import type { LayerV2, PaintDocumentV2, StrokeV2 } from '../core/types'
import type { FrameStats } from './engine'

export type ScenePatch = {
  document: Omit<PaintDocumentV2, 'layers'>
  layers: (Omit<LayerV2, 'strokes'> & { strokes: string[] })[]
  strokes: StrokeV2[]
  append: { id: string; points: StrokeV2['points']; revision?: number }[]
}
export type RenderRequest = {
  type: 'render'; id: number; version: number; patch: ScenePatch
  time: number; now: number; gpu: boolean
  surfaces: { id: string; kind: 'raster' | 'mask'; bitmap: ImageBitmap | null }[]
  stamps: { src: string; bitmap: ImageBitmap }[]
}
export type RenderResponse =
  | { type: 'frame'; id: number; version: number; bitmap: ImageBitmap; stats: FrameStats; gpuBatches: number }
  | { type: 'error'; id: number; message: string }

/** Only changed strokes cross the worker boundary; growing strokes send a tail. */
export class SceneDiffer {
  private previous = new Map<string, { stroke: StrokeV2; points: StrokeV2['points']; brush: StrokeV2['brushSnapshot']; length: number; revision: number }>()
  diff(document: PaintDocumentV2): ScenePatch {
    const strokes: StrokeV2[] = [], append: ScenePatch['append'] = []
    const next = new Map<string, { stroke: StrokeV2; points: StrokeV2['points']; brush: StrokeV2['brushSnapshot']; length: number; revision: number }>()
    for (const layer of document.layers) for (const stroke of layer.strokes) {
      const previous = this.previous.get(stroke.id)
      const revision = stroke.geometryRevision ?? 0
      if (previous?.stroke === stroke && previous.points === stroke.points && previous.brush === stroke.brushSnapshot && previous.revision === revision && stroke.points.length >= previous.length) {
        if (stroke.points.length > previous.length) append.push({ id: stroke.id, points: stroke.points.slice(previous.length), revision })
      } else strokes.push(stroke)
      next.set(stroke.id, { stroke, points: stroke.points, brush: stroke.brushSnapshot, length: stroke.points.length, revision })
    }
    this.previous = next
    const { layers, ...metadata } = document
    return { document: metadata, strokes, append,
      layers: layers.map(layer => ({ ...layer,
        // Pixels cross once as a transferred surface; drag updates only carry placement.
        image: layer.image ? { ...layer.image, dataUrl: '' } : undefined,
        rasterDataUrl: null, eraseMaskDataUrl: null, strokes: layer.strokes.map(stroke => stroke.id) })) }
  }
}

export function applyScenePatch(patch: ScenePatch, strokes: Map<string, StrokeV2>): PaintDocumentV2 {
  for (const stroke of patch.strokes) strokes.set(stroke.id, stroke)
  for (const tail of patch.append) {
    const stroke = strokes.get(tail.id)
    if (stroke) { stroke.points.push(...tail.points); stroke.geometryRevision = tail.revision }
  }
  const used = new Set(patch.layers.flatMap(layer => layer.strokes))
  for (const id of strokes.keys()) if (!used.has(id)) strokes.delete(id)
  return { ...patch.document, layers: patch.layers.map(layer => ({ ...layer, strokes: layer.strokes.map(id => strokes.get(id)!).filter(Boolean) })) }
}
