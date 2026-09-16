import { describe, expect, it } from 'vitest'
import { MAX_CELS, MAX_FRAMES, validateDocument, type AnimationDocument } from '../model'
import { insertInbetweens, planInbetweens, type InbetweenPlacement } from './timeline'
import type { GeneratedDrawing } from './types'

const RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
const BLUE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg=='
const GREEN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M/wHwAEAQH/cetH5QAAAABJRU5ErkJggg=='
const THUMB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAYAAADlNHIOAAAAuElEQVR4nO3OMREAAAgAIfuX1hgM71GAmX0UD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0P1PFAHQ/U8UAdD9TxQB0PxB1RZ9LCSFhkpQAAAABJRU5ErkJggg=='
const drawing: GeneratedDrawing = { dataUrl: GREEN, thumbnail: THUMB }
const generated = (count: number) => Array.from({ length: count }, () => ({ ...drawing }))
const fixture = (): AnimationDocument => validateDocument({
  format: 'artist-frame-by-frame', version: 1, name: 'Inbetweens', width: 1, height: 1,
  fps: 12, duration: 22, background: '#ffffff',
  layers: [
    { id: 'track', name: 'Animation', visible: true, locked: false, opacity: 1, cels: [
      { id: 'previous', start: 0, duration: 1, dataUrl: null, thumbnail: null },
      { id: 'a', start: 2, duration: 3, dataUrl: RED, thumbnail: THUMB },
      { id: 'b', start: 9, duration: 4, dataUrl: BLUE, thumbnail: THUMB },
      { id: 'later', start: 20, duration: 2, dataUrl: GREEN, thumbnail: null },
    ] },
    { id: 'other', name: 'Background', visible: false, locked: true, opacity: .5, cels: [
      { id: 'other-cel', start: 6, duration: 15, dataUrl: BLUE, thumbnail: null },
    ] },
  ],
})
const plan = (doc: AnimationDocument, count: number, exposure = 2, placement: InbetweenPlacement = 'insert') => planInbetweens(doc, 'track', 'a', 'b', count, exposure, placement)
const insert = (doc: AnimationDocument, count: number, exposure = 2, placement: InbetweenPlacement = 'insert') => insertInbetweens(doc, 'track', 'a', 'b', generated(count), exposure, placement)
const newCels = (doc: AnimationDocument) => doc.layers[0].cels.filter(cel => !['previous', 'a', 'b', 'later'].includes(cel.id))

