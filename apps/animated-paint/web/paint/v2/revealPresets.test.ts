import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { animationSourceHash } from './core/animationTiming'
import { emptyPoint } from './core/defaults'
import type { BrushV2, StrokePointV2 } from './core/types'
import { DEFAULT_BUDGETS } from './core/types'
import { snapshotStroke } from './input/sampler'
import { REVEAL_BRUSHES } from './revealPresets'
import { strokeTiming } from './render/timing'

const points = Array.from({ length: 80 }, (_, i) => emptyPoint(i * 3, 80, i * 0.01))
const brushFor = (id: string) => REVEAL_BRUSHES.find(brush => brush.id === id)!
function frame(id: string, age: number, path = points, overrides: Partial<BrushV2> = {}, seed = 7, time = 400) {
  const brush = { ...brushFor(id), ...overrides }
  return runAnimationSync({ source: brush.animationJs, points: path, config: brush, time, age, seed })
}
const bounds = (items: ReturnType<typeof frame>['items']) => [
  Math.min(...items.map(item => item.x)), Math.max(...items.map(item => item.x)),
]

describe.each(REVEAL_BRUSHES)('$name reveal', (brush) => {
  it('exports a self-contained recipe and preserves one-shot metadata', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const result = runAnimationSync({
      source: imported.animationJs, points, config: imported, time: 600, age: 0.8, seed: 7,
    })
    expect(result.diagnostics.filter(item => item.code === 'animate-error')).toEqual([])
    expect(result.items).toEqual(frame(brush.id, 0.8).items)
    expect(imported.animationTiming).toEqual(brush.animationTiming)
    expect(imported.animationTiming?.sourceHash).toBe(animationSourceHash(imported.animationJs))
  })

  it('handles empty paths, taps, zero pressure and coincident points', () => {
    expect(frame(brush.id, 1, []).items).toEqual([])
    for (const path of [[{ ...emptyPoint(10, 20), pressure: 0 }],
      [emptyPoint(10, 20, 0), emptyPoint(10, 20, 1)]]) {
      for (const age of [0, 0.6, 4]) {
        const result = frame(brush.id, age, path)
        expect(result.diagnostics.filter(item => item.code === 'animate-error')).toEqual([])
        expect(result.items.every(item => Number.isFinite(item.x + item.y + item.size + item.opacity))).toBe(true)
      }
      expect(frame(brush.id, 4, path).items.some(item => item.opacity > 0)).toBe(true)
    }
  })

  it('uses stroke age, supports backward seeks and holds its completed line', () => {
    const fresh = frame(brush.id, 0.1).items
    const mid = frame(brush.id, 0.8).items
    const complete = frame(brush.id, 4).items
    expect(mid).not.toEqual(fresh)
    expect(complete).not.toEqual(mid)
    expect(frame(brush.id, 0.1, points, {}, 7, 900).items).toEqual(fresh)
    expect(frame(brush.id, 100, points, {}, 7, 1000).items).toEqual(complete)
    expect(complete.every(item => item.kind === 'segment')).toBe(true)
    expect(bounds(complete)).toEqual([points[0].x, points.at(-1)!.x])
  })

  it('preserves chosen color and opacity and responds to pressure', () => {
    const low = frame(brush.id, 4, points.map(point => ({ ...point, pressure: 0.1 }))).items
    const high = frame(brush.id, 4, points.map(point => ({ ...point, pressure: 1 }))).items
    expect(high.reduce((sum, item) => sum + item.size, 0)).toBeGreaterThan(low.reduce((sum, item) => sum + item.size, 0))
    const transparent = frame(brush.id, 0.6, points, { color: '#20a045', opacity: 0 }).items
    expect(transparent.length).toBeGreaterThan(0)
    expect(transparent.every(item => item.color === '#20a045' && item.opacity === 0)).toBe(true)
    expect(frame(brush.id, 4, points, { opacity: 0.3 }).items.every(item => item.opacity === 0.3)).toBe(true)
  })

  it('shows the completed mark at zero speed and remains incomplete at very low speed', () => {
    expect(frame(brush.id, 0, points, { speed: 0 }).items).toEqual(frame(brush.id, 100).items)
    expect(frame(brush.id, 0.001, points, { speed: 0.001 }).items).not.toEqual(frame(brush.id, 100).items)
  })

  it('stops requesting frames only after the last point has settled', () => {
    const path = [emptyPoint(0, 0, 30), emptyPoint(100, 0, 42)]
    const scaled = { ...brush, speed: 2 }
    const stroke = snapshotStroke(scaled, path, 'layer', 7)
    const timing = brush.animationTiming!
    expect(timing.mode).toBe('once')
    if (timing.mode !== 'once') throw new Error('Expected a one-shot recipe')
    const end = 12_000 + timing.settleSeconds * 1000 / scaled.speed
    expect(strokeTiming(stroke, 100_000, end - 1).delay).toBe(0)
    expect(strokeTiming(stroke, 100_000, end).delay).toBe(Infinity)
    const completed = frame(brush.id, end / 1000 * scaled.speed, path, scaled).items
    expect(completed).toEqual(frame(brush.id, 1000, path, scaled).items)
  })

  it('caps output for very long paths while retaining the complete final shape', () => {
    const path = Array.from({ length: 20_000 }, (_, i) => emptyPoint(i * 3, 80))
    const midway = frame(brush.id, 0.75, path).items
    const complete = frame(brush.id, 10, path).items
    expect(midway.length).toBeLessThanOrEqual(4192)
    expect(midway.length).toBeLessThan(DEFAULT_BUDGETS.maxDrawItems)
    expect(complete.length).toBeLessThanOrEqual(4000)
    expect(bounds(complete)).toEqual([0, path.at(-1)!.x])
  })
})

