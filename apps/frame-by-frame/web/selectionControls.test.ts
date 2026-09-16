import { describe, expect, it } from 'vitest'
import { boundsCorners, quadBounds } from '../../drawing-canvas/web/engine/geometry'
import { dragSelection, hitSelectionHandle, rotationHandle } from './selectionControls'

describe('selection gestures', () => {
  const bounds = { x: 30, y: 80, width: 80, height: 50 }
  it('keeps rotation targets 30 screen pixels from the edge at any zoom', () => {
    for (const zoom of [.1, 1, 4]) {
      const point = rotationHandle(boundsCorners(bounds), zoom)
      expect((bounds.y - point.y) * zoom).toBeCloseTo(30)
      expect(hitSelectionHandle(bounds, point, zoom)?.id).toBe('rotate')
    }
  })
  it('rotates a selection about its center without translating it', () => {
    const quad = dragSelection(bounds, 'rotate', { x: 70, y: 50 }, { x: 125, y: 105 }, false, false)
    expect(quadBounds(quad)).toEqual({ x: 45, y: 65, width: 50, height: 80 })
  })
  it('snaps a rotation gesture to 15 degrees with Shift', () => {
    const start = { x: 70, y: 50 }, radians = -70 * Math.PI / 180
    const quad = dragSelection(bounds, 'rotate', start, { x: 70 + Math.cos(radians) * 55, y: 105 + Math.sin(radians) * 55 }, false, true)
    const edge = { x: quad[1].x - quad[0].x, y: quad[1].y - quad[0].y }
    expect(Math.atan2(edge.y, edge.x) * 180 / Math.PI).toBeCloseTo(15)
  })
  it('resizes from an edge while preserving the opposite edge', () => {
    expect(quadBounds(dragSelection(bounds, 'e', { x: 110, y: 105 }, { x: 150, y: 105 }, false, false))).toEqual({ x: 30, y: 80, width: 120, height: 50 })
    const locked = quadBounds(dragSelection(bounds, 'e', { x: 110, y: 105 }, { x: 150, y: 105 }, true, false))
    expect(locked.width / locked.height).toBeCloseTo(80 / 50)
  })
})