describe('inbetween insert placement', () => {
  it('starts after the first key hold and consumes the existing gap before shifting', () => {
    expect(plan(fixture(), 3)).toEqual({ firstFrame: 5, endFrame: 11, shift: 2, shotDuration: 24, fromDuration: 3,
      slots: [{ start: 5, duration: 2 }, { start: 7, duration: 2 }, { start: 9, duration: 2 }] })
    const original = fixture(), next = insert(original, 3)
    expect(newCels(next).map(cel => [cel.start, cel.duration])).toEqual([[5, 2], [7, 2], [9, 2]])
    expect(next.layers[0].cels.find(cel => cel.id === 'a')).toEqual(original.layers[0].cels[1])
    expect(next.layers[0].cels.find(cel => cel.id === 'b')).toEqual({ ...original.layers[0].cels[2], start: 11 })
    expect(next.layers[0].cels.find(cel => cel.id === 'later')).toEqual({ ...original.layers[0].cels[3], start: 22 })
    expect(next.layers[0].cels[0]).toEqual(original.layers[0].cels[0])
    expect(next.layers[1]).toEqual(original.layers[1])
    expect(next.duration).toBe(24)
  })

  it('does not shift or extend the shot when the drawings fit exactly inside the gap', () => {
    const original = fixture(), next = insert(original, 2)
    expect(plan(original, 2)).toMatchObject({ firstFrame: 5, endFrame: 9, shift: 0, shotDuration: 22 })
    expect(next.layers[0].cels.find(cel => cel.id === 'b')).toEqual(original.layers[0].cels[2])
    expect(next.layers[0].cels.find(cel => cel.id === 'later')).toEqual(original.layers[0].cels[3])
    expect(next.duration).toBe(original.duration)
  })

  it('retains unused gap frames rather than pulling the second key earlier', () => {
    const next = insert(fixture(), 1)
    expect(plan(fixture(), 1)).toMatchObject({ firstFrame: 5, endFrame: 7, shift: 0 })
    expect(newCels(next).map(cel => [cel.start, cel.duration])).toEqual([[5, 2]])
    expect(next.layers[0].cels.find(cel => cel.id === 'b')?.start).toBe(9)
  })

  it('shifts a contiguous second key by the full generated exposure', () => {
    const original = fixture()
    original.layers[0].cels[2].start = 5
    expect(plan(original, 3, 3)).toMatchObject({ firstFrame: 5, endFrame: 14, shift: 9, shotDuration: 31 })
    expect(insert(original, 3, 3).layers[0].cels.find(cel => cel.id === 'b')?.start).toBe(14)
  })

  it('uses existing shot tail space before extending duration', () => {
    const doc = { ...fixture(), duration: 100 }
    expect(plan(doc, 3).shift).toBe(2)
    expect(insert(doc, 3).duration).toBe(100)
  })

  it('gives generated artwork independent IDs and preserves its sequence and thumbnails', () => {
    const source = fixture()
    const drawings = [{ dataUrl: GREEN, thumbnail: THUMB }, { dataUrl: BLUE, thumbnail: THUMB }]
    const result = insertInbetweens(source, 'track', 'a', 'b', drawings, 1, 'insert')
    const created = newCels(result)
    expect(created.map(cel => ({ dataUrl: cel.dataUrl, thumbnail: cel.thumbnail }))).toEqual(drawings)
    const ids = result.layers.flatMap(layer => [layer.id, ...layer.cels.map(cel => cel.id)])
    expect(new Set(ids).size).toBe(ids.length)
    expect(created.every(cel => source.layers.every(layer => layer.id !== cel.id && layer.cels.every(old => old.id !== cel.id)))).toBe(true)
  })
})

