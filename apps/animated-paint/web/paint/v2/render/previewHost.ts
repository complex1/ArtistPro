import type { PaintDocumentV2 } from '../core/types'
import { isImageStamp, stampPaintSrc, onStampAssetReady } from './canvas2d'
import { renderDocumentV2, releaseRenderCache, type FrameStats, type LayerSurfaces } from './engine'
import { SceneDiffer, type RenderRequest, type RenderResponse } from './protocol'

const surfaceVersions = new WeakMap<HTMLCanvasElement, number>()
export function touchSurface(surface: HTMLCanvasElement) {
  surfaceVersions.set(surface, (surfaceVersions.get(surface) ?? 0) + 1)
}
type Frame = { document: PaintDocumentV2; surfaces: LayerSurfaces; time: number; now: number; version: number; gpu: boolean }
type Callbacks = {
  painted(stats: FrameStats, worker: boolean, gpuBatches: number): void
  error(message: string): void
  invalidate(): void
}

/** One persistent worker, one in-flight frame and one replaceable pending frame. */
export class PaintPreviewHost {
  private worker: Worker | null = null
  private context: CanvasRenderingContext2D
  private callbacks: Callbacks
  private differ = new SceneDiffer()
  private surfaces = new Map<string, { source: HTMLCanvasElement; revision: number }>()
  private stamps = new Set<string>()
  private pending?: Frame
  private busy = false
  private disposed = false
  private failed = false
  private latestVersion = 0
  private id = 0
  private timeout?: ReturnType<typeof setTimeout>
  private unsubscribe: () => void
  constructor(canvas: HTMLCanvasElement, callbacks: Callbacks) {
    this.context = canvas.getContext('2d')!
    this.callbacks = callbacks
    this.unsubscribe = onStampAssetReady(callbacks.invalidate)
    try {
      if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
        this.worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })
        this.worker.onmessage = (event: MessageEvent<RenderResponse>) => this.receive(event.data)
        this.worker.onerror = () => this.fail('The render worker stopped. Reopen the canvas to restart the preview.')
      }
    } catch { this.worker = null }
  }
  get threaded() { return this.worker !== null }
  request(frame: Frame) {
    if (this.disposed || this.failed) return
    this.latestVersion = frame.version
    this.pending = frame
    if (!this.busy) void this.send()
  }
  private async send() {
    const frame = this.pending
    if (!frame || this.disposed || this.failed) return
    this.pending = undefined; this.busy = true
    if (!this.worker) {
      const stats = renderDocumentV2(this.context, frame.document, frame.time, frame.surfaces.rasters, frame.surfaces.masks, undefined, frame.now)
      this.busy = false; this.callbacks.painted(stats, false, 0); return
    }
    const assets: RenderRequest['surfaces'] = [], stamps: RenderRequest['stamps'] = []
    this.timeout = setTimeout(() => this.fail('Preview paused: a brush or image took too long to render. Reopen the canvas after correcting the brush.'), 10_000)
    try {
      const used = new Set<string>()
      for (const [kind, map] of [['raster', frame.surfaces.rasters], ['mask', frame.surfaces.masks]] as const) {
        for (const [id, source] of map) {
          const key = `${kind}:${id}`, revision = surfaceVersions.get(source) ?? 0
          used.add(key)
          const previous = this.surfaces.get(key)
          if (previous?.source !== source || previous.revision !== revision) {
            assets.push({ kind, id, bitmap: await createImageBitmap(source) })
            this.surfaces.set(key, { source, revision })
          }
        }
      }
      for (const key of this.surfaces.keys()) if (!used.has(key)) {
        const split = key.indexOf(':')
        assets.push({ kind: key.slice(0, split) as 'raster' | 'mask', id: key.slice(split + 1), bitmap: null })
        this.surfaces.delete(key)
      }
      const needed = new Set(frame.document.layers.flatMap(layer => layer.strokes.flatMap(stroke => stroke.brushSnapshot.stamps.filter(isImageStamp).map(stampPaintSrc))))
      for (const src of this.stamps) if (!needed.has(src)) this.stamps.delete(src)
      for (const src of needed) if (!this.stamps.has(src)) {
        const image = new Image()
        image.src = src
        try { await image.decode(); stamps.push({ src, bitmap: await createImageBitmap(image) }) }
        catch { /* Broken stamps are skipped consistently with Canvas2D. */ }
        this.stamps.add(src)
      }
      if (this.disposed || this.failed) {
        for (const asset of [...assets, ...stamps]) asset.bitmap?.close()
        return
      }
      const message: RenderRequest = { type: 'render', id: ++this.id, version: frame.version,
        patch: this.differ.diff(frame.document), time: frame.time, now: frame.now, gpu: frame.gpu, surfaces: assets, stamps }
      this.worker.postMessage(message, [...assets, ...stamps].flatMap(asset => asset.bitmap ? [asset.bitmap] : []))
    } catch (error) {
      for (const asset of [...assets, ...stamps]) asset.bitmap?.close()
      this.fail(error instanceof Error ? error.message : 'Could not render this canvas.')
    }
  }
  private receive(message: RenderResponse) {
    if (message.type === 'error') { this.fail(message.message); return }
    clearTimeout(this.timeout); this.busy = false
    if (!this.disposed && message.version === this.latestVersion) {
      const canvas = this.context.canvas
      this.context.clearRect(0, 0, canvas.width, canvas.height)
      this.context.drawImage(message.bitmap, 0, 0)
      this.callbacks.painted(message.stats, true, message.gpuBatches)
    }
    message.bitmap.close()
    if (this.pending) void this.send()
  }
  private fail(message: string) {
    clearTimeout(this.timeout); this.worker?.terminate(); this.worker = null
    this.busy = false; this.failed = true; this.pending = undefined
    this.callbacks.error(message)
  }
  dispose() {
    this.disposed = true; clearTimeout(this.timeout); this.unsubscribe(); this.worker?.terminate()
    this.pending = undefined; this.surfaces.clear(); this.stamps.clear(); releaseRenderCache(this.context)
  }
}
