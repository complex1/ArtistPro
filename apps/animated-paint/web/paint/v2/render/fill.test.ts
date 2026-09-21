import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyPoint } from '../core/defaults'
import type { StrokeV2 } from '../core/types'
import { DEFAULT_BUDGETS } from '../core/types'
import { snapshotStroke } from '../input/sampler'
import { getBuiltinBrush } from '../presets'
import { strokeFrame } from './engine'
import { canClosePath, createFillTexture, paintStrokeFill, sampleClosedPath } from './fill'
import { RenderCache } from './renderCache'
import { strokeTiming } from './timing'

const square = () => [emptyPoint(20, 30), emptyPoint(180, 30), emptyPoint(180, 150), emptyPoint(20, 150)]
function stroke(id = 'wiggle') {
  const brush = getBuiltinBrush(id)
  brush.closedPath = true; brush.fill = { enabled: true, outline: false }
  return snapshotStroke(brush, square(), 'layer', 92)
}
function contextStub() {
  const fills: { rule: string | undefined; alpha: number; style: unknown }[] = []
  const saved: { alpha: number; style: unknown }[] = []
  const context = {
    canvas: { width: 240, height: 200 }, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '' as unknown,
    save() { saved.push({ alpha: this.globalAlpha, style: this.fillStyle }) },
    restore() { const value = saved.pop()!; this.globalAlpha = value.alpha; this.fillStyle = value.style },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {},
    createPattern: vi.fn(() => ({ pattern: true })),
    fill(rule?: string) { fills.push({ rule, alpha: this.globalAlpha, style: this.fillStyle }) },
  }
  return { context: context as unknown as CanvasRenderingContext2D, fills }
}
afterEach(() => vi.unstubAllGlobals())

describe('closed brush contours', () => {
  it('adds the missing closing edge, preserves corners and bounds sampling', () => {
    const coarse = sampleClosedPath(square(), 1000)
    expect(coarse).toEqual([...square(), square()[0]])
    const long = sampleClosedPath(square().map(point => ({ ...point, x: point.x * 1000, y: point.y * 1000 })), 0.5)
    expect(long.length).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxSampledPoints)
    expect(long.at(-1)).toEqual(long[0])
    expect(long.some(point => point.x === 20000 && point.y > 30000 && point.y < 150000)).toBe(true)
  })
  it('admits crossing paths but rejects repeated points and straight lines', () => {
    expect(canClosePath([emptyPoint(0, 0), emptyPoint(2, 2), emptyPoint(0, 2), emptyPoint(2, 0)])).toBe(true)
    expect(canClosePath([emptyPoint(1, 1), emptyPoint(1, 1), emptyPoint(1, 1)])).toBe(false)
    expect(canClosePath([emptyPoint(0, 0), emptyPoint(10, 10), emptyPoint(20, 20)])).toBe(false)
  })
  it.each(['round', 'marker', 'wiggle', 'wave', 'boil', 'textureBoil', 'graphiteCrawl'])(
    '%s produces a separate filled contour with an exact closing join', id => {
      const mark = stroke(id)
      mark.brushSnapshot.drift = 3; mark.brushSnapshot.scatter.across = 2
      const frame = strokeFrame(mark, 420)
      expect(frame.items).toHaveLength(0)
      expect(frame.fill?.boundary.length).toBeGreaterThan(4)
      expect(frame.fill?.boundary.at(-1)).toEqual(frame.fill?.boundary[0])
      expect(frame.fill?.opacity).toBe(mark.brushSnapshot.opacity)
    })
  it('preserves visible unfilled marks for degenerate and unsupported paths', () => {
    const mark = stroke()
    mark.points = [emptyPoint(0, 0), emptyPoint(20, 0), emptyPoint(100, 0)]
    expect(strokeFrame(mark, 0).fill).toBeUndefined()
    expect(strokeFrame(mark, 0).items.length).toBeGreaterThan(1)
    const unsupported = stroke('star')
    expect(strokeFrame(unsupported, 0).fill).toBeUndefined()
    expect(strokeFrame(unsupported, 0).items.length).toBeGreaterThan(0)
  })
  it('closes outlines without filling and preserves the optional textured border', () => {
    const mark = stroke('wave')
    mark.brushSnapshot.fill.enabled = false
    const frame = strokeFrame(mark, 200)
    expect(frame.fill).toBeUndefined()
    expect(frame.items[0]).toEqual(frame.items.at(-1))
    const textured = stroke('textureBoil')
    textured.brushSnapshot.fill.outline = true
    expect(strokeFrame(textured, 200).items.some(item => item.kind === 'stamp')).toBe(true)
  })
  it('keeps texture border rotation, distortion and stamp copies within the draw budget', () => {
    const mark = stroke('graphiteCrawl')
    mark.brushSnapshot.fill.outline = true
    const original = strokeFrame(mark, 125)
    mark.brushSnapshot.rotationDegrees = 45
    mark.brushSnapshot.distortion = 0.7
    mark.brushSnapshot.stampsPerPoint = 2
    const changed = strokeFrame(mark, 125)
    expect(changed.items.length).toBe(Math.min(DEFAULT_BUDGETS.maxDrawItems, original.items.length * 2))
    expect(changed.items[0].rotation - original.items[0].rotation).toBeCloseTo(Math.PI / 4)
    expect(changed.items[0].scaleX).not.toBe(original.items[0].scaleX)
    expect(changed.fill?.boundary).toEqual(original.fill?.boundary)
    mark.brushSnapshot.stampsPerPoint = 32
    expect(strokeFrame(mark, 125).items.length).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxDrawItems)
  })
  it.each([['boil', 12], ['textureBoil', 12], ['graphiteCrawl', 7]] as const)(
    '%s holds the same fill geometry and texture clock until the next cel, including speed', (id, fps) => {
      const mark = stroke(id)
      mark.brushSnapshot.speed = 2
      const duration = 1000 / fps / 2
      const early = strokeFrame(mark, duration * 0.1), late = strokeFrame(mark, duration * 0.9)
      expect(early.fill).toEqual(late.fill)
      expect(strokeFrame(mark, duration * 1.1).fill).not.toEqual(early.fill)
      mark.brushSnapshot.speed = 0
      expect(strokeFrame(mark, 900).fill).toEqual(strokeFrame(mark, 5000).fill)
      expect(strokeTiming(mark, 5000, 5000).delay).toBe(Infinity)
    })
})