describe('inbetween fit placement', () => {
  it('shortens the first hold to one and distributes all remaining frames evenly', () => {
    const original = fixture(), result = insert(original, 4, 12, 'fit')
    expect(plan(original, 4, 12, 'fit')).toEqual({ firstFrame: 3, endFrame: 9, shift: 0, shotDuration: 22, fromDuration: 1,
      slots: [{ start: 3, duration: 2 }, { start: 5, duration: 2 }, { start: 7, duration: 1 }, { start: 8, duration: 1 }] })
    expect(result.layers[0].cels.find(cel => cel.id === 'a')).toEqual({ ...original.layers[0].cels[1], duration: 1 })
    expect(result.layers[0].cels.find(cel => cel.id === 'b')).toEqual(original.layers[0].cels[2])
    expect(result.layers[0].cels.find(cel => cel.id === 'later')).toEqual(original.layers[0].cels[3])
    expect(result.layers[1]).toEqual(original.layers[1])
    expect(result.duration).toBe(original.duration)
  })

  it('ignores the exposure setting when fitting valid counts', () => {
    expect(plan(fixture(), 3, 1, 'fit')).toEqual(plan(fixture(), 3, 12, 'fit'))
    expect(newCels(insert(fixture(), 3, 1, 'fit')).map(cel => [cel.start, cel.duration])).toEqual([[3, 2], [5, 2], [7, 2]])
  })

  it('can reuse held frames even when the keys originally have no empty gap', () => {
    const original = fixture()
    original.layers[0].cels[1].duration = 7
    expect(plan(original, 6, 1, 'fit')).toMatchObject({ firstFrame: 3, endFrame: 9, shift: 0 })
    expect(newCels(insert(original, 6, 1, 'fit')).map(cel => cel.duration)).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('gives a single generated drawing the entire available interval', () => {
    expect(plan(fixture(), 1, 1, 'fit').slots).toEqual([{ start: 3, duration: 6 }])
  })

  it('rejects fitting too many drawings instead of using zero-duration cels', () => {
    expect(() => plan(fixture(), 7, 1, 'fit')).toThrow('Only 6 frames')
    expect(() => insert(fixture(), 7, 1, 'fit')).toThrow('Only 6 frames')
    const adjacent = fixture()
    adjacent.layers[0].cels[1].duration = 1
    adjacent.layers[0].cels[2].start = 3
    expect(() => plan(adjacent, 1, 1, 'fit')).toThrow('Only 0 frames')
  })
})

describe('endpoint and input validation', () => {
  it('finds consecutive keys by time instead of their incoming array order', () => {
    const original = fixture()
    original.layers[0].cels.reverse()
    expect(plan(original, 2)).toMatchObject({ firstFrame: 5, endFrame: 9, shift: 0 })
  })

  it('rejects nonconsecutive keys even when the intervening drawing is blank', () => {
    const doc = fixture()
    doc.layers[0].cels.splice(2, 0, { id: 'blank', start: 6, duration: 1, dataUrl: null, thumbnail: null })
    expect(() => plan(doc, 2)).toThrow(/consecutive/)
  })

  it.each([['b', 'a'], ['a', 'later'], ['a', 'a'], ['missing', 'b'], ['a', 'other-cel']])('rejects invalid endpoint pair %s → %s', (from, to) => {
    expect(() => planInbetweens(fixture(), 'track', from, to, 2, 2, 'insert')).toThrow(/consecutive/)
  })

  it.each(['a', 'b'])('requires saved artwork on endpoint %s', (id) => {
    const doc = fixture()
    doc.layers[0].cels.find(cel => cel.id === id)!.dataUrl = null
    expect(() => plan(doc, 2)).toThrow(/Both endpoint drawings/)
  })

  it('rejects missing tracks and locked tracks before changing their timing', () => {
    expect(() => planInbetweens(fixture(), 'missing', 'a', 'b', 2, 2, 'insert')).toThrow(/no longer exists/)
    const doc = fixture()
    doc.layers[0].locked = true
    expect(() => plan(doc, 2)).toThrow(/Unlock/)
    expect(() => insert(doc, 2)).toThrow(/Unlock/)
  })

  it.each([0, -1, 25, 1.5, NaN, Infinity])('rejects invalid generation count %s', count => {
    expect(() => plan(fixture(), count)).toThrow(/Inbetween count/)
  })

  it.each([0, -1, 13, 1.5, NaN, Infinity])('rejects invalid exposure %s for either placement', exposure => {
    expect(() => plan(fixture(), 2, exposure)).toThrow(/Inbetween exposure/)
    expect(() => plan(fixture(), 2, exposure, 'fit')).toThrow(/Inbetween exposure/)
  })

  it('accepts the maximum generation count and exposure', () => {
    expect(newCels(insert(fixture(), 24, 12))).toHaveLength(24)
    expect(plan(fixture(), 24, 12)).toMatchObject({ firstFrame: 5, endFrame: 293, shift: 284, shotDuration: 306 })
  })

  it('rejects unsupported placement and missing or invalid generated output', () => {
    expect(() => plan(fixture(), 2, 2, 'replace' as InbetweenPlacement)).toThrow(/insert or fit/)
    expect(() => insert(fixture(), 0)).toThrow(/Inbetween count/)
    expect(() => insertInbetweens(fixture(), 'track', 'a', 'b', null as unknown as GeneratedDrawing[], 2, 'insert')).toThrow(/list/)
    expect(() => insertInbetweens(fixture(), 'track', 'a', 'b', [{ dataUrl: null, thumbnail: THUMB } as unknown as GeneratedDrawing], 2, 'insert')).toThrow(/PNG artwork/)
    expect(() => insertInbetweens(fixture(), 'track', 'a', 'b', [{ ...drawing, dataUrl: 'https://example.com/frame.png' }], 2, 'insert')).toThrow(/embedded PNG/)
    expect(() => insertInbetweens(fixture(), 'track', 'a', 'b', [{ ...drawing, thumbnail: GREEN }], 2, 'insert')).toThrow(/dimensions must match/)
    expect(() => insertInbetweens(fixture(), 'track', 'a', 'b', [{ ...drawing, dataUrl: THUMB }], 2, 'insert')).toThrow(/dimensions must match/)
  })
})

describe('document safety and capacity', () => {
  it.each<InbetweenPlacement>(['insert', 'fit'])('keeps source objects and generated payloads unchanged during %s planning/insertion', placement => {
    const doc = fixture(), before = structuredClone(doc), drawings = generated(2), payload = structuredClone(drawings)
    doc.layers.forEach(layer => { layer.cels.forEach(Object.freeze); Object.freeze(layer.cels); Object.freeze(layer) })
    Object.freeze(doc.layers); Object.freeze(doc); drawings.forEach(Object.freeze); Object.freeze(drawings)
    plan(doc, 2, 2, placement)
    const next = insertInbetweens(doc, 'track', 'a', 'b', drawings, 2, placement)
    expect(doc).toEqual(before)
    expect(drawings).toEqual(payload)
    expect(next).not.toBe(doc)
    next.layers[1].name = 'Independent copy'
    expect(doc.layers[1].name).toBe('Background')
  })

  it('rejects a ripple beyond the maximum shot length in both planning and insertion', () => {
    const doc = fixture()
    doc.duration = MAX_FRAMES
    doc.layers[0].cels[3].start = MAX_FRAMES - 2
    expect(() => plan(doc, 3)).toThrow(/Shot length/)
    expect(() => insert(doc, 3)).toThrow(/Shot length/)
    expect(doc.layers[0].cels[3].start).toBe(MAX_FRAMES - 2)
  })

  it('does not reject a fit inside an existing maximum-length shot', () => {
    const doc = { ...fixture(), duration: MAX_FRAMES }
    expect(insert(doc, 2, 12, 'fit').duration).toBe(MAX_FRAMES)
  })

  it('counts drawings across all tracks before accepting more generated cels', () => {
    const doc = fixture()
    doc.duration = 600
    doc.layers[1].cels = Array.from({ length: MAX_CELS - doc.layers[0].cels.length }, (_, index) => ({ id: `background-${index}`, start: index, duration: 1, dataUrl: null, thumbnail: null }))
    expect(() => plan(doc, 1)).toThrow(/up to 500 drawings/)
    expect(() => insert(doc, 1)).toThrow(/up to 500 drawings/)
    expect(doc.layers[0].cels).toHaveLength(4)
  })

  it('checks the combined byte size of the final project before returning generated cels', () => {
    // The model validates PNG headers without decoding pixels. Large embedded
    // payloads exercise the aggregate storage limit using one shared string.
    const large = RED.replace(/==$/, `${'AAAA'.repeat(67_225)}==`)
    const doc = fixture()
    doc.duration = 600
    doc.layers = [{ ...doc.layers[0], cels: Array.from({ length: 498 }, (_, index) => ({ id: index === 0 ? 'a' : index === 1 ? 'b' : `cel-${index}`, start: index, duration: 1, dataUrl: large, thumbnail: null })) }]
    expect(validateDocument(doc).layers[0].cels).toHaveLength(498)
    expect(() => insertInbetweens(doc, 'track', 'a', 'b', [{ dataUrl: large, thumbnail: THUMB }, { dataUrl: large, thumbnail: THUMB }], 1, 'insert')).toThrow(/128 MB project limit/)
    expect(doc.layers[0].cels).toHaveLength(498)
  })
})
