/// <reference lib="webworker" />

import { applyPalette, GIFEncoder, quantize, type GifEncoder } from 'gifenc'

type InitMessage = {
  type: 'init'
  width: number
  height: number
  delay: number
}

type FrameMessage = {
  type: 'frame'
  rgba: ArrayBuffer
}

type FinishMessage = { type: 'finish' }
type CancelMessage = { type: 'cancel' }
type WorkerMessage = InitMessage | FrameMessage | FinishMessage | CancelMessage

let encoder: GifEncoder | null = null
let width = 0
let height = 0
let delay = 0
let frame = 0
let cancelled = false

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  if (message.type === 'init') {
    encoder = GIFEncoder()
    width = message.width
    height = message.height
    delay = message.delay
    frame = 0
    cancelled = false
    self.postMessage({ type: 'ready' })
    return
  }

  if (message.type === 'cancel') {
    cancelled = true
    encoder = null
    self.postMessage({ type: 'cancelled' })
    return
  }

  if (!encoder || cancelled) return

  if (message.type === 'frame') {
    try {
      const rgba = new Uint8ClampedArray(message.rgba)
      const palette = quantize(rgba, 256, { format: 'rgb565' })
      const index = applyPalette(rgba, palette, 'rgb565')
      encoder.writeFrame(index, width, height, {
        palette,
        delay,
        repeat: frame === 0 ? 0 : undefined,
      })
      frame += 1
      self.postMessage({ type: 'frame', frame })
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (message.type === 'finish') {
    encoder.finish()
    const bytes = encoder.bytes()
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    )
    encoder = null
    self.postMessage({ type: 'result', buffer }, [buffer])
  }
}