describe('Center Bloom shape', () => {
  const uneven = [emptyPoint(0, 0), emptyPoint(1, 0), emptyPoint(100, 0)]

  it('grows symmetrically from the arc-length midpoint with interpolated boundaries', () => {
    const half = frame('centerBloom', 0.75, uneven).items
    expect(bounds(half)).toEqual([25, 75])
    expect(half).toHaveLength(2)
    const early = frame('centerBloom', 0.15, uneven).items
    expect(early[0].x + early.at(-1)!.x).toBeCloseTo(100)
    expect(early[0].x).toBeGreaterThan(45)
    expect(early.at(-1)!.x).toBeLessThan(55)
  })

  it('follows bends instead of bridging the visible interval with a straight line', () => {
    const bent = [emptyPoint(0, 0), emptyPoint(50, 0), emptyPoint(50, 50)]
    const items = frame('centerBloom', 0.75, bent).items
    expect(items.map(item => [item.x, item.y])).toEqual([[25, 0], [50, 0], [50, 25]])
  })

  it('keeps new sections of a long live stroke revealing until after drawing stops', () => {
    const live = [emptyPoint(0, 0, 100), emptyPoint(100, 0, 110)]
    expect(bounds(frame('centerBloom', 10, live).items)[1]).toBeLessThan(100)
    expect(bounds(frame('centerBloom', 11.5, live).items)).toEqual([0, 100])
  })
})

describe('Dust Reveal particles', () => {
  const particles = (age: number, path: StrokePointV2[] = points, seed = 7) =>
    frame('dustReveal', age, path, {}, seed).items.filter(item => item.kind === 'particle')

  it('uses seeded, repeatable grain placement and holds the same final line for every seed', () => {
    expect(particles(0.7, points, 7)).not.toEqual(particles(0.7, points, 8))
    expect(particles(0.7, points, 7)).toEqual(particles(0.7, points, 7))
    expect(frame('dustReveal', 4, points, {}, 7).items).toEqual(frame('dustReveal', 4, points, {}, 8).items)
  })

  it('converges grains onto a tap before removing them and retaining the core', () => {
    const tap = [emptyPoint(50, 60)]
    const distance = (age: number) => particles(age, tap).reduce((sum, item) => sum + Math.hypot(item.x - 50, item.y - 60), 0)
    expect(distance(1)).toBeLessThan(distance(0))
    expect(distance(1.9)).toBeLessThan(distance(1))
    expect(particles(2, tap)).toEqual([])
    expect(frame('dustReveal', 2, tap).items).toHaveLength(1)
  })

  it('retains only grains associated with newly drawn sections of a long stroke', () => {
    const live = [emptyPoint(0, 0, 100), emptyPoint(100, 0, 110)]
    const earlyCore = frame('dustReveal', 10, live).items.filter(item => item.kind === 'segment')
    expect(earlyCore[0].opacity).toBe(brushFor('dustReveal').opacity)
    expect(earlyCore.at(-1)!.opacity).toBe(0)
    expect(particles(10, live).length).toBeGreaterThan(0)
    expect(particles(12, live)).toEqual([])
    expect(frame('dustReveal', 12, live).items.every(item => item.opacity === brushFor('dustReveal').opacity)).toBe(true)
  })

  it('bounds the particle population independently of canvas extent and brush size', () => {
    const huge = [emptyPoint(-100_000, -100_000), emptyPoint(100_000, 100_000)]
    for (const size of [0.5, 100, 2048]) {
      const result = frame('dustReveal', 0.8, huge, { size })
      expect(result.items.filter(item => item.kind === 'particle')).toHaveLength(192)
    }
  })
})
