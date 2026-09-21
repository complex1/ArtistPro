import { describe, expect, it } from 'vitest'
import { createBrushV2, createDocumentV2, createImageLayerV2 } from './defaults'
import { packDrawList, unpackDrawList } from './pack'
import { parseBrush, parseDocument, parseDrawList, parseLayer } from './schema'
import type { DrawItem } from './types'

describe('paint v2 contracts', () => {
  it('preserves contour breaks through validation and packing', () => {
    const items = parseDrawList([
      { x: 0, y: 0, kind: 'segment' },
      { x: 10, y: 0, kind: 'segment', breakBefore: true },
    ])
    expect(unpackDrawList(packDrawList(items)).map((item) => item.breakBefore)).toEqual([false, true])
    // Older packed lists have no break flag, and must remain continuous.
    const packed = packDrawList([items[1]])
    expect(unpackDrawList({ items: packed.items.slice(0, 20), count: 1, stride: 20 })[0].breakBefore).toBe(false)
  })

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

  it('round-trips image pixels and editable placement without flattening them', () => {
    const document = createDocumentV2()
    const image = {
      dataUrl: 'data:image/png;base64,original', naturalWidth: 1200, naturalHeight: 800,
      x: -15.5, y: 46, width: 300, height: 200,
    }
    const layer = createImageLayerV2('Reference', image)
    layer.opacity = 0.7
    layer.blendMode = 'multiply'
    document.layers.push(layer)
    document.activeLayerId = layer.id
    const restored = parseDocument(JSON.parse(JSON.stringify(document)))!
    expect(restored.layers[1]).toEqual(layer)
    expect(restored.activeLayerId).toBe(layer.id)
    expect(restored.layers[1].rasterDataUrl).toBeNull()
    layer.image!.x = 99
    expect(image.x).toBe(-15.5)
  })

  it('keeps legacy raster layers as drawing layers at their original location', () => {
    const layer = parseLayer({ id: 'old', rasterDataUrl: 'data:image/png;base64,legacy',
      eraseMaskDataUrl: 'data:image/png;base64,mask', strokes: [] })!
    expect(layer.kind).toBe('drawing')
    expect(layer.image).toBeUndefined()
    expect(layer.rasterDataUrl).toBe('data:image/png;base64,legacy')
    expect(layer.eraseMaskDataUrl).toBe('data:image/png;base64,mask')
  })

  it('sanitizes imported image placement and falls back safely for missing source metadata', () => {
    const image = { dataUrl: 'data:image/png;base64,source', naturalWidth: 800, naturalHeight: 600,
      x: NaN, y: Infinity, width: -10, height: Infinity }
    expect(parseLayer({ kind: 'image', image })?.image).toMatchObject({
      x: 0, y: 0, width: 0.5, height: 600,
    })
    for (const invalid of [undefined, { ...image, dataUrl: 'https://example.com/image.png' },
      { ...image, naturalWidth: 0 }, { ...image, naturalHeight: NaN }]) {
      const layer = parseLayer({ kind: 'image', image: invalid, rasterDataUrl: 'legacy' })!
      expect(layer.kind).toBe('drawing')
      expect(layer.image).toBeUndefined()
      expect(layer.rasterDataUrl).toBe('legacy')
    }
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
