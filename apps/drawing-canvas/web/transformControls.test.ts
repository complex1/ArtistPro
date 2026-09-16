import { describe, expect, it } from 'vitest'
import type { Bounds, Quad } from './engine/types'
import { dragTransform, flipTransform, hitTransformHandle, insideTransformQuad, numericTransform, transformHandles, type TransformHandle, type TransformMode } from './transformControls'

const bounds: Bounds = { x: 10, y: 20, width: 100, height: 50 }
const original: Quad = [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 70 }]
const start = { x: 40, y: 50 }
const rectangle = (left: number, top: number, right: number, bottom: number): Quad => [
  { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom },
]
function expectQuadClose(actual: Quad, expected: Quad) {
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x, 9)
    expect(point.y).toBeCloseTo(expected[index].y, 9)
  })
}

describe('transform resize handles', () => {
  it.each<{ handle: TransformHandle; result: Quad }>([
    { handle: 'nw', result: rectangle(30, 30, 110, 70) },
    { handle: 'n', result: rectangle(10, 30, 110, 70) },
    { handle: 'ne', result: rectangle(10, 30, 130, 70) },
    { handle: 'e', result: rectangle(10, 20, 130, 70) },
    { handle: 'se', result: rectangle(10, 20, 130, 80) },
    { handle: 's', result: rectangle(10, 20, 110, 80) },
    { handle: 'sw', result: rectangle(30, 20, 110, 80) },
    { handle: 'w', result: rectangle(30, 20, 110, 70) },
  ])('$handle changes its sides and anchors the opposite sides', ({ handle, result }) => {
    expect(dragTransform(bounds, 'resize', handle, start, { x: 60, y: 60 })).toEqual(result)
    expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it.each<{ handle: TransformHandle; dx: number; dy: number; result: Quad }>([
    { handle: 'nw', dx: 1000, dy: 1000, result: rectangle(109, 69, 110, 70) },
    { handle: 'n', dx: 1000, dy: 1000, result: rectangle(10, 69, 110, 70) },
    { handle: 'ne', dx: -1000, dy: 1000, result: rectangle(10, 69, 11, 70) },
    { handle: 'e', dx: -1000, dy: 1000, result: rectangle(10, 20, 11, 70) },
    { handle: 'se', dx: -1000, dy: -1000, result: rectangle(10, 20, 11, 21) },
    { handle: 's', dx: 1000, dy: -1000, result: rectangle(10, 20, 110, 21) },
    { handle: 'sw', dx: 1000, dy: -1000, result: rectangle(109, 20, 110, 21) },
    { handle: 'w', dx: 1000, dy: -1000, result: rectangle(109, 20, 110, 70) },
  ])('$handle stops at one pixel instead of inverting the box', ({ handle, dx, dy, result }) => {
    expect(dragTransform(bounds, 'resize', handle, start, { x: start.x + dx, y: start.y + dy })).toEqual(result)
  })

  it.each<{ handle: TransformHandle; dx: number; dy: number; result: Quad }>([
    { handle: 'nw', dx: -50, dy: 5, result: rectangle(-40, -5, 110, 70) },
    { handle: 'ne', dx: 100, dy: -10, result: rectangle(10, -30, 210, 70) },
    { handle: 'se', dx: 100, dy: 10, result: rectangle(10, 20, 210, 120) },
    { handle: 'sw', dx: -50, dy: 5, result: rectangle(-40, 20, 110, 95) },
  ])('$handle locks aspect ratio around its opposite corner', ({ handle, dx, dy, result }) => {
    expectQuadClose(dragTransform(bounds, 'resize', handle, start, { x: start.x + dx, y: start.y + dy }, true), result)
  })

  it.each<{ handle: TransformHandle; dx: number; dy: number; result: Quad }>([
    { handle: 'n', dx: 99, dy: -50, result: rectangle(-40, -30, 160, 70) },
    { handle: 'e', dx: 100, dy: 99, result: rectangle(10, -5, 210, 95) },
    { handle: 's', dx: 99, dy: 50, result: rectangle(-40, 20, 160, 120) },
    { handle: 'w', dx: -100, dy: 99, result: rectangle(-90, -5, 110, 95) },
  ])('$handle locks aspect ratio around the opposite edge midpoint', ({ handle, dx, dy, result }) => {
    expectQuadClose(dragTransform(bounds, 'resize', handle, start, { x: start.x + dx, y: start.y + dy }, true), result)
  })

  it('uses the dominant vertical drag when keeping a corner aspect ratio', () => {
    expect(dragTransform(bounds, 'resize', 'se', start, { x: 45, y: 100 }, true)).toEqual(rectangle(10, 20, 210, 120))
  })

  it('preserves the ratio and a one-pixel minimum when an aspect-locked corner crosses its anchor', () => {
    expect(dragTransform(bounds, 'resize', 'nw', start, { x: 1040, y: 1050 }, true)).toEqual(rectangle(108, 69, 110, 70))
  })

  it('constrains the narrow dimension when an aspect-locked portrait box shrinks', () => {
    const portrait = { x: 10, y: 20, width: 50, height: 100 }
    expect(dragTransform(portrait, 'resize', 'se', start, { x: -960, y: -950 }, true)).toEqual(rectangle(10, 20, 11, 22))
  })
})

describe('skew, perspective, and translation gestures', () => {
  it.each<{ handle: TransformHandle; result: Quad }>([
    { handle: 'n', result: [{ x: 30, y: 20 }, { x: 130, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 70 }] },
    { handle: 'e', result: [{ x: 10, y: 20 }, { x: 110, y: 30 }, { x: 110, y: 80 }, { x: 10, y: 70 }] },
    { handle: 's', result: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 130, y: 70 }, { x: 30, y: 70 }] },
    { handle: 'w', result: [{ x: 10, y: 30 }, { x: 110, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 80 }] },
  ])('skewing $handle moves its corner pair along the edge and preserves the opposite edge', ({ handle, result }) => {
    expect(dragTransform(bounds, 'skew', handle, start, { x: 60, y: 60 })).toEqual(result)
  })

  it.each<{ handle: TransformHandle; index: number }>([
    { handle: 'nw', index: 0 }, { handle: 'ne', index: 1 }, { handle: 'se', index: 2 }, { handle: 'sw', index: 3 },
  ])('perspective $handle moves only its own corner', ({ handle, index }) => {
    const transformed = dragTransform(bounds, 'perspective', handle, start, { x: 55, y: 43 })
    transformed.forEach((point, current) => {
      expect(point).toEqual(current === index ? { x: original[current].x + 15, y: original[current].y - 7 } : original[current])
    })
  })

  it.each<TransformMode>(['resize', 'skew', 'perspective'])('moves all corners together in %s mode', (mode) => {
    expect(dragTransform(bounds, mode, 'move', start, { x: 10, y: 75 }, true)).toEqual(rectangle(-20, 45, 80, 95))
  })
})

