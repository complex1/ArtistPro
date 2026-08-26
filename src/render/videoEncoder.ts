import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  type OutputFormat,
} from 'mediabunny'
import type { VideoCodec } from './types'
import { renderError } from './frameSchedule'

export type VideoFormat = {
  codec: VideoCodec
  extension: 'mp4' | 'webm'
  mimeType: 'video/mp4' | 'video/webm'
}

export async function selectVideoFormat(
  width: number,
  height: number,
  probe = getFirstEncodableVideoCodec,
): Promise<VideoFormat | null> {
  const quality = new Quality('high')
  const avc = await probe(['avc'], { width, height, quality })
  if (avc === 'avc') {
    return { codec: avc, extension: 'mp4', mimeType: 'video/mp4' }
  }

  const webm = await probe(['vp9', 'vp8'], { width, height, quality })
  if (webm === 'vp9' || webm === 'vp8') {
    return { codec: webm, extension: 'webm', mimeType: 'video/webm' }
  }
  return null
}

export class VideoFrameEncoder {
  readonly format: VideoFormat
  private readonly source: CanvasSource
  private readonly output: Output<OutputFormat, BufferTarget>
  private readonly signal?: AbortSignal
  private started = false
  private closed = false

  static async create(
    canvas: HTMLCanvasElement,
    fps: number,
    signal?: AbortSignal,
  ): Promise<VideoFrameEncoder> {
    if (!globalThis.isSecureContext || !('VideoEncoder' in globalThis)) {
      throw renderError(
        'insecure-context',
        'Open the editor over HTTPS or localhost to export video.',
      )
    }
    const format = await selectVideoFormat(canvas.width, canvas.height)
    if (!format) {
      throw renderError(
        'unsupported-codec',
        `No supported H.264, VP9, or VP8 encoder is available for ${canvas.width}×${canvas.height}.`,
      )
    }
    return new VideoFrameEncoder(canvas, fps, format, signal)
  }

  private constructor(
    canvas: HTMLCanvasElement,
    fps: number,
    format: VideoFormat,
    signal?: AbortSignal,
  ) {
    this.format = format
    this.signal = signal
    const outputFormat =
      format.extension === 'mp4'
        ? new Mp4OutputFormat({ fastStart: 'in-memory' })
        : new WebMOutputFormat()
    const target = new BufferTarget()
    this.output = new Output({ format: outputFormat, target })
    this.source = new CanvasSource(canvas, {
      codec: format.codec,
      quality: new Quality('high'),
      keyFrameInterval: 2,
    })
    this.output.addVideoTrack(this.source, { frameRate: fps })
    signal?.addEventListener('abort', this.abort, { once: true })
  }

  async add(timestamp: number, duration: number): Promise<void> {
    this.throwIfAborted()
    if (!this.started) {
      await this.output.start()
      this.started = true
    }
    await this.source.add(timestamp, duration)
  }

  async finish(): Promise<Blob> {
    this.throwIfAborted()
    if (!this.started) {
      await this.output.start()
      this.started = true
    }
    await this.output.finalize()
    const buffer = this.output.target.buffer
    this.close()
    if (!buffer) throw new Error('Video encoder returned no data')
    return new Blob([buffer], { type: this.format.mimeType })
  }

  async cancel(): Promise<void> {
    if (this.closed) return
    await this.output.cancel()
    this.close()
  }

  private throwIfAborted(): void {
    if (this.signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
  }

  private abort = () => {
    void this.cancel()
  }

  private close(): void {
    if (this.closed) return
    this.closed = true
    this.signal?.removeEventListener('abort', this.abort)
  }
}
