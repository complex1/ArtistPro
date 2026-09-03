import type { PixelBuffer } from './restore'
import { traceToSvg, type TraceOptions } from './trace'

export type TraceRequest = {
  id: number
  width: number
  height: number
  pixels: ArrayBuffer
  options: TraceOptions
}

export type TraceResponse =
  | { id: number; svg: string }
  | { id: number; error: string }

self.onmessage = async (event: MessageEvent<TraceRequest>) => {
  const { id, width, height, pixels, options } = event.data
  try {
    const buffer: PixelBuffer = {
      data: new Uint8ClampedArray(pixels),
      width,
      height,
    }
    const svg = await traceToSvg(buffer, options)
    const response: TraceResponse = { id, svg }
    self.postMessage(response)
  } catch (error) {
    const response: TraceResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