describe('transform handle locations and hit targets', () => {
  it('exposes eight resize handles, four skew edges, and four perspective corners', () => {
    expect(transformHandles(original, 'resize').map(handle => handle.id)).toEqual(['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'])
    expect(transformHandles(original, 'skew').map(handle => ({ id: handle.id, position: handle.position }))).toEqual([
      { id: 'n', position: { x: 60, y: 20 } }, { id: 'e', position: { x: 110, y: 45 } },
      { id: 's', position: { x: 60, y: 70 } }, { id: 'w', position: { x: 10, y: 45 } },
    ])
    expect(transformHandles(original, 'perspective').map(handle => handle.id)).toEqual(['nw', 'ne', 'se', 'sw'])
  })

  it('places handles on the transformed quad instead of its bounding rectangle', () => {
    const quad: Quad = [{ x: 30, y: 5 }, { x: 120, y: 15 }, { x: 100, y: 80 }, { x: 0, y: 70 }]
    expect(transformHandles(quad, 'skew').map(handle => handle.position)).toEqual([
      { x: 75, y: 10 }, { x: 110, y: 47.5 }, { x: 50, y: 75 }, { x: 15, y: 37.5 },
    ])
  })

  it.each([0.25, 1, 4])('keeps a 12-screen-pixel hit radius at zoom %s', (zoom) => {
    const large = rectangle(0, 0, 1000, 600)
    expect(hitTransformHandle(large, 'perspective', { x: -11 / zoom, y: 0 }, zoom)?.id).toBe('nw')
    expect(hitTransformHandle(large, 'perspective', { x: -13 / zoom, y: 0 }, zoom)).toBeNull()
    expect(hitTransformHandle(large, 'perspective', { x: -9 / zoom, y: -9 / zoom }, zoom)).toBeNull()
  })

  it('picks the closest overlapping handle and excludes handles from other modes', () => {
    const small = rectangle(0, 0, 20, 20)
    expect(hitTransformHandle(small, 'resize', { x: 9, y: 0 }, 1)?.id).toBe('n')
    expect(hitTransformHandle(original, 'perspective', { x: 60, y: 20 }, 1)).toBeNull()
    expect(hitTransformHandle(original, 'skew', { x: 10, y: 20 }, 1)).toBeNull()
  })
})

