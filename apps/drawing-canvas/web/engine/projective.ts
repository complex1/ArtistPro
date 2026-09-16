import { invertHomography, projectPoint, quadBounds } from './geometry'
import type { Homography } from './geometry'
import type { Bounds, Quad } from './types'

type Raster = { width: number; height: number; data: Uint8ClampedArray }
type RasterPatch = Omit<Raster, 'data'> & { x: number; y: number; data: Uint8ClampedArray<ArrayBuffer> }

/** Sample inverse-mapped pixel centers with premultiplied-alpha bilinear filtering. */
export function warpRaster(source: Raster, bounds: Bounds, quad: Quad, matrix: Homography, width: number, height: number): RasterPatch | null {
  const inverse = invertHomography(matrix)
  if (!inverse) return null
  const target = quadBounds(quad)
  const left = Math.max(0, Math.min(width, Math.floor(target.x))), top = Math.max(0, Math.min(height, Math.floor(target.y)))
  const right = Math.max(left, Math.min(width, Math.ceil(target.x + target.width))), bottom = Math.max(top, Math.min(height, Math.ceil(target.y + target.height)))
  const patchWidth = right - left, patchHeight = bottom - top
  if (!patchWidth || !patchHeight) return null
  const output = new Uint8ClampedArray(patchWidth * patchHeight * 4)
  const [a, b, c, d, e, f, g, h, i] = inverse
  for (let y = top; y < bottom; y++) {
    let numeratorX = a * (left + .5) + b * (y + .5) + c
    let numeratorY = d * (left + .5) + e * (y + .5) + f
    let denominator = g * (left + .5) + h * (y + .5) + i
    for (let x = left; x < right; x++, numeratorX += a, numeratorY += d, denominator += g) {
      if (!denominator) continue
      const sx = numeratorX / denominator, sy = numeratorY / denominator
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < bounds.x || sy < bounds.y || sx >= bounds.x + bounds.width || sy >= bounds.y + bounds.height) continue
      const x0 = Math.floor(sx - .5), y0 = Math.floor(sy - .5)
      const fx = sx - .5 - x0, fy = sy - .5 - y0
      let alpha = 0, red = 0, green = 0, blue = 0
      for (let dy = 0; dy < 2; dy++) {
        const py = y0 + dy
        if (py < 0 || py >= source.height) continue
        for (let dx = 0; dx < 2; dx++) {
          const px = x0 + dx
          if (px < 0 || px >= source.width) continue
          const offset = (py * source.width + px) * 4
          const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * source.data[offset + 3]
          alpha += weight
          red += source.data[offset] * weight
          green += source.data[offset + 1] * weight
          blue += source.data[offset + 2] * weight
        }
      }
      if (!alpha) continue
      const offset = ((y - top) * patchWidth + x - left) * 4
      output[offset] = red / alpha
      output[offset + 1] = green / alpha
      output[offset + 2] = blue / alpha
      output[offset + 3] = alpha
    }
  }
  return { x: left, y: top, width: patchWidth, height: patchHeight, data: output }
}

type Vertex = { x: number; y: number }

function drawTriangle(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, source: readonly [Vertex, Vertex, Vertex], target: readonly [Vertex, Vertex, Vertex]): void {
  const [p, q, r] = source, [u, v, w] = target
  const px = q.x - p.x, py = q.y - p.y, qx = r.x - p.x, qy = r.y - p.y
  const ux = v.x - u.x, uy = v.y - u.y, vx = w.x - u.x, vy = w.y - u.y
  const determinant = px * qy - qx * py
  const a = (ux * qy - vx * py) / determinant, b = (uy * qy - vy * py) / determinant
  const c = (vx * px - ux * qx) / determinant, d = (vy * px - uy * qx) / determinant
  const cx = (u.x + v.x + w.x) / 3, cy = (u.y + v.y + w.y) / 3
  ctx.save()
  ctx.beginPath()
  target.forEach((point, index) => {
    // Overlap triangle clips slightly; copy composition avoids alpha buildup at shared edges.
    const distance = Math.hypot(point.x - cx, point.y - cy)
    const scale = distance ? (distance + .6) / distance : 1
    const x = cx + (point.x - cx) * scale, y = cy + (point.y - cy) * scale
    if (index) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.closePath()
  ctx.clip()
  ctx.transform(a, b, c, d, u.x - a * p.x - c * p.y, u.y - b * p.x - d * p.y)
  ctx.drawImage(image, 0, 0)
  ctx.restore()
}

/** Bounded mesh work for pointer previews; committed pixels use the exact inverse map above. */
export function previewProjective(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, bounds: Bounds, quad: Quad, matrix: Homography): void {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.imageSmoothingEnabled = true
  if (Math.abs(matrix[6]) < 1e-12 && Math.abs(matrix[7]) < 1e-12) {
    const divisor = matrix[8]
    ctx.transform(matrix[0] / divisor, matrix[3] / divisor, matrix[1] / divisor, matrix[4] / divisor, matrix[2] / divisor, matrix[5] / divisor)
    ctx.drawImage(image, 0, 0)
    ctx.restore()
    return
  }
  ctx.beginPath()
  quad.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
  ctx.closePath()
  ctx.clip()
  ctx.globalCompositeOperation = 'copy'
  const divisions = Math.max(8, Math.min(24, Math.ceil(Math.max(bounds.width, bounds.height) / 64)))
  const vertices = Array.from({ length: divisions + 1 }, (_, row) => Array.from({ length: divisions + 1 }, (_, column) => {
    const source = { x: bounds.x + column / divisions * bounds.width, y: bounds.y + row / divisions * bounds.height }
    return { source, target: projectPoint(matrix, source) }
  }))
  for (let row = 0; row < divisions; row++) for (let column = 0; column < divisions; column++) {
    const a = vertices[row][column], b = vertices[row][column + 1], c = vertices[row + 1][column + 1], d = vertices[row + 1][column]
    drawTriangle(ctx, image, [a.source, b.source, c.source], [a.target, b.target, c.target])
    drawTriangle(ctx, image, [a.source, c.source, d.source], [a.target, c.target, d.target])
  }
  ctx.restore()
}
