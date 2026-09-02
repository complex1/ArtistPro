import type { BlendMode, Rgba } from './types'

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function parseColor(color: string): Rgba {
  const value = color.trim()
  if (value.startsWith('#') && (value.length === 7 || value.length === 9)) {
    return {
      r: Number.parseInt(value.slice(1, 3), 16) / 255,
      g: Number.parseInt(value.slice(3, 5), 16) / 255,
      b: Number.parseInt(value.slice(5, 7), 16) / 255,
      a: value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1,
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

export function toBytes(color: Rgba): [number, number, number, number] {
  return [
    Math.round(clamp01(color.r) * 255),
    Math.round(clamp01(color.g) * 255),
    Math.round(clamp01(color.b) * 255),
    Math.round(clamp01(color.a) * 255),
  ]
}

export function blendChannel(
  mode: BlendMode,
  src: number,
  dst: number,
): number {
  if (mode === 'multiply') return src * dst
  if (mode === 'screen') return 1 - (1 - src) * (1 - dst)
  if (mode === 'overlay') {
    return dst < 0.5 ? 2 * src * dst : 1 - 2 * (1 - src) * (1 - dst)
  }
  if (mode === 'darken') return Math.min(src, dst)
  if (mode === 'lighten') return Math.max(src, dst)
  return src
}

export function compositePixel(
  dst: Uint8ClampedArray,
  index: number,
  src: Rgba,
  opacity: number,
  mode: BlendMode,
): void {
  const sa = clamp01(src.a * opacity)
  if (sa <= 0) return
  const da = dst[index + 3] / 255
  const dr = dst[index] / 255
  const dg = dst[index + 1] / 255
  const db = dst[index + 2] / 255
  if (mode === 'erase') {
    dst[index + 3] = Math.round(clamp01(da * (1 - sa)) * 255)
    return
  }
  const outA = sa + da * (1 - sa)
  if (outA <= 0) {
    dst[index] = 0
    dst[index + 1] = 0
    dst[index + 2] = 0
    dst[index + 3] = 0
    return
  }
  const br = blendChannel(mode, src.r, dr)
  const bg = blendChannel(mode, src.g, dg)
  const bb = blendChannel(mode, src.b, db)
  const outR = (br * sa + dr * da * (1 - sa)) / outA
  const outG = (bg * sa + dg * da * (1 - sa)) / outA
  const outB = (bb * sa + db * da * (1 - sa)) / outA
  dst[index] = Math.round(clamp01(outR) * 255)
  dst[index + 1] = Math.round(clamp01(outG) * 255)
  dst[index + 2] = Math.round(clamp01(outB) * 255)
  dst[index + 3] = Math.round(clamp01(outA) * 255)
}
