import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { ANIME_MOTION_BRUSHES } from './animeMotionPresets'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { animationSourceHash } from './core/animationTiming'
import { emptyPoint } from './core/defaults'
import type { BrushV2, DrawItem } from './core/types'

const points = Array.from({ length: 101 }, (_, i) => emptyPoint(i * 4, 80))
const loops: Record<string, number> = { animeJiggle: 1, followThrough: 3, speedLines: 1 }
const brushById = (id: string) => ANIME_MOTION_BRUSHES.find((brush) => brush.id === id)!

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

describe.each(ANIME_MOTION_BRUSHES)('$name', (brush) => {
  it('exports self-contained, deterministic, seeded, looping animation', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const first = frame(imported, 0)
    expect(first.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(first.items.length).toBeGreaterThan(0)
    expect(frame(imported, 0).items).toEqual(first.items)
    expect(frame(imported, loops[brush.id]).items).toEqual(first.items)
    expect(frame(imported, 0.4).items).not.toEqual(first.items)
    expect(frame(imported, 0, points, 8).items).not.toEqual(first.items)
    // Rewinding and changing configuration speed cannot accumulate simulation
    // state or apply speed twice (the engine already scales recipe time).
    frame(imported, 50)
    expect(frame({ ...imported, speed: 3 }, 0).items).toEqual(first.items)
  })

  it('holds actual poses at the declared, source-hashed 12 fps', () => {
    expect(brush.animationTiming).toEqual({ mode: 'stepped', fps: 12, sourceHash: animationSourceHash(brush.animationJs) })
    expect(frame(brush, 0.001).items).toEqual(frame(brush, 0.082).items)
    expect(frame(brush, 0.084).items).not.toEqual(frame(brush, 0.082).items)
    expect(frame(brush, loops[brush.id] + 0.084).items).toEqual(frame(brush, 0.084).items)
  })

  it('keeps taps, repeated points, and very short strokes visible at every pose', () => {
    expect(frame(brush, 0, []).items).toEqual([])
    const tap = { ...emptyPoint(10, 20), pressure: 0 }
    for (const source of [[tap], [tap, tap, tap], [tap, emptyPoint(10.1, 20)], [tap, emptyPoint(12, 20)]]) {
      for (let pose = 0; pose < loops[brush.id] * 12; pose++) {
        const result = frame(brush, pose / 12, source)
        expect(result.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
        expect(result.items.some((item) => item.opacity > 0 && item.size > 0)).toBe(true)
        expect(result.items.every((item) => Number.isFinite(item.x + item.y + item.size))).toBe(true)
      }
    }
  })

  it('honors size, pressure, color, opacity, and optional effects', () => {
    const totalWidth = (items: DrawItem[]) => items.reduce((sum, item) => sum + item.size, 0)
    const low = frame(brush, 0.4, points.map((p) => ({ ...p, pressure: 0.1 }))).items
    const high = frame(brush, 0.4, points.map((p) => ({ ...p, pressure: 1 }))).items
    expect(totalWidth(high)).toBeGreaterThan(totalWidth(low))
    const custom = {
      ...brush, color: '#fd55a8', opacity: 0.4, blurRadius: 2, glow: 6,
      shadow: { offsetX: 2, offsetY: 3, blur: 4, color: '#123456', opacity: 0.5 },
    }
    const items = frame(custom, 0.4).items
    expect(items.every((item) => item.color === custom.color && item.opacity === 0.4 && item.blur === 2 && item.glow === 6)).toBe(true)
    expect(items.every((item) => item.shadow.color === custom.shadow.color && item.shadow.opacity === 0.5)).toBe(true)
    expect(frame({ ...custom, opacity: 0, glow: 0 }, 0.4).items.every((item) => item.opacity === 0 && item.glow === 0)).toBe(true)
    const bigger = frame({ ...brush, size: brush.size * 2 }, 0.4).items
    expect(Math.max(...bigger.map((item) => item.size))).toBeGreaterThan(Math.max(...frame(brush, 0.4).items.map((item) => item.size)))
  })

  it('resamples the whole path with bounded output rather than truncating it', () => {
    const long = Array.from({ length: 4_000 }, (_, i) => emptyPoint(i * 13, 80 + 20 * Math.sin(i * 0.05)))
    const items = frame(brush, 0.4, long).items
    expect(items.length).toBeLessThanOrEqual(1_600)
    expect(Math.max(...items.map((item) => item.x))).toBeGreaterThan(long.at(-1)!.x - 400)
    expect(frame(brush, 0.4).items.length).toBeLessThan(400)
    const uneven = [emptyPoint(0, 80), emptyPoint(1, 80), emptyPoint(7, 80), emptyPoint(120, 80), emptyPoint(400, 80)]
    const sparse = frame(brush, 0.4, uneven).items
    const dense = frame(brush, 0.4).items
    expect(sparse).toHaveLength(dense.length)
    for (let i = 0; i < dense.length; i++) {
      expect(sparse[i].x).toBeCloseTo(dense[i].x, 8)
      expect(sparse[i].y).toBeCloseTo(dense[i].y, 8)
      expect(sparse[i].size).toBeCloseTo(dense[i].size, 8)
    }
  })
})

describe('anime motion behavior', () => {
  it('jiggles a coherent outline with mild squash instead of local noisy edges', () => {
    const brush = brushById('animeJiggle')
    const outline = Array.from({ length: 81 }, (_, i) => emptyPoint(200 + 60 * Math.cos(i / 80 * Math.PI * 2), 120 + 40 * Math.sin(i / 80 * Math.PI * 2)))
    for (const time of [0, 0.4]) {
      const items = frame(brush, time, outline).items
      expect(contours(items)).toHaveLength(1)
      // The shared transform keeps a closed contour closed and preserves its
      // recognizable size rather than letting separate vertices crawl away.
      expect(items[0].x).toBeCloseTo(items.at(-1)!.x, 8)
      expect(items[0].y).toBeCloseTo(items.at(-1)!.y, 8)
      const width = Math.max(...items.map((item) => item.x)) - Math.min(...items.map((item) => item.x))
      expect(width).toBeGreaterThan(114)
      expect(width).toBeLessThan(126)
    }
  })

  it('pins the follow-through attachment and increases motion toward the tip', () => {
    const brush = brushById('followThrough')
    const poses = Array.from({ length: 36 }, (_, pose) => frame(brush, pose / 12).items)
    for (const items of poses) {
      expect(contours(items)).toHaveLength(1)
      expect([items[0].x, items[0].y]).toEqual([0, 80])
    }
    const rangeAt = (fraction: number) => {
      const values = poses.map((items) => items[Math.floor((items.length - 1) * fraction)].y)
      return Math.max(...values) - Math.min(...values)
    }
    expect(rangeAt(1)).toBeGreaterThan(20)
    expect(rangeAt(1)).toBeGreaterThan(rangeAt(0.5) * 3)
    expect(rangeAt(0.5)).toBeGreaterThan(rangeAt(0.1) * 5)
  })

  it('moves tapered speed dashes along three separate tracks with clear gaps', () => {
    const brush = brushById('speedLines')
    const early = contours(frame(brush, 0).items)
    const later = contours(frame(brush, 1 / 12).items)
    expect(new Set(early.map((run) => run[0].y)).size).toBe(3)
    const dash = early.find((run) => run[0].x > 30 && run.at(-1)!.x < 330)!
    const travel = Math.max(96, brush.size * 16, brush.spacing * 3) / 12
    const moved = later.find((run) => run[0].y === dash[0].y && Math.abs(run[0].x - dash[0].x - travel) < 0.001)!
    expect(moved).toBeDefined()
    expect(moved.at(-1)!.x - moved[0].x).toBeCloseTo(dash.at(-1)!.x - dash[0].x, 8)
    // Default streaks should read as long motion accents rather than a dense
    // repeating dash pattern on a typical character-sized gesture.
    expect(dash.at(-1)!.x - dash[0].x).toBeGreaterThan(60)
    expect(Math.max(...dash.map((item) => item.size))).toBeGreaterThan(dash[0].size * 3)
    expect(dash.at(-1)!.size).toBeLessThan(Math.max(...dash.map((item) => item.size)) / 3)
    const track = early.filter((run) => run[0].y === dash[0].y)
    for (let i = 1; i < track.length; i++) {
      expect(track[i][0].breakBefore).toBe(true)
      expect(track[i][0].x - track[i - 1].at(-1)!.x).toBeGreaterThan(10)
    }
  })
})