describe('fill compositing and cache', () => {
  it('applies opacity once and the even-odd winding rule while restoring destination state', () => {
    const fill = strokeFrame(stroke('round'), 0).fill!
    fill.opacity = 0.4
    const { context, fills } = contextStub()
    context.globalAlpha = 0.5
    paintStrokeFill(context, fill)
    expect(fills).toEqual([{ rule: 'evenodd', alpha: 0.2, style: fill.color }])
    expect(context.globalAlpha).toBe(0.5)
  })
  it('keeps tile dimensions bounded independently of shape area and fills through a repeating pattern', () => {
    const { context } = contextStub()
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
    const mark = stroke('textureBoil'), fill = strokeFrame(mark, 0).fill!
    fill.size = 10000
    const tile = createFillTexture(fill)!
    expect(tile.width).toBeLessThanOrEqual(96); expect(tile.height).toBeLessThanOrEqual(96)
    paintStrokeFill(context, fill, tile)
    expect(context.createPattern).toHaveBeenCalledWith(tile, 'repeat')
  })
  it('reuses sampled closed geometry and held tiles; accounts for and releases their memory', () => {
    const { context } = contextStub(), tileContext = contextStub().context
    const create = vi.fn(() => ({ getContext: () => tileContext }))
    vi.stubGlobal('document', { createElement: create })
    const mark = stroke('textureBoil'), cache = new RenderCache(), renderer = { paint: vi.fn() }
    const generatedSamples: StrokeV2['points'][] = []
    const get = (time: number) => cache.frame(mark, strokeTiming(mark, time, time).key, sampled => {
      generatedSamples.push(sampled); return strokeFrame(mark, time, time, sampled)
    })
    cache.begin()
    const first = get(1), geometryBytes = cache.bytes
    cache.paint(context, first, ['dot'], renderer, true, 0)
    expect(cache.bytes).toBeGreaterThan(geometryBytes)
    cache.paint(context, get(2), ['dot'], renderer, true, 0)
    expect(create).toHaveBeenCalledTimes(1)
    cache.paint(context, get(150), ['dot'], renderer, true, 0)
    expect(generatedSamples[0]).toBe(generatedSamples[1])
    expect(create).toHaveBeenCalledTimes(2)
    mark.brushSnapshot.fill.enabled = false
    expect(get(150).frame.fill).toBeUndefined()
    cache.end(); cache.begin(); cache.end()
    expect(cache.bytes).toBe(0)
  })
  it('does not retain tiles outside the budget or leave detached-entry accounting behind', () => {
    const { context } = contextStub(), tileContext = contextStub().context
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => tileContext }) })
    const mark = stroke('textureBoil'), cache = new RenderCache(1)
    cache.begin()
    const entry = cache.frame(mark, '0', sampled => strokeFrame(mark, 0, 0, sampled))
    cache.paint(context, entry, ['dot'], { paint() {} }, true, 0)
    expect(cache.bytes).toBe(0)
    cache.clear(); expect(cache.bytes).toBe(0)
  })
})
