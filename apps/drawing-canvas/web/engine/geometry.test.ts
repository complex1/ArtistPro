import { describe, expect, it } from 'vitest'
import { boundsCorners, containsPoint, homographyForQuad, invertHomography, isValidQuad, normalizeBounds, projectPoint, projectSelection, quadBounds, selectionBounds, transformPoint, transformSelection } from './geometry'
import type { Quad, Selection } from './types'

describe('selection geometry', () => {
  it('normalizes a rectangle dragged from bottom right to top left', () => {
    expect(normalizeBounds({ x: 90, y: 80, width: -60, height: -20 })).toEqual({ x: 30, y: 60, width: 60, height: 20 })
    expect(containsPoint({ kind: 'rectangle', bounds: { x: 90, y: 80, width: -60, height: -20 } }, 30, 60)).toBe(true)
    expect(containsPoint({ kind: 'rectangle', bounds: { x: 90, y: 80, width: -60, height: -20 } }, 90, 80)).toBe(false)
  })

  it('tests ellipse edges without accepting its bounding box corners', () => {
    const ellipse: Selection = { kind: 'ellipse', bounds: { x: 10, y: 20, width: 80, height: 40 } }
    expect(containsPoint(ellipse, 50, 40)).toBe(true)
    expect(containsPoint(ellipse, 90, 40)).toBe(true)
    expect(containsPoint(ellipse, 11, 21)).toBe(false)
    expect(containsPoint({ kind: 'ellipse', bounds: { x: 0, y: 0, width: 0, height: 20 } }, 0, 10)).toBe(false)
  })

  it('handles concave lasso regions with the even-odd rule', () => {
    const lasso: Selection = { kind: 'lasso', points: [[0, 0], [8, 0], [8, 3], [3, 3], [3, 8], [0, 8]].map(([x, y]) => ({ x, y, pressure: 1 })) }
    expect(containsPoint(lasso, 1, 6)).toBe(true)
    expect(containsPoint(lasso, 6, 1)).toBe(true)
    expect(containsPoint(lasso, 6, 6)).toBe(false)
    expect(selectionBounds(lasso)).toEqual({ x: 0, y: 0, width: 8, height: 8 })
  })

  it('scales then rotates around the selection center before translation', () => {
    const point = transformPoint({ x: 12, y: 20, pressure: .7 }, { x: 0, y: 0, width: 20, height: 40 }, { x: 5, y: -3, scaleX: 2, scaleY: 3, rotation: 90 })
    expect(point.x).toBeCloseTo(15)
    expect(point.y).toBeCloseTo(21)
    expect(point.pressure).toBe(.7)
  })

  it('transforms a rectangle into the actual rotated region', () => {
    const result = transformSelection({ kind: 'rectangle', bounds: { x: 0, y: 0, width: 20, height: 10 } }, { x: 30, y: 0, scaleX: 1, scaleY: 1, rotation: 90 })
    expect(result.kind).toBe('lasso')
    expect(selectionBounds(result).x).toBeCloseTo(35)
    expect(selectionBounds(result).y).toBeCloseTo(-5)
    expect(selectionBounds(result).width).toBeCloseTo(10)
    expect(selectionBounds(result).height).toBeCloseTo(20)
    expect(containsPoint(result, 40, 5)).toBe(true)
    expect(containsPoint(result, 10, 5)).toBe(false)
  })

  it('retains elliptical selection shape after a flip and rotation', () => {
    const result = transformSelection({ kind: 'ellipse', bounds: { x: 0, y: 0, width: 40, height: 20 } }, { x: 0, y: 0, scaleX: -1, scaleY: 1, rotation: 90 })
    expect(containsPoint(result, 20, 10)).toBe(true)
    expect(containsPoint(result, 20, -8)).toBe(true)
    expect(containsPoint(result, 11, -8)).toBe(false)
  })
})

