import { hashSeed, mulberry32 } from '../core/rng'
import type {
  BrushV2,
  StrokePointV2,
  StrokeV2,
} from '../core/types'
import { DEFAULT_BUDGETS } from '../core/types'

export type PointerSample = {
  x: number
  y: number
  t: number
  pressure?: number
  tiltX?: number
  tiltY?: number
  altitude?: number
}

export function fromPointer(
  sample: PointerSample,
  previous: StrokePointV2 | null,
): StrokePointV2 {
  const dt = previous ? Math.max(0.001, sample.t - previous.t) : 0.016
  const dx = previous ? sample.x - previous.x : 0
  const dy = previous ? sample.y - previous.y : 0
  return {
    x: sample.x,
    y: sample.y,
    t: sample.t,
    pressure: sample.pressure ?? 0.5,
    tiltX: sample.tiltX ?? 0,
    tiltY: sample.tiltY ?? 0,
    altitude: sample.altitude ?? 0,
    velocity: Math.hypot(dx, dy) / dt,
  }
}

export function stabilizePoint(
  point: StrokePointV2,
  previous: StrokePointV2 | null,
  stability: number,
): StrokePointV2 {
  if (!previous) return point
  const smoothing = Math.min(0.92, Math.max(0, stability) / 100)
  const mix = 1 - smoothing
  return {
    ...point,
    x: previous.x + (point.x - previous.x) * mix,
    y: previous.y + (point.y - previous.y) * mix,
  }
}

export function resampleStroke(
  points: StrokePointV2[],
  spacing: number,
  maxPoints = DEFAULT_BUDGETS.maxSampledPoints,
): StrokePointV2[] {
  if (points.length === 0) return []
  if (points.length === 1) return [points[0]]
  const gap = Math.max(0.5, spacing)
  const result: StrokePointV2[] = [points[0]]
  let carry = 0

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    let traveled = gap - carry
    while (traveled <= length && result.length < maxPoints) {
      const amount = traveled / length
      result.push({
        x: start.x + dx * amount,
        y: start.y + dy * amount,
        t: start.t + (end.t - start.t) * amount,
        pressure: start.pressure + (end.pressure - start.pressure) * amount,
        tiltX: start.tiltX + (end.tiltX - start.tiltX) * amount,
        tiltY: start.tiltY + (end.tiltY - start.tiltY) * amount,
        altitude: start.altitude + (end.altitude - start.altitude) * amount,
        velocity: start.velocity + (end.velocity - start.velocity) * amount,
      })
      traveled += gap
    }
    carry = length - (traveled - gap)
    if (result.length >= maxPoints) break
  }

  return result
}

export function scatterPoints(
  points: StrokePointV2[],
  along: number,
  across: number,
  seed: number,
): StrokePointV2[] {
  if (along === 0 && across === 0) return points
  return points.map((point, index) => {
    const rng = mulberry32(hashSeed(seed, index + 1))
    const tangent = index + 1 < points.length
      ? Math.atan2(points[index + 1].y - point.y, points[index + 1].x - point.x)
      : index > 0
        ? Math.atan2(point.y - points[index - 1].y, point.x - points[index - 1].x)
        : 0
    const alongDelta = (rng() - 0.5) * 2 * along
    const acrossDelta = (rng() - 0.5) * 2 * across
    return {
      ...point,
      x:
        point.x +
        Math.cos(tangent) * alongDelta -
        Math.sin(tangent) * acrossDelta,
      y:
        point.y +
        Math.sin(tangent) * alongDelta +
        Math.cos(tangent) * acrossDelta,
    }
  })
}

export function sampleStroke(
  points: StrokePointV2[],
  brush: BrushV2,
  seed: number,
): StrokePointV2[] {
  const limited = points.slice(0, DEFAULT_BUDGETS.maxSourcePoints)
  const resampled = resampleStroke(limited, brush.spacing)
  return scatterPoints(
    resampled,
    brush.scatter.along,
    brush.scatter.across,
    hashSeed(seed, brush.scatter.seed),
  )
}

export function snapshotStroke(
  brush: BrushV2,
  points: StrokePointV2[],
  layerId: string,
  seed = brush.seed,
): StrokeV2 {
  return {
    id: crypto.randomUUID(),
    layerId,
    brushSnapshot: structuredClone(brush),
    points: points.slice(0, DEFAULT_BUDGETS.maxSourcePoints),
    seed,
    createdAt: Date.now(),
  }
}
