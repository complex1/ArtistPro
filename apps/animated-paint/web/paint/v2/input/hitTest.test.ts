import { describe, expect, it } from 'vitest'
import { createBrushV2, createLayerV2 } from '../core/defaults'
import type { StrokePointV2 } from '../core/types'
import { strokeAtPoint } from './hitTest'
import { snapshotStroke } from './sampler'

function point(x: number, y: number): StrokePointV2 {
  return { x, y, t: 0, pressure: 0.5, tiltX: 0, tiltY: 0, altitude: 1, velocity: 0 }
}

describe('strokeAtPoint', () => {
  const brush = createBrushV2({ size: 8 })
  const stroke = snapshotStroke(brush, [point(10, 10), point(90, 10)], 'layer')

  it('finds a stroke near the drawn path', () => {
    const layer = { ...createLayerV2('Layer'), strokes: [stroke] }
    expect(strokeAtPoint([layer], 50, 14)?.id).toBe(stroke.id)
  })

  it('returns null away from every stroke', () => {
    const layer = { ...createLayerV2('Layer'), strokes: [stroke] }
    expect(strokeAtPoint([layer], 50, 120)).toBeNull()
  })

  it('ignores hidden layers', () => {
    const layer = { ...createLayerV2('Layer'), strokes: [stroke], visible: false }
    expect(strokeAtPoint([layer], 50, 10)).toBeNull()
  })

  it('prefers the topmost layer', () => {
    const top = snapshotStroke(brush, [point(10, 10), point(90, 10)], 'top')
    const layers = [
      { ...createLayerV2('Bottom'), strokes: [stroke] },
      { ...createLayerV2('Top'), strokes: [top] },
    ]
    expect(strokeAtPoint(layers, 50, 10)?.id).toBe(top.id)
  })

  const square = [point(0, 0), point(200, 0), point(200, 200), point(0, 200)]
  const fillBrush = createBrushV2({ renderer: 'line', size: 4, fill: { enabled: true, outline: false } })

  it('selects a supported filled shape from its interior even with the outline hidden', () => {
    const filled = snapshotStroke(fillBrush, square, 'filled')
    const layer = { ...createLayerV2(), strokes: [filled] }
    expect(strokeAtPoint([layer], 100, 100)?.id).toBe(filled.id)
    expect(strokeAtPoint([layer], 250, 100)).toBeNull()
  })

  it('does not select the interior of a closed but unfilled path', () => {
    const closed = snapshotStroke({ ...fillBrush, fill: { enabled: false, outline: true } }, square, 'closed')
    const layer = { ...createLayerV2(), strokes: [closed] }
    expect(strokeAtPoint([layer], 100, 100)).toBeNull()
    expect(strokeAtPoint([layer], 0, 100)?.id).toBe(closed.id)
  })

  it('ignores fill and closure flags for unsupported brushes', () => {
    const unsupported = snapshotStroke({ ...fillBrush, renderer: 'particle' }, square, 'particle')
    const layer = { ...createLayerV2(), strokes: [unsupported] }
    expect(strokeAtPoint([layer], 100, 100)).toBeNull()
    expect(strokeAtPoint([layer], 0, 100)).toBeNull()
  })

  it('respects concave gaps instead of using a filled bounding box', () => {
    const concave = [point(0, 0), point(200, 0), point(200, 80), point(80, 80), point(80, 200), point(0, 200)]
    const filled = snapshotStroke(fillBrush, concave, 'concave')
    const layer = { ...createLayerV2(), strokes: [filled] }
    expect(strokeAtPoint([layer], 40, 140)?.id).toBe(filled.id)
    expect(strokeAtPoint([layer], 140, 140)).toBeNull()
  })
})
