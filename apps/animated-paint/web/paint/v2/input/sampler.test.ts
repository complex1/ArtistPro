import { describe, expect, it } from 'vitest'
import { createBrushV2, emptyPoint } from '../core/defaults'
import { DEFAULT_BUDGETS } from '../core/types'
import { EXPRESSIVE_BRUSHES } from '../expressivePresets'
import { REVEAL_BRUSHES } from '../revealPresets'
import { strokeFrame } from '../render/engine'
import {
  fromPointer,
  randomStrokeSeed,
  resampleStroke,
  sampleStroke,
  scatterPoints,
  snapshotStroke,
  stabilizePoint,
} from './sampler'

describe('v2 input sampler', () => {
  it('captures pressure, tilt, and velocity', () => {
    const first = fromPointer({ x: 0, y: 0, t: 0, pressure: 0.8, tiltX: 0.2 }, null)
    const second = fromPointer(
      { x: 10, y: 0, t: 0.05, pressure: 0.4, tiltY: -0.1 },
      first,
    )
    expect(first.pressure).toBe(0.8)
    expect(second.velocity).toBeCloseTo(200)
    expect(second.tiltY).toBe(-0.1)
  })

  it('stabilizes toward the previous point', () => {
    const previous = fromPointer({ x: 0, y: 0, t: 0 }, null)
    const next = fromPointer({ x: 100, y: 0, t: 0.016 }, previous)
    const smoothed = stabilizePoint(next, previous, 80)
    expect(smoothed.x).toBeLessThan(next.x)
    expect(smoothed.x).toBeGreaterThan(previous.x)
  })

  it('resamples by spacing and is deterministic with scatter seed', () => {
    const points = [
      fromPointer({ x: 0, y: 0, t: 0 }, null),
      fromPointer({ x: 40, y: 0, t: 0.1 }, null),
    ]
    const sampled = resampleStroke(points, 10)
    expect(sampled.length).toBeGreaterThan(3)
    const scatteredA = scatterPoints(sampled, 0, 8, 7)
    const scatteredB = scatterPoints(sampled, 0, 8, 7)
    expect(scatteredA).toEqual(scatteredB)
    expect(scatteredA[1].y).not.toBe(sampled[1].y)
  })

  it('draws a fresh seed per live stroke', () => {
    const seeds = new Set(Array.from({ length: 50 }, randomStrokeSeed))
    expect(seeds.size).toBeGreaterThan(40)
    for (const seed of seeds) {
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThan(0)
    }
  })

  it('snapshots the brush at draw time', () => {
    const brush = createBrushV2({ id: 'ink', size: 9, name: 'Ink' })
    const stroke = snapshotStroke(brush, [fromPointer({ x: 1, y: 2, t: 0 }, null)], 'layer')
    brush.size = 40
    expect(stroke.brushSnapshot.size).toBe(9)
    expect(stroke.brushSnapshot.id).toBe('ink')
    expect(stroke.points[0]).toMatchObject({ x: 1, y: 2 })
  })

  it('applies brush spacing and scatter together', () => {
    const brush = createBrushV2({
      spacing: 8,
      scatter: { along: 0, across: 4, seed: 3 },
    })
    const points = [
      fromPointer({ x: 0, y: 0, t: 0 }, null),
      fromPointer({ x: 32, y: 0, t: 0.2 }, null),
    ]
    expect(sampleStroke(points, brush, 11).length).toBeGreaterThan(2)
  })

  it('keeps the exact final point on short strokes and after partial spacing', () => {
    for (const end of [0.1, 3, 9, 10, 11, 25]) {
      const points = [emptyPoint(0, 20, 0), { ...emptyPoint(end, 20, 2), pressure: 0.9, velocity: 400 }]
      const sampled = resampleStroke(points, 10)
      expect(sampled[0]).toBe(points[0])
      expect(sampled.at(-1)).toBe(points[1])
      expect(sampled.filter(point => point.x === end)).toHaveLength(1)
      expect(sampled.every(point => point.x >= 0 && point.x <= end)).toBe(true)
    }
  })

  it('adapts sampling across a long path while preserving pressure, velocity and time', () => {
    const start = { ...emptyPoint(0, 0, 1), pressure: 0.2, velocity: 20, tiltX: -0.4, tiltY: 0.1, altitude: 0.2 }
    const end = { ...emptyPoint(100_000, 0, 11), pressure: 0.8, velocity: 820, tiltX: 0.6, tiltY: 0.9, altitude: 0.8 }
    const sampled = resampleStroke([start, end], 0.5, 17)
    expect(sampled).toHaveLength(17)
    expect(sampled[0]).toBe(start)
    expect(sampled.at(-1)).toBe(end)
    for (let index = 0; index < sampled.length; index++) {
      const fraction = index / 16
      for (const key of ['x', 'y', 't', 'pressure', 'velocity', 'tiltX', 'tiltY', 'altitude'] as const) {
        expect(sampled[index][key]).toBeCloseTo(start[key] + (end[key] - start[key]) * fraction, 7)
      }
    }
  })

  it('stays bounded across many segments and retains both ends', () => {
    const points = Array.from({ length: 4_000 }, (_, index) => emptyPoint(index * 13, 30 + Math.sin(index * 0.1) * 20, index / 100))
    for (const budget of [2, 3, 17, DEFAULT_BUDGETS.maxSampledPoints]) {
      const sampled = resampleStroke(points, 0.5, budget)
      expect(sampled.length).toBeLessThanOrEqual(budget)
      expect(sampled[0]).toBe(points[0])
      expect(sampled.at(-1)).toBe(points.at(-1))
      expect(sampled.every(point => Number.isFinite(point.x + point.y + point.t + point.velocity))).toBe(true)
    }
  })

  it('handles empty paths, tiny budgets, repeated points, and closed loops', () => {
    const first = emptyPoint(1, 2)
    const last = { ...first, t: 5, pressure: 0.9 }
    expect(resampleStroke([], 2)).toEqual([])
    expect(resampleStroke([first, last], 2, 0)).toEqual([])
    expect(resampleStroke([first, last], 2, 1)).toEqual([first])
    expect(resampleStroke([first], 2, 5)).toEqual([first])
    const repeated = resampleStroke([first, first, last], 2)
    expect(repeated).toEqual([first, last])
    const loop = resampleStroke([first, emptyPoint(30, 2), emptyPoint(30, 40), last], 1, 20)
    expect(loop.length).toBeLessThanOrEqual(20)
    expect(loop[0]).toBe(first)
    expect(loop.at(-1)).toBe(last)
  })

  it.each(['speedTaper', 'centerBloom'])('keeps the long-stroke endpoint through the %s render pipeline', id => {
    const brush = [...EXPRESSIVE_BRUSHES, ...REVEAL_BRUSHES].find(value => value.id === id)!
    const points = Array.from({ length: 4_000 }, (_, index) => ({
      ...emptyPoint(index * 13, 80, index / 100), pressure: 0.7, velocity: 300,
    }))
    const stroke = snapshotStroke(brush, points, 'layer', 17)
    const frame = strokeFrame(stroke, 100_000, 100_000)
    expect(frame.diagnostics.filter(item => item.code === 'animate-error')).toEqual([])
    expect(frame.items[0].x).toBe(points[0].x)
    expect(frame.items.at(-1)!.x).toBe(points.at(-1)!.x)
    expect(frame.items.length).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxSampledPoints)
  })
})
