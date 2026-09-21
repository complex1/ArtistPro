import { describe, expect, it } from 'vitest'
import { ANIME_BRUSHES } from './animePresets'
import { emptyPoint } from './core/defaults'
import { snapshotStroke } from './input/sampler'
import { BUILTIN_BRUSHES, getBuiltinBrush } from './presets'
import { strokeFrame } from './render/engine'
import { strokeTiming } from './render/timing'

describe.each(ANIME_BRUSHES)('$name engine integration', brush => {
  it('is selectable and matches its cached pose at different speeds', () => {
    expect(BUILTIN_BRUSHES.filter(item => item.id === brush.id)).toHaveLength(1)
    expect(getBuiltinBrush(brush.id)).toBe(brush)
    const points = Array.from({ length: 60 }, (_, i) => emptyPoint(50 + i * 4, 100 + Math.sin(i * 0.1) * 30))
    const timing = brush.animationTiming
    const fps = timing?.mode === 'stepped' ? timing.fps : 0
    expect(fps).toBeGreaterThan(0)
    for (const speed of [0.5, 1, 2]) {
      const stroke = snapshotStroke({ ...brush, speed }, points, 'anime-test', 7)
      const early = 1000 / fps / speed * 0.1, late = 1000 / fps / speed * 0.9
      expect(strokeTiming(stroke, early, early).key).toBe(strokeTiming(stroke, late, late).key)
      const a = strokeFrame(stroke, early), b = strokeFrame(stroke, late)
      expect(a.diagnostics.filter(diagnostic => diagnostic.code === 'animate-error')).toEqual([])
      expect(a.items).toEqual(b.items)
      expect(a.items).not.toEqual(strokeFrame(stroke, 1000 / fps / speed * 2.1).items)
    }
  })
})
