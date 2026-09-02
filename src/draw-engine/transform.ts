import type { AffineTransform, PerspectiveCorners, WrapGrid } from './types'

export function applyAffine(
  x: number,
  y: number,
  transform: AffineTransform,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const dx = x - cx
  const dy = y - cy
  const cos = Math.cos(transform.rotation)
  const sin = Math.sin(transform.rotation)
  const rx = dx * transform.scaleX
  const ry = dy * transform.scaleY
  return {
    x: cx + rx * cos - ry * sin + transform.tx,
    y: cy + rx * sin + ry * cos + transform.ty,
  }
}

export function invertAffine(
  x: number,
  y: number,
  transform: AffineTransform,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const px = x - transform.tx - cx
  const py = y - transform.ty - cy
  const cos = Math.cos(-transform.rotation)
  const sin = Math.sin(-transform.rotation)
  const rx = px * cos - py * sin
  const ry = px * sin + py * cos
  return {
    x: cx + rx / (transform.scaleX || 1e-6),
    y: cy + ry / (transform.scaleY || 1e-6),
  }
}

function det3(m: number[]): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  )
}

function invert3(m: number[]): number[] | null {
  const d = det3(m)
  if (Math.abs(d) < 1e-12) return null
  const inv = 1 / d
  return [
    (m[4] * m[8] - m[5] * m[7]) * inv,
    (m[2] * m[7] - m[1] * m[8]) * inv,
    (m[1] * m[5] - m[2] * m[4]) * inv,
    (m[5] * m[6] - m[3] * m[8]) * inv,
    (m[0] * m[8] - m[2] * m[6]) * inv,
    (m[2] * m[3] - m[0] * m[5]) * inv,
    (m[3] * m[7] - m[4] * m[6]) * inv,
    (m[1] * m[6] - m[0] * m[7]) * inv,
    (m[0] * m[4] - m[1] * m[3]) * inv,
  ]
}

export function homographyFromQuads(
  src: PerspectiveCorners,
  dst: PerspectiveCorners,
): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i += 1) {
    const s = src[i]
    const d = dst[i]
    a.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y])
    b.push(d.x)
    a.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y])
    b.push(d.y)
  }
  const h = solve8(a, b)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

function solve8(a: number[][], b: number[]): number[] | null {
  const n = 8
  const m = a.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    const scale = m[col][col]
    for (let j = col; j <= n; j += 1) m[col][j] /= scale
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue
      const factor = m[row][col]
      for (let j = col; j <= n; j += 1) m[row][j] -= factor * m[col][j]
    }
  }
  return m.map((row) => row[n])
}

export function applyHomography(h: number[], x: number, y: number): { x: number; y: number } {
  const w = h[6] * x + h[7] * y + h[8]
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  }
}

export function invertHomography(h: number[]): number[] | null {
  return invert3(h)
}

export function createWrapGrid(
  cols: number,
  rows: number,
  x: number,
  y: number,
  width: number,
  height: number,
): WrapGrid {
  const points: { x: number; y: number }[] = []
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      points.push({
        x: x + (col / cols) * width,
        y: y + (row / rows) * height,
      })
    }
  }
  return { cols, rows, points }
}

export function wrapSample(
  x: number,
  y: number,
  rest: WrapGrid,
  restBounds: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const u = (x - restBounds.x) / restBounds.width
  const v = (y - restBounds.y) / restBounds.height
  const gx = Math.min(rest.cols - 1e-6, Math.max(0, u * rest.cols))
  const gy = Math.min(rest.rows - 1e-6, Math.max(0, v * rest.rows))
  const col = Math.floor(gx)
  const row = Math.floor(gy)
  const fx = gx - col
  const fy = gy - row
  const index = (r: number, c: number) => rest.points[r * (rest.cols + 1) + c]
  const a = index(row, col)
  const b = index(row, col + 1)
  const c = index(row + 1, col)
  const d = index(row + 1, col + 1)
  return {
    x: a.x * (1 - fx) * (1 - fy) + b.x * fx * (1 - fy) + c.x * (1 - fx) * fy + d.x * fx * fy,
    y: a.y * (1 - fx) * (1 - fy) + b.y * fx * (1 - fy) + c.y * (1 - fx) * fy + d.y * fx * fy,
  }
}

export function inverseWrapSample(
  x: number,
  y: number,
  grid: WrapGrid,
  bounds: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  let best = { x: bounds.x, y: bounds.y }
  let bestDist = Number.POSITIVE_INFINITY
  const steps = 24
  for (let iy = 0; iy <= steps; iy += 1) {
    for (let ix = 0; ix <= steps; ix += 1) {
      const sx = bounds.x + (ix / steps) * bounds.width
      const sy = bounds.y + (iy / steps) * bounds.height
      const mapped = wrapSample(sx, sy, grid, bounds)
      const dist = (mapped.x - x) ** 2 + (mapped.y - y) ** 2
      if (dist < bestDist) {
        bestDist = dist
        best = { x: sx, y: sy }
      }
    }
  }
  return best
}
