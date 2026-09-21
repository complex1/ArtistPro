import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { exportBrushJson, importBrushJson } from './brushTransfer'
import { emptyPoint } from './core/defaults'
import { parseBrush } from './core/schema'
import { isShapeStamp, stampPaintSrc } from './core/stamp'
import type { BrushV2, DrawItem } from './core/types'
import { strokeFrame } from './render/engine'
import { WEATHER_BRUSHES } from './weatherPresets'

const points = Array.from({ length: 101 }, (_, i) => emptyPoint(i * 4, 100))
const rain = WEATHER_BRUSHES.find(brush => brush.id === 'rainStreaks')!
const smoke = WEATHER_BRUSHES.find(brush => brush.id === 'softSmoke')!
const caps: Record<string, number> = { rainStreaks: 144, softSmoke: 72 }
function frame(brush: BrushV2, time = 0.7, source = points, seed = 7) {
  return runAnimationSync({ source: brush.animationJs, config: brush, points: source, time, seed })
}
function matchPositions(a: DrawItem[], b: DrawItem[]) {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    for (const key of ['x', 'y', 'size', 'opacity', 'rotation', 'scaleX', 'scaleY'] as const) {
      expect(a[i][key]).toBeCloseTo(b[i][key]!, 7)
    }
  }
}
function phaseAtZero(index = 0, seed = 7) {
  const value = Math.sin(seed * 0.017 + index * 127.1 + 11 * 311.7) * 43758.5453
  return value - Math.floor(value)
}

describe.each(WEATHER_BRUSHES)('$name', brush => {
  it('exports its complete deterministic recipe and animates with independent seeds', () => {
    const imported = importBrushJson(exportBrushJson(brush))!
    const original = frame(brush)
    expect(original.diagnostics.filter(diagnostic => diagnostic.code === 'animate-error')).toEqual([])
    expect(original.items.length).toBeGreaterThan(0)
    expect(frame(imported).items).toEqual(original.items)
    expect(frame(brush, 1.1).items).not.toEqual(original.items)
    expect(frame(brush, 0.7, points, 8).items).not.toEqual(original.items)
    // No accumulated simulation state: seeking backward reproduces the frame.
    frame(brush, 90)
    expect(frame(brush).items).toEqual(original.items)
  })

  it('handles empty paths, taps, repeated points, zero pressure, and negative time', () => {
    expect(frame(brush, 0, []).items).toEqual([])
    const point = { ...emptyPoint(12, 30), pressure: 0 }
    for (const source of [[point], [point, point, point]]) {
      for (const time of [-10, 0, 4]) {
        const result = frame(brush, time, source)
        expect(result.diagnostics.filter(diagnostic => diagnostic.code === 'animate-error')).toEqual([])
        expect(result.items.some(item => item.opacity > 0 && item.size > 0)).toBe(true)
        expect(result.items.every(item => Number.isFinite(item.x + item.y + item.size))).toBe(true)
      }
    }
  })

  it('caps work independently of length and covers the full long stroke', () => {
    const long = Array.from({ length: 4_000 }, (_, i) => emptyPoint(i * 13, 80))
    const dense = { ...brush, particle: { ...brush.particle, count: 64, spawn: 8 }, spacing: 1 }
    const items = frame(dense, 0.7, long).items
    expect(items).toHaveLength(caps[brush.id])
    expect(Math.min(...items.map(item => item.x))).toBeLessThan(long.at(-1)!.x * 0.03)
    expect(Math.max(...items.map(item => item.x))).toBeGreaterThan(long.at(-1)!.x * 0.97)
  })

  it('distributes emitters by distance so uneven input samples do not change the effect', () => {
    const sparse = [emptyPoint(0, 100), emptyPoint(1, 100), emptyPoint(17, 100), emptyPoint(340, 100), emptyPoint(400, 100)]
    matchPositions(frame(brush, 0.7, sparse).items, frame(brush).items)
  })

  it('honors size, opacity, color, pressure, and opt-in effects', () => {
    const shadow = { offsetX: 2, offsetY: 3, blur: 4, color: '#123456', opacity: 0.4 }
    const changed = { ...brush, color: '#903241', opacity: 0.3, glow: 4, blurRadius: 2, shadow }
    const items = frame(changed).items
    expect(items.every(item => item.color === changed.color && item.opacity <= changed.opacity)).toBe(true)
    expect(items.every(item => item.glow === 4 && item.blur === 2 && item.shadow.color === shadow.color)).toBe(true)
    expect(frame({ ...brush, opacity: 0 }).items.every(item => item.opacity === 0)).toBe(true)
    const largest = (value: BrushV2) => Math.max(...frame(value).items.map(item => item.size))
    expect(largest({ ...brush, size: brush.size * 2 })).toBeGreaterThan(largest(brush))
    const low = frame(brush, 0.7, [emptyPoint(0, 100)]).items
    const high = frame(brush, 0.7, [{ ...emptyPoint(0, 100), pressure: 1 }]).items
    expect(high.some((item, index) => item.size > low[index].size || item.opacity > low[index].opacity)).toBe(true)
  })

  it('uses particle density and spacing and stops emission when spawn is zero', () => {
    const dense = { ...brush, particle: { ...brush.particle, count: 8, spawn: 2 } }
    expect(frame(dense).items.length).toBeGreaterThan(frame(brush).items.length)
    expect(frame({ ...brush, spacing: 200 }).items.length).toBeLessThan(frame(brush).items.length)
    expect(frame({ ...brush, particle: { ...brush.particle, spawn: 0 } }).items).toEqual([])
  })

  it('repeats at the configured lifetime and fades both sides of the wrap', () => {
    matchPositions(frame(brush, 0.23).items, frame(brush, 0.23 + brush.particle.lifetime).items)
    const wrap = (1 - phaseAtZero()) * brush.particle.lifetime
    for (const delta of [-0.0001, 0, 0.0001]) {
      expect(frame(brush, wrap + delta).items[0].opacity).toBeLessThan(0.00001)
    }
    const custom = { ...brush, particle: { ...brush.particle, lifetime: 0.8 } }
    matchPositions(frame(custom, 0.23).items, frame(custom, 1.03).items)
  })

  it('provides a frozen recipe frame and tolerates the full parsed particle range', () => {
    const frozen = { ...brush, animated: false }
    expect(frame(frozen, 0).items).toEqual(frame(frozen, 100).items)
    for (const particle of [
      { count: -1, lifetime: 0, velocity: -8, gravity: -900, spawn: 1 },
      { count: 100, lifetime: 300, velocity: 900, gravity: 900, spawn: 100 },
    ]) {
      const parsed = parseBrush({ ...brush, particle })!
      const result = frame(parsed)
      expect(result.items.length).toBeLessThanOrEqual(caps[brush.id])
      expect(result.items.every(item => Number.isFinite(item.x + item.y + item.size))).toBe(true)
    }
  })

  it('freezes through the actual engine when speed is zero', () => {
    const stroke = { id: 'weather', layerId: 'layer', brushSnapshot: { ...brush, speed: 0 }, points, seed: 7, createdAt: 0 }
    const first = strokeFrame(stroke, 100)
    expect(first.items.some(item => item.opacity > 0)).toBe(true)
    expect(strokeFrame(stroke, 100_000).items).toEqual(first.items)
  })
})

