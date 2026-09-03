export const RENDER_FPS = [12, 24, 30, 60] as const
export type RenderFps = (typeof RENDER_FPS)[number]

export const RENDER_SPEEDS = [0.25, 0.5, 1, 2, 4] as const
export type RenderSpeed = (typeof RENDER_SPEEDS)[number]

export const RENDER_RESOLUTION_SCALES = [1, 2, 3, 4] as const
export type RenderResolutionScale = (typeof RENDER_RESOLUTION_SCALES)[number]

export type RenderSettings = {
  fps: RenderFps
  speed: RenderSpeed
  resolutionScale: RenderResolutionScale
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  fps: 30,
  speed: 1,
  resolutionScale: 1,
}

export type RenderPhase =
  | 'preparing'
  | 'rasterizing'
  | 'encoding'
  | 'finalizing'
  | 'complete'
  | 'cancelled'
  | 'failed'

export type RenderProgress = {
  phase: RenderPhase
  frameIndex: number
  frameCount: number
  ratio: number
}

export type RenderFormat = 'video' | 'gif' | 'image-sequence'

export type VideoCodec = 'avc' | 'vp9' | 'vp8'

export type VideoArtifact = {
  kind: 'video'
  mimeType: 'video/mp4' | 'video/webm'
  codec: VideoCodec
  filename: string
  blob: Blob
  width: number
  height: number
  duration: number
  frameCount: number
}

export type GifArtifact = {
  kind: 'gif'
  mimeType: 'image/gif'
  filename: string
  blob: Blob
  width: number
  height: number
  duration: number
  frameCount: number
}

export type ImageSequenceArtifact = {
  kind: 'image-sequence'
  mimeType: 'application/zip'
  filename: string
  blob: Blob
  width: number
  height: number
  duration: number
  frameCount: number
}

export type RenderArtifact = VideoArtifact | GifArtifact | ImageSequenceArtifact

export type RenderErrorCode =
  | 'invalid-settings'
  | 'invalid-duration'
  | 'canvas-size'
  | 'unsupported-codec'
  | 'insecure-context'
  | 'rasterization-failed'
  | 'encoding-failed'
  | 'cancelled'

export class RenderError extends Error {
  readonly code: RenderErrorCode
  readonly cause: unknown

  constructor(
    code: RenderErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'RenderError'
    this.code = code
    this.cause = options.cause
  }
}

export function isRenderError(error: unknown): error is RenderError {
  return error instanceof RenderError
}

export type ScheduledFrame = {
  index: number
  sourceTime: number
  outputTime: number
  duration: number
}

export type FrameSchedule = {
  frames: ScheduledFrame[]
  frameCount: number
  documentDuration: number
  outputDuration: number
  fps: RenderFps
  speed: RenderSpeed
}

export type RenderSize = {
  width: number
  height: number
}
