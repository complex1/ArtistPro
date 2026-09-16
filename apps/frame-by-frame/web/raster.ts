import { celAt, type AnimationDocument } from './model'
export { DrawingEngine } from '../../drawing-canvas/web/engine/engine'
export { DEFAULT_BRUSH, BRUSH_PRESETS } from '../../drawing-canvas/web/engine/brush'
export type { Point, BrushSettings, DrawingTool, Selection } from '../../drawing-canvas/web/engine/types'

export function thumbnail(source: HTMLCanvasElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = 96; canvas.height = 64
  const ratio = Math.min(96 / source.width, 64 / source.height)
  canvas.getContext('2d')!.drawImage(source, (96 - source.width * ratio) / 2, (64 - source.height * ratio) / 2, source.width * ratio, source.height * ratio)
  return canvas.toDataURL('image/png')
}

/** Export composites omit guides and onion skins, and decode only the current drawings. */
export class FrameRenderer {
  private images = new Map<string, HTMLImageElement>()
  async render(doc: AnimationDocument, frame: number, canvas: HTMLCanvasElement, opaque = false): Promise<void> {
    const current = doc.layers.filter(layer => layer.visible).map(layer => ({ layer, cel: celAt(layer, frame) }))
    const active = new Set(current.map(item => item.cel?.dataUrl).filter(Boolean))
    for (const key of this.images.keys()) if (!active.has(key)) this.images.delete(key)
    for (const { cel } of current) {
      if (!cel?.dataUrl || this.images.has(cel.dataUrl)) continue
      const image = new Image(); image.src = cel.dataUrl; await image.decode()
      if (image.naturalWidth !== doc.width || image.naturalHeight !== doc.height) throw new Error('A drawing has invalid image dimensions.')
      this.images.set(cel.dataUrl, image)
    }
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (doc.background || opaque) { ctx.fillStyle = doc.background ?? '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    for (const { layer, cel } of current) if (cel?.dataUrl) {
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(this.images.get(cel.dataUrl)!, 0, 0, canvas.width, canvas.height)
    }
    ctx.globalAlpha = 1
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
export const safeName = (name: string) => name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'animation'

export async function exportAnimation(doc: AnimationDocument, format: 'gif' | 'sequence' | 'video', signal: AbortSignal, progress: (value: number) => void) {
  const { GifFrameEncoder, ImageSequenceEncoder, VideoFrameEncoder } = await import('@artist-studio/render')
  const canvas = document.createElement('canvas')
  canvas.width = doc.width; canvas.height = doc.height
  const renderer = new FrameRenderer()
  const encoder = format === 'gif' ? new GifFrameEncoder({ width: doc.width, height: doc.height, fps: doc.fps, signal })
    : format === 'video' ? await VideoFrameEncoder.create(canvas, doc.fps, signal) : new ImageSequenceEncoder(signal)
  try {
    for (let frame = 0; frame < doc.duration; frame++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
      await renderer.render(doc, frame, canvas, format !== 'sequence')
      if (encoder instanceof GifFrameEncoder) await encoder.add(canvas.getContext('2d')!.getImageData(0, 0, doc.width, doc.height))
      else if (encoder instanceof VideoFrameEncoder) await encoder.add(frame / doc.fps, 1 / doc.fps)
      else await encoder.add(canvas, frame)
      progress((frame + 1) / doc.duration)
      if (frame % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    const blob = await encoder.finish()
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
    return { blob, extension: encoder instanceof VideoFrameEncoder ? encoder.format.extension : format === 'gif' ? 'gif' : 'zip' }
  } finally { await encoder.cancel() }
}
