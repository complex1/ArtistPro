export type GifEncoderOptions = {
  width: number
  height: number
  fps: number
  signal?: AbortSignal
}

type WorkerReply =
  | { type: 'ready' }
  | { type: 'frame'; frame: number }
  | { type: 'result'; buffer: ArrayBuffer }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }

export class GifFrameEncoder {
  private readonly worker = new Worker(
    new URL('./gifWorker.ts', import.meta.url),
    { type: 'module' },
  )
  private readonly signal?: AbortSignal
  private readonly ready: Promise<WorkerReply>
  private pending:
    | {
        resolve: (value: WorkerReply) => void
        reject: (reason: unknown) => void
      }
    | undefined
  private closed = false

  constructor(options: GifEncoderOptions) {
    this.signal = options.signal
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.type === 'error') {
        this.pending?.reject(new Error(event.data.message))
      } else {
        this.pending?.resolve(event.data)
      }
      this.pending = undefined
    }
    this.worker.onerror = (event) => {
      this.pending?.reject(new Error(event.message || 'GIF worker failed'))
      this.pending = undefined
    }
    this.signal?.addEventListener('abort', this.abort, { once: true })
    this.ready = this.request({
      type: 'init',
      width: options.width,
      height: options.height,
      delay: Math.max(10, Math.round(1000 / options.fps)),
    })
    void this.ready.catch(() => undefined)
  }

  async add(image: ImageData): Promise<void> {
    this.throwIfAborted()
    await this.ready
    const copy = new Uint8ClampedArray(image.data)
    await this.request({ type: 'frame', rgba: copy.buffer }, [copy.buffer])
  }

  async finish(): Promise<Blob> {
    this.throwIfAborted()
    await this.ready
    const reply = await this.request({ type: 'finish' })
    if (reply.type !== 'result') throw new Error('GIF encoder returned no data')
    this.close()
    return new Blob([reply.buffer], { type: 'image/gif' })
  }

  cancel(): void {
    if (this.closed) return
    this.worker.postMessage({ type: 'cancel' })
    this.close()
  }

  private request(message: object, transfer: Transferable[] = []) {
    if (this.pending) {
      return Promise.reject(new Error('GIF encoder backpressure was ignored'))
    }
    return new Promise<WorkerReply>((resolve, reject) => {
      this.pending = { resolve, reject }
      this.worker.postMessage(message, transfer)
    })
  }

  private throwIfAborted(): void {
    if (this.signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
  }

  private abort = () => {
    this.pending?.reject(new DOMException('Render cancelled', 'AbortError'))
    this.pending = undefined
    this.cancel()
  }

  private close(): void {
    if (this.closed) return
    this.closed = true
    this.signal?.removeEventListener('abort', this.abort)
    this.worker.terminate()
  }
}
