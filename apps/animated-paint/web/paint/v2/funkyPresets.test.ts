import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { animationSourceHash } from './core/animationTiming'
import { emptyPoint } from './core/defaults'
import type { BrushV2, DrawItem } from './core/types'
import { FUNKY_BRUSHES } from './funkyPresets'

const points = Array.from({ length: 101 }, (_, i) => emptyPoint(i * 4, 80))
const loops: Record<string, number> = { candyConveyor: 3, elasticNoodles: 4, neonFuse: 2.4, jellyBeads: 1.5 }
const brushById = (id: string) => FUNKY_BRUSHES.find((brush) => brush.id === id)!

function frame(brush: BrushV2, time: number, sourcePoints = points, seed = 7) {
  return runAnimationSync({ source: brush.animationJs, config: brush, points: sourcePoints, time, seed })
}

function contours(items: DrawItem[]) {
  const runs: DrawItem[][] = []
  for (const item of items) {
    if (item.breakBefore || !runs.length) runs.push([])
    runs.at(-1)!.push(item)
  }
  return runs
}

describe.each(FUNKY_BRUSHES)('$name', (brush) => {
  it('is importable, deterministic, seeded, animated, and loops cleanly', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const first = frame(imported, 0)
    expect(first.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(first.items.length).toBeGreaterThan(0)
    expect(frame(imported, 0).items).toEqual(first.items)
    expect(frame(imported, loops[brush.id]).items).toEqual(first.items)
    expect(frame(imported, 0.7).items).not.toEqual(first.items)
    expect(frame(imported, 0, points, 8).items).not.toEqual(first.items)
  })

  it('handles empty paths, taps, repeated points, and zero pressure', () => {
    expect(frame(brush, 0, []).items).toEqual([])
    const tap = { ...emptyPoint(10, 20), pressure: 0 }
    for (const source of [[tap], [tap, tap, tap]]) {
      const result = frame(brush, 0, source)
      expect(result.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
      expect(result.items.some((item) => item.opacity > 0 && item.size > 0)).toBe(true)
      expect(result.items.every((item) => Number.isFinite(item.x + item.y + item.size))).toBe(true)
    }
  })

  it('bounds work to 2,000 items on a long 4,000-point stroke', () => {
    const long = Array.from({ length: 4_000 }, (_, i) => emptyPoint(i * 13, 80 + 20 * Math.sin(i * 0.05)))
    const result = frame(brush, 1.1, long)
    expect(result.items.length).toBeLessThanOrEqual(2_000)
    // A budget must simplify the whole path, rather than truncate its tail.
    expect(Math.max(...result.items.map((item) => item.x))).toBeGreaterThan(long.at(-1)!.x - 200)
  })

  it('uses brush pressure, size, palette, opacity, and effects', () => {
    const low = frame(brush, 0.7, points.map((p) => ({ ...p, pressure: 0.1 })))
    const high = frame(brush, 0.7, points.map((p) => ({ ...p, pressure: 1 })))
    const totalWidth = (items: DrawItem[]) => items.reduce((sum, item) => sum + item.size, 0)
    expect(totalWidth(high.items)).toBeGreaterThan(totalWidth(low.items))
    const shadow = { offsetX: 2, offsetY: 3, blur: 4, color: '#123456', opacity: 0.5 }
    const custom = { ...brush, color: '#1452ac', opacity: 0.4, blurRadius: 2, glow: 6, shadow }
    const result = frame(custom, 0.7).items
    expect(result.some((item) => item.color === custom.color)).toBe(true)
    expect(result.every((item) => item.opacity <= 0.4 && item.blur === 2 && item.glow <= 6)).toBe(true)
    expect(result.every((item) => item.shadow.color === shadow.color && item.shadow.opacity === shadow.opacity)).toBe(true)
    expect(result.map((item) => item.color)).not.toEqual(frame({ ...custom, color: '#c71c40' }, 0.7).items.map((item) => item.color))
    expect(frame({ ...custom, opacity: 0, glow: 0 }, 0.7).items.every((item) => item.opacity === 0 && item.glow === 0)).toBe(true)
    expect(frame({ ...brush, size: brush.size * 1.5 }, 0.7).items.some((item) => item.size > Math.max(...frame(brush, 0.7).items.map((item) => item.size)))).toBe(true)
  })
})

describe('funky motion behavior', () => {
  it('keeps short candy strokes visible throughout the loop', () => {
    const brush = brushById('candyConveyor')
    for (const length of [1, 2, 8, 12]) {
      const short = [emptyPoint(0, 80), emptyPoint(length, 80)]
      for (let step = 0; step < 120; step++) {
        const items = frame(brush, step / 40, short).items
        expect(items.some((item) => item.opacity > 0 && item.size > 0)).toBe(true)
        expect(items[0].x).toBe(0)
        expect(items.at(-1)!.x).toBe(length)
      }
    }
  })

  it.each(['candyConveyor', 'jellyBeads'])('%s spaces its marks according to brush spacing', (id) => {
    const brush = brushById(id)
    expect(frame({ ...brush, spacing: 200 }, 0.7).items.length).toBeLessThan(frame(brush, 0.7).items.length)
  })

  it.each(['candyConveyor', 'neonFuse'])('%s moves the same interior dash through arc length', (id) => {
    const brush = brushById(id)
    const early = contours(frame(brush, 0).items).filter((run) => run[0].x > 30 && run.at(-1)!.x < 360)
    const late = contours(frame(brush, 0.01).items)
    const dash = early[0]
    const moved = late.find((run) => run[0].color === dash[0].color && run[0].x > dash[0].x && run[0].x < dash[0].x + 3)!
    expect(moved).toBeDefined()
    expect(moved.at(-1)!.x - moved[0].x).toBeCloseTo(dash.at(-1)!.x - dash[0].x, 6)
    expect(moved[0].x).toBeGreaterThan(dash[0].x)
    // Extra uneven samples on this same straight path do not change travel.
    const uneven = [emptyPoint(0, 80), emptyPoint(1, 80), emptyPoint(7, 80), emptyPoint(120, 80), emptyPoint(400, 80)]
    const sparse = frame(brush, 0.7, uneven).items
    const dense = frame(brush, 0.7).items
    expect(sparse.length).toBe(dense.length)
    for (let i = 0; i < sparse.length; i++) {
      expect(sparse[i].x).toBeCloseTo(dense[i].x, 8)
      expect(sparse[i].color).toBe(dense[i].color)
    }
  })

  it('keeps noodle contours separate and their endpoints pinned', () => {
    const brush = brushById('elasticNoodles')
    for (const time of [0, 0.7]) {
      const runs = contours(frame(brush, time).items)
      expect(runs).toHaveLength(3)
      for (const run of runs) {
        expect([run[0].x, run[0].y]).toEqual([0, 80])
        expect([run.at(-1)!.x, run.at(-1)!.y]).toEqual([400, 80])
      }
    }
  })

  it('holds a steady neon trail and respects disabling glow', () => {
    const brush = brushById('neonFuse')
    const trail = (time: number) => contours(frame(brush, time).items)[0]
    expect(trail(0)).toEqual(trail(0.7))
    expect(trail(0).every((item) => item.opacity < brush.opacity / 2)).toBe(true)
    expect(frame({ ...brush, glow: 0 }, 0.7).items.every((item) => item.glow === 0)).toBe(true)
  })

  it('holds jelly poses at 8 fps and ties scheduling to the actual recipe', () => {
    const brush = brushById('jellyBeads')
    expect(brush.animationTiming).toEqual({ mode: 'stepped', fps: 8, sourceHash: animationSourceHash(brush.animationJs) })
    expect(frame(brush, 0.01).items).toEqual(frame(brush, 0.12).items)
    expect(frame(brush, 0.13).items).not.toEqual(frame(brush, 0.12).items)
    const bead = frame(brush, 0.13).items[0]
    expect(bead.scaleX! * bead.scaleY!).toBeCloseTo(1, 8)
  })
})
