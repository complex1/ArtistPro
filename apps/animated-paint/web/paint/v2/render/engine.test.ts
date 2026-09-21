import { describe, expect, it } from 'vitest'
import { createBrushV2, createDocumentV2 } from '../core/defaults'
import { emptyPoint } from '../core/defaults'
import { snapshotStroke } from '../input/sampler'
import { packDrawList } from '../core/pack'
import { staticDrawList } from '../animation/staticDrawList'
import { renderDocumentV2, strokeFrame } from './engine'
import type { DrawItem } from '../core/types'
import { canvas2dRenderer } from './canvas2d'

function contextStub() {
  const composites: string[] = []
  const drawn: unknown[] = []
  const drawAlphas: number[] = []
  return {
    canvas: { tag: 'scratch' },
    composites,
    drawn,
    drawAlphas,
    globalAlpha: 1,
    fillStyle: '',
    get globalCompositeOperation() {
      return composites[composites.length - 1] ?? 'source-over'
    },
    set globalCompositeOperation(value: string) {
      composites.push(value)
    },
    save() {},
    restore() {},
    setTransform() {},
    fillRect() {},
    clearRect() {},
    drawImage(source: unknown) {
      drawn.push(source)
      drawAlphas.push(this.globalAlpha)
    },
  }
}

