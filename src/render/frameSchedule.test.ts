import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RENDER_SETTINGS,
  RENDER_FPS,
  RENDER_RESOLUTION_SCALES,
  RENDER_SPEEDS,
  RenderError,
  isRenderError,
} from './types'
import {
  MAX_RENDER_DIMENSION,
  MAX_RENDER_PIXELS,
  artifactFilename,
  artifactMimeType,
  assertDocumentDuration,
  assertOutputSize,
  assertRenderSettings,
  createRenderProgress,
  isRenderFps,
  isRenderResolutionScale,
  isRenderSettings,
  isRenderSpeed,
  outputDuration,
  renderDimensions,
  renderError,
  sanitizeRenderFilename,
  scaledOutputSize,
  scheduleFrames,
  sequenceFrameFilename,
} from './frameSchedule'

const settings = (
  overrides: Partial<typeof DEFAULT_RENDER_SETTINGS> = {},
) => ({
  ...DEFAULT_RENDER_SETTINGS,
  ...overrides,
})

describe('render setting contracts', () => {
  it('accepts the documented fps, speed, and scale unions', () => {
    expect(RENDER_FPS).toEqual([12, 24, 30, 60])
    expect(RENDER_SPEEDS).toEqual([0.25, 0.5, 1, 2, 4])
    expect(RENDER_RESOLUTION_SCALES).toEqual([1, 2, 3, 4])
    expect(DEFAULT_RENDER_SETTINGS).toEqual({
      fps: 30,
      speed: 1,
      resolutionScale: 1,
    })
  })

  it('type-guards valid and invalid settings', () => {
    expect(isRenderFps(24)).toBe(true)
    expect(isRenderFps(25)).toBe(false)
    expect(isRenderSpeed(0.25)).toBe(true)
    expect(isRenderSpeed(3)).toBe(false)
    expect(isRenderResolutionScale(4)).toBe(true)
    expect(isRenderResolutionScale(5)).toBe(false)
    expect(isRenderSettings(DEFAULT_RENDER_SETTINGS)).toBe(true)
    expect(isRenderSettings({ fps: 30, speed: 1 })).toBe(false)
    expect(isRenderSettings({ fps: 15, speed: 1, resolutionScale: 1 })).toBe(false)
  })

  it('throws structured invalid-settings errors', () => {
    expect(() => assertRenderSettings({ fps: 15, speed: 1, resolutionScale: 1 })).toThrow(
      RenderError,
    )
    try {
      assertRenderSettings(null)
    } catch (error) {
      expect(isRenderError(error)).toBe(true)
      if (isRenderError(error)) expect(error.code).toBe('invalid-settings')
    }
  })
})

