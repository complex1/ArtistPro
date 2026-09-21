import { renderDocumentV2, releaseRenderCache } from './engine'
import { applyScenePatch, type RenderRequest, type RenderResponse } from './protocol'
import type { StrokeV2 } from '../core/types'
import { registerStampImage, retainStampImages, isImageStamp, stampPaintSrc, canvas2dRenderer } from './canvas2d'
import { createGpuRenderer } from './gpu'

const surface = new OffscreenCanvas(1, 1)
const context = surface.getContext('2d')!
const strokes = new Map<string, StrokeV2>()
const rasters = new Map<string, OffscreenCanvas>()
const masks = new Map<string, OffscreenCanvas>()
let gpu: ReturnType<typeof createGpuRenderer> | undefined
const worker = self as unknown as { onmessage: (event: MessageEvent<RenderRequest>) => void; postMessage(message: RenderResponse, transfer?: Transferable[]): void }
worker.onmessage = ({ data }) => {
  if (data.type !== 'render') return
  try {
    const document = applyScenePatch(data.patch, strokes)
    if (surface.width !== document.width || surface.height !== document.height) {
      releaseRenderCache(context); surface.width = document.width; surface.height = document.height
    }
    const ids = new Set(document.layers.map(layer => layer.id))
    for (const map of [rasters, masks]) for (const id of map.keys()) if (!ids.has(id)) map.delete(id)
    for (const asset of data.surfaces) {
      const map = asset.kind === 'raster' ? rasters : masks
      if (!asset.bitmap) { map.delete(asset.id); continue }
      const target = new OffscreenCanvas(asset.bitmap.width, asset.bitmap.height)
      target.getContext('2d')!.drawImage(asset.bitmap, 0, 0)
      map.set(asset.id, target)
      asset.bitmap.close()
    }
    for (const asset of data.stamps) registerStampImage(asset.src, asset.bitmap)
    retainStampImages(new Set(document.layers.flatMap(layer => layer.strokes.flatMap(stroke => stroke.brushSnapshot.stamps.filter(isImageStamp).map(stampPaintSrc)))))
    if (data.gpu) gpu ??= createGpuRenderer()
    const before = gpu?.batches ?? 0
    const stats = renderDocumentV2(context, document, data.time, rasters, masks, data.gpu ? gpu! : canvas2dRenderer, data.now)
    const bitmap = surface.transferToImageBitmap()
    worker.postMessage({ type: 'frame', id: data.id, version: data.version, bitmap, stats, gpuBatches: (gpu?.batches ?? 0) - before }, [bitmap])
  } catch (error) {
    for (const asset of [...data.surfaces, ...data.stamps]) asset.bitmap?.close()
    worker.postMessage({ type: 'error', id: data.id, message: error instanceof Error ? error.message : String(error) })
  }
}
