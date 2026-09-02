import { describe, expect, it } from 'vitest'
import { createEngine } from './engine'
import { stampStroke } from './celAdapter'
import { createBrush } from './presets'
import { emptyPoint } from './sampler'

describe('cel adapter', () => {
  it('stamps a stroke onto a cel-sized document', () => {
    const engine = createEngine({
      backend: 'cpu',
      document: { width: 24, height: 24, name: 'Cel' },
    })
    stampStroke(engine, createBrush({ size: 8, hardness: 1, spacing: 2 }), [
      emptyPoint(4, 12),
      emptyPoint(20, 12, 10),
    ])
    const pixels = engine.readLayerPixels()
    expect(pixels[(12 * 24 + 12) * 4 + 3]).toBeGreaterThan(0)
  })
})
