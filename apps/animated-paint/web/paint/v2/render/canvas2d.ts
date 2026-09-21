import { createSurface, context2d, type PaintContext, type PaintSurface } from './surfaces'
import {
  isImageStamp,
  isShapeStamp,
  stampPaintSrc,
} from '../core/stamp'
import type { DrawItem } from '../core/types'

export { isImageStamp, isShapeStamp, stampPaintSrc }

export type PaintRenderer = {
  cacheRaster?: boolean | ((items: DrawItem[], stamps: string[]) => boolean)
  paint(
    context: PaintContext,
    items: DrawItem[],
    stamps: string[],
  ): void
}

function parseColor(color: string, opacity: number): string {
  const value = color.trim()
  if (value.startsWith('#') && value.length === 7) {
    const r = Number.parseInt(value.slice(1, 3), 16)
    const g = Number.parseInt(value.slice(3, 5), 16)
    const b = Number.parseInt(value.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  return color
}

function drawNamedStamp(
  context: PaintContext,
  name: string,
  size: number,
): void {
  const radius = Math.max(0.4, size / 2)
  context.beginPath()
  if (name === 'star') {
    for (let index = 0; index < 5; index += 1) {
      const angle = (index * 4 * Math.PI) / 5 - Math.PI / 2
      const command = index === 0 ? context.moveTo : context.lineTo
      command.call(context, Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    context.closePath()
  } else if (name === 'heart') {
    context.moveTo(0, radius * 0.35)
    context.bezierCurveTo(radius, -radius * 0.6, radius * 0.15, -radius, 0, -radius * 0.35)
    context.bezierCurveTo(-radius * 0.15, -radius, -radius, -radius * 0.6, 0, radius * 0.35)
  } else {
    context.arc(0, 0, radius, 0, Math.PI * 2)
  }
  context.fill()
}

type StampImage = HTMLImageElement | ImageBitmap
const imageCache = new Map<string, StampImage>()
const imageLoads = new Map<string, { promise: Promise<StampImage>; cancel(): void }>()
let assetVersion = 0
const assetListeners = new Set<() => void>()
export const stampAssetVersion = () => assetVersion
export function onStampAssetReady(callback: () => void) {
  assetListeners.add(callback)
  return () => { assetListeners.delete(callback) }
}
export function registerStampImage(src: string, image: ImageBitmap) {
  imageLoads.get(src)?.cancel()
  imageLoads.delete(src)
  const previous = imageCache.get(src)
  if (previous && previous !== image && 'close' in previous) previous.close()
  imageCache.set(src, image)
  assetVersion++
  for (const listener of assetListeners) listener()
}
export function clearStampImages() {
  for (const load of imageLoads.values()) load.cancel()
  imageLoads.clear()
  for (const image of imageCache.values()) if ('close' in image) image.close()
  imageCache.clear(); tintCache.clear(); tintBytes = 0; assetVersion++
}
export function retainStampImages(sources: Set<string>) {
  let changed = false
  for (const [src, load] of imageLoads) if (!sources.has(src)) {
    load.cancel(); imageLoads.delete(src)
  }
  for (const [src, image] of imageCache) if (!sources.has(src)) {
    if ('close' in image) image.close()
    imageCache.delete(src); changed = true
  }
  if (changed) { tintCache.clear(); tintBytes = 0; assetVersion++ }
}
function imageWidth(image: HTMLImageElement | ImageBitmap) {
  return 'naturalWidth' in image ? image.naturalWidth : image.width
}
function imageHeight(image: HTMLImageElement | ImageBitmap) {
  return 'naturalHeight' in image ? image.naturalHeight : image.height
}

function loadStampImage(src: string): Promise<StampImage> | undefined {
  const ready = imageCache.get(src)
  if (ready) return Promise.resolve(ready)
  const pending = imageLoads.get(src)
  if (pending) return pending.promise
  if (typeof Image === 'undefined') return undefined

  const image = new Image()
  image.decoding = 'async'
  let resolve!: (image: StampImage) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<StampImage>((yes, no) => { resolve = yes; reject = no })
  // Synchronous painting starts loads without awaiting them. Keep failures for
  // prepareStampImages to report, without an unhandled rejection or retry loop.
  void promise.catch(() => undefined)
  let started = false
  let finished = false
  const detach = () => { image.onload = null; image.onerror = null }
  const fail = (error: unknown) => {
    if (finished) return
    finished = true
    detach()
    reject(error)
  }
  const load = { promise, cancel: () => fail(new Error('Image stamp load was discarded.')) }
  imageLoads.set(src, load)
  const publish = (asset: StampImage) => {
    if (finished || imageLoads.get(src) !== load) {
      if ('close' in asset) asset.close()
      return
    }
    finished = true
    detach()
    imageCache.set(src, asset)
    imageLoads.delete(src)
    assetVersion++
    resolve(asset)
    for (const listener of assetListeners) listener()
  }
  const decoded = () => {
    if (started || finished) return
    started = true
    if (imageWidth(image) <= 0 || imageHeight(image) <= 0) {
      fail(new Error('An image stamp has no decoded pixels.'))
      return
    }
    // SVG HTMLImages are rasterized at each target size, whereas worker stamps
    // arrive as native-size bitmaps. Normalize here too so previews and exports
    // use the same pixels, including their soft alpha edges.
    if (typeof createImageBitmap === 'function') {
      try { void createImageBitmap(image).then(publish, fail) }
      catch (error) { fail(error) }
    } else {
      publish(image)
    }
  }
  image.onerror = () => fail(new Error('An image stamp could not be loaded.'))
  if (typeof image.decode !== 'function') image.onload = decoded
  try {
    image.src = src
    if (typeof image.decode === 'function') {
      void image.decode().then(decoded, fail)
    } else if (image.complete) {
      decoded()
    }
  } catch (error) { fail(error) }
  return promise
}

// Painting never blocks or temporarily uses unnormalized SVG pixels.
function stampImage(src: string): StampImage | null {
  if (!imageCache.has(src)) loadStampImage(src)
  return imageCache.get(src) ?? null
}

/** Exports must wait for pixels before rendering their first frame. */
export async function prepareStampImages(stamps: Iterable<string>, signal?: AbortSignal): Promise<void> {
  const cancelled = () => new DOMException('Image preparation cancelled', 'AbortError')
  if (signal?.aborted) throw cancelled()
  const sources = new Set(Array.from(stamps).filter(isImageStamp).map(stampPaintSrc))
  const loading = Promise.all(Array.from(sources, async (src) => {
    const ready = loadStampImage(src)
    if (!ready) throw new Error('An image stamp could not be loaded.')
    await ready
  }))
  if (!signal) { await loading; return }
  await new Promise<void>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(cancelled()) }
    signal.addEventListener('abort', abort, { once: true })
    loading.then(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, (error: unknown) => {
      signal.removeEventListener('abort', abort)
      reject(error)
    })
    if (signal.aborted) abort()
  })
}

const tintCache = new Map<string, PaintSurface>()
const imageIds = new WeakMap<object, number>()
let nextImageId = 0
let tintBytes = 0
function tintedStampImage(
  image: HTMLImageElement | ImageBitmap, color: string, width: number, height: number,
): PaintSurface | null {
  let id = imageIds.get(image)
  if (id === undefined) { id = nextImageId++; imageIds.set(image, id) }
  const pixelWidth = Math.max(1, Math.round(width))
  const pixelHeight = Math.max(1, Math.round(height))
  const key = `${id}:${color}:${pixelWidth}:${pixelHeight}`
  const cached = tintCache.get(key)
  if (cached) return cached
  const canvas = createSurface(pixelWidth, pixelHeight)
  const context = canvas && context2d(canvas)
  if (!canvas || !context) return null
  context.drawImage(image, 0, 0, pixelWidth, pixelHeight)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = color
  context.fillRect(0, 0, pixelWidth, pixelHeight)
  context.globalCompositeOperation = 'source-over'
  const bytes = pixelWidth * pixelHeight * 4
  while (tintCache.size && (tintBytes + bytes > 16 * 1024 * 1024 || tintCache.size >= 512)) {
    const first = tintCache.keys().next().value!
    const removed = tintCache.get(first)!
    tintBytes -= removed.width * removed.height * 4
    tintCache.delete(first)
  }
  if (bytes <= 16 * 1024 * 1024) { tintCache.set(key, canvas); tintBytes += bytes }
  return canvas
}

function applyEffects(context: PaintContext, item: DrawItem): void {
  if (item.shadow.opacity > 0) {
    context.shadowColor = parseColor(item.shadow.color, item.shadow.opacity)
    context.shadowBlur = item.shadow.blur
    context.shadowOffsetX = item.shadow.offsetX
    context.shadowOffsetY = item.shadow.offsetY
  }
  if (item.glow > 0) {
    context.shadowColor = parseColor(item.color, Math.min(1, item.opacity))
    context.shadowBlur = item.glow
    context.shadowOffsetX = 0
    context.shadowOffsetY = 0
  }
  if (item.blur > 0) {
    context.filter = `blur(${item.blur}px)`
  }
}

function paintStamp(
  context: PaintContext,
  item: DrawItem,
  stamps: string[],
): void {
  context.save()
  context.globalAlpha *= item.opacity
  context.fillStyle = parseColor(item.color, 1)
  context.translate(item.x, item.y)
  context.rotate(item.rotation)
  context.scale(item.scaleX ?? 1, item.scaleY ?? 1)
  applyEffects(context, item)
  const stamp = stamps[item.stampIndex] ?? stamps[0] ?? 'dot'
  if (isImageStamp(stamp)) {
    const image = stampImage(stampPaintSrc(stamp))
    if (image) {
      // Fit the longest edge to the mark size so tall or wide art is not squashed.
      const ratio = imageWidth(image) / imageHeight(image)
      const width = ratio >= 1 ? item.size : item.size * ratio
      const height = ratio >= 1 ? item.size / ratio : item.size
      const tinted = isShapeStamp(stamp)
        ? tintedStampImage(image, parseColor(item.color, 1), width, height)
        : null
      context.drawImage(
        tinted ?? image,
        -width / 2,
        -height / 2,
        width,
        height,
      )
    }
  } else {
    drawNamedStamp(context, stamp, item.size)
  }
  context.restore()
}

// Segment items describe a continuous ribbon, so each neighbouring pair is
// stroked instead of stamped. Per-pair styling keeps color and width dynamics.
function paintSegmentRun(
  context: PaintContext,
  items: DrawItem[],
  start: number,
  end: number,
): void {
  if (start === end) {
    const only = items[start]
    context.save()
    context.globalAlpha *= only.opacity
    context.fillStyle = parseColor(only.color, 1)
    applyEffects(context, only)
    context.beginPath()
    context.arc(only.x, only.y, Math.max(0.4, only.size / 2), 0, Math.PI * 2)
    context.fill()
    context.restore()
    return
  }

  for (let index = start; index < end; index += 1) {
    const from = items[index]
    const to = items[index + 1]
    context.save()
    context.globalAlpha *= from.opacity
    context.strokeStyle = parseColor(from.color, 1)
    context.lineWidth = Math.max(0.4, (from.size + to.size) / 2)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    applyEffects(context, from)
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.stroke()
    context.restore()
  }
}

export const canvas2dRenderer: PaintRenderer = {
  paint(context, items, stamps) {
    let index = 0
    while (index < items.length) {
      if (items[index].kind === 'segment') {
        let end = index
        while (
          end + 1 < items.length &&
          items[end + 1].kind === 'segment' &&
          !items[end + 1].breakBefore
        ) {
          end += 1
        }
        paintSegmentRun(context, items, index, end)
        index = end + 1
        continue
      }
      paintStamp(context, items[index], stamps)
      index += 1
    }
  },
}

export function paintDocumentBackground(
  context: PaintContext,
  width: number,
  height: number,
  background: string,
): void {
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalCompositeOperation = 'copy'
  context.fillStyle = background
  context.fillRect(0, 0, width, height)
  context.restore()
}
