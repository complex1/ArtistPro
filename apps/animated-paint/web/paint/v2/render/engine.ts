import { packDrawList } from '../core/pack'
import { hashSeed, mulberry32 } from '../core/rng'
import type {
  BrushV2,
  DrawItem,
  EngineDiagnostic,
  PackedDrawList,
  PaintDocumentV2,
  StrokeV2,
} from '../core/types'
import { DEFAULT_BUDGETS } from '../core/types'
import { runAnimationSync } from '../animation/evaluate'
import { staticDrawList } from '../animation/staticDrawList'
import { canvas2dRenderer, paintDocumentBackground, stampAssetVersion, type PaintRenderer } from './canvas2d'
import { createSurface, context2d, type PaintContext, type PaintSurface } from './surfaces'
import { strokeTiming } from './timing'
import { RenderCache } from './renderCache'
import { closedStrokeFrame, sampleStrokeForFrame, type StrokeFill } from './fill'

export type StrokeFrame = {
  items: DrawItem[]
  packed: PackedDrawList
  durationMs: number
  diagnostics: EngineDiagnostic[]
  fill?: StrokeFill
}

let lastGood = new WeakMap<StrokeV2, DrawItem[]>()
// Strongly hold only a bounded window of fallbacks; WeakRefs do not retain
// deleted strokes or closed projects just to keep an error preview alive.
const fallbackWindow: { stroke: WeakRef<StrokeV2>; items: WeakRef<DrawItem[]>; count: number }[] = []
let fallbackItems = 0
function rememberGood(stroke: StrokeV2, items: DrawItem[]) {
  lastGood.set(stroke, items)
  fallbackWindow.push({ stroke: new WeakRef(stroke), items: new WeakRef(items), count: items.length })
  fallbackItems += items.length
  while (fallbackItems > 100_000 || fallbackWindow.length > 256) {
    const entry = fallbackWindow.shift()!
    const old = entry.stroke.deref()
    if (old && lastGood.get(old) === entry.items.deref()) lastGood.delete(old)
    fallbackItems -= entry.count
  }
}

export function strokeFrame(stroke: StrokeV2, timeMs: number, ageMs = timeMs, sampledPoints?: StrokeV2['points']): StrokeFrame {
  const brush = stroke.brushSnapshot
  const sampled = sampledPoints ?? sampleStrokeForFrame(stroke)
  const closedStart = performance.now()
  const closed = closedStrokeFrame(stroke, sampled, timeMs)
  if (closed) {
    // The cyclic contour already includes coherent drift. Stamp-only dynamics
    // still apply to the texture border without displacing its fill twice.
    const items = applyBrushDynamics(closed.items, { ...brush, drift: 0 }, stroke.seed, timeMs)
    let packed: PackedDrawList | undefined
    return { ...closed, items, get packed() { return packed ??= packDrawList(items) },
      durationMs: performance.now() - closedStart, diagnostics: [] }
  }
  const diagnostics: EngineDiagnostic[] = []
  let items: DrawItem[]
  let durationMs = 0

  if (!brush.animated) {
    items = staticDrawList(sampled, brush, stroke.seed)
  } else {
    const time = (timeMs / 1000) * brush.speed
    const result = runAnimationSync({
      source: brush.animationJs,
      points: sampledPoints ? sampled.map(point => ({ ...point })) : sampled,
      config: brush,
      time,
      age: (Math.max(0, ageMs) / 1000) * brush.speed,
      seed: stroke.seed,
    })
    durationMs = result.durationMs
    diagnostics.push(...result.diagnostics)
    if (result.diagnostics.some((item) => item.code === 'animate-error')) {
      items = lastGood.get(stroke) ?? staticDrawList(sampled, brush, stroke.seed)
    } else {
      items = result.items
      rememberGood(stroke, items)
    }
  }

  const finalItems = applyBrushDynamics(applyRendererKind(items, brush), brush, stroke.seed, timeMs)
  let packed: PackedDrawList | undefined
  return {
    items: finalItems,
    get packed() { return packed ??= packDrawList(finalItems) },
    durationMs,
    diagnostics: diagnostics.map((item) => ({ ...item, strokeId: stroke.id })),
  }
}

function applyBrushDynamics(
  items: DrawItem[],
  brush: BrushV2,
  seed: number,
  timeMs: number,
): DrawItem[] {
  if (brush.drift === 0 && brush.distortion === 0 && brush.rotationDegrees === 0 && brush.stampsPerPoint === 1 &&
      items.every(item => item.stampIndex < Math.max(1, brush.stamps.length))) return items
  const output: DrawItem[] = []
  const rotation = (brush.rotationDegrees * Math.PI) / 180
  const elapsed = (timeMs / 1000) * brush.speed

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const copies =
      item.kind === 'segment' ? 1 : Math.max(1, Math.round(brush.stampsPerPoint))
    for (let copy = 0; copy < copies; copy += 1) {
      if (output.length >= DEFAULT_BUDGETS.maxDrawItems) return output
      const rng = mulberry32(hashSeed(seed, index * 97 + copy * 31))
      const phase = rng() * Math.PI * 2
      const aspect = 1 + (rng() * 2 - 1) * brush.distortion
      const inverseAspect = 1 / Math.max(0.05, aspect)
      output.push({
        ...item,
        x: item.x + Math.cos(elapsed + phase) * brush.drift,
        y: item.y + Math.sin(elapsed + phase) * brush.drift,
        rotation: item.rotation + rotation,
        stampIndex:
          brush.stamps.length > 0
            ? (item.stampIndex + copy) % brush.stamps.length
            : 0,
        scaleX: (item.scaleX ?? 1) * aspect,
        scaleY: (item.scaleY ?? 1) * inverseAspect,
      })
    }
  }
  return output
}

