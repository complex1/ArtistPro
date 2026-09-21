import { describe, expect, it } from 'vitest'
import { fitImageToCanvas, moveImageRect, resizeImageRect, type ImageResizeCorner } from './imageTransform'

describe('image layer placement', () => {
  it('fits and centers a wide image within 80% of the canvas', () => {
    expect(fitImageToCanvas(1600, 800, 1000, 600)).toEqual({ x: 100, y: 100, width: 800, height: 400 })
  })

  it('fits tall images by height and does not enlarge smaller images', () => {
    expect(fitImageToCanvas(1000, 2000, 1000, 500)).toEqual({ x: 400, y: 50, width: 200, height: 400 })
    expect(fitImageToCanvas(100, 80, 1000, 600)).toEqual({ x: 450, y: 260, width: 100, height: 80 })
  })

  it('translates screen movement into canvas coordinates without clamping off-canvas placement', () => {
    const original = { x: 10, y: 20, width: 200, height: 100 }
    expect(moveImageRect(original, -60, 40, 2)).toEqual({ ...original, x: -20, y: 40 })
    expect(moveImageRect(original, 10, -5, 0.5)).toEqual({ ...original, x: 30, y: 10 })
    expect(original.x).toBe(10)
  })

  it('bounds movement to the persisted image position limits', () => {
    const original = { x: 10, y: 20, width: 200, height: 100 }
    expect(moveImageRect(original, -300000, 300000, 0.5)).toEqual({ ...original, x: -100000, y: 100000 })
    expect(moveImageRect(original, 300000, -300000, 0.5)).toEqual({ ...original, x: 100000, y: -100000 })
  })
})

describe('image corner resizing', () => {
  const rect = { x: 30, y: 40, width: 200, height: 100 }
  const corners: ImageResizeCorner[] = ['nw', 'ne', 'sw', 'se']

  for (const corner of corners) {
    it(`keeps the opposite anchor and aspect ratio when enlarging from ${corner}`, () => {
      const dx = corner.endsWith('e') ? 200 : -200
      const dy = corner.startsWith('s') ? 100 : -100
      const next = resizeImageRect(rect, corner, dx, dy, 2)
      expect(next.width).toBeCloseTo(300)
      expect(next.height).toBeCloseTo(150)
      expect(next.width / next.height).toBeCloseTo(2)
      expect(corner.endsWith('e') ? next.x : next.x + next.width).toBeCloseTo(
        corner.endsWith('e') ? rect.x : rect.x + rect.width,
      )
      expect(corner.startsWith('s') ? next.y : next.y + next.height).toBeCloseTo(
        corner.startsWith('s') ? rect.y : rect.y + rect.height,
      )
    })

    it(`stops at the minimum size instead of flipping when ${corner} crosses its anchor`, () => {
      const dx = corner.endsWith('e') ? -1000 : 1000
      const dy = corner.startsWith('s') ? -1000 : 1000
      const next = resizeImageRect(rect, corner, dx, dy, 1)
      expect(next.width).toBeCloseTo(16)
      expect(next.height).toBeCloseTo(8)
      expect(corner.endsWith('e') ? next.x : next.x + next.width).toBeCloseTo(
        corner.endsWith('e') ? rect.x : rect.x + rect.width,
      )
      expect(corner.startsWith('s') ? next.y : next.y + next.height).toBeCloseTo(
        corner.startsWith('s') ? rect.y : rect.y + rect.height,
      )
    })
  }

  it('ignores pointer motion perpendicular to the resize diagonal', () => {
    expect(resizeImageRect(rect, 'se', -20, 40, 1)).toEqual(rect)
  })

  it('keeps a portrait image at least eight pixels wide', () => {
    const next = resizeImageRect({ x: 0, y: 0, width: 100, height: 300 }, 'se', -1000, -1000, 1)
    expect(next.width).toBeCloseTo(8)
    expect(next.height).toBeCloseTo(24)
  })

  it('caps both dimensions using one shared scale', () => {
    const next = resizeImageRect({ x: 20, y: 30, width: 40, height: 400 }, 'se', 1000000, 1000000, 1)
    expect(next).toEqual({ x: 20, y: 30, width: 3276.8, height: 32768 })
    expect(next.width / next.height).toBeCloseTo(0.1)
  })

  it('prioritizes maximum dimensions and aspect ratio for extremely thin imported images', () => {
    const next = resizeImageRect({ x: 20, y: 30, width: 0.01, height: 100 }, 'se', -10000, -10000, 1)
    expect(next.width).toBeCloseTo(3.2768)
    expect(next.height).toBe(32768)
    expect(next.width / next.height).toBeCloseTo(0.0001)
  })

  it('limits a west/north enlargement before its moving corner crosses the minimum position', () => {
    const original = { x: -99900, y: -99900, width: 200, height: 100 }
    const next = resizeImageRect(original, 'nw', -10000, -10000, 1)
    expect(next).toEqual({ x: -100000, y: -99950, width: 300, height: 150 })
    expect(next.x + next.width).toBe(original.x + original.width)
    expect(next.y + next.height).toBe(original.y + original.height)
  })

  it('limits a west/north shrink before its moving corner crosses the maximum position', () => {
    const original = { x: 99900, y: 99900, width: 200, height: 100 }
    const next = resizeImageRect(original, 'nw', 10000, 10000, 1)
    expect(next).toEqual({ x: 100000, y: 99950, width: 100, height: 50 })
    expect(next.x + next.width).toBe(original.x + original.width)
    expect(next.y + next.height).toBe(original.y + original.height)
  })
})