describe('scheduleFrames', () => {
  it('maps source time through speed and keeps output duration exact', () => {
    const schedule = scheduleFrames(3, settings({ fps: 30, speed: 1 }))
    expect(schedule.outputDuration).toBe(3)
    expect(schedule.frameCount).toBe(90)
    expect(schedule.frames).toHaveLength(90)
    expect(schedule.frames[0]).toEqual({
      index: 0,
      sourceTime: 0,
      outputTime: 0,
      duration: 1 / 30,
    })
    expect(schedule.frames[1]?.outputTime).toBeCloseTo(1 / 30, 12)
    expect(schedule.frames[1]?.sourceTime).toBeCloseTo(1 / 30, 12)
    const last = schedule.frames[89]
    expect(last?.index).toBe(89)
    expect(last?.outputTime).toBeCloseTo(89 / 30, 12)
    expect(last?.sourceTime).toBeCloseTo(89 / 30, 12)
    expect(last?.duration).toBeCloseTo(1 / 30, 12)
    const covered = schedule.frames.reduce((sum, frame) => sum + frame.duration, 0)
    expect(covered).toBeCloseTo(3, 12)
  })

  it('shortens output when speed is greater than 1', () => {
    const schedule = scheduleFrames(4, settings({ fps: 24, speed: 2 }))
    expect(schedule.outputDuration).toBe(2)
    expect(schedule.frameCount).toBe(48)
    expect(schedule.frames[1]?.sourceTime).toBeCloseTo(2 / 24, 12)
    expect(schedule.frames[1]?.outputTime).toBeCloseTo(1 / 24, 12)
    expect(schedule.frames.at(-1)?.sourceTime).toBeLessThan(4)
  })

  it('lengthens output when speed is less than 1', () => {
    const schedule = scheduleFrames(2, settings({ fps: 12, speed: 0.5 }))
    expect(schedule.outputDuration).toBe(4)
    expect(schedule.frameCount).toBe(48)
    expect(schedule.frames[2]?.sourceTime).toBeCloseTo((2 / 12) * 0.5, 12)
  })

  it('is deterministic across fps and speed combinations', () => {
    for (const fps of RENDER_FPS) {
      for (const speed of RENDER_SPEEDS) {
        const first = scheduleFrames(3, settings({ fps, speed }))
        const second = scheduleFrames(3, settings({ fps, speed }))
        expect(second).toEqual(first)
        expect(first.outputDuration).toBe(3 / speed)
        expect(first.frames.map((frame) => frame.index)).toEqual(
          [...Array(first.frameCount)].map((_, index) => index),
        )
        for (const frame of first.frames) {
          expect(frame.sourceTime).toBeCloseTo(frame.outputTime * speed, 12)
          expect(frame.sourceTime).toBeGreaterThanOrEqual(0)
          expect(frame.sourceTime).toBeLessThan(3)
          expect(frame.duration).toBeGreaterThan(0)
        }
        const covered = first.frames.reduce((sum, frame) => sum + frame.duration, 0)
        expect(covered).toBeCloseTo(first.outputDuration, 10)
      }
    }
  })

  it('keeps a single frame when the output is shorter than one tick', () => {
    const schedule = scheduleFrames(0.01, settings({ fps: 12, speed: 4 }))
    expect(schedule.outputDuration).toBeCloseTo(0.0025, 12)
    expect(schedule.frameCount).toBe(1)
    expect(schedule.frames[0]).toMatchObject({
      index: 0,
      sourceTime: 0,
      outputTime: 0,
    })
    expect(schedule.frames[0]?.duration).toBeCloseTo(0.0025, 12)
  })

  it('absorbs rounding remainder on the last frame', () => {
    const schedule = scheduleFrames(1.01, settings({ fps: 30, speed: 1 }))
    expect(schedule.outputDuration).toBe(1.01)
    const last = schedule.frames.at(-1)
    expect(last).toBeDefined()
    expect(last!.outputTime + last!.duration).toBeCloseTo(1.01, 12)
    expect(schedule.frames.slice(0, -1).every((frame) => frame.duration === 1 / 30)).toBe(
      true,
    )
  })

  it('rejects non-positive or non-finite durations', () => {
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => scheduleFrames(duration, settings())).toThrow(RenderError)
      try {
        assertDocumentDuration(duration)
      } catch (error) {
        expect(isRenderError(error) && error.code).toBe('invalid-duration')
      }
    }
  })

  it('rejects invalid settings before scheduling', () => {
    expect(() =>
      scheduleFrames(1, { fps: 25, speed: 1, resolutionScale: 1 } as never),
    ).toThrow(RenderError)
  })
})

describe('outputDuration', () => {
  it('is document duration divided by speed', () => {
    expect(outputDuration(3, 1)).toBe(3)
    expect(outputDuration(3, 2)).toBe(1.5)
    expect(outputDuration(3, 0.25)).toBe(12)
  })
})

