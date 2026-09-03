import { describe, expect, it } from 'vitest'
import {
  dedupeFreehandPoints,
  fitFreehandPath,
  simplifyFreehandPoints,
} from './freehandPath'

describe('freehand path fitting', () => {
  it('drops duplicate samples and rejects a click without a drag', () => {
    expect(
      dedupeFreehandPoints([
        { x: 1, y: 1 },
        { x: 1.1, y: 1.1 },
        { x: 1.2, y: 1.2 },
      ]),
    ).toHaveLength(1)
    expect(fitFreehandPath([{ x: 1, y: 1 }], 0.5)).toEqual([])
  })

  it('fits a straight stroke as one cubic segment', () => {
    const points = Array.from({ length: 21 }, (_, index) => ({
      x: index * 5,
      y: 20,
    }))
    const fitted = fitFreehandPath(points, 0.5)

    expect(fitted).toHaveLength(2)
    expect(fitted[0].anchor).toEqual({ x: 0, y: 20 })
    expect(fitted[1].anchor).toEqual({ x: 100, y: 20 })
    expect(fitted[0].handleOut.x).toBeGreaterThan(0)
    expect(fitted[1].handleIn.x).toBeLessThan(0)
  })

  it('removes noise while retaining a curved shape', () => {
    const points = Array.from({ length: 101 }, (_, index) => ({
      x: index,
      y: Math.sin(index / 14) * 24 + (index % 2 === 0 ? 0.35 : -0.35),
    }))
    const fitted = fitFreehandPath(points, 0.75)

    expect(fitted.length).toBeGreaterThan(3)
    expect(fitted.length).toBeLessThan(points.length / 4)
    expect(fitted[0].anchor).toEqual(points[0])
    expect(fitted.at(-1)?.anchor).toEqual(points.at(-1))
  })

  it('preserves a sharp corner instead of rounding across it', () => {
    const fitted = fitFreehandPath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
      0.5,
    )
    expect(fitted).toHaveLength(3)
    expect(fitted[1]).toMatchObject({
      anchor: { x: 50, y: 0 },
      handleIn: { x: 0, y: 0 },
      handleOut: { x: 0, y: 0 },
      handleMode: 'none',
    })
  })

  it('uses smoothing to reduce more points without moving endpoints', () => {
    const points = Array.from({ length: 40 }, (_, index) => ({
      x: index * 3,
      y: Math.sin(index / 3) * 5,
    }))
    const low = simplifyFreehandPoints(points, 0.35)
    const high = simplifyFreehandPoints(points, 4.35)

    expect(high.length).toBeLessThan(low.length)
    expect(high[0]).toEqual(points[0])
    expect(high.at(-1)).toEqual(points.at(-1))
  })
})
