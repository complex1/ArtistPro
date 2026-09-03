import { describe, expect, it } from 'vitest'
import {
  composeTransform,
  defaultTransform,
  retargetPivot,
  rotationFromPoints,
  transformPoint,
} from './transform'

describe('composeTransform', () => {
  it('keeps the pivot fixed while rotating a node', () => {
    const transform = {
      ...defaultTransform(),
      position: { x: 20, y: 30 },
      pivot: { x: 50, y: 40 },
      rotation: 90,
    }

    expect(composeTransform(transform)).toBe(
      'translate(20 30) translate(50 40) rotate(90) scale(1 1) skewX(0) skewY(0) translate(-50 -40)',
    )
  })

  it('serializes scale and skew in a stable order', () => {
    const transform = {
      ...defaultTransform(),
      scale: { x: 2, y: 0.5 },
      skew: { x: 12, y: -4 },
    }

    expect(composeTransform(transform)).toContain(
      'scale(2 0.5) skewX(12) skewY(-4)',
    )
  })
})

describe('retargetPivot', () => {
  const transform = {
    pivot: { x: 55, y: 70 },
    position: { x: 310, y: 220 },
    rotation: 34,
    scale: { x: 1.4, y: 0.8 },
    skew: { x: 9, y: -6 },
    opacity: 1,
  }

  it('leaves rendered geometry in place when the pivot moves', () => {
    const moved = retargetPivot(transform, { x: 0, y: 0 })

    for (const point of [
      { x: 0, y: 0 },
      { x: 110, y: 140 },
      { x: -40, y: 25 },
    ]) {
      const before = transformPoint(transform, point)
      const after = transformPoint(moved, point)

      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.y).toBeCloseTo(before.y, 6)
    }
  })

  it('stores the requested pivot', () => {
    expect(retargetPivot(transform, { x: 12, y: 34 }).pivot).toEqual({
      x: 12,
      y: 34,
    })
  })
})

describe('bounding box transforms', () => {
  it('rotates around the pivot and snaps with Shift', () => {
    const transform = {
      ...defaultTransform(),
      pivot: { x: 50, y: 50 },
      position: { x: 10, y: 20 },
      rotation: 12,
    }
    const pivot = { x: 60, y: 70 }

    expect(
      rotationFromPoints(
        transform,
        { x: pivot.x + 40, y: pivot.y },
        { x: pivot.x, y: pivot.y + 40 },
      ),
    ).toBeCloseTo(102, 6)
    expect(
      rotationFromPoints(
        transform,
        { x: pivot.x + 40, y: pivot.y },
        { x: pivot.x + 5, y: pivot.y + 40 },
        true,
      ),
    ).toBe(90)
  })
})
