import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { emptyPoint } from './core/defaults'
import { DEFAULT_BUDGETS } from './core/types'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { ORGANIC_BRUSHES } from './organicPresets'
import { getBuiltinBrush } from './presets'
import { snapshotStroke } from './input/sampler'
import { strokeFrame } from './render/engine'

const points = Array.from({ length: 80 }, (_, i) => emptyPoint(i * 3, 80, i * 0.01))

function frame(id: string, time: number, seed = 7, sourcePoints = points, age = time) {
  const brush = getBuiltinBrush(id)
  return runAnimationSync({ source: brush.animationJs, config: brush, points: sourcePoints, time, age, seed })
}

describe.each(ORGANIC_BRUSHES)('$name', (brush) => {
  it('is a self-contained, importable recipe with deterministic animation', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    expect(imported.id).not.toBe(brush.id)
    const stroke = snapshotStroke(imported, points, 'layer', 7)
    const first = strokeFrame(stroke, 800)
    const repeated = strokeFrame(stroke, 800)
    expect(first.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(first.items.length).toBeGreaterThan(0)
    expect(repeated.items).toEqual(first.items)
    expect(frame(brush.id, 0.8, 8).items).not.toEqual(frame(brush.id, 0.8).items)
  })

  it('handles an empty path, a tap, and zero pressure', () => {
    expect(frame(brush.id, 0, 7, []).items).toEqual([])
    const tap = frame(brush.id, 0, 7, [{ ...emptyPoint(10, 20), pressure: 0 }])
    expect(tap.diagnostics).toEqual([])
    expect(tap.items.some((item) => item.opacity > 0)).toBe(true)
    expect(tap.items.every((item) => Number.isFinite(item.x + item.y + item.size))).toBe(true)
  })

  it('covers a long path within the draw-item budget', () => {
    const longPath = Array.from({ length: DEFAULT_BUDGETS.maxSampledPoints }, (_, i) => emptyPoint(i * 3, 80))
    const result = frame(brush.id, 1, 7, longPath)
    expect(result.items.length).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxDrawItems)
    expect(Math.max(...result.items.map((item) => item.x))).toBeGreaterThan(longPath.at(-1)!.x - 20)
  })

  it('responds to pressure, color, and opacity', () => {
    const low = frame(brush.id, 1, 7, points.map((p) => ({ ...p, pressure: 0.1 })))
    const high = frame(brush.id, 1, 7, points.map((p) => ({ ...p, pressure: 1 })))
    const totalWidth = (items: typeof low.items) => items.reduce((sum, item) => sum + item.size, 0)
    expect(totalWidth(high.items)).toBeGreaterThan(totalWidth(low.items))
    const result = runAnimationSync({
      source: brush.animationJs, config: { ...brush, color: '#ff1234', opacity: 0 },
      points, time: 1, age: 1, seed: 7,
    })
    expect(result.items.every((item) => item.opacity === 0 && item.color === '#ff1234')).toBe(true)
  })
})

describe('organic motion', () => {
  it('keeps dry gaps in place while the bristles flex', () => {
    const early = frame('dryBristle', 0).items
    const late = frame('dryBristle', 1).items
    expect(late.length).toBe(early.length)
    expect(late.map((item) => item.opacity)).toEqual(early.map((item) => item.opacity))
    expect(late).not.toEqual(early)
  })

  it('holds graphite grain between redraws', () => {
    expect(frame('graphiteCrawl', 0.1).items).toEqual(frame('graphiteCrawl', 0.01).items)
    expect(frame('graphiteCrawl', 0.2).items).not.toEqual(frame('graphiteCrawl', 0.01).items)
  })

  it('anchors the ink core while its feathered edges breathe', () => {
    const early = frame('breathingInk', 0).items
    const late = frame('breathingInk', 1).items
    expect(late).not.toEqual(early)
    expect(late.filter((_, i) => i % 5 === 4)).toEqual(early.filter((_, i) => i % 5 === 4))
  })

  it('blooms according to stroke age, then stops changing', () => {
    const fresh = frame('inkBloom', 900, 7, points, 0).items
    const spreading = frame('inkBloom', 900, 7, points, 1.5).items
    expect(spreading).not.toEqual(fresh)
    expect(frame('inkBloom', 900, 7, points, 5).items).toEqual(frame('inkBloom', 901, 7, points, 10).items)
    const widest = (items: typeof fresh) => Math.max(...items.map((item) => Math.abs(item.y - 80) + item.size / 2))
    expect(widest(spreading)).toBeGreaterThan(widest(fresh))
  })

  it('keeps the primary sketch still while redrawing a separate echo', () => {
    const early = frame('sketchEcho', 0).items
    const late = frame('sketchEcho', 0.3).items
    expect(early.filter((item) => item.breakBefore)).toHaveLength(2)
    expect(late.slice(0, points.length)).toEqual(early.slice(0, points.length))
    expect(late.slice(points.length)).not.toEqual(early.slice(points.length))
  })
})
