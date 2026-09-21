import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { animationSourceHash } from './core/animationTiming'
import { emptyPoint } from './core/defaults'
import type { BrushV2, DrawItem, StrokeV2 } from './core/types'
import { EXPRESSIVE_BRUSHES } from './expressivePresets'
import { strokeTiming } from './render/timing'
import { strokeFrame } from './render/engine'

const points = Array.from({ length: 101 }, (_, i) => ({
  ...emptyPoint(i * 4, 80, i * 0.016), velocity: 250,
}))
const brushById = (id: string) => EXPRESSIVE_BRUSHES.find((brush) => brush.id === id)!

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

describe.each(EXPRESSIVE_BRUSHES)('$name', (brush) => {
  it('exports a self-contained recipe that stays deterministic after seeking', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const first = frame(imported, 0.4)
    expect(first.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(first.items.length).toBeGreaterThan(0)
    expect(frame(imported, 0.4).items).toEqual(first.items)
    frame(imported, 100)
    expect(frame(imported, 0.4).items).toEqual(first.items)
    // The host already applies speed to recipe time; recipes must not do so twice.
    expect(frame({ ...imported, speed: 3 }, 0.4).items).toEqual(first.items)
    expect(frame(imported, 1.4).items).not.toEqual(first.items)
    expect(frame(imported, 0.4, points, 8).items).not.toEqual(first.items)
  })

  it('keeps taps, duplicate points, tiny paths, and empty paths finite', () => {
    expect(frame(brush, 0, []).items).toEqual([])
    const tap = { ...emptyPoint(10, 20), pressure: 0, velocity: 0 }
    for (const source of [[tap], [tap, tap, tap], [tap, emptyPoint(10.001, 20)], [tap, emptyPoint(12, 20)]]) {
      for (const time of [0, 0.7, 3, 300]) {
        const result = frame(brush, time, source)
        expect(result.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
        expect(result.items.some((item) => item.opacity > 0 && item.size > 0)).toBe(true)
        expect(result.items.every((item) => Number.isFinite(item.x + item.y + item.size + item.rotation + item.opacity))).toBe(true)
      }
    }
  })

  it('honors pressure, size, opacity, color, and optional effects', () => {
    const low = frame(brush, 0.4, points.map((p) => ({ ...p, pressure: 0.1 }))).items
    const high = frame(brush, 0.4, points.map((p) => ({ ...p, pressure: 1 }))).items
    expect(Math.max(...high.map((item) => item.size))).toBeGreaterThan(Math.max(...low.map((item) => item.size)))
    const custom = {
      ...brush, color: '#f351a8', opacity: 0.4, blurRadius: 2, glow: 6,
      shadow: { offsetX: 2, offsetY: 3, blur: 4, color: '#123456', opacity: 0.5 },
    }
    const items = frame(custom, 0.4).items
    expect(items.every((item) => item.opacity <= 0.4 && item.blur === 2 && item.glow === 6)).toBe(true)
    expect(items.some((item) => item.color === custom.color)).toBe(true)
    expect(items.every((item) => item.shadow.color === custom.shadow.color && item.shadow.opacity === 0.5)).toBe(true)
    expect(frame({ ...custom, opacity: 0, glow: 0 }, 0.4).items.every((item) => item.opacity === 0 && item.glow === 0)).toBe(true)
    const bigger = frame({ ...brush, size: brush.size * 2 }, 0.4).items
    expect(Math.max(...bigger.map((item) => item.size))).toBeGreaterThan(Math.max(...frame(brush, 0.4).items.map((item) => item.size)))
  })

  it('covers the whole path within a small, explicit item budget', () => {
    const long = Array.from({ length: 4_000 }, (_, i) => emptyPoint(i * 13, 80 + 20 * Math.sin(i * 0.05)))
    const result = frame(brush, 0.4, long)
    expect(result.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(result.items.length).toBeLessThanOrEqual(960)
    expect(Math.max(...result.items.map((item) => item.x))).toBeGreaterThan(long.at(-1)!.x - 20)
    expect(Math.min(...result.items.map((item) => item.x))).toBeLessThan(20)
    expect(frame(brush, 0.4).items.length).toBeLessThan(500)
  })

  it('keeps shape and coverage independent of source point density', () => {
    const sparse = [0, 1, 7, 120, 400].map((x) => ({ ...emptyPoint(x, 80), velocity: 250 }))
    const denseItems = frame(brush, 0.4).items
    const sparseItems = frame(brush, 0.4, sparse).items
    expect(sparseItems).toHaveLength(denseItems.length)
    for (let i = 0; i < denseItems.length; i++) {
      expect(sparseItems[i].x).toBeCloseTo(denseItems[i].x, 8)
      expect(sparseItems[i].y).toBeCloseTo(denseItems[i].y, 8)
      expect(sparseItems[i].size).toBeCloseTo(denseItems[i].size, 8)
    }
  })
})

describe('expressive brush behavior', () => {
  it('separates chromatic copies without moving the ink core or bridging contours', () => {
    const brush = brushById('chromaticEcho')
    const early = contours(frame(brush, 0).items)
    const later = contours(frame(brush, 1.4).items)
    expect(early).toHaveLength(3)
    expect(later).toHaveLength(3)
    expect(early[2]).toEqual(later[2])
    expect(early[0]).not.toEqual(later[0])
    expect(early.every((run) => run[0].breakBefore && run[0].x < 10 && run.at(-1)!.x > 390)).toBe(true)
    expect(early[0][0].y - 80).toBeCloseTo(-(early[1][0].y - 80), 8)
    expect(new Set(early.map((run) => run[0].color)).size).toBe(3)
    expect(frame(brush, 3.6).items).toEqual(frame(brush, 0).items)
  })

  it('keeps iridescent geometry fixed while limited-palette highlights travel', () => {
    const brush = brushById('iridescentRibbon')
    const early = contours(frame(brush, 0).items)
    const later = contours(frame(brush, 1).items)
    expect(early).toHaveLength(3)
    expect(early[0]).toEqual(later[0])
    expect(early[1].map((item) => item.opacity)).not.toEqual(later[1].map((item) => item.opacity))
    expect(early[2].map(({ x, y, size }) => ({ x, y, size })))
      .toEqual(later[2].map(({ x, y, size }) => ({ x, y, size })))
    expect(new Set(early.flat().map((item) => item.color)).size).toBe(3)
    expect(early[1][0].size).toBeLessThan(early[0][0].size)
    expect(early[2][0].size).toBeLessThan(early[1][0].size)
    expect(frame(brush, 4).items).toEqual(frame(brush, 0).items)
  })

  it.each(['chromaticEcho', 'iridescentRibbon'])('%s derives every palette swatch from the selected color', (id) => {
    const brush = brushById(id)
    const red = new Set(frame({ ...brush, color: '#ff0000' }, 0).items.map((item) => item.color))
    const blue = new Set(frame({ ...brush, color: '#0000ff' }, 0).items.map((item) => item.color))
    expect(red.size).toBe(3)
    expect(blue.size).toBe(3)
    expect([...red].every((color) => !blue.has(color))).toBe(true)
    expect(frame({ ...brush, color: '#f00' }, 0).items.filter((item) => item.color !== '#f00').map((item) => item.color))
      .toEqual(frame({ ...brush, color: '#ff0000' }, 0).items.filter((item) => item.color !== '#ff0000').map((item) => item.color))
    expect(frame({ ...brush, color: 'rebeccapurple' }, 0).items.every((item) => item.color === 'rebeccapurple')).toBe(true)
  })

  it('builds pencil entirely from tightly spaced animated scratches without a continuous core', () => {
    const brush = brushById('scatteredPencil')
    const early = contours(frame(brush, 0).items)
    const later = contours(frame(brush, 1).items)
    expect(early).not.toEqual(later)
    expect(early.every((run) => run.length === 2 && run[0].breakBefore && !run[1].breakBefore)).toBe(true)
    expect(early.every((run) => Math.hypot(run[1].x - run[0].x, run[1].y - run[0].y) < brush.size)).toBe(true)
    for (const time of [0, 0.2, 0.8, 1.7, 2.9]) {
      const marks = frame(brush, time).items
      // Even outer tips stay in a narrow band around this horizontal path.
      expect(marks.every((item) => Math.abs(item.y - 80) < brush.size * 0.22)).toBe(true)
      const centers = contours(marks).map((run) => (run[0].x + run[1].x) / 2).sort((a, b) => a - b)
      expect(Math.max(...centers.slice(1).map((x, i) => x - centers[i]))).toBeLessThan(brush.size * 0.4)
    }
    const low = frame(brush, 0, points.map((p) => ({ ...p, pressure: 0.1 }))).items
    const high = frame(brush, 0, points.map((p) => ({ ...p, pressure: 1 }))).items
    expect(high.length).toBeGreaterThan(low.length)
    expect(frame(brush, 3).items).toEqual(frame(brush, 0).items)
  })

  it('holds pencil redraws at a source-hashed seven frames per second', () => {
    const brush = brushById('scatteredPencil')
    expect(brush.animationTiming).toEqual({ mode: 'stepped', fps: 7, sourceHash: animationSourceHash(brush.animationJs) })
    expect(frame(brush, 0.001).items).toEqual(frame(brush, 0.14).items)
    expect(frame(brush, 0.143).items).not.toEqual(frame(brush, 0.14).items)
  })

  it('keeps pressure and drawing speed in the animated width, with tapered ends', () => {
    const brush = brushById('speedTaper')
    const slow = frame(brush, 0, points.map((p) => ({ ...p, velocity: 50 }))).items
    const fast = frame(brush, 0, points.map((p) => ({ ...p, velocity: 1_600 }))).items
    const middle = Math.floor(slow.length / 2)
    expect(slow[middle].size).toBeGreaterThan(fast[middle].size * 2)
    expect(slow[0].size).toBeLessThan(Math.max(...slow.map((item) => item.size)) / 4)
    expect(slow.at(-1)!.size).toBeLessThan(Math.max(...slow.map((item) => item.size)) / 4)
    expect(contours(slow)).toHaveLength(1)
  })

  it('moves an obvious width swell along a fixed path in a seamless three-second loop', () => {
    const brush = brushById('speedTaper')
    const poses = [0, 0.75, 1.5, 2.25].map((time) => frame(brush, time).items)
    const middle = Math.floor(poses[0].length / 2)
    expect(Math.max(...poses.map((items) => items[middle].size)))
      .toBeGreaterThan(Math.min(...poses.map((items) => items[middle].size)) * 2.5)
    const fixedGeometry = (items: DrawItem[]) => items.map(({ x, y, rotation, opacity, color }) => ({ x, y, rotation, opacity, color }))
    for (const items of poses.slice(1)) expect(fixedGeometry(items)).toEqual(fixedGeometry(poses[0]))
    expect(poses[0].map((item) => item.size)).not.toEqual(poses[2].map((item) => item.size))
    expect(frame(brush, 3).items).toEqual(poses[0])
    expect(frame(brush, -3).items).toEqual(poses[0])
    const nearEnd = frame(brush, 2.999).items
    const nearStart = frame(brush, 0.001).items
    expect(Math.max(...nearEnd.map((item, i) => Math.abs(item.size - nearStart[i].size)))).toBeLessThan(0.1)
  })

  it('continues changing width on the timeline and obeys animation speed including zero', () => {
    const brush = brushById('speedTaper')
    expect(brush.animated).toBe(true)
    expect(brush.animationTiming).toBeUndefined()
    const stroke: StrokeV2 = { id: 'speed', layerId: 'layer', brushSnapshot: brush, points, seed: 7, createdAt: 0 }
    for (const time of [0, 750, 1500, 60_000]) {
      expect(strokeTiming(stroke, time, time).delay).toBe(0)
    }
    expect(strokeFrame(stroke, 750).items).not.toEqual(strokeFrame(stroke, 1500).items)
    const double = { ...stroke, brushSnapshot: { ...brush, speed: 2 } }
    expect(strokeFrame(double, 375).items).toEqual(strokeFrame(stroke, 750).items)
    const frozen = { ...stroke, brushSnapshot: { ...brush, speed: 0 } }
    expect(strokeTiming(frozen, 100, 100).delay).toBe(Infinity)
    expect(strokeFrame(frozen, 750).items).toEqual(strokeFrame(frozen, 10_000).items)
  })
})
