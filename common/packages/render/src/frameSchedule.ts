import {
  DEFAULT_RENDER_SETTINGS,
  RENDER_FPS,
  RENDER_RESOLUTION_SCALES,
  RENDER_SPEEDS,
  RenderError,
  type FrameSchedule,
  type RenderArtifact,
  type RenderErrorCode,
  type RenderFps,
  type RenderFormat,
  type RenderPhase,
  type RenderProgress,
  type RenderResolutionScale,
  type RenderSettings,
  type RenderSize,
  type RenderSpeed,
  type ScheduledFrame,
  type VideoCodec,
} from './types'

/** Conservative canvas limits used before encoder/WebCodecs attempts. */
export const MAX_RENDER_DIMENSION = 16384
export const MAX_RENDER_PIXELS = 268_435_456

const ERROR_MESSAGES: Record<RenderErrorCode, string> = {
  'invalid-settings': 'Render settings are invalid.',
  'invalid-duration': 'Document duration must be a finite number greater than zero.',
  'canvas-size': 'Output dimensions exceed the supported canvas size.',
  'unsupported-codec': 'No supported video codec is available in this browser.',
  'insecure-context': 'Video encoding requires a secure context.',
  'rasterization-failed': 'A frame could not be rasterized.',
  'encoding-failed': 'The output file could not be encoded.',
  cancelled: 'The render was cancelled.',
}

export function renderError(
  code: RenderErrorCode,
  detail?: string,
  cause?: unknown,
): RenderError {
  const message = detail ? `${ERROR_MESSAGES[code]} ${detail}` : ERROR_MESSAGES[code]
  return new RenderError(code, message, { cause })
}

export function isRenderFps(value: unknown): value is RenderFps {
  return (RENDER_FPS as readonly unknown[]).includes(value)
}

export function isRenderSpeed(value: unknown): value is RenderSpeed {
  return (RENDER_SPEEDS as readonly unknown[]).includes(value)
}

export function isRenderResolutionScale(
  value: unknown,
): value is RenderResolutionScale {
  return (RENDER_RESOLUTION_SCALES as readonly unknown[]).includes(value)
}

export function isRenderSettings(value: unknown): value is RenderSettings {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as RenderSettings
  return (
    isRenderFps(candidate.fps) &&
    isRenderSpeed(candidate.speed) &&
    isRenderResolutionScale(candidate.resolutionScale)
  )
}

export function assertRenderSettings(
  settings: unknown,
): asserts settings is RenderSettings {
  if (!isRenderSettings(settings)) {
    throw renderError('invalid-settings')
  }
}

export function outputDuration(documentDuration: number, speed: RenderSpeed): number {
  assertDocumentDuration(documentDuration)
  return documentDuration / speed
}

export function assertDocumentDuration(documentDuration: number): void {
  if (
    typeof documentDuration !== 'number' ||
    !Number.isFinite(documentDuration) ||
    documentDuration <= 0
  ) {
    throw renderError('invalid-duration')
  }
}

export function scheduleFrames(
  documentDuration: number,
  settings: RenderSettings = DEFAULT_RENDER_SETTINGS,
): FrameSchedule {
  assertRenderSettings(settings)
  assertDocumentDuration(documentDuration)

  const { fps, speed } = settings
  const totalOutput = outputDuration(documentDuration, speed)
  const frameDuration = 1 / fps
  let frameCount = Math.max(1, Math.round(totalOutput * fps))

  while (frameCount > 1 && (frameCount - 1) / fps >= totalOutput) {
    frameCount -= 1
  }

  const frames: ScheduledFrame[] = []
  for (let index = 0; index < frameCount; index += 1) {
    const outputTime = index * frameDuration
    const duration =
      index === frameCount - 1 ? totalOutput - outputTime : frameDuration
    frames.push({
      index,
      outputTime,
      sourceTime: outputTime * speed,
      duration,
    })
  }

  return {
    frames,
    frameCount,
    documentDuration,
    outputDuration: totalOutput,
    fps,
    speed,
  }
}

