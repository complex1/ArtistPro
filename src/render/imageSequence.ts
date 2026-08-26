import { Zip, ZipDeflate } from 'fflate'
import { sequenceFrameFilename } from './frameSchedule'

export function frameFilename(index: number): string {
  return sequenceFrameFilename(index)
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The browser could not encode this frame as PNG'))
    }, 'image/png')
  })
}

export class ImageSequenceEncoder {
  private readonly chunks: ArrayBuffer[] = []
  private readonly zip: Zip
  private readonly result: Promise<Blob>
  private readonly signal?: AbortSignal
  private resolve!: (value: Blob) => void
  private reject!: (reason: unknown) => void
  private closed = false

  constructor(signal?: AbortSignal) {
    this.signal = signal
    this.result = new Promise<Blob>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
    void this.result.catch(() => undefined)
    this.zip = new Zip((error, chunk, final) => {
      if (error) {
        this.reject(error)
        return
      }
      this.chunks.push(chunk.slice().buffer as ArrayBuffer)
      if (final) this.resolve(new Blob(this.chunks, { type: 'application/zip' }))
    })
    signal?.addEventListener('abort', this.abort, { once: true })
  }

  async add(canvas: HTMLCanvasElement, index: number): Promise<void> {
    this.throwIfAborted()
    const blob = await canvasToPng(canvas)
    this.throwIfAborted()
    const entry = new ZipDeflate(frameFilename(index), { level: 1 })
    this.zip.add(entry)
    entry.push(new Uint8Array(await blob.arrayBuffer()), true)
  }

  async finish(): Promise<Blob> {
    this.throwIfAborted()
    this.zip.end()
    const blob = await this.result
    this.close()
    return blob
  }

  cancel(): void {
    if (this.closed) return
    this.zip.terminate()
    this.reject(new DOMException('Render cancelled', 'AbortError'))
    this.close()
  }

  private throwIfAborted(): void {
    if (this.signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
  }

  private abort = () => this.cancel()

  private close(): void {
    if (this.closed) return
    this.closed = true
    this.signal?.removeEventListener('abort', this.abort)
  }
}
