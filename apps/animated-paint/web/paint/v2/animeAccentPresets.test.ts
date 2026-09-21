import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { ANIME_ACCENT_BRUSHES } from './animeAccentPresets'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { animationSourceHash } from './core/animationTiming'
import { emptyPoint } from './core/defaults'
import type { BrushV2, DrawItem } from './core/types'

const points = Array.from({ length: 101 }, (_, i) => emptyPoint(i * 4, 80))
const loops: Record<string, number> = { impactBurst: 1.5, powerAura: 2, sparkleStar: 2 }
const byId = (id: string) => ANIME_ACCENT_BRUSHES.find((brush) => brush.id === id)!

function frame(brush: BrushV2, time: number, source = points, seed = 7) {
  return runAnimationSync({ source: brush.animationJs, config: brush, points: source, time, seed })
}

function contours(items: DrawItem[]) {
  const runs: DrawItem[][] = []
  for (const item of items) {
    if (item.breakBefore || !runs.length) runs.push([])
    runs.at(-1)!.push(item)
  }
  return runs
}

describe.each(ANIME_ACCENT_BRUSHES)('$name', (brush) => {
  it('exports a self-contained, seeded, deterministic animation with a closed loop', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const first = frame(imported, 0)
    expect(first.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(first.items.length).toBeGreaterThan(0)
    expect(frame(imported, 0).items).toEqual(first.items)
    expect(frame(imported, loops[brush.id]).items).toEqual(first.items)
    expect(frame(imported, 0.7).items).not.toEqual(first.items)
    expect(frame(imported, 0, points, 19).items).not.toEqual(first.items)
  })

  it('holds poses at its advertised frame rate and hashes the actual recipe', () => {
    const fps = brush.id === 'impactBurst' ? 12 : 8
    expect(brush.animationTiming).toEqual({ mode: 'stepped', fps, sourceHash: animationSourceHash(brush.animationJs) })
    expect(frame(brush, 0.001).items).toEqual(frame(brush, 0.99 / fps).items)
    expect(frame(brush, 1.01 / fps).items).not.toEqual(frame(brush, 0.99 / fps).items)
  })

  it('handles empty, tapped, repeated, and very short strokes without invalid marks', () => {
    expect(frame(brush, 0, []).items).toEqual([])
    const tap = { ...emptyPoint(10, 20), pressure: 0 }
    for (const source of [[tap], [tap, tap, tap], [tap, emptyPoint(10.01, 20)]]) {
      for (const time of [0, 0.7, 1.4]) {
        const result = frame(brush, time, source)
        expect(result.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
        expect(result.items.some((item) => item.size > 0 && item.opacity > 0)).toBe(true)
        expect(result.items.every((item) => Number.isFinite(item.x + item.y + item.size))).toBe(true)
      }
    }
  })

  it('bounds work while preserving the tail of a long, dense stroke', () => {
    const long = Array.from({ length: 4_000 }, (_, i) => emptyPoint(i * 13, 80 + 20 * Math.sin(i * 0.05)))
    const items = frame(brush, 0.7, long).items
    expect(items.length).toBeLessThanOrEqual(1_600)
    expect(Math.max(...items.map((item) => item.x))).toBeGreaterThan(long.at(-1)!.x - 100)
    expect(frame(brush, 0.7).items.length).toBeLessThan(400)
  })

  it('honors size, pressure, color, opacity, and explicitly chosen effects', () => {
    const tap = [emptyPoint(40, 50)]
    const radius = (items: DrawItem[]) => Math.max(...items.map((p) => Math.hypot(p.x - 40, p.y - 50)))
    expect(radius(frame(brush, 0.7, [{ ...tap[0], pressure: 1 }]).items))
      .toBeGreaterThan(radius(frame(brush, 0.7, [{ ...tap[0], pressure: 0 }]).items))
    expect(radius(frame({ ...brush, size: brush.size * 2 }, 0.7, tap).items))
      .toBeGreaterThan(radius(frame(brush, 0.7, tap).items) * 1.9)
    const shadow = { offsetX: 2, offsetY: 3, blur: 4, color: '#123456', opacity: 0.5 }
    const custom = { ...brush, color: '#1452ac', opacity: 0.4, blurRadius: 2, glow: 6, shadow }
    const result = frame(custom, 0.7).items
    expect(result.every((item) => item.color === custom.color && item.opacity <= 0.4 && item.blur === 2 && item.glow === 6)).toBe(true)
    expect(result.every((item) => item.shadow.color === shadow.color && item.shadow.opacity === shadow.opacity)).toBe(true)
    expect(frame({ ...custom, opacity: 0, glow: 0 }, 0.7).items.every((item) => item.opacity === 0 && item.glow === 0)).toBe(true)
    expect(brush.glow).toBeLessThanOrEqual(2)
  })

  it('spaces marks by distance and reduces work when spacing increases', () => {
    // Use enough distance for both gap sizes to cross a placement boundary.
    const longer = Array.from({ length: 201 }, (_, i) => emptyPoint(i * 4, 80))
    expect(frame({ ...brush, spacing: 200 }, 0.7, longer).items.length).toBeLessThan(frame(brush, 0.7, longer).items.length)
    const sparse = [emptyPoint(0, 80), emptyPoint(1, 80), emptyPoint(7, 80), emptyPoint(120, 80), emptyPoint(400, 80)]
    const sparseFrame = frame(brush, 0.7, sparse).items
    const denseFrame = frame(brush, 0.7).items
    expect(sparseFrame.length).toBe(denseFrame.length)
    for (let index = 0; index < sparseFrame.length; index++) {
      expect(sparseFrame[index].x).toBeCloseTo(denseFrame[index].x, 7)
      expect(sparseFrame[index].y).toBeCloseTo(denseFrame[index].y, 7)
    }
  })
})

describe('anime accent geometry', () => {
  it.each(['impactBurst', 'sparkleStar'])('keeps a very short %s stroke to one centered accent', (id) => {
    const brush = byId(id)
    const short = frame(brush, 0, [emptyPoint(99, 100), emptyPoint(101, 100)]).items
    expect(short).toEqual(frame(brush, 0, [emptyPoint(100, 100)]).items)
  })

  it('gives a tap eight tapered impact rays around a clear center', () => {
    const brush = byId('impactBurst'), tap = [emptyPoint(100, 100)]
    const rays = contours(frame(brush, 0, tap).items)
    expect(rays).toHaveLength(8)
    for (const ray of rays) {
      expect(ray).toHaveLength(3)
      expect(ray[0].size).toBeGreaterThan(ray.at(-1)!.size)
      expect(Math.hypot(ray[0].x - 100, ray[0].y - 100)).toBeGreaterThan(ray[0].size)
      expect(Math.hypot(ray.at(-1)!.x - 100, ray.at(-1)!.y - 100)).toBeLessThan(brush.size * 2)
    }
    const expanded = frame(brush, 0.4, tap).items
    expect(Math.hypot(expanded[2].x - 100, expanded[2].y - 100))
      .toBeGreaterThan(Math.hypot(rays[0][2].x - 100, rays[0][2].y - 100))
    expect(expanded[0].opacity).toBeLessThan(rays[0][0].opacity)
  })

  it('keeps aura rails and branches separate and closes a tapped aura ring', () => {
    const brush = byId('powerAura')
    const runs = contours(frame(brush, 0).items)
    expect(runs[0].length).toBeGreaterThan(3)
    expect(runs[1].length).toBe(runs[0].length)
    expect(runs.slice(2).every((run) => run.length === 3)).toBe(true)
    const ring = contours(frame(brush, 0, [emptyPoint(100, 100)]).items)[0]
    expect(ring[0].x).toBe(ring.at(-1)!.x)
    expect(ring[0].y).toBe(ring.at(-1)!.y)
  })

  it('makes exactly four tapered arms for a tapped sparkle', () => {
    const brush = byId('sparkleStar')
    const arms = contours(frame(brush, 0, [emptyPoint(100, 100)]).items)
    expect(arms).toHaveLength(4)
    for (const arm of arms) {
      expect(arm).toHaveLength(4)
      expect([arm[0].x, arm[0].y]).toEqual([100, 100])
      expect(arm[0].size).toBeGreaterThan(arm.at(-1)!.size)
      expect(arm.every((item) => item.kind === 'segment')).toBe(true)
    }
  })
})
