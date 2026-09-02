export type Rgb = [number, number, number]
export type ChromaMode = 'remove' | 'retain'
export type ChromaRule = { color: Rgb; mode: ChromaMode }

export type PixelBuffer = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type RestoreOptions = {
  colorCount: number
  maxEdge: number
  denoise: boolean
  inkThreshold: number | null
  ignoreNearWhite: boolean
  chromaRules?: ChromaRule[]
  chromaTolerance?: number
}

export const CEL_RESTORE_DEFAULTS: RestoreOptions = {
  colorCount: 16,
  maxEdge: 1024,
  denoise: true,
  inkThreshold: null,
  ignoreNearWhite: true,
  chromaRules: [],
  chromaTolerance: 24,
}

const NEAR_WHITE = 242
const OPAQUE = 16

export type RestoreResult = PixelBuffer & {
  /** Palette before chroma removal, so selected colors remain editable. */
  palette: Rgb[]
  outputPalette: Rgb[]
}

export function cloneBuffer(source: PixelBuffer): PixelBuffer {
  return {
    data: new Uint8ClampedArray(source.data),
    width: source.width,
    height: source.height,
  }
}

export function resizeToMaxEdge(source: PixelBuffer, maxEdge: number): PixelBuffer {
  const longest = Math.max(source.width, source.height)
  if (longest <= maxEdge) return cloneBuffer(source)

  const width = Math.max(1, Math.round((source.width * maxEdge) / longest))
  const height = Math.max(1, Math.round((source.height * maxEdge) / longest))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(
      source.height - 1,
      Math.floor(((y + 0.5) * source.height) / height),
    )
    for (let x = 0; x < width; x++) {
      const sx = Math.min(
        source.width - 1,
        Math.floor(((x + 0.5) * source.width) / width),
      )
      const si = (sy * source.width + sx) * 4
      const di = (y * width + x) * 4
      data[di] = source.data[si]
      data[di + 1] = source.data[si + 1]
      data[di + 2] = source.data[si + 2]
      data[di + 3] = source.data[si + 3]
    }
  }
  return { data, width, height }
}

export function medianDenoise(source: PixelBuffer): PixelBuffer {
  const { width, height, data } = source
  const out = new Uint8ClampedArray(data)
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const as: number[] = []

  const median = (values: number[]) => {
    values.sort((a, b) => a - b)
    return values[Math.floor(values.length / 2)] ?? 0
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      rs.length = 0
      gs.length = 0
      bs.length = 0
      as.length = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4
          rs.push(data[i])
          gs.push(data[i + 1])
          bs.push(data[i + 2])
          as.push(data[i + 3])
        }
      }
      const i = (y * width + x) * 4
      out[i] = median(rs)
      out[i + 1] = median(gs)
      out[i + 2] = median(bs)
      out[i + 3] = median(as)
    }
  }
  return { data: out, width, height }
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function isNearWhite(r: number, g: number, b: number): boolean {
  return r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE
}

export function extractPalette(
  data: Uint8ClampedArray,
  colorCount: number,
  skip?: (offset: number) => boolean,
): Rgb[] {
  const k = Math.max(1, Math.floor(colorCount))
  const unique = new Map<number, number>()
  const indices: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < OPAQUE) continue
    if (skip?.(i)) continue
    indices.push(i)
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    if (!unique.has(key)) unique.set(key, i)
  }
  if (indices.length === 0) return [[0, 0, 0]]
  if (unique.size <= k) {
    return [...unique.keys()].map((key) => [
      (key >> 16) & 255,
      (key >> 8) & 255,
      key & 255,
    ])
  }

  const buckets: number[][] = [indices]
  while (buckets.length < k) {
    let best = -1
    let bestRange = -1
    for (let b = 0; b < buckets.length; b++) {
      const bucket = buckets[b]
      if (!bucket || bucket.length < 2) continue
      const range = maxChannelRange(data, bucket)
      if (range > bestRange) {
        bestRange = range
        best = b
      }
    }
    if (best < 0) break
    const bucket = buckets[best]
    if (!bucket) break
    const [left, right] = splitBucket(data, bucket)
    buckets.splice(best, 1, left, right)
  }

  return buckets.map((bucket) => averageColor(data, bucket))
}

export function snapToPalette(data: Uint8ClampedArray, palette: Rgb[]): void {
  if (palette.length === 0) return
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < OPAQUE) continue
    const color = nearestColor(data[i], data[i + 1], data[i + 2], palette)
    data[i] = color[0]
    data[i + 1] = color[1]
    data[i + 2] = color[2]
  }
}