describe('projective transform geometry', () => {
  const bounds = { x: 20, y: 30, width: 80, height: 60 }
  const target: Quad = [{ x: 40, y: 10 }, { x: 80, y: 10 }, { x: 100, y: 90 }, { x: 20, y: 90 }]

  it('normalizes bounds into consistently ordered corners', () => {
    expect(boundsCorners({ x: 100, y: 90, width: -80, height: -60 })).toEqual([
      { x: 20, y: 30 }, { x: 100, y: 30 }, { x: 100, y: 90 }, { x: 20, y: 90 },
    ])
    expect(quadBounds(target)).toEqual({ x: 20, y: 10, width: 80, height: 80 })
  })

  it('maps all four source corners to the requested perspective corners and back', () => {
    const matrix = homographyForQuad(bounds, target)!
    const inverse = invertHomography(matrix)!
    boundsCorners(bounds).forEach((point, index) => {
      const mapped = projectPoint(matrix, point), recovered = projectPoint(inverse, mapped)
      expect(mapped.x).toBeCloseTo(target[index].x, 10)
      expect(mapped.y).toBeCloseTo(target[index].y, 10)
      expect(recovered.x).toBeCloseTo(point.x, 10)
      expect(recovered.y).toBeCloseTo(point.y, 10)
    })
  })

  it('uses perspective foreshortening inside the quad instead of bilinear corner interpolation', () => {
    const matrix = homographyForQuad(bounds, target)!
    const center = projectPoint(matrix, { x: 60, y: 60 })
    expect(center.x).toBeCloseTo(60)
    expect(center.y).toBeCloseTo(36.6666666667)
    expect(center.y).not.toBeCloseTo(50)
    // A straight diagonal stays straight under a projective map.
    const diagonal = projectPoint(matrix, { x: 40, y: 45 })
    expect((diagonal.x - target[0].x) / (target[2].x - target[0].x)).toBeCloseTo((diagonal.y - target[0].y) / (target[2].y - target[0].y))
  })

  it('supports independent scaling, shear, and reflected convex corners', () => {
    const skew: Quad = [{ x: 10, y: 5 }, { x: 170, y: 5 }, { x: 200, y: 35 }, { x: 40, y: 35 }]
    expect(projectPoint(homographyForQuad(bounds, skew)!, { x: 60, y: 60 })).toEqual({ x: 105, y: 20 })
    const flipped: Quad = [skew[1], skew[0], skew[3], skew[2]]
    expect(isValidQuad(flipped)).toBe(true)
    expect(projectPoint(homographyForQuad(bounds, flipped)!, { x: 20, y: 30 })).toEqual(skew[1])
  })

  it('keeps selected ellipse and lasso geometry under the same projective mapping', () => {
    const matrix = homographyForQuad(bounds, target)!
    const ellipse = projectSelection({ kind: 'ellipse', bounds }, matrix)
    const center = projectPoint(matrix, { x: 60, y: 60 })
    expect(containsPoint(ellipse, center.x, center.y)).toBe(true)
    expect(containsPoint(ellipse, 40, 11)).toBe(false)
    const lasso = projectSelection({ kind: 'lasso', points: [{ x: 20, y: 30, pressure: .3 }, { x: 100, y: 30, pressure: .5 }, { x: 60, y: 90, pressure: .8 }] }, matrix)
    expect(lasso.kind === 'lasso' && lasso.points[0]).toEqual({ x: 40, y: 10, pressure: .3 })
  })

  it.each([
    ['crossed', [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]],
    ['concave', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 10 }]],
    ['collapsed', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }]],
    ['collinear corner', [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]],
    ['NaN', [{ x: NaN, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]],
    ['infinite', [{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]],
    ['near horizon', [{ x: 0, y: 0 }, { x: 1e-10, y: 0 }, { x: 100, y: 100 }, { x: -100, y: 100 }]],
  ] as [string, Quad][])('rejects %s targets', (_, quad) => {
    expect(isValidQuad(quad)).toBe(false)
    expect(homographyForQuad(bounds, quad)).toBeNull()
  })

  it('rejects degenerate source rectangles and singular matrices', () => {
    expect(homographyForQuad({ ...bounds, width: 0 }, target)).toBeNull()
    expect(homographyForQuad({ ...bounds, x: NaN }, target)).toBeNull()
    expect(invertHomography([1, 0, 0, 0, 0, 0, 0, 0, 1])).toBeNull()
  })
})
