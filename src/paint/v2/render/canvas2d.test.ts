import { describe, expect, it } from 'vitest'
import { DEFAULT_SHADOW } from '../core/defaults'
import type { DrawItem } from '../core/types'
import { canvas2dRenderer } from './canvas2d'

type Call = { op: string; args: number[] }

function stubContext() {
  const calls: Call[] = []
  const record = (op: string) => (...args: number[]) => {
    calls.push({ op, args })
  }
  const context = {
    calls,
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
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    scale: record('scale'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    bezierCurveTo: record('bezierCurveTo'),
    fill: record('fill'),
    drawImage: record('drawImage'),
    stroke() {
      calls.push({ op: 'stroke', args: [] })
      context.widths.push(context.lineWidth)
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
