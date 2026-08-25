import { describe, expect, it } from 'vitest'
import {
  canDeletePathPoint,
  createPath,
  createPathPoint,
  moveHandle,
  pathData,
  samplePathAt,
  setHandleMode,
} from './path'
import { resizeNode } from './scene'

describe('pathData', () => {
  it('writes straight and curved segments', () => {
    const first = createPathPoint({ x: 0, y: 0 })
    first.handleOut = { x: 20, y: 0 }
    const second = createPathPoint({ x: 80, y: 40 })
    second.handleIn = { x: -10, y: 0 }
    const third = createPathPoint({ x: 120, y: 40 })

    expect(pathData({ points: [first, second, third], closed: false })).toBe(
      'M 0 0 C 20 0 70 40 80 40 L 120 40',
    )
  })

  it('closes a path back to its first point', () => {
    const points = [
      createPathPoint({ x: 0, y: 0 }),
      createPathPoint({ x: 30, y: 0 }),
      createPathPoint({ x: 30, y: 30 }),
    ]

    expect(pathData({ points, closed: true })).toBe(
      'M 0 0 L 30 0 L 30 30 L 0 0 Z',
    )
  })
})

describe('path point handle modes', () => {
  it('keeps symmetric handles opposite and equal', () => {
    const point = setHandleMode(
      {
        ...createPathPoint({ x: 0, y: 0 }),
        handleIn: { x: -10, y: 0 },
        handleOut: { x: 20, y: 0 },
      },
      'symmetric',
    )
    const moved = moveHandle(point, 'out', { x: 12, y: 16 })

    expect(moved.handleIn).toEqual({ x: -12, y: -16 })
  })

  it('keeps asymmetric handles collinear with independent lengths', () => {
    const point = {
      ...createPathPoint({ x: 0, y: 0 }),
      handleMode: 'asymmetric' as const,
      handleIn: { x: -10, y: 0 },
      handleOut: { x: 20, y: 0 },
    }
    const moved = moveHandle(point, 'out', { x: 0, y: 20 })

    expect(moved.handleIn.x).toBeCloseTo(0)
    expect(moved.handleIn.y).toBeCloseTo(-10)
  })

  it('moves disconnected handles independently', () => {
    const point = {
      ...createPathPoint({ x: 0, y: 0 }),
      handleMode: 'disconnected' as const,
      handleIn: { x: -10, y: 0 },
    }
    const moved = moveHandle(point, 'out', { x: 0, y: 20 })

    expect(moved.handleIn).toEqual(point.handleIn)
  })

  it('removes both handles for no curve', () => {
    const point = createPathPoint({ x: 0, y: 0 }, { x: 20, y: 10 })

    expect(setHandleMode(point, 'none')).toMatchObject({
      handleMode: 'none',
      handleIn: { x: 0, y: 0 },
      handleOut: { x: 0, y: 0 },
    })
  })
})

describe('path point deletion', () => {
  it('protects the minimum number of open and closed points', () => {
    const open = createPath({ x: 0, y: 0 })
    open.points.push(createPathPoint({ x: 20, y: 0 }))
    expect(canDeletePathPoint(open)).toBe(false)
    open.points.push(createPathPoint({ x: 40, y: 0 }))
    expect(canDeletePathPoint(open)).toBe(true)

    open.closed = true
    expect(canDeletePathPoint(open)).toBe(false)
    open.points.push(createPathPoint({ x: 40, y: 40 }))
    expect(canDeletePathPoint(open)).toBe(true)
  })
})

describe('path geometry resize', () => {
  it('stretches anchors and handles without scaling the stroke', () => {
    const path = createPath({ x: 10, y: 20 })
    path.points.push(
      createPathPoint({ x: 40, y: 60 }, { x: 10, y: -20 }),
    )
    const resized = resizeNode(
      path,
      { x: 2, y: 0.5 },
      { x: 0, y: 0 },
    )

    expect(resized.type).toBe('path')
    if (resized.type !== 'path') return
    expect(resized.points[1].anchor).toEqual({ x: 80, y: 30 })
    expect(resized.points[1].handleOut).toEqual({ x: 20, y: -10 })
    expect(resized.transform.scale).toEqual({ x: 1, y: 1 })
    expect(resized.strokeWidth).toBe(path.strokeWidth)
  })
})

describe('samplePathAt', () => {
  it('samples straight segments by total arc length', () => {
    const points = [
      createPathPoint({ x: 0, y: 0 }),
      createPathPoint({ x: 100, y: 0 }),
      createPathPoint({ x: 100, y: 300 }),
    ]

    expect(samplePathAt({ points, closed: false }, 0.5)).toMatchObject({
      point: { x: 100, y: 100 },
      tangent: { x: 0, y: 1 },
    })
  })

  it('returns a normalized tangent along a curve', () => {
    const first = createPathPoint({ x: 0, y: 0 })
    first.handleOut = { x: 0, y: 100 }
    const second = createPathPoint({ x: 100, y: 100 })
    second.handleIn = { x: 0, y: -100 }

    const sample = samplePathAt({ points: [first, second], closed: false }, 0.5)

    expect(sample?.point.x).toBeCloseTo(50, 1)
    expect(sample?.point.y).toBeCloseTo(50, 1)
    expect(Math.hypot(sample?.tangent.x ?? 0, sample?.tangent.y ?? 0)).toBeCloseTo(1)
  })

  it('returns to the first point at the end of a closed path', () => {
    const points = [
      createPathPoint({ x: 0, y: 0 }),
      createPathPoint({ x: 100, y: 0 }),
      createPathPoint({ x: 100, y: 100 }),
    ]

    expect(samplePathAt({ points, closed: true }, 1)?.point).toEqual({ x: 0, y: 0 })
  })
})
