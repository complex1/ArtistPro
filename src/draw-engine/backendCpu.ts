import type { GpuBackend } from './backend'
import { compositePixel, parseColor, toBytes } from './color'
import { dabBounds, dabCoverageAt, unionRect } from './dabs'
import type { Dab, Rect, SurfaceId } from './types'

function emptyPixels(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4)
}

function clipAlpha(
  clip: Uint8ClampedArray | undefined,
  width: number,
  x: number,
  y: number,
): number {
  if (!clip) return 1
  return clip[(y * width + x) * 4 + 3] / 255
}

export function createCpuBackend(
  width: number,
  height: number,
  canvas?: HTMLCanvasElement | null,
): GpuBackend {
  const surfaces = new Map<SurfaceId, Uint8ClampedArray>()
  let stroke: Float32Array | null = null
  let strokeDirty: Rect | null = null
  let w = width
  let h = height

  const get = (id: SurfaceId): Uint8ClampedArray => {
    const surface = surfaces.get(id)
    if (!surface) throw new Error(`Unknown surface ${id}`)
    return surface
  }

  const paintDab = (
    coverage: Float32Array | Uint8ClampedArray,
    dab: Dab,
    clip: Uint8ClampedArray | undefined,
    intoStroke: boolean,
  ): Rect => {
    const bounds = dabBounds(dab, w, h)
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const cover = dabCoverageAt(x, y, dab) * dab.flow * clipAlpha(clip, w, x, y)
        if (cover <= 0) continue
        const index = y * w + x
        if (intoStroke) {
          const prev = (coverage as Float32Array)[index]
          coverage[index] = prev + cover * (1 - prev)
        } else {
          const pixels = coverage as Uint8ClampedArray
          const i = index * 4
          compositePixel(
            pixels,
            i,
            { ...dab.color, a: dab.color.a },
            dab.opacity * cover,
            dab.erase ? 'erase' : 'source-over',
          )
        }
      }
    }
    return bounds
  }

  const backend: GpuBackend = {
    kind: 'cpu',
    get width() {
      return w
    },
    get height() {
      return h
    },
    createSurface(id) {
      surfaces.set(id, emptyPixels(w, h))
    },
    destroySurface(id) {
      surfaces.delete(id)
    },
    clear(id, color) {
      const pixels = get(id)
      if (!color) {
        pixels.fill(0)
        return
      }
      const [r, g, b, a] = toBytes(color)
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = r
        pixels[i + 1] = g
        pixels[i + 2] = b
        pixels[i + 3] = a
      }
    },
    fillRect(id, rect, color) {
      const pixels = get(id)
      const [r, g, b, a] = toBytes(color)
      const x0 = Math.max(0, Math.floor(rect.x))
      const y0 = Math.max(0, Math.floor(rect.y))
      const x1 = Math.min(w, Math.ceil(rect.x + rect.width))
      const y1 = Math.min(h, Math.ceil(rect.y + rect.height))
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * w + x) * 4
          pixels[i] = r
          pixels[i + 1] = g
          pixels[i + 2] = b
          pixels[i + 3] = a
        }
      }
    },
    stampDab(target, dab, clip) {
      return paintDab(get(target), dab, clip ? get(clip) : undefined, false)
    },
    beginStroke() {
      stroke = new Float32Array(w * h)
      strokeDirty = null
    },
    stampStrokeDab(dab, clip) {
      if (!stroke) this.beginStroke()
      const bounds = paintDab(stroke!, dab, clip ? get(clip) : undefined, true)
      strokeDirty = unionRect(strokeDirty, bounds)
      return bounds
    },
    previewStroke(target, color, opacity, erase) {
      if (!stroke) return { x: 0, y: 0, width: 0, height: 0 }
      const pixels = get(target)
      const bounds = strokeDirty ?? { x: 0, y: 0, width: w, height: h }
      for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
        for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
          const cover = stroke[y * w + x]
          if (cover <= 0) continue
          compositePixel(
            pixels,
            (y * w + x) * 4,
            color,
            opacity * cover,
            erase ? 'erase' : 'source-over',
          )
        }
      }
      return bounds
    },
    applyStrokeFromSource(source, target, color, opacity, erase, rect) {
      if (!stroke) return { x: 0, y: 0, width: 0, height: 0 }
      const src = get(source)
      const dest = get(target)
      const x0 = Math.max(0, Math.floor(rect.x))
      const y0 = Math.max(0, Math.floor(rect.y))
      const x1 = Math.min(w, Math.ceil(rect.x + rect.width))
      const y1 = Math.min(h, Math.ceil(rect.y + rect.height))
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * w + x) * 4
          dest[i] = src[i]
          dest[i + 1] = src[i + 1]
          dest[i + 2] = src[i + 2]
          dest[i + 3] = src[i + 3]
          const cover = stroke[y * w + x]
          if (cover <= 0) continue
          compositePixel(
            dest,
            i,
            color,
            opacity * cover,
            erase ? 'erase' : 'source-over',
          )
        }
      }
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    },
    mergeStroke(target, color, opacity, erase) {
      const bounds = this.previewStroke(target, color, opacity, erase)
      this.clearStroke()
      return bounds
    },
    clearStroke() {
      stroke = null
      strokeDirty = null
    },
    read(id, rect) {
      const pixels = get(id)
      if (!rect) return new Uint8ClampedArray(pixels)
      const out = new Uint8ClampedArray(rect.width * rect.height * 4)
      for (let y = 0; y < rect.height; y += 1) {
        const srcY = rect.y + y
        if (srcY < 0 || srcY >= h) continue
        for (let x = 0; x < rect.width; x += 1) {
          const srcX = rect.x + x
          if (srcX < 0 || srcX >= w) continue
          const si = (srcY * w + srcX) * 4
          const di = (y * rect.width + x) * 4
          out[di] = pixels[si]
          out[di + 1] = pixels[si + 1]
          out[di + 2] = pixels[si + 2]
          out[di + 3] = pixels[si + 3]
        }
      }
      return out
    },
    write(id, pixels, rect) {
      const dest = get(id)
      if (!rect) {
        dest.set(pixels.subarray(0, dest.length))
        return
      }
      for (let y = 0; y < rect.height; y += 1) {
        const dstY = rect.y + y
        if (dstY < 0 || dstY >= h) continue
        for (let x = 0; x < rect.width; x += 1) {
          const dstX = rect.x + x
          if (dstX < 0 || dstX >= w) continue
          const si = (y * rect.width + x) * 4
          const di = (dstY * w + dstX) * 4
          dest[di] = pixels[si]
          dest[di + 1] = pixels[si + 1]
          dest[di + 2] = pixels[si + 2]
          dest[di + 3] = pixels[si + 3]
        }
      }
    },
    copySurface(src, dst) {
      get(dst).set(get(src))
    },
    warp(src, dst, sample, clip, options) {
      const source = get(src)
      const dest = get(dst)
      if (options?.clear !== false) dest.fill(0)
      const mask = clip ? get(clip) : undefined
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (clipAlpha(mask, w, x, y) <= 0) continue
          const uv = sample(x + 0.5, y + 0.5)
          const sx = uv.x - 0.5
          const sy = uv.y - 0.5
          const x0 = Math.floor(sx)
          const y0 = Math.floor(sy)
          const x1 = x0 + 1
          const y1 = y0 + 1
          const fx = sx - x0
          const fy = sy - y0
          const samplePx = (ix: number, iy: number, channel: number) => {
            if (ix < 0 || iy < 0 || ix >= w || iy >= h) return 0
            return source[(iy * w + ix) * 4 + channel]
          }
          const di = (y * w + x) * 4
          for (let c = 0; c < 4; c += 1) {
            const a = samplePx(x0, y0, c)
            const b = samplePx(x1, y0, c)
            const c0 = samplePx(x0, y1, c)
            const d = samplePx(x1, y1, c)
            dest[di + c] =
              a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c0 * (1 - fx) * fy + d * fx * fy
          }
        }
      }
    },
    composite(layers, background) {
      const out = emptyPixels(w, h)
      const bg = parseColor(background)
      const [br, bgc, bb, ba] = toBytes({ ...bg, a: 1 })
      for (let i = 0; i < out.length; i += 4) {
        out[i] = br
        out[i + 1] = bgc
        out[i + 2] = bb
        out[i + 3] = ba
      }
      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue
        const pixels = get(layer.id)
        for (let i = 0; i < pixels.length; i += 4) {
          const a = pixels[i + 3] / 255
          if (a <= 0) continue
          compositePixel(
            out,
            i,
            {
              r: pixels[i] / 255,
              g: pixels[i + 1] / 255,
              b: pixels[i + 2] / 255,
              a,
            },
            layer.opacity,
            layer.blendMode === 'erase' ? 'source-over' : layer.blendMode,
          )
        }
      }
      return out
    },
    present(pixels) {
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0)
    },
    resize(nextWidth, nextHeight) {
      w = nextWidth
      h = nextHeight
      for (const id of [...surfaces.keys()]) {
        surfaces.set(id, emptyPixels(w, h))
      }
      stroke = null
    },
    dispose() {
      surfaces.clear()
      stroke = null
    },
  }
  return backend
}
