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
import { sampleStroke } from '../input/sampler'
import { canvas2dRenderer, paintDocumentBackground, type PaintRenderer } from './canvas2d'

export type StrokeFrame = {
  items: DrawItem[]
  packed: PackedDrawList
  durationMs: number
  diagnostics: EngineDiagnostic[]
}

const lastGood = new Map<string, DrawItem[]>()

export function strokeFrame(stroke: StrokeV2, timeMs: number): StrokeFrame {
  const brush = stroke.brushSnapshot
  const sampled = sampleStroke(stroke.points, brush, stroke.seed)
  const diagnostics: EngineDiagnostic[] = []
  let items: DrawItem[]
  let durationMs = 0

  if (!brush.animated) {
    items = staticDrawList(sampled, brush, stroke.seed)
  } else {
    const time = (timeMs / 1000) * brush.speed
    const result = runAnimationSync({
      source: brush.animationJs,
      points: sampled,
      config: brush,
      time,
      seed: stroke.seed,
    })
    durationMs = result.durationMs
    diagnostics.push(...result.diagnostics)
    if (result.diagnostics.some((item) => item.code === 'animate-error')) {
      items = lastGood.get(stroke.id) ?? staticDrawList(sampled, brush, stroke.seed)
    } else {
      items = result.items
      lastGood.set(stroke.id, items)
    }
  }

  const finalItems = applyBrushDynamics(applyRendererKind(items, brush), brush, stroke.seed, timeMs)
  return {
    items: finalItems,
    packed: packDrawList(finalItems),
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

// Masked layers composite through a scratch canvas so the mask can punch
// through the vector strokes as well as the raster. One canvas is reused
// because a render pass never interleaves with another.
let scratch: HTMLCanvasElement | null = null

function scratchContext(
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  if (typeof globalThis.document === 'undefined') return null
  if (!scratch) scratch = globalThis.document.createElement('canvas')
  const resized = scratch.width !== width || scratch.height !== height
  if (resized) {
    // Resizing already clears the canvas, so skip the redundant clear.
    scratch.width = width
    scratch.height = height
  }
  const context = scratch.getContext('2d')
  if (context && !resized) {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 1
    context.clearRect(0, 0, width, height)
  }
  return context
}

export function renderDocumentV2(
  context: CanvasRenderingContext2D,
  document: PaintDocumentV2,
  timeMs: number,
  rasters: Map<string, HTMLCanvasElement>,
  masks: Map<string, HTMLCanvasElement> = NO_MASKS,
  renderer: PaintRenderer = canvas2dRenderer,
): FrameStats {
  paintDocumentBackground(context, document.width, document.height, document.background)
  const stats: FrameStats = {
    strokeCount: 0,
    itemCount: 0,
    animationMs: 0,
    diagnostics: [],
  }

  for (const layer of document.layers) {
    if (!layer.visible) continue
    const mask = masks.get(layer.id)
    const masked = mask
      ? scratchContext(document.width, document.height)
      : null
    const target = masked ?? context

    target.save()
    if (!masked) {
      target.globalAlpha = layer.opacity
      target.globalCompositeOperation = layer.blendMode
    }
    const raster = rasters.get(layer.id)
    if (raster) target.drawImage(raster, 0, 0)
    for (const stroke of layer.strokes) {
      const frame = strokeFrame(stroke, timeMs)
      stats.strokeCount += 1
      stats.itemCount += frame.items.length
      stats.animationMs += frame.durationMs
      stats.diagnostics.push(...frame.diagnostics)
      target.save()
      if (stroke.brushSnapshot.blendMode !== 'source-over') {
        target.globalCompositeOperation = stroke.brushSnapshot.blendMode
      }
      renderer.paint(target, frame.items, stroke.brushSnapshot.stamps)
      target.restore()
    }
    target.restore()

    if (masked && mask) {
      masked.save()
      masked.globalCompositeOperation = 'destination-out'
      masked.drawImage(mask, 0, 0)
      masked.restore()
      context.save()
      context.globalAlpha = layer.opacity
      context.globalCompositeOperation = layer.blendMode
      context.drawImage(masked.canvas, 0, 0)
      context.restore()
    }
  }

  return stats
}

export function clearStrokeCache(strokeId?: string): void {
  if (strokeId) lastGood.delete(strokeId)
  else lastGood.clear()
}
