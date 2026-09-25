import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { emptyPoint } from './core/defaults'
import type { BrushV2, StrokeV2 } from './core/types'
import { PLAYFUL_BRUSHES } from './playfulPresets'
import { strokeFrame } from './render/engine'
import { strokeTiming } from './render/timing'

const points = [0, 100, 240, 400].map(x => emptyPoint(x, 80))
const caps = [480, 224, 160, 240, 128, 160, 192, 738, 540]
function frame(brush: BrushV2, time: number, source = points, seed = 7) {
  const result = runAnimationSync({ source: brush.animationJs, config: brush, points: source, time, seed })
  expect(result.diagnostics.filter(d => d.code === 'animate-error')).toEqual([])
  return result.items
}

describe.each(PLAYFUL_BRUSHES.map((brush, index) => ({ brush, cap: caps[index] })))('$brush.name', ({ brush, cap }) => {
  it('round-trips a portable, deterministic animation and repeats seamlessly', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const start = frame(imported, 0)
    expect(start.length).toBeGreaterThan(0)
    frame(imported, 100)
    expect(frame(imported, 0)).toEqual(start)
    expect(frame(imported, 1)).not.toEqual(start)
    expect(frame(imported, 0, points, 23)).not.toEqual(start)
    const period = ['scribble', 'glitter', 'faded', 'pencil'].includes(brush.id) ? 3 : ['particle', 'dashed'].includes(brush.id) ? 2 : 4
    expect(frame(imported, period)).toEqual(start)
    expect(frame(imported, -period)).toEqual(start)

  })

  it('handles taps and duplicate points, caps long paths, and spans sparse input', () => {
    expect(frame(brush, 0, [])).toEqual([])
    const tap = emptyPoint(10, 20)
    for (const source of [[tap], [tap, tap, tap], [tap, emptyPoint(10.001, 20)],
      Array.from({ length: 4000 }, (_, i) => emptyPoint(i * 13, 80))]) {
      const items = frame(brush, 0.75, source)
      expect(items.length).toBeGreaterThan(0)
      expect(items.length).toBeLessThanOrEqual(cap)
      expect(items.every(item => Number.isFinite(item.x + item.y + item.size + item.opacity + item.rotation))).toBe(true)
      if (source.length === 4000) expect(Math.max(...items.map(item => item.x))).toBeGreaterThan(51_000)
    }
    const sparse = frame(brush, 0.75)
    const dense = frame(brush, 0.75, Array.from({ length: 401 }, (_, x) => emptyPoint(x, 80)))
    expect(dense.length).toEqual(sparse.length)
    dense.forEach((item, i) => {
      expect(item.x).toBeCloseTo(sparse[i].x, 8)
      expect(item.y).toBeCloseTo(sparse[i].y, 8)
    })
  })

  it('obeys selected ink, opacity, pressure, and timeline speed including freeze', () => {
    const custom = { ...brush, color: '#ed1267', opacity: 0.35 }
    expect(frame(custom, 0.75).every(item => (brush.id === 'cascade' || item.color === custom.color) && item.opacity <= custom.opacity)).toBe(true)
    const low = frame(brush, 0.75, points.map(p => ({ ...p, pressure: 0 })))
    const high = frame(brush, 0.75, points.map(p => ({ ...p, pressure: 1 })))
    expect(Math.max(...high.map(i => i.size * (i.scaleX ?? 1)))).toBeGreaterThan(Math.max(...low.map(i => i.size * (i.scaleX ?? 1))))
    const stroke: StrokeV2 = { id: 's', layerId: 'l', brushSnapshot: brush, points, seed: 7, createdAt: 0 }
    expect(strokeFrame(stroke, 750).items).not.toEqual(strokeFrame(stroke, 1500).items)
    expect(strokeTiming(stroke, 60_000, 60_000).delay).toBeLessThan(100)
    expect(strokeFrame({ ...stroke, brushSnapshot: { ...brush, speed: 2 } }, 375).items).toEqual(strokeFrame(stroke, 750).items)
    const frozen = { ...stroke, brushSnapshot: { ...brush, speed: 0 } }
    expect(strokeFrame(frozen, 750).items).toEqual(strokeFrame(frozen, 6000).items)
    expect(strokeTiming(frozen, 750, 750).delay).toBe(Infinity)
  })
})


it('changes cascade colors and glitter brightness independently', () => {
  const cascade = PLAYFUL_BRUSHES.find(b => b.id === 'cascade')!
  expect(frame(cascade, 0).map(i => i.color)).not.toEqual(frame(cascade, 1).map(i => i.color))
  const glitter = PLAYFUL_BRUSHES.find(b => b.id === 'glitter')!
  const a = frame(glitter, 0), b = frame(glitter, 1)
  expect(a.map(i => [i.x, i.y])).toEqual(b.map(i => [i.x, i.y]))
  expect(a.map(i => i.opacity)).not.toEqual(b.map(i => i.opacity))
  expect(new Set(a.map(i => i.opacity)).size).toBeGreaterThan(10)
})
it('keeps gaps between dashes and uses reusable texture variants', () => {
  const dashed = PLAYFUL_BRUSHES.find(b => b.id === 'dashed')!
  const items = frame(dashed, 0.75)
  const starts = items.flatMap((item, i) => item.breakBefore ? [i] : [])
  expect(starts.length).toBeGreaterThan(5)
  for (const i of starts.slice(1)) expect(items[i].x - items[i - 1].x).toBeGreaterThan(dashed.size)
  for (const id of ['charcoal', 'faded']) {
    const brush = PLAYFUL_BRUSHES.find(b => b.id === id)!
    expect(brush.stamps.every(s => s.startsWith('shape:data:image/svg+xml,'))).toBe(true)
    expect(new Set(frame(brush, 0).map(i => i.size)).size).toBe(1)
  }
})
it('honors particle emission and motion controls', () => {
  const brush = PLAYFUL_BRUSHES.find(b => b.id === 'particle')!
  expect(frame({ ...brush, particle: { ...brush.particle, spawn: 0 } }, 0)).toEqual([])
  expect(frame({ ...brush, particle: { ...brush.particle, count: 1 } }, 0).length).toBeLessThan(frame(brush, 0).length)
  const still = { ...brush, particle: { ...brush.particle, velocity: 0, gravity: 0 } }
  expect(frame(still, 0).map(i => [i.x, i.y])).toEqual(frame(still, 1).map(i => [i.x, i.y]))
})

it('redraws scribble locally rather than repeating the same arc', () => {
  const brush = PLAYFUL_BRUSHES[0], a = frame(brush, 0), b = frame(brush, 0.1)
  const deltas = a.slice(0, a.length / 2).map((item, i) => b[i].y - item.y)
  expect(deltas.some(d => d > 2)).toBe(true)
  expect(deltas.some(d => d < -2)).toBe(true)
  expect(new Set(deltas.map(d => Math.round(d)) ).size).toBeGreaterThan(6)
  expect(frame(brush, 0.01)).toEqual(a)
})
