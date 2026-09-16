import { describe, expect, it } from 'vitest'
import { createDrawingDocument, validateDocument } from './document'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

describe('Drawing Canvas portable documents', () => {
  it('creates a named, independent canvas with one empty editable layer', () => {
    const first = createDrawingDocument('  Sketchbook  ', 800, 600)
    const second = createDrawingDocument(' ')
    expect(first).toMatchObject({ version: 1, name: 'Sketchbook', width: 800, height: 600, background: '#ffffff' })
    expect(first.layers).toEqual([{ id: first.activeLayerId, name: 'Layer 1', visible: true, locked: false, opacity: 1, blendMode: 'source-over', dataUrl: null }])
    expect(second.name).toBe('Untitled canvas')
    expect(second.activeLayerId).not.toBe(first.activeLayerId)
  })

  it('round-trips layers in paint order and copies imported object structures', () => {
    const original = createDrawingDocument('Layered', 1, 1)
    original.layers[0].dataUrl = PNG_1PX
    original.layers.push({ ...original.layers[0], id: 'second', name: 'Highlights', blendMode: 'screen', opacity: .4, visible: false, locked: true })
    original.activeLayerId = 'second'
    original.background = null
    const validated = validateDocument(JSON.parse(JSON.stringify(original)))
    expect(validated).toEqual(original)
    validated.layers[0].name = 'Changed'
    expect(original.layers[0].name).toBe('Layer 1')
  })

  it.each([0, -1, 1.5, 4097, NaN, Infinity, '1024', null])('rejects invalid canvas dimensions: %s', (width) => {
    expect(() => validateDocument({ ...createDrawingDocument(), width })).toThrow('Canvas width')
    expect(() => validateDocument({ ...createDrawingDocument(), height: width })).toThrow('Canvas height')
  })

  it.each([null, [], {}, { version: 2 }, 'canvas'])('rejects unknown document shapes and versions', (value) => {
    expect(() => validateDocument(value)).toThrow()
  })

  it('rejects invalid names, colors, layer counts, and missing active layers', () => {
    const doc = createDrawingDocument()
    expect(() => validateDocument({ ...doc, name: '' })).toThrow('Canvas name')
    expect(() => validateDocument({ ...doc, name: 'x'.repeat(121) })).toThrow('Canvas name')
    expect(() => validateDocument({ ...doc, background: 'url(https://example.com)' })).toThrow('background')
    expect(() => validateDocument({ ...doc, layers: [] })).toThrow('between 1 and 32')
    expect(() => validateDocument({ ...doc, layers: Array.from({ length: 33 }, (_, i) => ({ ...doc.layers[0], id: `layer-${i}` })) })).toThrow('between 1 and 32')
    expect(() => validateDocument({ ...doc, activeLayerId: 'missing' })).toThrow('does not exist')
    expect(() => validateDocument({ ...doc, layers: [doc.layers[0], doc.layers[0]] })).toThrow('unique ID')
  })

  it.each([
    ['opacity', -1], ['opacity', 1.01], ['opacity', NaN], ['opacity', Infinity],
    ['visible', 1], ['locked', 'false'], ['blendMode', 'unknown'], ['name', ''], ['id', ''],
  ])('rejects invalid layer %s values', (key, value) => {
    const doc = createDrawingDocument()
    expect(() => validateDocument({ ...doc, layers: [{ ...doc.layers[0], [key]: value }] })).toThrow()
  })

  it('rejects remote or disguised content and verifies embedded PNG dimensions before decoding', () => {
    const doc = createDrawingDocument('Pixel', 1, 1)
    for (const dataUrl of ['https://example.com/art.png', 'data:image/svg+xml,<svg/>', 'data:image/png;base64,bm90IGEgcG5n', 14, undefined]) {
      expect(() => validateDocument({ ...doc, layers: [{ ...doc.layers[0], dataUrl }] })).toThrow()
    }
    expect(() => validateDocument({ ...doc, width: 2, layers: [{ ...doc.layers[0], dataUrl: PNG_1PX }] })).toThrow('image dimensions must match')
    expect(validateDocument({ ...doc, layers: [{ ...doc.layers[0], dataUrl: PNG_1PX }] }).layers[0].dataUrl).toBe(PNG_1PX)
  })

  it('removes unrelated imported properties', () => {
    const doc = createDrawingDocument()
    const value = validateDocument({ ...doc, script: 'untrusted', layers: [{ ...doc.layers[0], extra: { anything: true } }] })
    expect(value).not.toHaveProperty('script')
    expect(value.layers[0]).not.toHaveProperty('extra')
  })

  it('bounds total layer pixel allocation as well as individual canvas dimensions', () => {
    const doc = createDrawingDocument('Large', 4096, 4096)
    const layers = Array.from({ length: 5 }, (_, i) => ({ ...doc.layers[0], id: `layer-${i}` }))
    expect(() => validateDocument({ ...doc, layers, activeLayerId: 'layer-0' })).toThrow('canvas memory limit')
    expect(validateDocument({ ...doc, layers: layers.slice(0, 4), activeLayerId: 'layer-0' }).layers).toHaveLength(4)
  })
})
