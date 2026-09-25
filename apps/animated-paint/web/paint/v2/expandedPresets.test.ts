import { describe, expect, it } from 'vitest'
import { createDocumentV2 } from './core/defaults'
import { getBrushFillKind } from './core/fill'
import { parseDocument } from './core/schema'
import { snapshotStroke } from './input/sampler'
import { BUILTIN_BRUSHES } from './presets'
import { SceneDiffer, applyScenePatch } from './render/protocol'
import { strokeFrame } from './render/engine'
import { brushPreviewPoints } from './ui/brushPreviewPath'

const expected = {
  scribble: 'Motion', gooBlobs: 'Funky', particle: 'Particles', glitter: 'Particles', cascade: 'FX',
  charcoal: 'Texture', faded: 'Texture', dashed: 'Motion', pencil: 'Texture',
  zipperInk: 'Funky', livingStitch: 'Texture', fireflyTrail: 'Particles', pixelMelt: 'FX',
  rainStreaks: 'Particles', softSmoke: 'Particles',
  chromaticEcho: 'FX', iridescentRibbon: 'FX',
  centerBloom: 'Reveal', dustReveal: 'Reveal',
  scatteredPencil: 'Texture', speedTaper: 'Texture',
}

describe('expanded brush integration', () => {
  it('registers each new brush once under its intended category', () => {
    for (const [id, category] of Object.entries(expected)) {
      const matches = BUILTIN_BRUSHES.filter((brush) => brush.id === id)
      expect(matches).toHaveLength(1)
      expect(matches[0].category).toBe(category)
      expect(getBrushFillKind(matches[0])).toBeNull()
    }
    expect(new Set(BUILTIN_BRUSHES.map((brush) => brush.id)).size).toBe(BUILTIN_BRUSHES.length)
  })

  it('preserves a mixed scene through document save and worker transport', () => {
    const document = createDocumentV2('Expanded brushes', 640, 400)
    document.layers[0].strokes = BUILTIN_BRUSHES.filter((brush) => brush.id in expected)
      .map((brush, index) => snapshotStroke(brush, brushPreviewPoints(brush, 640, 400), document.layers[0].id, index + 7))
    const saved = parseDocument(JSON.parse(JSON.stringify(document)))!
    const restored = applyScenePatch(new SceneDiffer().diff(saved), new Map())
    expect(restored.layers[0].strokes).toHaveLength(Object.keys(expected).length)
    for (let i = 0; i < Object.keys(expected).length; i++) {
      const original = document.layers[0].strokes[i]
      const loaded = restored.layers[0].strokes[i]
      for (const time of [750, 4000, 250]) {
        const frame = strokeFrame(loaded, time)
        expect(frame.diagnostics).toEqual([])
        expect(frame.items).toEqual(strokeFrame(original, time).items)
      }
    }
  })

  it('leaves room for weather previews and demonstrates pressure and velocity', () => {
    const rain = BUILTIN_BRUSHES.find((brush) => brush.id === 'rainStreaks')!
    const smoke = BUILTIN_BRUSHES.find((brush) => brush.id === 'softSmoke')!
    const taper = BUILTIN_BRUSHES.find((brush) => brush.id === 'speedTaper')!
    const points = brushPreviewPoints(taper, 240, 128)
    expect(Math.max(...points.map((point) => point.velocity)) - Math.min(...points.map((point) => point.velocity))).toBeGreaterThan(400)
    expect(Math.max(...points.map((point) => point.pressure))).toBeGreaterThan(0.9)
    expect(Math.max(...brushPreviewPoints(rain, 240, 128).map((point) => point.y))).toBeLessThan(25)
    expect(Math.min(...brushPreviewPoints({ ...smoke, id: 'custom-copy' }, 240, 128).map((point) => point.y))).toBeGreaterThan(90)
  })
})
