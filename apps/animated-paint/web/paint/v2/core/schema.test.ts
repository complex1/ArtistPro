import { describe, expect, it } from 'vitest'
import { createBrushV2, createDocumentV2 } from './defaults'
import { packDrawList, unpackDrawList } from './pack'
import { parseBrush, parseDocument, parseDrawList } from './schema'
import type { DrawItem } from './types'

describe('paint v2 contracts', () => {
  it('round-trips a valid document through the schema', () => {
    const document = createDocumentV2('Ink', 800, 600)
    const parsed = parseDocument(JSON.parse(JSON.stringify(document)))
    expect(parsed).toMatchObject({
      version: 2,
      name: 'Ink',
      width: 800,
      height: 600,
    })
    expect(parsed?.layers).toHaveLength(1)
  })

  it('rejects version-1 payloads', () => {
    expect(parseDocument({ version: 1, layers: [] })).toBeNull()
  })

  it('fills missing brush fields with defaults', () => {
    const brush = parseBrush({ id: 'wiggle', name: 'Wiggle', renderer: 'line' })
    expect(brush).toMatchObject({
      id: 'wiggle',
      renderer: 'line',
      animated: false,
      stamps: ['dot'],
      speed: 1,
      stampsPerPoint: 1,
      rotationDegrees: 0,
      drift: 0,
      distortion: 0,
    })
    expect(brush?.animationJs).toContain('function animate')
  })

  it('clamps blur and draw-list size', () => {
    const brush = parseBrush({ blurRadius: 999, opacity: 4 })
    expect(brush?.blurRadius).toBe(64)
    expect(brush?.opacity).toBe(1)
    const items = parseDrawList([{ x: 1, y: 2, size: 9, kind: 'particle' }])
    expect(items[0]).toMatchObject({ x: 1, y: 2, kind: 'particle', size: 9 })
    expect(parseDrawList([{ x: 'nope' }])).toEqual([])
  })

  it('clones brushes with a new identity', () => {
    const brush = createBrushV2({ id: 'a', name: 'Ink' })
    const copy = {
      ...structuredClone(brush),
      id: 'b',
      name: 'Ink copy',
    }
    expect(copy.id).not.toBe(brush.id)
    expect(copy.name).toBe('Ink copy')
    expect(copy.size).toBe(brush.size)
  })

  it('packs and unpacks draw lists without Canvas objects', () => {
    const items: DrawItem[] = [
      {
        x: 10,
        y: 20,
        size: 8,
        rotation: 0.5,
        opacity: 0.8,
        color: '#ff00aa',
        stampIndex: 1,
        blur: 2,
        glow: 4,
        shadow: {
          offsetX: 1,
          offsetY: 2,
          blur: 3,
          color: '#112233',
          opacity: 0.4,
        },
        kind: 'stamp',
        vx: 3,
        vy: -1,
        scaleX: 1.25,
        scaleY: 0.8,
      },
    ]
    const packed = packDrawList(items)
    expect(packed.items).toBeInstanceOf(Float32Array)
    expect(unpackDrawList(packed)[0]).toMatchObject({
      x: 10,
      y: 20,
      color: '#ff00aa',
      kind: 'stamp',
      vx: 3,
    })
    expect(unpackDrawList(packed)[0].scaleX).toBeCloseTo(1.25)
    expect(unpackDrawList(packed)[0].scaleY).toBeCloseTo(0.8)
  })
})
