import { describe, expect, it } from 'vitest'
import { createBrushV2 } from '../core/defaults'
import {
  fromPointer,
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
})