// Only stamp and particle items read the brush stamp list, so a stamp brush
// re-kinds the segments its animation emits. Without this, uploading an image
// to a brush whose JS returns segments silently keeps painting plain lines.
function applyRendererKind(items: DrawItem[], brush: BrushV2): DrawItem[] {
  if (brush.renderer !== 'stamp') return items
  if (!items.some((item) => item.kind === 'segment')) return items
  return items.map((item) =>
    item.kind === 'segment' ? { ...item, kind: 'stamp' as const } : item,
  )
}

export type FrameStats = {
  strokeCount: number
  itemCount: number
  animationMs: number
  diagnostics: EngineDiagnostic[]
  totalMs: number
  reusedStrokes: number
  cacheBytes: number
}

/** Off-document pixels a layer needs at paint time. */
export type LayerSurfaces = {
  rasters: Map<string, HTMLCanvasElement>
  masks: Map<string, HTMLCanvasElement>
}

export function emptySurfaces(): LayerSurfaces {
  return { rasters: new Map(), masks: new Map() }
}

const NO_MASKS: Map<string, HTMLCanvasElement> = new Map()

// Composite layers as a group when masking, fading, or blending. Applying layer
// opacity per grain makes overlaps darker and changes the texture of the brush.
// Each destination reuses one surface without retaining closed canvases.
const scratchSurfaces = new WeakMap<PaintContext, PaintSurface>()
let renderCaches = new WeakMap<PaintContext, RenderCache>()

export function releaseRenderCache(context: PaintContext) {
  renderCaches.get(context)?.clear()
  renderCaches.delete(context)
  scratchSurfaces.delete(context)
}

function scratchContext(
  destination: PaintContext,
  width: number,
  height: number,
): PaintContext | null {
  let scratch = scratchSurfaces.get(destination)
  if (!scratch) {
    const surface = createSurface(width, height)
    if (!surface) return null
    scratch = surface
    scratchSurfaces.set(destination, scratch)
  }
  const resized = scratch.width !== width || scratch.height !== height
  if (resized) {
    // Resizing already clears the canvas, so skip the redundant clear.
    scratch.width = width
    scratch.height = height
  }
  const context = context2d(scratch)
  if (context && !resized) {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 1
    context.clearRect(0, 0, width, height)
  }
  return context
}

export function renderDocumentV2(
  context: PaintContext,
  document: PaintDocumentV2,
  timeMs: number,
  rasters: ReadonlyMap<string, PaintSurface>,
  masks: ReadonlyMap<string, PaintSurface> = NO_MASKS,
  renderer: PaintRenderer = canvas2dRenderer,
  // Live drawing uses a clock paired with stroke.createdAt. Exports omit it so
  // all strokes replay from age zero on the deterministic export timeline.
  strokeNowMs?: number,
): FrameStats {
  const start = performance.now()
  let cache = renderCaches.get(context)
  if (!cache) { cache = new RenderCache(); renderCaches.set(context, cache) }
  cache.begin(context.canvas.width, context.canvas.height)
  paintDocumentBackground(context, document.width, document.height, document.background)
  const stats: FrameStats = {
    strokeCount: 0,
    itemCount: 0,
    animationMs: 0,
    diagnostics: [],
    totalMs: 0,
    reusedStrokes: 0,
    cacheBytes: 0,
  }

  for (const layer of document.layers) {
    if (!layer.visible) continue
    const mask = masks.get(layer.id)
    const isolated = mask || layer.opacity !== 1 || layer.blendMode !== 'source-over'
      ? scratchContext(context, document.width, document.height)
      : null
    const target = isolated ?? context

    target.save()
    if (!isolated) {
      target.globalAlpha = layer.opacity
      target.globalCompositeOperation = layer.blendMode
    }
    const raster = rasters.get(layer.id)
    if (raster) {
      const image = layer.kind === 'image' ? layer.image : undefined
      if (image) target.drawImage(raster, image.x, image.y, image.width, image.height)
      else target.drawImage(raster, 0, 0)
    }
    for (const stroke of layer.strokes) {
      const age = strokeNowMs === undefined ? timeMs : strokeNowMs - stroke.createdAt
      const timing = strokeTiming(stroke, timeMs, age)
      const entry = cache.frame(stroke, timing.key, sampled => strokeFrame(stroke, timeMs, age, sampled))
      const frame = entry.frame
      if (entry.reused) stats.reusedStrokes += 1
      stats.strokeCount += 1
      stats.itemCount += frame.items.length
      if (!entry.reused) stats.animationMs += frame.durationMs
      stats.diagnostics.push(...frame.diagnostics)
      target.save()
      if (stroke.brushSnapshot.blendMode !== 'source-over') {
        target.globalCompositeOperation = stroke.brushSnapshot.blendMode
      }
      cache.paint(target, entry, stroke.brushSnapshot.stamps, renderer, timing.delay > 0, stampAssetVersion())
      target.restore()
    }
    target.restore()

    if (isolated) {
      if (mask) {
        isolated.save()
        isolated.globalCompositeOperation = 'destination-out'
        isolated.drawImage(mask, 0, 0)
        isolated.restore()
      }
      context.save()
      context.globalAlpha = layer.opacity
      context.globalCompositeOperation = layer.blendMode
      context.drawImage(isolated.canvas, 0, 0)
      context.restore()
    }
  }

  cache.end()
  stats.totalMs = performance.now() - start
  stats.cacheBytes = cache.bytes
  return stats
}

export function clearStrokeCache(): void {
  lastGood = new WeakMap()
  fallbackWindow.length = 0
  fallbackItems = 0
  renderCaches = new WeakMap()
}