describe('weather appearance', () => {
  it('moves separate thin rain drops downward and responds to velocity', () => {
    const begin = (0.25 - phaseAtZero()) * rain.particle.lifetime
    const a = frame(rain, begin).items[0]
    const b = frame(rain, begin + 0.1).items[0]
    expect(b.y).toBeGreaterThan(a.y)
    expect(b.x).toBeGreaterThan(a.x)
    expect(frame(rain).items.every(item => item.kind === 'particle' && item.scaleY! > item.scaleX! * 8)).toBe(true)
    const stopped = { ...rain, particle: { ...rain.particle, velocity: 0 } }
    expect(frame(stopped, begin).items[0].y).toBe(frame(stopped, begin + 0.1).items[0].y)
  })

  it('uses one tintable soft alpha mask and rises while expanding smoothly', () => {
    expect(smoke.stamps).toHaveLength(1)
    expect(isShapeStamp(smoke.stamps[0])).toBe(true)
    const source = decodeURIComponent(stampPaintSrc(smoke.stamps[0]))
    expect(source).toContain('<radialGradient')
    expect(source).toContain('stop-opacity="0"')
    expect(source).not.toContain('<filter')
    expect(smoke.blurRadius).toBe(0)
    expect(smoke.glow).toBe(0)
    const begin = (0.25 - phaseAtZero()) * smoke.particle.lifetime
    const a = frame(smoke, begin).items[0]
    const b = frame(smoke, begin + 0.1).items[0]
    expect(b.y).toBeLessThan(a.y)
    expect(b.size * b.scaleX!).toBeGreaterThan(a.size * a.scaleX!)
    expect(frame(smoke).items.every(item => item.size % 4 === 0)).toBe(true)
    const maxKinds = new Set<number>()
    for (let step = 0; step <= 30; step++) {
      for (const item of frame(smoke, step / 10).items) maxKinds.add(item.size)
    }
    expect(maxKinds.size).toBeLessThanOrEqual(14)
  })
})
