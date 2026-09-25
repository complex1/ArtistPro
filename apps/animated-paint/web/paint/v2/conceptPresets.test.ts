import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { emptyPoint } from './core/defaults'
import type { BrushV2, StrokeV2 } from './core/types'
import { CONCEPT_BRUSHES } from './conceptPresets'
import { strokeFrame } from './render/engine'
import { strokeTiming } from './render/timing'

const points = [0, 100, 240, 400].map(x => emptyPoint(x, 80))
const caps = [768, 576, 96, 192]
function frame(brush: BrushV2, time: number, source = points, seed = 7) {
  const result = runAnimationSync({ source: brush.animationJs, config: brush, points: source, time, seed })
  expect(result.diagnostics.filter(d => d.code === 'animate-error')).toEqual([])
  return result.items
}

describe.each(CONCEPT_BRUSHES.map((brush, index) => ({ brush, cap: caps[index] })))('$brush.name', ({ brush, cap }) => {
  it('round-trips a portable, deterministic animation and repeats seamlessly', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const start = frame(imported, 0)
    expect(start.length).toBeGreaterThan(0)
    frame(imported, 100)
    expect(frame(imported, 0)).toEqual(start)
    expect(frame(imported, 1)).not.toEqual(start)
    expect(frame(imported, 0, points, 23)).not.toEqual(start)
    const period = ['livingStitch', 'fireflyTrail'].includes(brush.id) ? 3 : 4
    expect(frame(imported, period)).toEqual(start)
    expect(frame(imported, -period)).toEqual(start)
    const before = frame(imported, period - 0.0001), after = frame(imported, 0.0001)
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(before[i].x - after[i].x) + Math.abs(before[i].y - after[i].y)).toBeLessThan(0.1)
      expect(Math.abs(before[i].opacity - after[i].opacity)).toBeLessThan(0.01)
    }
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
    expect(frame(custom, 0.75).every(item => item.color === custom.color && item.opacity <= custom.opacity)).toBe(true)
    const low = frame(brush, 0.75, points.map(p => ({ ...p, pressure: 0 })))
    const high = frame(brush, 0.75, points.map(p => ({ ...p, pressure: 1 })))
    expect(Math.max(...high.map(i => i.size * (i.scaleX ?? 1)))).toBeGreaterThan(Math.max(...low.map(i => i.size * (i.scaleX ?? 1))))
    const stroke: StrokeV2 = { id: 's', layerId: 'l', brushSnapshot: brush, points, seed: 7, createdAt: 0 }
    expect(strokeFrame(stroke, 750).items).not.toEqual(strokeFrame(stroke, 1500).items)
    expect(strokeTiming(stroke, 60_000, 60_000).delay).toBe(0)
    expect(strokeFrame({ ...stroke, brushSnapshot: { ...brush, speed: 2 } }, 375).items).toEqual(strokeFrame(stroke, 750).items)
    const frozen = { ...stroke, brushSnapshot: { ...brush, speed: 0 } }
    expect(strokeFrame(frozen, 750).items).toEqual(strokeFrame(frozen, 6000).items)
    expect(strokeTiming(frozen, 750, 750).delay).toBe(Infinity)
  })
})

it('keeps zipper teeth separate and stitch anchors fixed while the thread bends', () => {
  for (const [brush, length] of [[CONCEPT_BRUSHES[0], 3], [CONCEPT_BRUSHES[1], 6]] as const) {
    const a = frame(brush, 0), b = frame(brush, 1)
    expect(a.every((item, i) => item.kind === 'segment' && item.breakBefore === (i % length === 0))).toBe(true)
    if (length === 6) {
      for (let i = 0; i < a.length; i += length) {
        expect([a[i].x, a[i].y, a[i + 5].x, a[i + 5].y]).toEqual([b[i].x, b[i].y, b[i + 5].x, b[i + 5].y])
        expect([a[i + 2].x, a[i + 2].y]).not.toEqual([b[i + 2].x, b[i + 2].y])
      }
    }
  }
})

it('reuses one firefly stamp size while each light blinks and wanders independently', () => {
  const brush = CONCEPT_BRUSHES[2]
  const a = frame(brush, 0), b = frame(brush, 1)
  expect(new Set(a.map(i => i.size)).size).toBe(1)
  expect(a.every(i => i.kind === 'particle' && i.blur === 0 && i.glow === 0)).toBe(true)
  expect(new Set(a.map(i => i.opacity)).size).toBe(a.length)
  expect(a.some((item, i) => item.x !== b[i].x && item.opacity !== b[i].opacity)).toBe(true)
  expect(frame({ ...brush, particle: { ...brush.particle, spawn: 0 } }, 0)).toEqual([])
  expect(frame({ ...brush, particle: { ...brush.particle, count: 1 } }, 0).length).toBeLessThan(a.length)
  expect(frame({ ...brush, particle: { ...brush.particle, velocity: 0 } }, 0).map(i => [i.x, i.y]))
    .toEqual(frame({ ...brush, particle: { ...brush.particle, velocity: 0 } }, 1).map(i => [i.x, i.y]))
})

it('melts screen-aligned square blocks and rebuilds without an underlying line', () => {
  const brush = CONCEPT_BRUSHES[3], a = frame(brush, 0), b = frame(brush, 1)
  expect(brush.stamps[0]).toContain('shape:data:image/svg+xml,')
  expect(a.every(i => i.kind === 'stamp' && i.rotation === 0 && i.scaleX === i.scaleY)).toBe(true)
  expect(a.some((item, i) => Math.abs(item.y - b[i].y) > brush.size)).toBe(true)
  expect(a.map(i => i.opacity)).not.toEqual(b.map(i => i.opacity))
})
