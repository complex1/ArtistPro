/// <reference lib="webworker" />

import { applyPalette, GIFEncoder, quantize, type GifEncoder } from 'gifenc'

type Message =
  | { type: 'init'; width: number; height: number }
  | { type: 'frame'; rgba: ArrayBuffer; delay: number }
  | { type: 'finish' }
let encoder: GifEncoder | null = null
let width = 0,
  height = 0,
  frame = 0

self.onmessage = (event: MessageEvent<Message>) => {
  try {
    const message = event.data
    if (message.type === 'init') {
      encoder = GIFEncoder()
      width = message.width
      height = message.height
      frame = 0
      self.postMessage({ type: 'ready' })
      return
    }
    if (!encoder)
      throw new Error('The animation encoder has not been initialized.')
    if (message.type === 'frame') {
      const rgba = new Uint8ClampedArray(message.rgba)
      const palette = quantize(rgba, 256, { format: 'rgb565' })
      const index = applyPalette(rgba, palette, 'rgb565')
      encoder.writeFrame(index, width, height, {
        palette,
        delay: message.delay,
        repeat: frame === 0 ? 0 : undefined,
      })
      frame++
      self.postMessage({ type: 'frame' })
    } else {
      encoder.finish()
      const buffer = new Uint8Array(encoder.bytes()).buffer
      encoder = null
      self.postMessage({ type: 'result', buffer }, [buffer])
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