describe('numeric transform composition', () => {
  it('scales width and height independently around the original center', () => {
    expect(numericTransform(bounds, 200, 50, 0, 0, 0)).toEqual(rectangle(-40, 32.5, 160, 57.5))
    expect(numericTransform(bounds, 100, 100, 0, 0, 0)).toEqual(original)
  })

  it('rotates clockwise by 90 degrees in canvas coordinates around the center', () => {
    expectQuadClose(numericTransform(bounds, 100, 100, 90, 0, 0), [
      { x: 85, y: -5 }, { x: 85, y: 95 }, { x: 35, y: 95 }, { x: 35, y: -5 },
    ])
  })

  it('applies horizontal and vertical skew independently', () => {
    expectQuadClose(numericTransform(bounds, 100, 100, 0, 45, 0), [
      { x: -15, y: 20 }, { x: 85, y: 20 }, { x: 135, y: 70 }, { x: 35, y: 70 },
    ])
    expectQuadClose(numericTransform(bounds, 100, 100, 0, 0, 45), [
      { x: 10, y: -30 }, { x: 110, y: 70 }, { x: 110, y: 120 }, { x: 10, y: 20 },
    ])
  })

  it('composes scale, skew, then rotation without shifting the center', () => {
    const transformed = numericTransform(bounds, 200, 50, 90, 45, 0)
    expectQuadClose(transformed, [
      { x: 72.5, y: -67.5 }, { x: 72.5, y: 132.5 }, { x: 47.5, y: 157.5 }, { x: 47.5, y: -42.5 },
    ])
    expect(transformed.reduce((sum, point) => sum + point.x, 0) / 4).toBeCloseTo(60)
    expect(transformed.reduce((sum, point) => sum + point.y, 0) / 4).toBeCloseTo(45)
  })
})

describe('convex transform containment', () => {
  const diamond: Quad = [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }]

  it('includes the interior, edges, and corners of a convex transformed quad', () => {
    expect(insideTransformQuad(diamond, { x: 50, y: 50 })).toBe(true)
    expect(insideTransformQuad(diamond, { x: 75, y: 25 })).toBe(true)
    expect(insideTransformQuad(diamond, { x: 50, y: 0 })).toBe(true)
  })

  it('excludes points outside the quad even when they are inside its axis-aligned bounds', () => {
    expect(insideTransformQuad(diamond, { x: 10, y: 10 })).toBe(false)
    expect(insideTransformQuad(diamond, { x: 75, y: 24 })).toBe(false)
    expect(insideTransformQuad(diamond, { x: 150, y: 50 })).toBe(false)
  })

  it('accepts either winding direction, including a horizontally flipped quad', () => {
    const reversed: Quad = [diamond[3], diamond[2], diamond[1], diamond[0]]
    expect(insideTransformQuad(reversed, { x: 50, y: 50 })).toBe(true)
    expect(insideTransformQuad(reversed, { x: 10, y: 10 })).toBe(false)
    expect(insideTransformQuad(numericTransform(bounds, -100, 100, 0, 0, 0), { x: 60, y: 45 })).toBe(true)
  })
})


describe('unchanged gestures and content-centered flips', () => {
  it.each<TransformHandle>(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])('clicking %s keeps a subpixel selection unchanged with or without aspect lock', handle => {
    const tiny = { x: 15, y: 25, width: 0.4, height: 0.2 }
    const expected = rectangle(15, 25, 15.4, 25.2)
    expect(dragTransform(tiny, 'resize', handle, start, start)).toEqual(expected)
    expect(dragTransform(tiny, 'resize', handle, start, start, true)).toEqual(expected)
  })

  it('flips an off-center content box horizontally without moving its bounds', () => {
    const flipped = flipTransform(bounds, 'horizontal')
    expect(flipped).toEqual([original[1], original[0], original[3], original[2]])
    expect(flipped.reduce((sum, point) => sum + point.x, 0) / 4).toBe(60)
    expect(flipped.reduce((sum, point) => sum + point.y, 0) / 4).toBe(45)
  })

  it('flips an off-center content box vertically without moving its bounds', () => {
    const flipped = flipTransform(bounds, 'vertical')
    expect(flipped).toEqual([original[3], original[2], original[1], original[0]])
    expect(flipped.reduce((sum, point) => sum + point.x, 0) / 4).toBe(60)
    expect(flipped.reduce((sum, point) => sum + point.y, 0) / 4).toBe(45)
  })
})
