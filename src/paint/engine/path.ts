import type { SampledPoint, StrokePoint } from './types'

export function sampledPath(
  points: StrokePoint[],
  spacing: number,
): SampledPoint[] {
  if (points.length < 2) {
    return points.map((point, index) => ({
      ...point,
      angle: 0,
      index,
    }))
  }

  const result: SampledPoint[] = []
  let distanceToNext = Math.max(1, spacing)

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue

    const angle = Math.atan2(dy, dx)
    while (distanceToNext <= length) {
      const amount = distanceToNext / length
      result.push({
        x: start.x + dx * amount,
        y: start.y + dy * amount,
        pressure:
          start.pressure + (end.pressure - start.pressure) * amount,
        angle,
        index: result.length,
      })
      distanceToNext += spacing
    }
    distanceToNext -= length
  }

  return result
}
