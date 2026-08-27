import type { LayerV2, StrokeV2 } from '../core/types'

function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(x - x1, y - y1)
  const amount = Math.min(
    1,
    Math.max(0, ((x - x1) * dx + (y - y1) * dy) / lengthSquared),
  )
  return Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount))
}

export function distanceToStroke(stroke: StrokeV2, x: number, y: number): number {
  const points = stroke.points
  if (points.length === 0) return Number.POSITIVE_INFINITY
  if (points.length === 1) return Math.hypot(x - points[0].x, y - points[0].y)
  let closest = Number.POSITIVE_INFINITY
  for (let index = 1; index < points.length; index += 1) {
    const distance = distanceToSegment(
      x,
      y,
      points[index - 1].x,
      points[index - 1].y,
      points[index].x,
      points[index].y,
    )
    if (distance < closest) closest = distance
  }
  return closest
}

// Hit testing uses the authored points, not the animated draw list, so a moving
// stroke stays clickable where the artist drew it.
export function strokeAtPointInList(
  strokes: StrokeV2[],
  x: number,
  y: number,
): StrokeV2 | null {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]
    const tolerance = Math.max(6, stroke.brushSnapshot.size)
    if (distanceToStroke(stroke, x, y) <= tolerance) return stroke
  }
  return null
}

export function strokeAtPoint(
  layers: LayerV2[],
  x: number,
  y: number,
): StrokeV2 | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (!layer.visible) continue
    const hit = strokeAtPointInList(layer.strokes, x, y)
    if (hit) return hit
  }
  return null
}
