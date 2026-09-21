import { describe, it, expect, vi, afterEach } from 'vitest'
import { createBrushV2, createDocumentV2, emptyPoint } from '../core/defaults'
import { animationSourceHash } from '../core/animationTiming'
import { snapshotStroke } from '../input/sampler'
import { getBuiltinBrush } from '../presets'
import { parseBrush } from '../core/schema'
import { strokeTiming, nextDocumentFrame } from './timing'
import { RenderCache } from './renderCache'
import { strokeFrame } from './engine'
import { SceneDiffer, applyScenePatch } from './protocol'
import { createPaintScheduler } from './scheduler'
import type { StrokeV2 } from '../core/types'

const makeStroke = (id = 'graphiteCrawl') => snapshotStroke(getBuiltinBrush(id), [emptyPoint(0, 0), emptyPoint(100, 20, 2)], 'layer', 4)
const STATIC_RECIPE = `function animate(points, config) {
  return points.map(function(point, index) {
    return { x: point.x, y: point.y, kind: "segment", breakBefore: index === 0,
      size: config.size * (0.3 + point.pressure * 0.7), color: config.color,
      opacity: config.opacity };
  });
}`
const makeStaticRecipeStroke = () => snapshotStroke(createBrushV2({
  id: 'static-recipe-fixture', renderer: 'line', animated: true, spacing: 3,
  animationJs: STATIC_RECIPE,
  animationTiming: { mode: 'static', sourceHash: animationSourceHash(STATIC_RECIPE) },
}), [emptyPoint(0, 0), emptyPoint(100, 20, 2)], 'layer', 4)
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('animation scheduling', () => {
  it('holds stepped frames, honours speed, and upgrades old recipe snapshots', () => {
    const stroke = makeStroke()
    delete stroke.brushSnapshot.animationTiming
    expect(strokeTiming(stroke, 1, 1).key).toBe(strokeTiming(stroke, 100, 100).key)
    expect(strokeTiming(stroke, 145, 145).key).not.toBe(strokeTiming(stroke, 100, 100).key)
    stroke.brushSnapshot.speed = 2
    expect(strokeTiming(stroke, 80, 80).key).toBe('step:1')
  })
  it('does not freeze edited scripts or moving static brushes', () => {
    const stroke = makeStroke()
    stroke.brushSnapshot.animationJs += '\n// changed recipe'
    expect(strokeTiming(stroke, 20, 20).delay).toBe(0)
    stroke.brushSnapshot = createBrushV2({ animated: false, drift: 3 })
    expect(strokeTiming(stroke, 20, 20).delay).toBe(0)
    stroke.brushSnapshot.speed = 0
    expect(strokeTiming(stroke, 20, 20).delay).toBe(Infinity)
  })
  it('settles after the last point dries and resumes on a backward export seek', () => {
    const stroke = makeStroke('inkBloom')
    expect(strokeTiming(stroke, 999999, 4900).delay).toBe(0)
    expect(strokeTiming(stroke, 999999, 5000).delay).toBe(Infinity)
    expect(strokeTiming(stroke, 0, 0).delay).toBe(0)
    stroke.brushSnapshot.speed = 2
    expect(strokeTiming(stroke, 0, 3500).delay).toBe(Infinity)
  })
  it('round-trips timing metadata and ignores invisible animation', () => {
    const brush = getBuiltinBrush('graphiteCrawl')
    expect(parseBrush(JSON.parse(JSON.stringify(brush)))?.animationTiming).toEqual(brush.animationTiming)
    const doc = createDocumentV2()
    doc.layers[0].strokes = [makeStroke()]; doc.layers[0].visible = false
    expect(nextDocumentFrame(doc, 0)).toBe(Infinity)
  })
  it('round-trips static recipe timing and holds it from frame zero', () => {
    const stroke = makeStaticRecipeStroke()
    stroke.brushSnapshot = parseBrush(JSON.parse(JSON.stringify(stroke.brushSnapshot)))!
    expect(stroke.brushSnapshot.animationTiming?.mode).toBe('static')
    expect(stroke.brushSnapshot.animated).toBe(true)
    for (const time of [0, 750, 1500, 100_000]) {
      expect(strokeTiming(stroke, time, time)).toEqual({ key: 'static', delay: Infinity })
    }
    const doc = createDocumentV2()
    doc.layers[0].strokes = [stroke]
    expect(nextDocumentFrame(doc, 0)).toBe(Infinity)
    delete stroke.brushSnapshot.animationTiming
    expect(strokeTiming(stroke, 750, 750).delay).toBe(0)
  })
  it('does not freeze edited or drifting static recipes', () => {
    const stroke = makeStaticRecipeStroke()
    stroke.brushSnapshot.animationJs += '\n// edited static recipe'
    expect(strokeTiming(stroke, 750, 750).delay).toBe(0)
    expect(strokeTiming(stroke, 1500, 1500).key).not.toBe(strokeTiming(stroke, 750, 750).key)
    stroke.brushSnapshot = makeStaticRecipeStroke().brushSnapshot
    stroke.brushSnapshot.drift = 3
    expect(strokeTiming(stroke, 750, 750).delay).toBe(0)
    stroke.brushSnapshot.speed = 0
    expect(strokeTiming(stroke, 750, 750)).toEqual({ key: 'static', delay: Infinity })
  })
  it('keeps Speed Taper animating after drawing, while zero speed still pauses it', () => {
    const stroke = makeStroke('speedTaper')
    expect(stroke.brushSnapshot.animationTiming).toBeUndefined()
    const keys = new Set<string>()
    for (const time of [0, 750, 1500, 100_000]) {
      const timing = strokeTiming(stroke, time, time)
      expect(timing.delay).toBe(0)
      keys.add(timing.key)
    }
    expect(keys.size).toBe(4)
    const doc = createDocumentV2()
    doc.layers[0].strokes = [stroke]
    expect(nextDocumentFrame(doc, 100_000)).toBe(0)
    stroke.brushSnapshot.speed = 0
    expect(strokeTiming(stroke, 100_000, 100_000)).toEqual({ key: 'static', delay: Infinity })
    expect(nextDocumentFrame(doc, 100_000)).toBe(Infinity)
  })
  it('sleeps when static, wakes for an edit, and pauses in hidden tabs', () => {
    vi.useFakeTimers()
    const listeners = new Map<string, () => void>()
    const document = { hidden: false, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) }
    vi.stubGlobal('document', document)
    vi.stubGlobal('requestAnimationFrame', (fn: (t: number) => void) => setTimeout(() => fn(Date.now()), 1))
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const paint = vi.fn(() => Infinity)
    const scheduler = createPaintScheduler(paint)
    vi.advanceTimersByTime(1000); expect(paint).toHaveBeenCalledTimes(1)
    scheduler.invalidate(); vi.advanceTimersByTime(10); expect(paint).toHaveBeenCalledTimes(2)
    document.hidden = true; listeners.get('visibilitychange')!()
    scheduler.invalidate(); vi.advanceTimersByTime(1000); expect(paint).toHaveBeenCalledTimes(2)
    document.hidden = false; listeners.get('visibilitychange')!()
    vi.advanceTimersByTime(10); expect(paint).toHaveBeenCalledTimes(3)
    scheduler.dispose(); expect(listeners.size).toBe(0)
  })
})

