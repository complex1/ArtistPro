import {
  artifactFilename,
  createRenderProgress,
  renderError,
  scheduleFrames,
} from '../../../render/frameSchedule'
import { GifFrameEncoder } from '../../../render/gifEncoder'
import { ImageSequenceEncoder } from '../../../render/imageSequence'
import type {
  RenderArtifact,
  RenderFormat,
  RenderFps,
  RenderProgress,
} from '../../../render/types'
import { RenderError } from '../../../render/types'
import { VideoFrameEncoder } from '../../../render/videoEncoder'
import type { PaintDocumentV2 } from '../core/types'
import { renderDocumentV2, type LayerSurfaces } from './engine'

export type PaintExportSettings = {
  fps: RenderFps
  duration: number
  format: RenderFormat
}

export type PaintExportOptions = {
  signal?: AbortSignal
  onProgress?: (progress: RenderProgress) => void
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw renderError('cancelled')
}

function normalizeError(error: unknown): RenderError {
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

function report(
  options: PaintExportOptions,
  phase: RenderProgress['phase'],
  frameIndex: number,
  frameCount: number,
): void {
  options.onProgress?.(createRenderProgress(phase, frameIndex, frameCount))
}

export async function renderPaintDocument(
  sourceDocument: PaintDocumentV2,
  surfaces: LayerSurfaces,
  settings: PaintExportSettings,
  options: PaintExportOptions = {},
): Promise<RenderArtifact> {
  const documentSnapshot = structuredClone(sourceDocument)
  const schedule = scheduleFrames(settings.duration, {
    fps: settings.fps,
    speed: 1,
    resolutionScale: 1,
  })
  throwIfAborted(options.signal)

  const canvas = document.createElement('canvas')
  canvas.width = documentSnapshot.width
  canvas.height = documentSnapshot.height
  const context = canvas.getContext('2d', {
    willReadFrequently: settings.format === 'gif',
  })
  if (!context) throw renderError('rasterization-failed', 'Canvas 2D is unavailable.')

  let video: VideoFrameEncoder | undefined
  let gif: GifFrameEncoder | undefined
  let sequence: ImageSequenceEncoder | undefined
  let completed = false

  try {
    report(options, 'preparing', 0, schedule.frameCount)
    if (settings.format === 'video') {
      video = await VideoFrameEncoder.create(canvas, settings.fps, options.signal)
    } else if (settings.format === 'gif') {
      gif = new GifFrameEncoder({
        width: canvas.width,
        height: canvas.height,
        fps: settings.fps,
        signal: options.signal,
      })
    } else {
      sequence = new ImageSequenceEncoder(options.signal)
    }

    for (const frame of schedule.frames) {
      throwIfAborted(options.signal)
      report(options, 'rasterizing', frame.index, schedule.frameCount)
      renderDocumentV2(
        context,
        documentSnapshot,
        frame.sourceTime * 1000,
        surfaces.rasters,
        surfaces.masks,
      )

      throwIfAborted(options.signal)
      report(options, 'encoding', frame.index, schedule.frameCount)
      if (video) {
        await video.add(frame.outputTime, frame.duration)
      } else if (gif) {
        await gif.add(context.getImageData(0, 0, canvas.width, canvas.height))
      } else if (sequence) {
        await sequence.add(canvas, frame.index)
      }
      report(options, 'encoding', frame.index + 1, schedule.frameCount)
      if ((frame.index + 1) % 4 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
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
        width: canvas.width,
        height: canvas.height,
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
        width: canvas.width,
        height: canvas.height,
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
      width: canvas.width,
      height: canvas.height,
      duration: schedule.outputDuration,
      frameCount: schedule.frameCount,
    }
    report(options, 'complete', schedule.frameCount, schedule.frameCount)
    return artifact
  } catch (error) {
    const normalized = normalizeError(error)
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