export function renderDimensions(
  artboard: RenderSize,
  resolutionScale: RenderResolutionScale,
): RenderSize {
  if (!isRenderResolutionScale(resolutionScale)) {
    throw renderError('invalid-settings')
  }
  if (!isPositiveFinite(artboard.width) || !isPositiveFinite(artboard.height)) {
    throw renderError(
      'canvas-size',
      'Artboard width and height must be finite numbers greater than zero.',
    )
  }

  return {
    width: Math.max(1, Math.round(artboard.width * resolutionScale)),
    height: Math.max(1, Math.round(artboard.height * resolutionScale)),
  }
}

export function assertOutputSize(size: RenderSize): RenderSize {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) {
    throw renderError('canvas-size', 'Output width and height must be integers.')
  }
  if (size.width < 1 || size.height < 1) {
    throw renderError('canvas-size', 'Output width and height must be at least 1px.')
  }
  if (size.width > MAX_RENDER_DIMENSION || size.height > MAX_RENDER_DIMENSION) {
    throw renderError(
      'canvas-size',
      `Each side must be at most ${MAX_RENDER_DIMENSION}px.`,
    )
  }
  if (size.width * size.height > MAX_RENDER_PIXELS) {
    throw renderError(
      'canvas-size',
      `Total pixels must be at most ${MAX_RENDER_PIXELS}.`,
    )
  }
  return size
}

export function scaledOutputSize(
  artboard: RenderSize,
  resolutionScale: RenderResolutionScale,
): RenderSize {
  return assertOutputSize(renderDimensions(artboard, resolutionScale))
}

export function createRenderProgress(
  phase: RenderPhase,
  frameIndex: number,
  frameCount: number,
): RenderProgress {
  const safeFrameCount = Math.max(0, frameCount)
  const safeIndex = Math.max(0, Math.min(frameIndex, safeFrameCount))
  let ratio = 0
  if (phase === 'complete') ratio = 1
  else if (phase === 'cancelled' || phase === 'failed') {
    ratio = safeFrameCount === 0 ? 0 : safeIndex / safeFrameCount
  } else if (safeFrameCount > 0) {
    ratio = safeIndex / safeFrameCount
  }
  return {
    phase,
    frameIndex: safeIndex,
    frameCount: safeFrameCount,
    ratio,
  }
}

const UNSAFE_FILENAME = /[^A-Za-z0-9._-]+/g

export function sanitizeRenderFilename(name: string, fallback = 'untitled'): string {
  const trimmed = name.trim().replace(/\\/g, '/').split('/').pop() ?? ''
  const withoutExt = trimmed.replace(/\.(svg|png|gif|mp4|webm|zip|json)$/i, '')
  const cleaned = withoutExt
    .replace(UNSAFE_FILENAME, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80)
  return cleaned || fallback
}

export function sequenceFrameFilename(
  index: number,
  frameCount = index + 1,
): string {
  if (!Number.isInteger(index) || index < 0) {
    throw renderError('invalid-settings', 'Sequence frame index must be a non-negative integer.')
  }
  const digits = Math.max(6, String(Math.max(1, frameCount)).length)
  return `frame_${String(index + 1).padStart(digits, '0')}.png`
}

export function artifactFilename(
  documentName: string,
  format: RenderFormat,
  codec?: VideoCodec,
): string {
  const base = sanitizeRenderFilename(documentName)
  if (format === 'gif') return `${base}.gif`
  if (format === 'image-sequence') return `${base}-frames.zip`
  if (codec === 'avc') return `${base}.mp4`
  return `${base}.webm`
}

export function artifactMimeType(
  format: RenderFormat,
  codec?: VideoCodec,
): RenderArtifact['mimeType'] {
  if (format === 'gif') return 'image/gif'
  if (format === 'image-sequence') return 'application/zip'
  return codec === 'avc' ? 'video/mp4' : 'video/webm'
}

function isPositiveFinite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
