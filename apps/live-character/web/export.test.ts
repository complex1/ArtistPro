import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLayer, generateMesh } from './engine'
import { exportAnimation, exportFrame, getAnimationExportPlan } from './export'
import type { CharacterDocument } from './model'
import { drawCharacter } from './render'

vi.mock('./render', () => ({
  prepareAssets: vi.fn().mockResolvedValue(undefined),
  drawCharacter: vi.fn(),
}))

vi.mock('./animationEncoder', () => ({
  CharacterGifEncoder: class {
    add = vi.fn().mockResolvedValue(undefined)
    finish = vi.fn().mockResolvedValue(new Blob([], { type: 'image/gif' }))
    cancel = vi.fn()
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('mesh animation export', () => {
  it('renders the requested PNG pose and every GIF mesh pose without modifying the bind mesh', async () => {
    vi.useFakeTimers()
    const layer = createLayer('rectangle', 'Body')
    layer.mesh = generateMesh(layer, 2)
    const initialVertices = structuredClone(layer.mesh.vertices)
    const finalVertices = initialVertices.map((vertex, index) => ({
      x: vertex.x + (index === 0 ? 20 : 0),
      y: vertex.y + (index === 0 ? 10 : 0),
    }))
    const doc: CharacterDocument = {
      version: 1,
      name: 'Mesh motion',
      width: 100,
      height: 100,
      fps: 24,
      duration: 2,
      layers: [layer],
      bones: [],
      controllers: [],
      keyframes: [
        {
          id: 'start',
          targetType: 'mesh',
          targetId: layer.id,
          frame: 0,
          easing: 'linear',
          vertices: initialVertices,
        },
        {
          id: 'end',
          targetType: 'mesh',
          targetId: layer.id,
          frame: 2,
          easing: 'linear',
          vertices: finalVertices,
        },
      ],
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        setTransform: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(100 * 100 * 4) }),
      }),
      toBlob: (callback: BlobCallback) =>
        callback(new Blob([], { type: 'image/png' })),
    }
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', {
      createElement: (tag: string) => (tag === 'canvas' ? canvas : link),
      body: { appendChild: vi.fn() },
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mesh-export')

    await exportFrame(doc, 1)
    const pngPose = vi.mocked(drawCharacter).mock.calls[0][2]
    expect(pngPose.layers[0].mesh!.vertices[0]).toEqual({
      x: initialVertices[0].x + 10,
      y: initialVertices[0].y + 5,
    })
    expect(link.download).toBe('Mesh motion-frame-001.png')

    vi.mocked(drawCharacter).mockClear()
    await exportAnimation(doc)
    const gifCalls = vi.mocked(drawCharacter).mock.calls
    expect(gifCalls).toHaveLength(3)
    expect(gifCalls.map((call) => call[2].layers[0].mesh!.vertices[0])).toEqual([
      initialVertices[0],
      { x: initialVertices[0].x + 10, y: initialVertices[0].y + 5 },
      finalVertices[0],
    ])
    expect(gifCalls.every((call) => call[1] === doc)).toBe(true)
    expect(layer.mesh.vertices).toEqual(initialVertices)
    expect(link.download).toBe('Mesh motion.gif')
  })
})

describe('animation GIF sampling', () => {
  it('keeps each frame, the final pose, and original playback duration for a short animation', () => {
    const plan = getAnimationExportPlan({
      width: 640,
      height: 480,
      fps: 24,
      duration: 119,
    })
    expect(plan.frames).toHaveLength(120)
    expect(plan.frames[0]).toBe(0)
    expect(plan.frames.at(-1)).toBe(119)
    expect(plan.fps).toBe(24)
    expect(plan.width).toBe(640)
    expect(plan.delays.reduce((sum, delay) => sum + delay, 0)).toBe(5000)
    expect(new Set(plan.delays)).toEqual(new Set([40, 50]))
  })

  it('caps expensive exports without shortening the animation or dropping its final pose', () => {
    const plan = getAnimationExportPlan({
      width: 2400,
      height: 1200,
      fps: 24,
      duration: 599,
    })
    expect(plan.frames).toHaveLength(240)
    expect(plan.frames.at(-1)).toBe(599)
    expect(plan.frames.length / plan.fps).toBeCloseTo(25)
    expect(plan.delays.reduce((sum, delay) => sum + delay, 0)).toBe(25_000)
    expect([plan.width, plan.height]).toEqual([800, 400])
  })

  it('exports a one-frame project without dividing by zero', () => {
    const plan = getAnimationExportPlan({
      width: 800,
      height: 600,
      fps: 12,
      duration: 0,
    })
    expect(plan.frames).toEqual([0])
    expect(plan.delays).toEqual([80])
    expect(plan.fps).toBe(12.5)
  })

  it('resamples high frame rates to at most 50fps while preserving duration', () => {
    const plan = getAnimationExportPlan({
      width: 640,
      height: 480,
      fps: 60,
      duration: 119,
    })
    expect(plan.frames).toHaveLength(100)
    expect(plan.frames.at(-1)).toBe(119)
    expect(plan.delays.every((delay) => delay >= 20)).toBe(true)
    expect(plan.delays.reduce((sum, delay) => sum + delay, 0)).toBe(2000)
  })

  it('retains both poses even for a clip shorter than GIF minimum frame delays', () => {
    const plan = getAnimationExportPlan({
      width: 640,
      height: 480,
      fps: 120,
      duration: 1,
    })
    expect(plan.frames).toEqual([0, 1])
    expect(plan.delays).toEqual([20, 20])
  })

  it('rejects malformed export settings', () => {
    expect(() =>
      getAnimationExportPlan({
        width: Infinity,
        height: 600,
        fps: 0,
        duration: 10,
      }),
    ).toThrow()
  })
})
