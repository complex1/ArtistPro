import type { EditorDocument } from '../model/types'
import {
  artifactFilename,
  createRenderProgress,
  renderError,
  scaledOutputSize,
  scheduleFrames,
} from './frameSchedule'
import { GifFrameEncoder } from './gifEncoder'
import { ImageSequenceEncoder } from './imageSequence'
import { rasterizeSvg } from './rasterize'
import { renderDocumentSvg } from './svgFrame'
import {
  RenderError,
  type RenderArtifact,
  type RenderFormat,
  type RenderProgress,
  type RenderSettings,
} from './types'
import { VideoFrameEncoder } from './videoEncoder'

export type RenderEngineOptions = {
  signal?: AbortSignal
  onProgress?: (progress: RenderProgress) => void
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw renderError('cancelled')
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function report(
  options: RenderEngineOptions,
  phase: RenderProgress['phase'],
  frameIndex: number,
  frameCount: number,
): void {
  options.onProgress?.(createRenderProgress(phase, frameIndex, frameCount))
}

function normalizeRenderError(error: unknown): RenderError {
  if (error instanceof RenderError) return error
  if (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return renderError('cancelled', undefined, error)
  }
  return renderError(
    'encoding-failed',
    error instanceof Error ? error.message : String(error),
    error,
  )
}

export async function renderDocument(
  sourceDocument: EditorDocument,
  settings: RenderSettings,
  format: RenderFormat,
  options: RenderEngineOptions = {},
): Promise<RenderArtifact> {
  const documentSnapshot = structuredClone(sourceDocument)
  const schedule = scheduleFrames(documentSnapshot.animation.duration, settings)
  const size = scaledOutputSize(
    documentSnapshot.artboard,
    settings.resolutionScale,
  )
  throwIfAborted(options.signal)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  let video: VideoFrameEncoder | undefined
  let gif: GifFrameEncoder | undefined
  let sequence: ImageSequenceEncoder | undefined
  let completed = false

  try {
    throwIfAborted(options.signal)
    report(options, 'preparing', 0, schedule.frameCount)

    if (format === 'video') {
      video = await VideoFrameEncoder.create(canvas, settings.fps, options.signal)
    } else if (format === 'gif') {
      gif = new GifFrameEncoder({
        width: size.width,
        height: size.height,
        fps: settings.fps,
        signal: options.signal,
      })
    } else {
      sequence = new ImageSequenceEncoder(options.signal)
    }

    for (const frame of schedule.frames) {
      throwIfAborted(options.signal)
      report(options, 'rasterizing', frame.index, schedule.frameCount)
      const svg = renderDocumentSvg(documentSnapshot, frame.sourceTime)
      let pixels: ImageData | undefined
      try {
        pixels = await rasterizeSvg(
          svg,
          canvas,
          size.width,
          size.height,
          options.signal,
          Boolean(gif),
        )
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === 'AbortError') ||
          options.signal?.aborted
        ) {
          throw error
        }
        throw renderError(
          'rasterization-failed',
          error instanceof Error ? error.message : String(error),
          error,
        )
      }

      throwIfAborted(options.signal)
      report(options, 'encoding', frame.index, schedule.frameCount)
      if (video) {
        await video.add(frame.outputTime, frame.duration)
      } else if (gif) {
        if (!pixels) throw renderError('rasterization-failed')
        await gif.add(pixels)
      } else if (sequence) {
        await sequence.add(canvas, frame.index)
      }
      report(options, 'encoding', frame.index + 1, schedule.frameCount)
      if ((frame.index + 1) % 4 === 0) await yieldToBrowser()
    }

    throwIfAborted(options.signal)
    report(options, 'finalizing', schedule.frameCount, schedule.frameCount)

    if (video) {
      const blob = await video.finish()
      completed = true
      const artifact: RenderArtifact = {
        kind: 'video',
        mimeType: video.format.mimeType,
        codec: video.format.codec,
        filename: artifactFilename(
          documentSnapshot.name,
          'video',
          video.format.codec,
        ),
        blob,
        width: size.width,
        height: size.height,
        duration: schedule.outputDuration,
        frameCount: schedule.frameCount,
      }
      report(options, 'complete', schedule.frameCount, schedule.frameCount)
      return artifact
    }

    if (gif) {
      const blob = await gif.finish()
      completed = true
      const artifact: RenderArtifact = {
        kind: 'gif',
        mimeType: 'image/gif',
        filename: artifactFilename(documentSnapshot.name, 'gif'),
        blob,
        width: size.width,
        height: size.height,
        duration: schedule.outputDuration,
        frameCount: schedule.frameCount,
      }
      report(options, 'complete', schedule.frameCount, schedule.frameCount)
      return artifact
    }

    if (!sequence) throw renderError('encoding-failed')
    const blob = await sequence.finish()
    completed = true
    const artifact: RenderArtifact = {
      kind: 'image-sequence',
      mimeType: 'application/zip',
      filename: artifactFilename(documentSnapshot.name, 'image-sequence'),
      blob,
      width: size.width,
      height: size.height,
      duration: schedule.outputDuration,
      frameCount: schedule.frameCount,
    }
    report(options, 'complete', schedule.frameCount, schedule.frameCount)
    return artifact
  } catch (error) {
    const normalized = normalizeRenderError(error)
    report(
      options,
      normalized.code === 'cancelled' ? 'cancelled' : 'failed',
      0,
      schedule.frameCount,
    )
    throw normalized
  } finally {
    if (!completed) {
      if (video) await video.cancel().catch(() => undefined)
      gif?.cancel()
      sequence?.cancel()
    }
    canvas.width = 1
    canvas.height = 1
  }
}
