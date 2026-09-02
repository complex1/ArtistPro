import { describe, expect, it } from 'vitest'
import {
  applyHandleDrag,
  hitHandle,
  lassoLength,
  opaqueBounds,
  selectionTint,
  transformedCorners,
} from './overlay'

describe('draw overlay helpers', () => {
  it('finds opaque pixel bounds', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4)
    pixels[(3 * 8 + 2) * 4 + 3] = 255
    pixels[(5 * 8 + 4) * 4 + 3] = 200
    expect(opaqueBounds(pixels, 8, 8)).toEqual({ x: 2, y: 3, width: 3, height: 3 })
    expect(opaqueBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull()
  })

  it('hits transform handles and the box body', () => {
    const corners = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 10, y: 40 },
    ]
    expect(hitHandle(10, 10, corners, 6)).toBe('nw')
    expect(hitHandle(40, 25, corners, 6)).toBe('e')
    expect(hitHandle(25, 25, corners, 6)).toBe('body')
    expect(hitHandle(80, 80, corners, 6)).toBeNull()
  })

  it('drags the body as a move and a corner as a scale', () => {
    const start = { scaleX: 1, scaleY: 1, rotation: 0, tx: 0, ty: 0 }
    const bounds = { x: 0, y: 0, width: 20, height: 20 }
    const moved = applyHandleDrag( 'body', start, bounds, { x: 0, y: 0 }, { x: 5, y: 3 }, false)
    expect(moved).toMatchObject({ tx: 5, ty: 3 })
    const scaled = applyHandleDrag('se', start, bounds, { x: 20, y: 20 }, { x: 30, y: 20 }, true)
    expect(scaled.scaleX).toBeGreaterThan(1)
    expect(scaled.scaleY).toBe(scaled.scaleX)
  })

  it('tints a mask and measures a lasso', () => {
    const mask = new Uint8ClampedArray(4 * 4)
    mask[3] = 255
    const tint = selectionTint(mask, 1, 1)
    expect(tint[0]).toBe(74)
    expect(tint[3]).toBeGreaterThan(0)
    expect(lassoLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5)
    expect(
      transformedCorners(
        { x: 0, y: 0, width: 10, height: 10 },
        { scaleX: 1, scaleY: 1, rotation: 0, tx: 4, ty: 0 },
      )[0],
    ).toMatchObject({ x: 4, y: 0 })
  })
})
