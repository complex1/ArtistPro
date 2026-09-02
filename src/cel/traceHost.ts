import type { PixelBuffer } from './restore'
import { CEL_TRACE_DEFAULTS, traceToSvg, type TraceOptions } from './trace'
import type { TraceRequest, TraceResponse } from './trace.worker'

type Pending = {
  resolve: (svg: string) => void
  reject: (error: Error) => void
}

export class TraceWorkerHost {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()

  constructor() {
    if (typeof Worker === 'undefined') return
    try {
      this.worker = new Worker(new URL('./trace.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (event: MessageEvent<TraceResponse>) => {
        const waiter = this.pending.get(event.data.id)
        if (!waiter) return
        this.pending.delete(event.data.id)
        if ('error' in event.data) waiter.reject(new Error(event.data.error))
        else waiter.resolve(event.data.svg)
      }
      this.worker.onerror = () => {
        this.worker?.terminate()
        this.worker = null
        for (const waiter of this.pending.values()) {
          waiter.reject(new Error('Cel tracer worker failed'))
        }
        this.pending.clear()
      }
    } catch {
      this.worker = null
    }
  }

  async run(
    buffer: PixelBuffer,
    options: TraceOptions = CEL_TRACE_DEFAULTS,
  ): Promise<string> {
    if (!this.worker) return traceToSvg(buffer, options)
    const id = this.nextId
    this.nextId += 1
    const pixels = new ArrayBuffer(buffer.data.byteLength)
    new Uint8ClampedArray(pixels).set(buffer.data)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const request: TraceRequest = {
        id,
        width: buffer.width,
        height: buffer.height,
        pixels,
        options,
      }
      this.worker?.postMessage(request, [pixels])
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }
}
