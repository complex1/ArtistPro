import { describe, expect, it } from 'vitest'
import { animatedPoint, visibleRange } from './animation'
import { sampledPath } from './path'
import type { PaintStroke } from './types'

function stroke(overrides: Partial<PaintStroke> = {}): PaintStroke {
  return {
    id: 'stroke-1',
    presetId: 'round',
    renderer: 'line',
    animation: 'none',
    color: '#111111',
    size: 10,
    motion: 8,
    speed: 4,
    opacity: 1,
    glow: 0,
    spacing: 10,
    density: 1,
    widthScale: 1,
    dash: null,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 20, y: 0, pressure: 0.5 },
    ],
    seed: 0,
    ...overrides,
  }
}

describe('paint animation engine', () => {
  it('leaves points unchanged for a static stroke', () => {
    expect(animatedPoint(stroke(), { x: 4, y: 6, pressure: 0.7 }, 0, 1)).toEqual({
      x: 4,
      y: 6,
      pressure: 0.7,
      size: 1,
      rotation: 0,
      opacity: 1,
      hue: 0,
      saturation: 1,
      lightness: 1,
      blur: 0,
      glow: 0,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 0,
      shadowOpacity: 1,
    })
  })

  it('applies wave displacement without mutating the source point', () => {
    const point = { x: 4, y: 6, pressure: 0.7 }
    const result = animatedPoint(
      stroke({ animation: 'wave', motion: 10, speed: 2 }),
      point,
      3,
      0.5,
    )

    expect(result.x).toBe(4)
    expect(result.y).not.toBe(6)
    expect(point.y).toBe(6)
  })

  it('applies math expressions as per-point visual overrides', () => {
    const result = animatedPoint(
      stroke({
        motion: 10,
        speed: 2,
        expressions: {
          x: 'sin(time * speed + index) * amount',
          y: 'progress * amount',
          size: '1 + pressure',
          rotation: 'PI / 2',
          opacity: '0.4',
          hue: 'time * 30',
          saturation: '1.2',
          lightness: '0.8',
          blur: '2 + sin(time)',
          glow: 'amount',
          shadowX: 'index * 2',
          shadowY: '4',
          shadowBlur: '6',
          shadowOpacity: '0.3',
        },
      }),
      { x: 4, y: 6, pressure: 0.5 },
      1,
      1,
    )

    expect(result.x).toBeCloseTo(4 + Math.sin(3) * 10)
    expect(result.y).toBe(16)
    expect(result.size).toBe(1.5)
    expect(result.rotation).toBeCloseTo(Math.PI / 2)
    expect(result.opacity).toBe(0.4)
    expect(result.hue).toBe(30)
    expect(result.saturation).toBe(1.2)
    expect(result.lightness).toBe(0.8)
    expect(result.blur).toBeCloseTo(2 + Math.sin(1))
    expect(result.glow).toBe(10)
    expect(result.shadowX).toBe(2)
    expect(result.shadowY).toBe(4)
    expect(result.shadowBlur).toBe(6)
    expect(result.shadowOpacity).toBe(0.3)
  })

  it('falls back safely when a persisted expression is invalid', () => {
    const result = animatedPoint(
      stroke({ expressions: { x: 'window.location', size: '1 / 0' } }),
      { x: 4, y: 6, pressure: 0.5 },
      0,
      1,
    )

    expect(result.x).toBe(4)
    expect(result.size).toBe(1)
  })

  it('computes looping draw-on visibility', () => {
    expect(visibleRange(stroke({ animation: 'drawOn', speed: 4 }), 0)).toEqual([
      0, 0,
    ])
    const [, end] = visibleRange(
      stroke({ animation: 'drawOn', speed: 4 }),
      0.5,
    )
    expect(end).toBeGreaterThan(0)
    expect(end).toBeLessThan(1)
  })

  it('samples an even path spacing across source segments', () => {
    expect(sampledPath(stroke().points, 5).map(({ x }) => x)).toEqual([
      5, 10, 15, 20,
    ])
  })
})
