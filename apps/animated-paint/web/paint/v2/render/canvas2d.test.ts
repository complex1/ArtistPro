import { describe, expect, it } from 'vitest'
import { DEFAULT_SHADOW } from '../core/defaults'
import type { DrawItem } from '../core/types'
import { canvas2dRenderer } from './canvas2d'

type Call = { op: string; args: number[] }

function stubContext() {
  const calls: Call[] = []
  const alphas: number[] = []
  const savedAlpha: number[] = []
  const record = (op: string) => (...args: number[]) => {
    calls.push({ op, args })
  }
  const context = {
    calls,
    alphas,
    globalAlpha: 1,
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    fillStyle: '',
    strokeStyle: '',
    filter: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    widths: [] as number[],
    save() { savedAlpha.push(context.globalAlpha) },
    restore() { context.globalAlpha = savedAlpha.pop()! },
    translate: record('translate'),
    rotate: record('rotate'),
    scale: record('scale'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    bezierCurveTo: record('bezierCurveTo'),
    fill() {
      calls.push({ op: 'fill', args: [] })
      alphas.push(context.globalAlpha)
    },
    drawImage: record('drawImage'),
    stroke() {
      calls.push({ op: 'stroke', args: [] })
      context.widths.push(context.lineWidth)
      alphas.push(context.globalAlpha)
    },
  }
  return context
}

function item(overrides: Partial<DrawItem>): DrawItem {
  return {
    x: 0,
    y: 0,
    size: 10,
    rotation: 0,
    opacity: 1,
    color: '#111111',
    stampIndex: 0,
    blur: 0,
    glow: 0,
    shadow: { ...DEFAULT_SHADOW },
    kind: 'stamp',
    ...overrides,
  }
}

describe('canvas2d renderer', () => {
  it('starts a separate contour without drawing a connector', () => {
    const context = stubContext()
    canvas2dRenderer.paint(context as unknown as CanvasRenderingContext2D, [
      item({ kind: 'segment', x: 0 }),
      item({ kind: 'segment', x: 10 }),
      item({ kind: 'segment', x: 100, breakBefore: true }),
      item({ kind: 'segment', x: 110 }),
    ], ['dot'])
    expect(context.calls.filter((call) => call.op === 'moveTo').map((call) => call.args)).toEqual([[0, 0], [100, 0]])
    expect(context.calls.filter((call) => call.op === 'lineTo').map((call) => call.args)).toEqual([[10, 0], [110, 0]])
  })

  it.each(['stamp', 'segment'] as const)('preserves parent alpha for %s marks', (kind) => {
    const context = stubContext()
    context.globalAlpha = 0.2
    canvas2dRenderer.paint(context as unknown as CanvasRenderingContext2D, [
      item({ kind, opacity: 0.5 }), item({ kind, opacity: 0.5, x: 10 }),
      item({ kind, opacity: 0.5, x: 20 }),
    ], ['dot'])
    expect(context.alphas.every((alpha) => alpha === 0.1)).toBe(true)
    expect(context.globalAlpha).toBe(0.2)
  })

  it('strokes connected segments instead of stamping dots', () => {
    const context = stubContext()
    canvas2dRenderer.paint(
      context as unknown as CanvasRenderingContext2D,
      [
        item({ kind: 'segment', x: 0, y: 0, size: 8 }),
        item({ kind: 'segment', x: 10, y: 0, size: 12 }),
        item({ kind: 'segment', x: 20, y: 0, size: 12 }),
      ],
      ['dot'],
    )

    const ops = context.calls.map((call) => call.op)
    expect(ops.filter((op) => op === 'stroke')).toHaveLength(2)
    expect(ops).not.toContain('arc')
    expect(context.widths[0]).toBe(10)
    expect(context.calls.filter((call) => call.op === 'lineTo')).toHaveLength(2)
  })

  it('falls back to a dot for a lone segment item', () => {
    const context = stubContext()
    canvas2dRenderer.paint(
      context as unknown as CanvasRenderingContext2D,
      [item({ kind: 'segment' })],
      ['dot'],
    )
    expect(context.calls.map((call) => call.op)).toContain('arc')
  })

  it('draws an uploaded image stamp fitted to the mark size', () => {
    class FakeImage {
      complete = true
      naturalWidth = 200
      naturalHeight = 100
      decoding = 'auto'
      src = ''
    }
    const original = globalThis.Image
    globalThis.Image = FakeImage as unknown as typeof Image
    try {
      const context = stubContext()
      canvas2dRenderer.paint(
        context as unknown as CanvasRenderingContext2D,
        [item({ kind: 'stamp', size: 10 })],
        ['data:image/png;base64,wide'],
      )
      const call = context.calls.find((entry) => entry.op === 'drawImage')
      expect(call?.args.slice(1)).toEqual([-5, -2.5, 10, 5])
      expect(context.calls.map((entry) => entry.op)).not.toContain('arc')
    } finally {
      globalThis.Image = original
    }
  })

  it('draws a shape stamp from a prefixed data URL', () => {
    class FakeImage {
      complete = true
      naturalWidth = 100
      naturalHeight = 100
      decoding = 'auto'
      src = ''
    }
    const original = globalThis.Image
    globalThis.Image = FakeImage as unknown as typeof Image
    try {
      const context = stubContext()
      canvas2dRenderer.paint(
        context as unknown as CanvasRenderingContext2D,
        [item({ kind: 'stamp', size: 8 })],
        ['shape:data:image/png;base64,mask'],
      )
      const call = context.calls.find((entry) => entry.op === 'drawImage')
      expect(call?.args.slice(1)).toEqual([-4, -4, 8, 8])
    } finally {
      globalThis.Image = original
    }
  })

  it('skips an image stamp that has not decoded yet', () => {
    class PendingImage {
      complete = false
      naturalWidth = 0
      naturalHeight = 0
      decoding = 'auto'
      src = ''
    }
    const original = globalThis.Image
    globalThis.Image = PendingImage as unknown as typeof Image
    try {
      const context = stubContext()
      canvas2dRenderer.paint(
        context as unknown as CanvasRenderingContext2D,
        [item({ kind: 'stamp' })],
        ['data:image/png;base64,pending'],
      )
      const ops = context.calls.map((entry) => entry.op)
      expect(ops).not.toContain('drawImage')
      expect(ops).not.toContain('arc')
    } finally {
      globalThis.Image = original
    }
  })

  it('still stamps stamp and particle items', () => {
    const context = stubContext()
    canvas2dRenderer.paint(
      context as unknown as CanvasRenderingContext2D,
      [item({ kind: 'stamp' }), item({ kind: 'particle', x: 5 })],
      ['dot'],
    )
    const ops = context.calls.map((call) => call.op)
    expect(ops.filter((op) => op === 'arc')).toHaveLength(2)
    expect(ops).not.toContain('stroke')
  })
})
