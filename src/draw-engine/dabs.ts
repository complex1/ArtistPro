import type { Dab, Rect, StampImage } from './types'
import { clamp01 } from './color'

export function hash2(x: number, y: number, seed: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

export function sampleStamp(
  stamp: StampImage,
  u: number,
  v: number,
): number {
  const x = (u * 0.5 + 0.5) * (stamp.width - 1)
  const y = (v * 0.5 + 0.5) * (stamp.height - 1)
  if (x < 0 || y < 0 || x > stamp.width - 1 || y > stamp.height - 1) return 0
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(stamp.width - 1, x0 + 1)
  const y1 = Math.min(stamp.height - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const a = stamp.pixels[(y0 * stamp.width + x0) * 4 + 3] / 255
  const b = stamp.pixels[(y0 * stamp.width + x1) * 4 + 3] / 255
  const c = stamp.pixels[(y1 * stamp.width + x0) * 4 + 3] / 255
  const d = stamp.pixels[(y1 * stamp.width + x1) * 4 + 3] / 255
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

export function dabCoverageAt(
  px: number,
  py: number,
  dab: Dab,
): number {
  const radius = Math.max(0.5, dab.size / 2)
  let dx = (px + 0.5 - dab.x) / radius
  let dy = (py + 0.5 - dab.y) / radius
  if (dab.rotation !== 0) {
    const cos = Math.cos(-dab.rotation)
    const sin = Math.sin(-dab.rotation)
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    dx = rx
    dy = ry
  }
  if (dab.tip === 'oval') dy /= 0.55
  const dist = Math.hypot(dx, dy)
  if (dist > 1 && dab.tip !== 'stamp') return 0
  let coverage: number
  if (dab.tip === 'stamp' && dab.stamp) {
    coverage = sampleStamp(dab.stamp, dx, dy)
  } else {
    if (dist >= 1) return 0
    const inner = clamp01(dab.hardness) * 0.98
    coverage =
      dist <= inner ? 1 : 1 - (dist - inner) / Math.max(0.02, 1 - inner)
    if (dab.tip === 'grain') {
      coverage *= 0.35 + 0.65 * hash2(px, py, dab.seed)
    }
  }
  return clamp01(coverage)
}

export function dabBounds(dab: Dab, width: number, height: number): Rect {
  const pad = Math.ceil(dab.size / 2) + 2
  const x = Math.max(0, Math.floor(dab.x - pad))
  const y = Math.max(0, Math.floor(dab.y - pad))
  return {
    x,
    y,
    width: Math.min(width - x, Math.ceil(dab.x + pad) - x),
    height: Math.min(height - y, Math.ceil(dab.y + pad) - y),
  }
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b }
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: right - x, height: bottom - y }
}