describe('v2 canvas renderer contracts', () => {
  it('passes a separate stroke age and scales it with speed', () => {
    const stroke = snapshotStroke(createBrushV2({
      animated: true, speed: 2,
      animationJs: 'function animate(points, config, time, age) { return [{ x: time, y: age }]; }',
    }), [emptyPoint(0, 0)], 'layer')
    expect(strokeFrame(stroke, 90000, 500).items[0]).toMatchObject({ x: 180, y: 1 })
    expect(strokeFrame(stroke, 90000, -500).items[0].y).toBe(0)
    expect(strokeFrame(stroke, 1000).items[0]).toMatchObject({ x: 2, y: 2 })
  })

  it('uses creation time live, and replays strokes from zero for export', () => {
    const document = createDocumentV2()
    const layer = document.layers[0]
    const brush = createBrushV2({ animated: true,
      animationJs: 'function animate(points, config, time, age) { return [{ x: age, y: 0 }]; }',
    })
    layer.strokes = [snapshotStroke(brush, [emptyPoint(0, 0)], layer.id)]
    layer.strokes[0].createdAt = 100000
    const painted: number[] = []
    const renderer = { paint: (_context: CanvasRenderingContext2D, items: DrawItem[]) => { painted.push(items[0].x) } }
    const context = contextStub() as unknown as CanvasRenderingContext2D
    renderDocumentV2(context, document, 9000, new Map(), undefined, renderer, 100500)
    renderDocumentV2(context, document, 0, new Map(), undefined, renderer)
    renderDocumentV2(context, document, 500, new Map(), undefined, renderer)
    expect(painted).toEqual([0.5, 0, 0.5])
  })

  it('fades an unmasked layer once after painting all its grain', () => {
    const document = createDocumentV2()
    const layer = document.layers[0]
    layer.opacity = 0.2
    layer.strokes = [snapshotStroke(createBrushV2(), [emptyPoint(0, 0)], layer.id)]
    const page = contextStub()
    const scratch = contextStub()
    const originalDocument = globalThis.document
    Object.defineProperty(globalThis, 'document', { configurable: true,
      value: { createElement: () => ({ getContext: () => scratch }) },
    })
    const alphas: number[] = []
    try {
      renderDocumentV2(page as unknown as CanvasRenderingContext2D, document, 0, new Map(), undefined,
        { paint: (context) => { alphas.push(context.globalAlpha) } })
    } finally {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    }
    expect(alphas).toEqual([1])
    expect(page.drawn).toContain(scratch.canvas)
    expect(page.drawAlphas).toEqual([0.2])
  })

  it('emits packed draw commands for a static stroke', () => {
    const brush = createBrushV2({ renderer: 'stamp', spacing: 8, size: 6 })
    const stroke = snapshotStroke(
      brush,
      [emptyPoint(0, 0, 0), emptyPoint(24, 0, 0.1)],
      'layer',
      3,
    )
    const frame = strokeFrame(stroke, 0)
    expect(frame.packed.items).toBeInstanceOf(Float32Array)
    expect(frame.items.length).toBeGreaterThan(1)
    expect(frame.items[0]).toMatchObject({ kind: 'stamp' })
  })

  it('uses the animation function when the brush is animated', () => {
    const brush = createBrushV2({
      animated: true,
      animationJs: `function animate(points, config, time) {
        return [{ x: points[0].x, y: time * 10, size: config.size, kind: "particle" }];
      }`,
    })
    const stroke = snapshotStroke(brush, [emptyPoint(5, 6)], 'layer', 1)
    const a = strokeFrame(stroke, 1000)
    const b = strokeFrame(stroke, 1000)
    expect(a.items).toEqual(b.items)
    expect(a.items[0]?.kind).toBe('particle')
  })

  it('uses speed to scale continuous animation time', () => {
    const brush = createBrushV2({
      animated: true,
      speed: 2.5,
      animationJs: `function animate(points, config, time) {
        return [{ x: time, y: 0, size: config.size, kind: "stamp" }];
      }`,
    })
    const stroke = snapshotStroke(brush, [emptyPoint(0, 0)], 'layer', 1)
    expect(strokeFrame(stroke, 2000).items[0]?.x).toBe(5)
  })

  it('applies stamp count, angle, drift, and distortion', () => {
    const brush = createBrushV2({
      renderer: 'stamp',
      stamps: ['star', 'heart'],
      stampsPerPoint: 3,
      rotationDegrees: 90,
      drift: 8,
      distortion: 0.5,
    })
    const stroke = snapshotStroke(brush, [emptyPoint(10, 10)], 'layer', 7)
    const first = strokeFrame(stroke, 0)
    const later = strokeFrame(stroke, 1000)

    expect(first.items).toHaveLength(3)
    expect(first.items.map((item) => item.stampIndex)).toEqual([0, 1, 0])
    expect(first.items[0].rotation).toBeCloseTo(Math.PI / 2)
    expect(first.items[0].scaleX).not.toBe(1)
    expect(first.items[0].scaleY).not.toBe(1)
    expect(later.items[0].x).not.toBe(first.items[0].x)
  })

  it('keeps last good items when animation throws', () => {
    const brush = createBrushV2({
      animated: true,
      animationJs: `function animate(points) {
        return [{ x: points[0].x, y: 1, size: 4 }];
      }`,
    })
    const stroke = snapshotStroke(brush, [emptyPoint(2, 3)], 'layer', 1)
    strokeFrame(stroke, 0)
    stroke.brushSnapshot.animationJs = 'function animate() { throw new Error("boom"); }'
    const failed = strokeFrame(stroke, 16)
    expect(failed.items[0]?.x).toBe(2)
    expect(failed.diagnostics[0]?.code).toBe('animate-error')
  })

  it('static particle lists stay canvas-free', () => {
    const items = staticDrawList(
      [emptyPoint(0, 0), emptyPoint(10, 0)],
      createBrushV2({ renderer: 'particle', particle: { count: 3, lifetime: 1, velocity: 4, gravity: 2, spawn: 1 } }),
      9,
    )
    expect(items.every((item: DrawItem) => item.kind === 'particle')).toBe(true)
    expect(packDrawList(items).count).toBe(items.length)
    expect(canvas2dRenderer.paint).toBeTypeOf('function')
  })

  it('stamps the segments a stamp brush animation returns', () => {
    const brush = createBrushV2({
      renderer: 'stamp',
      stamps: ['data:image/png;base64,AAA'],
      animated: true,
      animationJs: `function animate(points, config) {
        return points.map(function (p) {
          return { x: p.x, y: p.y, size: config.size, kind: "segment" };
        });
      }`,
    })
    const stroke = snapshotStroke(brush, [emptyPoint(0, 0), emptyPoint(20, 0)], 'layer', 1)
    const frame = strokeFrame(stroke, 0)
    expect(frame.items.length).toBeGreaterThan(0)
    expect(frame.items.every((item: DrawItem) => item.kind === 'stamp')).toBe(true)
  })

  it('leaves segments alone for line brushes', () => {
    const brush = createBrushV2({
      renderer: 'line',
      animated: true,
      animationJs: `function animate(points, config) {
        return points.map(function (p) {
          return { x: p.x, y: p.y, size: config.size, kind: "segment" };
        });
      }`,
    })
    const stroke = snapshotStroke(brush, [emptyPoint(0, 0), emptyPoint(20, 0)], 'layer', 1)
    expect(strokeFrame(stroke, 0).items[0]?.kind).toBe('segment')
  })

  it('erases vector strokes through the layer mask', () => {
    const document = createDocumentV2('Erase', 20, 20)
    const layer = document.layers[0]
    layer.strokes = [
      snapshotStroke(
        createBrushV2({ renderer: 'line' }),
        [emptyPoint(0, 0), emptyPoint(10, 0)],
        layer.id,
        1,
      ),
    ]

    const page = contextStub()
    const scratch = contextStub()
    const mask = { tag: 'mask' } as unknown as HTMLCanvasElement
    const painted: unknown[] = []

    const originalDocument = globalThis.document
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: () => ({ getContext: () => scratch }) },
    })
    try {
      renderDocumentV2(
        page as unknown as CanvasRenderingContext2D,
        document,
        0,
        new Map(),
        new Map([[layer.id, mask]]),
        { paint: (context) => painted.push(context) },
      )
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      })
    }

    expect(painted).toEqual([scratch])
    expect(scratch.composites).toContain('destination-out')
    expect(scratch.drawn).toContain(mask)
    expect(page.drawn).toContain(scratch.canvas)
  })

  it('does not update old strokes when the library brush changes', () => {
    const brush = createBrushV2({
      animated: true,
      size: 8,
      animationJs: `function animate(points, config) {
        return [{ x: 0, y: 0, size: config.size }];
      }`,
    })
    const stroke = snapshotStroke(brush, [emptyPoint(0, 0)], 'layer', 1)
    brush.size = 40
    expect(strokeFrame(stroke, 0).items[0]?.size).toBe(8)
  })
})
