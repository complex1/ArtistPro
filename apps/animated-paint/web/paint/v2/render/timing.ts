import type { StrokeV2 } from '../core/types'
import { animationSourceHash } from '../core/animationTiming'
import { BUILTIN_BRUSHES } from '../presets'

// Exact recipe matching also upgrades existing saved stroke snapshots safely.
const builtins = new Map(BUILTIN_BRUSHES.map(brush => [brush.animationJs, brush.animationTiming]))

export function strokeTiming(stroke: StrokeV2, timeMs: number, ageMs: number) {
  const brush = stroke.brushSnapshot
  if ((!brush.animated && brush.drift === 0) || brush.speed === 0) {
    return { key: 'static', delay: Infinity }
  }
  const declared = brush.animationTiming ?? builtins.get(brush.animationJs)
  const timing = declared?.sourceHash === animationSourceHash(brush.animationJs) ? declared : undefined
  if (brush.drift === 0 && timing) {
    // Static recipes still evaluate custom geometry whenever points or brush
    // settings change; only the clock stops invalidating their cached frame.
    if (timing.mode === 'static') return { key: 'static', delay: Infinity }
    if (timing.mode === 'stepped') {
      const frame = timeMs * brush.speed * timing.fps / 1000
      return { key: `step:${Math.floor(frame)}`, delay: (1 - (frame - Math.floor(frame))) * 1000 / (brush.speed * timing.fps) }
    }
    const points = stroke.points
    const pathSeconds = points.length ? Math.max(0, points[points.length - 1].t - points[0].t) : 0
    if (ageMs >= pathSeconds * 1000 + timing.settleSeconds * 1000 / brush.speed) {
      return { key: 'settled', delay: Infinity }
    }
  }
  return { key: `${timeMs}:${ageMs}`, delay: 0 }
}

export function nextDocumentFrame(document: import('../core/types').PaintDocumentV2, timeMs: number, nowMs?: number): number {
  let delay = Infinity
  for (const layer of document.layers) {
    if (!layer.visible) continue
    for (const stroke of layer.strokes) {
      delay = Math.min(delay, strokeTiming(stroke, timeMs, nowMs === undefined ? timeMs : nowMs - stroke.createdAt).delay)
    }
  }
  return delay
}
