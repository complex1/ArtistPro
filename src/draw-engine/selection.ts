import type { PointerPoint, Rect } from './types'

export function selectionBounds(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): Rect | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[(y * width + x) * 4 + 3] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function pointInPolygon(x: number, y: number, points: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]
    const b = points[j]
    const intersect =
      a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

export function rasterizeLasso(
  points: PointerPoint[] | { x: number; y: number }[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height * 4)
  if (points.length < 3) return mask
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (const point of points) {
    minX = Math.min(minX, Math.floor(point.x))
    minY = Math.min(minY, Math.floor(point.y))
    maxX = Math.max(maxX, Math.ceil(point.x))
    maxY = Math.max(maxY, Math.ceil(point.y))
  }
  minX = Math.max(0, minX - 1)
  minY = Math.max(0, minY - 1)
  maxX = Math.min(width - 1, maxX + 1)
  maxY = Math.min(height - 1, maxY + 1)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      let cover = 0
      const samples = [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]
      for (const [ox, oy] of samples) {
        if (pointInPolygon(x + ox, y + oy, points)) cover += 1
      }
      if (cover === 0) continue
      const i = (y * width + x) * 4
      mask[i] = 255
      mask[i + 1] = 255
      mask[i + 2] = 255
      mask[i + 3] = Math.round((cover / samples.length) * 255)
    }
  }
  return mask
}

export function fullSelection(width: number, height: number): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < mask.length; i += 4) {
    mask[i] = 255
    mask[i + 1] = 255
    mask[i + 2] = 255
    mask[i + 3] = 255
  }
  return mask
}
