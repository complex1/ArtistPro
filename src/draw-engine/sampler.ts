import type { BrushConfig, PointerPoint } from './types'
import { DEFAULT_BUDGETS } from './types'

export type PointerSample = {
  x: number
  y: number
  t: number
  pressure?: number
  tiltX?: number
  tiltY?: number
  altitude?: number
}

export function emptyPoint(x: number, y: number, t = 0): PointerPoint {
  return {
    x,
    y,
    t,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    altitude: 0,
    velocity: 0,
  }
}

export function fromPointer(
  sample: PointerSample,
  previous: PointerPoint | null,
): PointerPoint {
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
  point: PointerPoint,
  previous: PointerPoint | null,
  stability: number,
): PointerPoint {
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
  points: PointerPoint[],
  spacing: number,
  maxPoints = DEFAULT_BUDGETS.maxSampledPoints,
): PointerPoint[] {
  if (points.length === 0) return []
  if (points.length === 1) return [points[0]]
  const gap = Math.max(0.5, spacing)
  const result: PointerPoint[] = [points[0]]
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

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  if (state === 0) state = 0x9e3779b9
  return () => {
    state += 0x6d2b79f5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed: number, salt: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + salt) >>> 0
}

export function scatterPoints(
  points: PointerPoint[],
  along: number,
  across: number,
  seed: number,
): PointerPoint[] {
  if (along === 0 && across === 0) return points
  return points.map((point, index) => {
    const rng = mulberry32(hashSeed(seed, index + 1))
    const tangent =
      index + 1 < points.length
        ? Math.atan2(points[index + 1].y - point.y, points[index + 1].x - point.x)
        : index > 0
          ? Math.atan2(point.y - points[index - 1].y, point.x - points[index - 1].x)
          : 0
    const alongDelta = (rng() - 0.5) * 2 * along
    const acrossDelta = (rng() - 0.5) * 2 * across
    return {
      ...point,
      x: point.x + Math.cos(tangent) * alongDelta - Math.sin(tangent) * acrossDelta,
      y: point.y + Math.sin(tangent) * alongDelta + Math.cos(tangent) * acrossDelta,
    }
  })
}

export function sampleStroke(
  points: PointerPoint[],
  brush: BrushConfig,
  seed: number,
): PointerPoint[] {
  const limited = points.slice(0, DEFAULT_BUDGETS.maxSourcePoints)
  const resampled = resampleStroke(limited, brush.spacing)
  return scatterPoints(
    resampled,
    brush.scatter.along,
    brush.scatter.across,
    hashSeed(seed, brush.scatter.seed),
  )
}

export { hashSeed, mulberry32 }
