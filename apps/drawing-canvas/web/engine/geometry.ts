import type { Bounds, Point, Quad, Selection, Transform } from './types'

export function normalizeBounds(bounds: Bounds): Bounds {
  return {
    x: Math.min(bounds.x, bounds.x + bounds.width),
    y: Math.min(bounds.y, bounds.y + bounds.height),
    width: Math.abs(bounds.width),
    height: Math.abs(bounds.height),
  }
}

export function boundsCorners(bounds: Bounds): Quad {
  const { x, y, width, height } = normalizeBounds(bounds)
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
}

export function quadBounds(quad: Quad): Bounds {
  const left = Math.min(...quad.map(point => point.x)), top = Math.min(...quad.map(point => point.y))
  return { x: left, y: top, width: Math.max(...quad.map(point => point.x)) - left, height: Math.max(...quad.map(point => point.y)) - top }
}

/** A projective rectangle must stay convex; crossing an edge crosses the projection horizon. */
export function isValidQuad(quad: Quad): boolean {
  if (quad.length !== 4 || !quad.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return false
  const edges = quad.map((point, index) => ({ x: quad[(index + 1) % 4].x - point.x, y: quad[(index + 1) % 4].y - point.y }))
  const scale = Math.max(...edges.map(edge => Math.hypot(edge.x, edge.y)))
  if (!Number.isFinite(scale) || scale < 1e-6) return false
  const turns = edges.map((edge, index) => edge.x / scale * (edges[(index + 1) % 4].y / scale) - edge.y / scale * (edges[(index + 1) % 4].x / scale))
  return turns.every(turn => turn > 1e-9) || turns.every(turn => turn < -1e-9)
}

/** Row-major 3 × 3 matrix, applied with homogeneous division. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number]

export function projectPoint(matrix: Homography, point: { x: number; y: number }): { x: number; y: number } {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8]
  return { x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator }
}

export function invertHomography(matrix: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = matrix
  const cofactors: Homography = [e * i - f * h, c * h - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * h - e * g, b * g - a * h, a * e - b * d]
  const determinant = a * cofactors[0] + b * cofactors[3] + c * cofactors[6]
  if (!Number.isFinite(determinant) || determinant === 0) return null
  const inverse = cofactors.map(value => value / determinant) as unknown as Homography
  return inverse.every(Number.isFinite) ? inverse : null
}

/** Solve in unit-square coordinates to keep translated source rectangles numerically stable. */
export function homographyForQuad(source: Bounds, quad: Quad): Homography | null {
  const bounds = normalizeBounds(source)
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 1e-6 || bounds.height < 1e-6 || !isValidQuad(quad)) return null
  const [a, b, c, d] = quad
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y
  const determinant = dx1 * dy2 - dx2 * dy1
  if (!Number.isFinite(determinant) || determinant === 0) return null
  const g = (dx3 * dy2 - dx2 * dy3) / determinant, h = (dx1 * dy3 - dx3 * dy1) / determinant
  const denominators = [1, 1 + g, 1 + g + h, 1 + h]
  const largest = Math.max(...denominators.map(Math.abs))
  if (!denominators.every(value => Number.isFinite(value) && value > largest * 1e-9)) return null
  const m00 = (b.x - a.x + g * b.x) / bounds.width, m01 = (d.x - a.x + h * d.x) / bounds.height
  const m10 = (b.y - a.y + g * b.y) / bounds.width, m11 = (d.y - a.y + h * d.y) / bounds.height
  const m20 = g / bounds.width, m21 = h / bounds.height
  const matrix: Homography = [m00, m01, a.x - m00 * bounds.x - m01 * bounds.y,
    m10, m11, a.y - m10 * bounds.x - m11 * bounds.y,
    m20, m21, 1 - m20 * bounds.x - m21 * bounds.y]
  return matrix.every(Number.isFinite) && invertHomography(matrix) ? matrix : null
}

export function projectSelection(selection: Selection, matrix: Homography): Selection {
  const bounds = selectionBounds(selection)
  const points = selection.kind === 'lasso' ? selection.points : selection.kind === 'rectangle' ? boundsCorners(bounds) :
    Array.from({ length: 96 }, (_, index) => ({
      x: bounds.x + bounds.width / 2 + Math.cos(index / 96 * Math.PI * 2) * bounds.width / 2,
      y: bounds.y + bounds.height / 2 + Math.sin(index / 96 * Math.PI * 2) * bounds.height / 2,
    }))
  return { kind: 'lasso', points: points.map(point => ({ ...projectPoint(matrix, point), pressure: 'pressure' in point && typeof point.pressure === 'number' ? point.pressure : 1 })) }
}

export function selectionBounds(selection: Selection): Bounds {
  if (selection.kind !== 'lasso') return normalizeBounds(selection.bounds)
  if (!selection.points.length) return { x: 0, y: 0, width: 0, height: 0 }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const point of selection.points) {
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x)
    bottom = Math.max(bottom, point.y)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function containsPoint(selection: Selection | null, x: number, y: number): boolean {
  if (!selection) return true
  if (selection.kind === 'lasso') {
    let inside = false
    const points = selection.points
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j]
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
  }
  const bounds = normalizeBounds(selection.bounds)
  if (!bounds.width || !bounds.height) return false
  if (selection.kind === 'rectangle') return x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height
  return ((x - bounds.x - bounds.width / 2) / (bounds.width / 2)) ** 2 + ((y - bounds.y - bounds.height / 2) / (bounds.height / 2)) ** 2 <= 1
}

/** Use the same winding rule for raster edits and geometric containment. */
export function traceSelection(ctx: CanvasRenderingContext2D, selection: Selection): void {
  ctx.beginPath()
  if (selection.kind === 'lasso') {
    selection.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
    ctx.closePath()
    return
  }
  const bounds = normalizeBounds(selection.bounds)
  if (selection.kind === 'rectangle') ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
  else ctx.ellipse(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width / 2, bounds.height / 2, 0, 0, Math.PI * 2)
}

export function transformPoint(point: Point, bounds: Bounds, value: Transform): Point {
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2
  const radians = value.rotation * Math.PI / 180
  const x = (point.x - cx) * value.scaleX, y = (point.y - cy) * value.scaleY
  return { x: cx + value.x + x * Math.cos(radians) - y * Math.sin(radians), y: cy + value.y + x * Math.sin(radians) + y * Math.cos(radians), pressure: point.pressure }
}

/** Rotated regions become polygons, preserving the transformed clip for the next edit. */
export function transformSelection(selection: Selection, value: Transform): Selection {
  const bounds = selectionBounds(selection)
  let points: Point[]
  if (selection.kind === 'lasso') points = selection.points
  else if (selection.kind === 'ellipse') {
    points = Array.from({ length: 96 }, (_, i) => ({
      x: bounds.x + bounds.width / 2 + Math.cos(i / 96 * Math.PI * 2) * bounds.width / 2,
      y: bounds.y + bounds.height / 2 + Math.sin(i / 96 * Math.PI * 2) * bounds.height / 2,
      pressure: 1,
    }))
  } else {
    points = [{ x: bounds.x, y: bounds.y, pressure: 1 }, { x: bounds.x + bounds.width, y: bounds.y, pressure: 1 },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height, pressure: 1 }, { x: bounds.x, y: bounds.y + bounds.height, pressure: 1 }]
  }
  return { kind: 'lasso', points: points.map(point => transformPoint(point, bounds, value)) }
}
