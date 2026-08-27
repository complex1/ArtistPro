import { hashSeed, mulberry32 } from '../core/rng'
import type { BrushV2, DrawItem, StrokePointV2 } from '../core/types'
import { DEFAULT_BUDGETS } from '../core/types'

function headingAt(points: StrokePointV2[], index: number): number {
  if (points.length < 2) return 0
  if (index + 1 < points.length) {
    return Math.atan2(points[index + 1].y - points[index].y, points[index + 1].x - points[index].x)
  }
  const previous = points[index - 1]
  return Math.atan2(points[index].y - previous.y, points[index].x - previous.x)
}

export function staticDrawList(
  points: StrokePointV2[],
  brush: BrushV2,
  seed: number,
): DrawItem[] {
  const items: DrawItem[] = []
  const count =
    brush.renderer === 'particle' ? Math.max(1, Math.round(brush.particle.count)) : 1
  const rng = mulberry32(hashSeed(seed, 91))

  for (let index = 0; index < points.length; index += 1) {
    if (items.length >= DEFAULT_BUDGETS.maxDrawItems) break
    const point = points[index]
    const tangent = headingAt(points, index)
    const rotation =
      brush.rotation === 'fixed'
        ? 0
        : brush.rotation === 'followPath'
          ? tangent
          : rng() * Math.PI * 2
    const size =
      brush.size * (0.35 + point.pressure * 0.65) *
      (brush.renderer === 'ribbon' ? 1.65 : 1)
    for (let copy = 0; copy < count; copy += 1) {
      if (items.length >= DEFAULT_BUDGETS.maxDrawItems) break
      const jitter = copy === 0 ? 0 : (rng() - 0.5) * brush.size
      items.push({
        x: point.x - Math.sin(tangent) * jitter,
        y: point.y + Math.cos(tangent) * jitter,
        size,
        rotation,
        opacity: brush.opacity * (0.55 + point.pressure * 0.45),
        color: brush.color,
        stampIndex: 0,
        blur: brush.blurRadius,
        glow: brush.glow,
        shadow: { ...brush.shadow },
        kind:
          brush.renderer === 'particle'
            ? 'particle'
            : brush.renderer === 'line' || brush.renderer === 'ribbon'
              ? 'segment'
              : 'stamp',
        life: brush.particle.lifetime,
        vx: Math.cos(tangent) * brush.particle.velocity,
        vy: Math.sin(tangent) * brush.particle.velocity + brush.particle.gravity,
      })
    }
  }

  return items
}