export function uniqueOpaqueColors(data: Uint8ClampedArray): Rgb[] {
  const unique = new Map<number, Rgb>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < OPAQUE) continue
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    if (!unique.has(key)) unique.set(key, [data[i], data[i + 1], data[i + 2]])
  }
  return [...unique.values()]
}

// Remove and retain rules coexist: retains act as a whitelist, so anything not
// listed drops out, and an explicit remove still wins where the two overlap
// within the tolerance.
export function applyChroma(
  data: Uint8ClampedArray,
  rules: ChromaRule[],
  tolerance: number,
): void {
  if (rules.length === 0) return
  const maxDistanceSquared = Math.max(0, tolerance) ** 2 * 3
  const removes = rules.filter((rule) => rule.mode === 'remove')
  const retains = rules.filter((rule) => rule.mode === 'retain')

  const matches = (offset: number, color: Rgb) => {
    const dr = data[offset] - color[0]
    const dg = data[offset + 1] - color[1]
    const db = data[offset + 2] - color[2]
    return dr * dr + dg * dg + db * db <= maxDistanceSquared
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < OPAQUE) continue
    const removed = removes.some((rule) => matches(i, rule.color))
    const retained = retains.some((rule) => matches(i, rule.color))
    if (removed || (retains.length > 0 && !retained)) data[i + 3] = 0
  }
}

export function restorePixels(
  source: PixelBuffer,
  options: RestoreOptions,
): RestoreResult {
  let buffer = resizeToMaxEdge(source, options.maxEdge)
  if (options.denoise) buffer = medianDenoise(buffer)

  const { data } = buffer
  if (options.ignoreNearWhite) {
    for (let i = 0; i < data.length; i += 4) {
      if (isNearWhite(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0
    }
  }

  const inkThreshold = options.inkThreshold
  const isInk =
    inkThreshold == null
      ? undefined
      : (offset: number) =>
          luminance(data[offset], data[offset + 1], data[offset + 2]) <
          inkThreshold

  const paletteCount =
    inkThreshold == null ? options.colorCount : Math.max(1, options.colorCount - 1)
  const palette = extractPalette(data, paletteCount, isInk)
  if (inkThreshold != null && !palette.some((c) => c[0] === 0 && c[1] === 0 && c[2] === 0)) {
    palette.unshift([0, 0, 0])
  }

  snapToPalette(data, palette)

  if (inkThreshold != null) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < OPAQUE) continue
      if (luminance(data[i], data[i + 1], data[i + 2]) < inkThreshold) {
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
      }
    }
  }

  const fullPalette = uniqueOpaqueColors(data)
  applyChroma(data, options.chromaRules ?? [], options.chromaTolerance ?? 24)

  return {
    ...buffer,
    palette: fullPalette,
    outputPalette: uniqueOpaqueColors(data),
  }
}

function maxChannelRange(data: Uint8ClampedArray, indices: number[]): number {
  let rMin = 255
  let rMax = 0
  let gMin = 255
  let gMax = 0
  let bMin = 255
  let bMax = 0
  for (const i of indices) {
    rMin = Math.min(rMin, data[i])
    rMax = Math.max(rMax, data[i])
    gMin = Math.min(gMin, data[i + 1])
    gMax = Math.max(gMax, data[i + 1])
    bMin = Math.min(bMin, data[i + 2])
    bMax = Math.max(bMax, data[i + 2])
  }
  return Math.max(rMax - rMin, gMax - gMin, bMax - bMin)
}

function splitBucket(
  data: Uint8ClampedArray,
  indices: number[],
): [number[], number[]] {
  let channel = 0
  let best = -1
  for (const ch of [0, 1, 2]) {
    let min = 255
    let max = 0
    for (const i of indices) {
      const v = data[i + ch]
      if (v < min) min = v
      if (v > max) max = v
    }
    if (max - min > best) {
      best = max - min
      channel = ch
    }
  }
  const sorted = [...indices].sort((a, b) => data[a + channel] - data[b + channel])
  const mid = Math.max(1, Math.floor(sorted.length / 2))
  return [sorted.slice(0, mid), sorted.slice(mid)]
}

function averageColor(data: Uint8ClampedArray, indices: number[]): Rgb {
  let r = 0
  let g = 0
  let b = 0
  for (const i of indices) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  const n = indices.length || 1
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

function nearestColor(r: number, g: number, b: number, palette: Rgb[]): Rgb {
  let best = palette[0] ?? [0, 0, 0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const color of palette) {
    const dr = r - color[0]
    const dg = g - color[1]
    const db = b - color[2]
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = color
    }
  }
  return best
}
