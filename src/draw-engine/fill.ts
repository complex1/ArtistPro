import { parseColor, toBytes } from './color'
import type { Rgba } from './types'

function colorDistance(
  pixels: Uint8ClampedArray,
  index: number,
  target: [number, number, number, number],
): number {
  const dr = pixels[index] - target[0]
  const dg = pixels[index + 1] - target[1]
  const db = pixels[index + 2] - target[2]
  const da = pixels[index + 3] - target[3]
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da)
}

export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  color: string | Rgba,
  tolerance = 32,
  clip?: Uint8ClampedArray | null,
): { pixels: Uint8ClampedArray; dirty: { x: number; y: number; width: number; height: number } } {
  const x = Math.floor(seedX)
  const y = Math.floor(seedY)
  const out = new Uint8ClampedArray(pixels)
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return { pixels: out, dirty: { x: 0, y: 0, width: 0, height: 0 } }
  }
  const seedIndex = (y * width + x) * 4
  if (clip && clip[seedIndex + 3] === 0) {
    return { pixels: out, dirty: { x: 0, y: 0, width: 0, height: 0 } }
  }
  const target: [number, number, number, number] = [
    pixels[seedIndex],
    pixels[seedIndex + 1],
    pixels[seedIndex + 2],
    pixels[seedIndex + 3],
  ]
  const fill = typeof color === 'string' ? toBytes(parseColor(color)) : toBytes(color)
  if (
    target[0] === fill[0] &&
    target[1] === fill[1] &&
    target[2] === fill[2] &&
    target[3] === fill[3]
  ) {
    return { pixels: out, dirty: { x: 0, y: 0, width: 0, height: 0 } }
  }
  const seen = new Uint8Array(width * height)
  const stack = [x, y]
  let minX = x
  let minY = y
  let maxX = x
  let maxY = y
  const limit = width * height

  while (stack.length > 0) {
    const cy = stack.pop()!
    const cx = stack.pop()!
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
    const si = cy * width + cx
    if (seen[si]) continue
    seen[si] = 1
    const pi = si * 4
    if (clip && clip[pi + 3] === 0) continue
    if (colorDistance(out, pi, target) > tolerance) continue
    out[pi] = fill[0]
    out[pi + 1] = fill[1]
    out[pi + 2] = fill[2]
    out[pi + 3] = fill[3]
    minX = Math.min(minX, cx)
    minY = Math.min(minY, cy)
    maxX = Math.max(maxX, cx)
    maxY = Math.max(maxY, cy)
    if (stack.length / 2 > limit) break
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1)
  }

  return {
    pixels: out,
    dirty: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  }
}