describe('bounded frame cache', () => {
  it('reuses a static recipe across time and regenerates for point and configuration edits', () => {
    const cache = new RenderCache(), stroke = makeStaticRecipeStroke()
    const generate = vi.fn((points: StrokeV2['points']) => strokeFrame(stroke, 0, 0, points))
    const get = (time: number) => cache.frame(stroke, strokeTiming(stroke, time, time).key, generate).frame
    const initial = get(0)
    expect(initial.items.length).toBeGreaterThan(0)
    expect(get(750)).toBe(initial)
    expect(get(1500)).toBe(initial)
    expect(generate).toHaveBeenCalledTimes(1)

    stroke.points.push(emptyPoint(200, 50, 3))
    const appended = get(1500)
    expect(appended).not.toBe(initial)
    expect(appended.items.at(-1)!.x).toBeGreaterThan(initial.items.at(-1)!.x + 50)

    stroke.brushSnapshot.color = '#f654ab'
    const recolored = get(1500)
    expect(recolored).not.toBe(appended)
    expect(recolored.items.every((item) => item.color === '#f654ab')).toBe(true)

    stroke.points[0].x = 45
    stroke.geometryRevision = 1
    expect(get(1500).items[0].x).toBe(45)
    expect(generate).toHaveBeenCalledTimes(4)
  })
  it('regenerates animated Speed Taper widths across time and after a backward seek', () => {
    const cache = new RenderCache(), stroke = makeStroke('speedTaper')
    let clock = 0
    const generate = vi.fn((points: StrokeV2['points']) => strokeFrame(stroke, clock, clock, points))
    const get = (time: number) => {
      clock = time
      return cache.frame(stroke, strokeTiming(stroke, time, time).key, generate).frame
    }
    const initial = get(0)
    expect(get(0)).toBe(initial)
    const middle = get(750)
    expect(middle.items.map((item) => item.size)).not.toEqual(initial.items.map((item) => item.size))
    const later = get(1500)
    expect(later.items.map((item) => item.size)).not.toEqual(middle.items.map((item) => item.size))
    expect(get(0).items).toEqual(initial.items)
    expect(generate).toHaveBeenCalledTimes(4)
  })
  it('reuses held geometry and invalidates append, point edits, config and seed', () => {
    const cache = new RenderCache(), stroke = makeStroke()
    const generate = vi.fn((points: StrokeV2['points']) => strokeFrame(stroke, 0, 0, points))
    const get = () => cache.frame(stroke, 'step:0', generate)
    const a = get().frame
    expect(get().frame).toBe(a); expect(generate).toHaveBeenCalledTimes(1)
    stroke.points.push(emptyPoint(200, 50)); expect(get().frame).not.toBe(a)
    stroke.points[0].x = 45; stroke.geometryRevision = 1; get()
    stroke.brushSnapshot.size = 30; get()
    stroke.seed++; get()
    expect(generate).toHaveBeenCalledTimes(5)
  })
  it('evicts over-budget entries and deleted strokes', () => {
    const cache = new RenderCache(1), stroke = makeStroke()
    cache.begin(); cache.frame(stroke, '0', points => strokeFrame(stroke, 0, 0, points))
    expect(cache.bytes).toBe(0)
    cache.end()
    expect(cache.bytes).toBe(0)
    const normal = new RenderCache()
    normal.begin(); normal.frame(stroke, '0', points => strokeFrame(stroke, 0, 0, points)); normal.end()
    expect(normal.bytes).toBeGreaterThan(0)
    normal.begin(); normal.end(); expect(normal.bytes).toBe(0)
  })
  it('protects sampled geometry from a script mutating its arguments', () => {
    const stroke = makeStroke()
    stroke.brushSnapshot.animationJs = 'function animate(points) { points[0].x += 20; return [{x:points[0].x,y:0}]; }'
    const cache = new RenderCache()
    const generate = (points: StrokeV2['points']) => strokeFrame(stroke, 0, 0, points)
    expect(cache.frame(stroke, '0', generate).frame.items[0].x).toBe(20)
    expect(cache.frame(stroke, '1', generate).frame.items[0].x).toBe(20)
  })
})

describe('incremental worker scene', () => {
  it('sends appended points once and reconstructs edits, deletion and undo', () => {
    const differ = new SceneDiffer(), doc = createDocumentV2(), strokes = new Map<string, StrokeV2>()
    const stroke = makeStroke(); doc.layers[0].strokes = [stroke]
    const apply = () => { const patch = differ.diff(doc); return { patch, doc: applyScenePatch(structuredClone(patch), strokes) } }
    expect(apply().patch.strokes).toHaveLength(1)
    expect(apply().patch.strokes).toHaveLength(0)
    stroke.points.push(emptyPoint(250, 30))
    const tail = apply(); expect(tail.patch.append[0].points).toHaveLength(1)
    expect(tail.doc.layers[0].strokes[0].points).toEqual(stroke.points)
    stroke.points = [emptyPoint(80, 20)]
    expect(apply().patch.strokes).toHaveLength(1)
    doc.layers[0].strokes = []; apply(); expect(strokes.size).toBe(0)
    doc.layers[0].strokes = [stroke]; expect(apply().patch.strokes).toHaveLength(1)
  })
})
