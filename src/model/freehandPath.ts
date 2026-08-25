import { createPathPoint } from './path'
import type { PathPoint, Vec2 } from './types'

const distanceSquared = (a: Vec2, b: Vec2) => {
  const x = a.x - b.x
  const y = a.y - b.y
  return x * x + y * y
}

const segmentDistanceSquared = (point: Vec2, start: Vec2, end: Vec2) => {
  const length = distanceSquared(start, end)
  if (length === 0) return distanceSquared(point, start)
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * (end.x - start.x) +
        (point.y - start.y) * (end.y - start.y)) /
        length,
    ),
  )
  return distanceSquared(point, {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  })
}

export function dedupeFreehandPoints(points: Vec2[], minimumDistance = 0.5) {
  if (points.length === 0) return []
  const minimumSquared = minimumDistance * minimumDistance
  const result = [{ ...points[0] }]
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    if (distanceSquared(point, result[result.length - 1]) >= minimumSquared) {
      result.push({ ...point })
    }
  }
  const last = points[points.length - 1]
  if (
    result.length > 1 &&
    distanceSquared(last, result[result.length - 1]) > 1e-8
  ) {
    result.push({ ...last })
  }
  return result
}

export function simplifyFreehandPoints(points: Vec2[], tolerance: number) {
  if (points.length <= 2) return points.map((point) => ({ ...point }))
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const toleranceSquared = tolerance * tolerance
  const ranges: [number, number][] = [[0, points.length - 1]]

  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!
    let furthestIndex = -1
    let furthestDistance = toleranceSquared
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = segmentDistanceSquared(
        points[index],
        points[startIndex],
        points[endIndex],
      )
      if (distance > furthestDistance) {
        furthestDistance = distance
        furthestIndex = index
      }
    }
    if (furthestIndex >= 0) {
      keep[furthestIndex] = 1
      ranges.push(
        [startIndex, furthestIndex],
        [furthestIndex, endIndex],
      )
    }
  }

  return points.filter((_, index) => keep[index]).map((point) => ({ ...point }))
}

const sharpCorner = (previous: Vec2, point: Vec2, next: Vec2) => {
  const incoming = { x: previous.x - point.x, y: previous.y - point.y }
  const outgoing = { x: next.x - point.x, y: next.y - point.y }
  const divisor =
    Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y)
  if (divisor === 0) return true
  const cosine = Math.max(
    -1,
    Math.min(1, (incoming.x * outgoing.x + incoming.y * outgoing.y) / divisor),
  )
  return Math.acos(cosine) < (115 * Math.PI) / 180
}

export function fitFreehandPath(
  rawPoints: Vec2[],
  smoothing: number,
): PathPoint[] {
  const amount = Math.max(0, Math.min(1, smoothing))
  const deduped = dedupeFreehandPoints(rawPoints)
  if (deduped.length < 2) return []
  const points = simplifyFreehandPoints(deduped, 0.35 + amount * 4)
  if (points.length < 2) return []

  const pathPoints = points.map((point) => createPathPoint(point))
  const handleStrength = 0.5 + amount * 0.5

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]
    const start = points[index]
    const end = points[index + 1]
    const following = points[Math.min(points.length - 1, index + 2)]
    const firstControl = {
      x: start.x + ((end.x - previous.x) * handleStrength) / 6,
      y: start.y + ((end.y - previous.y) * handleStrength) / 6,
    }
    const secondControl = {
      x: end.x - ((following.x - start.x) * handleStrength) / 6,
      y: end.y - ((following.y - start.y) * handleStrength) / 6,
    }
    pathPoints[index].handleOut = {
      x: firstControl.x - start.x,
      y: firstControl.y - start.y,
    }
    pathPoints[index + 1].handleIn = {
      x: secondControl.x - end.x,
      y: secondControl.y - end.y,
    }
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    if (sharpCorner(points[index - 1], points[index], points[index + 1])) {
      pathPoints[index].handleIn = { x: 0, y: 0 }
      pathPoints[index].handleOut = { x: 0, y: 0 }
      pathPoints[index].handleMode = 'none'
    } else {
      pathPoints[index].handleMode = 'asymmetric'
    }
  }
  pathPoints[0].handleMode = 'asymmetric'
  pathPoints[pathPoints.length - 1].handleMode = 'asymmetric'
  return pathPoints
}
