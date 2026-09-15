type WorkerReply =
  | { type: 'ready' | 'frame' }
  | { type: 'result'; buffer: ArrayBuffer }
  | { type: 'error'; message: string }

/** Encodes in a worker with individual frame delays to avoid GIF timing drift. */
export class CharacterGifEncoder {
  private readonly worker = new Worker(
    new URL('./animationEncoder.worker.ts', import.meta.url),
    { type: 'module' },
  )
  private pending:
    | { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }
    | undefined
  private readonly ready: Promise<WorkerReply>
  private closed = false

  constructor(width: number, height: number) {
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const pending = this.pending
      this.pending = undefined
      if (event.data.type === 'error')
        pending?.reject(new Error(event.data.message))
      else pending?.resolve(event.data)
    }
    this.worker.onerror = (event) => {
      this.pending?.reject(
        new Error(event.message || 'The animation encoder failed.'),
      )
      this.pending = undefined
    }
    this.ready = this.request({ type: 'init', width, height })
    void this.ready.catch(() => undefined)
  }

  private request(
    message: object,
    transfer: Transferable[] = [],
  ): Promise<WorkerReply> {
    if (this.closed)
      return Promise.reject(new Error('The animation encoder is closed.'))
    if (this.pending)
      return Promise.reject(
        new Error(
          'Wait for the previous animation frame before encoding another.',
        ),
      )
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      this.worker.postMessage(message, transfer)
    })
  }

  async add(image: ImageData, delay: number): Promise<void> {
    await this.ready
    const copy = new Uint8ClampedArray(image.data)
    await this.request({ type: 'frame', rgba: copy.buffer, delay }, [
      copy.buffer,
    ])
  }

  async finish(): Promise<Blob> {
    await this.ready
    const result = await this.request({ type: 'finish' })
    if (result.type !== 'result')
      throw new Error('The animation encoder returned no GIF.')
    this.cancel()
    return new Blob([result.buffer], { type: 'image/gif' })
  }

  cancel(): void {
    if (this.closed) return
    this.closed = true
    this.pending?.reject(new Error('Animation encoding was cancelled.'))
    this.pending = undefined
    this.worker.terminate()
  }
}
