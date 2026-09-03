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
})
