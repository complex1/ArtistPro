import {
  isImageStamp,
  isShapeStamp,
  stampPaintSrc,
} from '../core/stamp'
import type { DrawItem } from '../core/types'

export { isImageStamp, isShapeStamp, stampPaintSrc }

export type PaintRenderer = {
  paint(
    context: CanvasRenderingContext2D,
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
  context: CanvasRenderingContext2D,
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

const imageCache = new Map<string, HTMLImageElement>()

// A broken image still reports `complete`, and drawing one throws, so decoded
// pixels are the only safe signal that the stamp is ready.
function stampImage(src: string): HTMLImageElement | null {
  let image = imageCache.get(src)
  if (!image) {
    if (typeof Image === 'undefined') return null
    image = new Image()
    image.decoding = 'async'
    image.src = src
    imageCache.set(src, image)
  }
  return image.complete && image.naturalWidth > 0 ? image : null
}

let tintCanvas: HTMLCanvasElement | null = null

function tintedStampImage(
  image: HTMLImageElement,
  color: string,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  if (!tintCanvas) tintCanvas = document.createElement('canvas')
  const canvas = tintCanvas
  const pixelWidth = Math.max(1, Math.round(width))
  const pixelHeight = Math.max(1, Math.round(height))
  canvas.width = pixelWidth
  canvas.height = pixelHeight
  const context = canvas.getContext('2d')
  if (!context) return null
  context.clearRect(0, 0, pixelWidth, pixelHeight)
  context.globalCompositeOperation = 'source-over'
  context.drawImage(image, 0, 0, pixelWidth, pixelHeight)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = color
  context.fillRect(0, 0, pixelWidth, pixelHeight)
  context.globalCompositeOperation = 'source-over'
  return canvas
}

function applyEffects(context: CanvasRenderingContext2D, item: DrawItem): void {
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
  context: CanvasRenderingContext2D,
  item: DrawItem,
  stamps: string[],
): void {
  context.save()
  context.globalAlpha = item.opacity
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
      const ratio = image.naturalWidth / image.naturalHeight
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
  context: CanvasRenderingContext2D,
  items: DrawItem[],
  start: number,
  end: number,
): void {
  if (start === end) {
    const only = items[start]
    context.save()
    context.globalAlpha = only.opacity
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
    context.globalAlpha = from.opacity
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
        while (end + 1 < items.length && items[end + 1].kind === 'segment') {
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
  context: CanvasRenderingContext2D,
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