describe('render dimensions', () => {
  it('scales integer artboards through 1x-4x', () => {
    expect(renderDimensions({ width: 1920, height: 1080 }, 1)).toEqual({
      width: 1920,
      height: 1080,
    })
    expect(renderDimensions({ width: 1920, height: 1080 }, 2)).toEqual({
      width: 3840,
      height: 2160,
    })
    expect(scaledOutputSize({ width: 800, height: 600 }, 3)).toEqual({
      width: 2400,
      height: 1800,
    })
    expect(renderDimensions({ width: 100.4, height: 50.6 }, 1)).toEqual({
      width: 100,
      height: 51,
    })
  })

  it('guards oversized canvases', () => {
    expect(() =>
      scaledOutputSize({ width: MAX_RENDER_DIMENSION + 1, height: 1 }, 1),
    ).toThrow(RenderError)
    expect(() => assertOutputSize({ width: 16385, height: 1 })).toThrow(RenderError)
    expect(() =>
      assertOutputSize({
        width: Math.floor(Math.sqrt(MAX_RENDER_PIXELS)) + 1,
        height: Math.floor(Math.sqrt(MAX_RENDER_PIXELS)) + 1,
      }),
    ).toThrow(RenderError)
    try {
      scaledOutputSize({ width: 8000, height: 8000 }, 4)
    } catch (error) {
      expect(isRenderError(error) && error.code).toBe('canvas-size')
    }
  })

  it('rejects non-positive artboards and non-integer outputs', () => {
    expect(() => renderDimensions({ width: 0, height: 100 }, 1)).toThrow(RenderError)
    expect(() => renderDimensions({ width: 100, height: -2 }, 1)).toThrow(RenderError)
    expect(() => assertOutputSize({ width: 1.5, height: 10 })).toThrow(RenderError)
    expect(() => renderDimensions({ width: 10, height: 10 }, 8 as never)).toThrow(
      RenderError,
    )
  })
})

describe('progress and errors', () => {
  it('reports a complete ratio of 1 and clamps frame indexes', () => {
    expect(createRenderProgress('rasterizing', 15, 60)).toEqual({
      phase: 'rasterizing',
      frameIndex: 15,
      frameCount: 60,
      ratio: 0.25,
    })
    expect(createRenderProgress('complete', 60, 60).ratio).toBe(1)
    expect(createRenderProgress('preparing', -3, 10).frameIndex).toBe(0)
    expect(createRenderProgress('encoding', 99, 10).frameIndex).toBe(10)
    expect(createRenderProgress('cancelled', 3, 10).ratio).toBe(0.3)
    expect(createRenderProgress('failed', 0, 0).ratio).toBe(0)
  })

  it('preserves structured error codes and causes', () => {
    const cause = new Error('codec probe failed')
    const error = renderError('unsupported-codec', 'AVC and VP9 are unavailable.', cause)
    expect(error).toBeInstanceOf(RenderError)
    expect(error.name).toBe('RenderError')
    expect(error.code).toBe('unsupported-codec')
    expect(error.cause).toBe(cause)
    expect(error.message).toContain('AVC')
    expect(renderError('insecure-context').code).toBe('insecure-context')
    expect(renderError('cancelled').code).toBe('cancelled')
    expect(renderError('rasterization-failed').code).toBe('rasterization-failed')
    expect(renderError('encoding-failed').code).toBe('encoding-failed')
  })
})

describe('filenames', () => {
  it('sanitizes document names for downloads', () => {
    expect(sanitizeRenderFilename(' My Film *.svg ')).toBe('My-Film')
    expect(sanitizeRenderFilename('../../secret/name')).toBe('name')
    expect(sanitizeRenderFilename('!!!')).toBe('untitled')
    expect(sanitizeRenderFilename('')).toBe('untitled')
    expect(sanitizeRenderFilename('a'.repeat(120)).length).toBe(80)
  })

  it('names sequence frames with a stable padded order', () => {
    expect(sequenceFrameFilename(0)).toBe('frame_000001.png')
    expect(sequenceFrameFilename(11, 24)).toBe('frame_000012.png')
    expect(sequenceFrameFilename(999999, 1_000_000)).toBe('frame_1000000.png')
    expect(() => sequenceFrameFilename(-1)).toThrow(RenderError)
  })

  it('builds artifact filenames and mime types from format and codec', () => {
    expect(artifactFilename('Hero Shot', 'video', 'avc')).toBe('Hero-Shot.mp4')
    expect(artifactFilename('Hero Shot', 'video', 'vp9')).toBe('Hero-Shot.webm')
    expect(artifactFilename('Hero Shot', 'gif')).toBe('Hero-Shot.gif')
    expect(artifactFilename('Hero Shot', 'image-sequence')).toBe('Hero-Shot-frames.zip')
    expect(artifactMimeType('video', 'avc')).toBe('video/mp4')
    expect(artifactMimeType('video', 'vp8')).toBe('video/webm')
    expect(artifactMimeType('gif')).toBe('image/gif')
    expect(artifactMimeType('image-sequence')).toBe('application/zip')
  })
})
