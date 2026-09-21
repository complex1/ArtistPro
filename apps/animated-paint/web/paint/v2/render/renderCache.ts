import type { StrokeV2 } from '../core/types'
import type { StrokeFrame } from './engine'
import type { PaintRenderer } from './canvas2d'
import { createSurface, context2d, type PaintContext, type PaintSurface } from './surfaces'
import { createFillTexture, paintStrokeFill, sampleStrokeForFrame } from './fill'

type Entry = {
  id: string
  points: StrokeV2['points']; length: number; revision: number; brush: string; seed: number
  sampled: StrokeV2['points']; key: string; frame: StrokeFrame; reused: boolean
  raster?: { surface: PaintSurface; x: number; y: number; assetVersion: number; renderer: PaintRenderer }
  fillTexture?: { surface: PaintSurface; key: string }
  bytes: number
}

/** Per-destination cache; bounded and swept after every frame, including undo/delete. */
export class RenderCache {
  private entries = new Map<string, Entry>()
  private used = new Set<string>()
  private width = 0
  private height = 0
  bytes = 0
  readonly budget: number
  constructor(budget = 64 * 1024 * 1024) { this.budget = budget }
  begin(width = 0, height = 0) {
    if (width !== this.width || height !== this.height) { this.clear(); this.width = width; this.height = height }
    this.used.clear()
  }
  clear() { this.entries.clear(); this.bytes = 0 }
  private remove(id: string) {
    const entry = this.entries.get(id)
    if (entry) this.bytes -= entry.bytes
    this.entries.delete(id)
  }
  end() {
    for (const id of this.entries.keys()) if (!this.used.has(id)) this.remove(id)
    while (this.bytes > this.budget && this.entries.size) this.remove(this.entries.keys().next().value!)
  }
  frame(stroke: StrokeV2, key: string, generate: (sampled: StrokeV2['points']) => StrokeFrame): Entry {
    this.used.add(stroke.id)
    let entry = this.entries.get(stroke.id)
    const brush = JSON.stringify(stroke.brushSnapshot)
    const revision = stroke.geometryRevision ?? 0
    if (entry && (entry.points !== stroke.points || entry.length !== stroke.points.length ||
        entry.revision !== revision || entry.brush !== brush || entry.seed !== stroke.seed)) {
      this.remove(stroke.id)
      entry = undefined
    }
    if (entry && entry.key === key) { entry.reused = true; return entry }
    const sampled = entry?.sampled ?? sampleStrokeForFrame(stroke)
    const previousTexture = entry?.fillTexture
    if (entry) this.remove(stroke.id)
    const frame = generate(sampled)
    entry = { id: stroke.id, points: stroke.points, length: stroke.points.length, revision, brush, seed: stroke.seed,
      sampled, key, frame, reused: false, bytes: sampled.length * 80 + frame.items.length * 256 + (frame.fill?.boundary.length ?? 0) * 96 }
    if (previousTexture && frame.fill && previousTexture.key === this.textureKey(frame)) {
      entry.fillTexture = previousTexture
      entry.bytes += previousTexture.surface.width * previousTexture.surface.height * 4
    }
    this.entries.set(stroke.id, entry)
    this.bytes += entry.bytes
    // Evict during traversal as well as at frame end: a large scene must not
    // temporarily retain every generated draw list before the budget applies.
    while (this.bytes > this.budget && this.entries.size) this.remove(this.entries.keys().next().value!)
    return entry
  }
  private textureKey(frame: StrokeFrame) {
    const fill = frame.fill!
    return `${fill.kind}:${fill.seed}:${fill.frame}:${fill.size}:${fill.color}:${fill.textureVariant}:${fill.rotationDegrees}:${fill.distortion}:${fill.stampsPerPoint}`
  }
  paint(context: PaintContext, entry: Entry, stamps: string[], renderer: PaintRenderer, held: boolean, assetVersion: number) {
    const { items, fill } = entry.frame
    if (fill) {
      let texture = entry.fillTexture?.surface
      if (fill.kind !== 'solid' && !texture) {
        texture = createFillTexture(fill) ?? undefined
        if (texture && this.entries.get(entry.id) === entry) {
          const bytes = texture.width * texture.height * 4
          if (this.bytes + bytes <= this.budget) {
            entry.fillTexture = { surface: texture, key: this.textureKey(entry.frame) }
            entry.bytes += bytes; this.bytes += bytes
          }
        }
      }
      paintStrokeFill(context, fill, texture)
    }
    // Source-over is associative at full alpha. Other blend modes/effects must
    // retain per-mark compositing against the actual destination.
    const rasterAllowed = typeof renderer.cacheRaster === 'function' ? renderer.cacheRaster(items, stamps) : renderer.cacheRaster !== false
    const eligible = this.entries.get(entry.id) === entry && rasterAllowed && held && items.length >= 32 && context.globalAlpha === 1 &&
      context.globalCompositeOperation === 'source-over' &&
      items.every(item => item.blur === 0 && item.glow === 0 && item.shadow.opacity === 0)
    if (entry.raster && (entry.raster.assetVersion !== assetVersion || entry.raster.renderer !== renderer)) {
      const bytes = entry.raster.surface.width * entry.raster.surface.height * 4
      entry.bytes -= bytes; this.bytes -= bytes; entry.raster = undefined
    }
    if (eligible && !entry.raster) {
      let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
      for (const item of items) {
        const r = Math.max(0.4, item.size / 2) * Math.max(1, item.scaleX ?? 1, item.scaleY ?? 1) * 1.5 + 2
        x = Math.min(x, item.x - r); y = Math.min(y, item.y - r)
        right = Math.max(right, item.x + r); bottom = Math.max(bottom, item.y + r)
      }
      x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y))
      const width = Math.max(0, Math.min(context.canvas.width, Math.ceil(right)) - x)
      const height = Math.max(0, Math.min(context.canvas.height, Math.ceil(bottom)) - y)
      const bytes = width * height * 4
      if (width && height && this.bytes + bytes <= this.budget) {
        const surface = createSurface(width, height)
        const scratch = surface && context2d(surface)
        if (surface && scratch) {
          scratch.translate(-x, -y)
          renderer.paint(scratch, items, stamps)
          entry.raster = { surface, x, y, assetVersion, renderer }
          entry.bytes += bytes; this.bytes += bytes
        }
      }
    }
    if (eligible && entry.raster) context.drawImage(entry.raster.surface, entry.raster.x, entry.raster.y)
    else renderer.paint(context, items, stamps)
  }
}
