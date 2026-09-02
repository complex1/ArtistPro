import { applyAffine } from './transform'
import type { AffineTransform, PerspectiveCorners, Rect } from './types'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'body'

export const HANDLE_ORDER: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function opaqueBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaMin = 8,
): Rect | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < alphaMin) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function rectCorners(bounds: Rect): PerspectiveCorners {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ]
}

export function transformedCorners(
  bounds: Rect,
  affine: AffineTransform,
): PerspectiveCorners {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  return rectCorners(bounds).map((point) => applyAffine(point.x, point.y, affine, cx, cy))
}

export function handlePoints(corners: PerspectiveCorners): Record<HandleId, { x: number; y: number }> {
  const [nw, ne, se, sw] = corners
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  return {
    nw,
    n: mid(nw, ne),
    ne,
    e: mid(ne, se),
    se,
    s: mid(se, sw),
    sw,
    w: mid(sw, nw),
    body: mid(nw, se),
  }
}

export function pointInQuad(
  x: number,
  y: number,
  corners: PerspectiveCorners,
): boolean {
  let inside = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
    const a = corners[i]
    const b = corners[j]
    const intersect =
      a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

export function hitHandle(
  x: number,
  y: number,
  corners: PerspectiveCorners,
  radius = 10,
): HandleId | null {
  const points = handlePoints(corners)
  for (const id of HANDLE_ORDER) {
    const point = points[id]
    if (Math.hypot(point.x - x, point.y - y) <= radius) return id
  }
  return pointInQuad(x, y, corners) ? 'body' : null
}

export function applyHandleDrag(
  handle: HandleId,
  start: AffineTransform,
  bounds: Rect,
  from: { x: number; y: number },
  to: { x: number; y: number },
  uniform: boolean,
): AffineTransform {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (handle === 'body') {
    return { ...start, tx: start.tx + dx, ty: start.ty + dy }
  }
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  let scaleX = start.scaleX + (sx * dx) / Math.max(8, bounds.width)
  let scaleY = start.scaleY + (sy * dy) / Math.max(8, bounds.height)
  if (sx === 0) scaleX = start.scaleX
  if (sy === 0) scaleY = start.scaleY
  if (uniform) {
    const used = sx !== 0 ? scaleX : scaleY
    scaleX = used
    scaleY = used
  }
  return {
    ...start,
    scaleX: Math.max(0.05, scaleX),
    scaleY: Math.max(0.05, scaleY),
  }
}

export function lassoLength(points: { x: number; y: number }[]): number {
  let length = 0
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return length
}

export function selectionTint(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < mask.length; i += 4) {
    const a = mask[i + 3]
    if (a === 0) continue
    out[i] = 74
    out[i + 1] = 114
    out[i + 2] = 255
    out[i + 3] = Math.round(a * 0.38)
  }
  return out
}
