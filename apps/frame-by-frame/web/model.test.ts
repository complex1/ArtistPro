import { describe, expect, it } from 'vitest'
import { celAt, createDocument, deleteTrack, insertCel, moveCel, onionCels, playbackFrame, setExposure, splitCel, validateDocument } from './model'

describe('frame-by-frame timing', () => {
  const fixture = () => { const doc = createDocument('Test', 64, 64, 12); return { doc, layerId: doc.layers[0].id, first: doc.layers[0].cels[0] } }
  it('holds a drawing over a half-open frame range', () => { const { doc, first } = fixture(); expect(celAt(doc.layers[0], 0)?.id).toBe(first.id); expect(celAt(doc.layers[0], 1)?.id).toBe(first.id); expect(celAt(doc.layers[0], 2)).toBeUndefined() })
  it('inserts in gaps and pushes only the affected layer when needed', () => {
    const { doc, layerId } = fixture(); doc.layers.push({ ...doc.layers[0], id: 'other', cels: [{ ...doc.layers[0].cels[0], id: 'other-cel' }] })
    const a = insertCel(doc, layerId, 2, 2).document
    const b = insertCel(a, layerId, 8, 2).document
    const c = insertCel(b, layerId, 6, 4).document
    expect(c.layers[0].cels.map(cel => cel.start)).toEqual([0, 2, 6, 10]); expect(c.layers[1]).toEqual(doc.layers[1])
  })
  it('rejects insertion inside an existing hold', () => { const { doc, layerId } = fixture(); expect(() => insertCel(doc, layerId, 1, 2)).toThrow(/split/) })
  it('deletes only the requested track and keeps other timing intact', () => {
    const { doc, layerId } = fixture()
    doc.layers.push({ id: 'other', name: 'Other', visible: true, locked: false, opacity: 1, cels: [] })
    const next = deleteTrack(doc, layerId)
    expect(next.layers).toEqual([doc.layers[1]])
    expect(next.duration).toBe(doc.duration)
    expect(doc.layers).toHaveLength(2)
  })
  it('replaces a deleted final track with an empty editable track and rejects locked tracks', () => {
    const { doc, layerId } = fixture(), next = deleteTrack(doc, layerId)
    expect(next.layers).toHaveLength(1)
    expect(next.layers[0].cels).toEqual([])
    expect(next.layers[0].id).not.toBe(layerId)
    doc.layers[0].locked = true
    expect(() => deleteTrack(doc, layerId)).toThrow(/Unlock/)
  })
  it('inserts at a shared boundary and ripples contiguous drawings', () => {
    const { doc, layerId } = fixture()
    const next = insertCel(doc, layerId, 2, 2)
    const result = insertCel(next.document, layerId, 2, 3)
    expect(result.document.layers[0].cels.map(cel => [cel.id, cel.start, cel.duration])).toEqual([
      [doc.layers[0].cels[0].id, 0, 2], [result.cel.id, 2, 3], [next.cel.id, 5, 2],
    ])
  })
  it('retimes subsequent drawings without changing their pixels or IDs', () => {
    const { doc, layerId, first } = fixture(), next = insertCel(doc, layerId, 2, 4)
    const result = setExposure(next.document, layerId, first.id, 5)
    expect(result.layers[0].cels.map(cel => [cel.id, cel.start, cel.duration])).toEqual([[first.id, 0, 5], [next.cel.id, 5, 4]])
    expect(setExposure(result, layerId, first.id, 1).layers[0].cels[1].start).toBe(1)
  })
  it('splits a held drawing into independent drawing IDs', () => { const { doc, layerId } = fixture(); const next = splitCel(doc, layerId, 1); expect(next.layers[0].cels.map(cel => [cel.start, cel.duration])).toEqual([[0, 1], [1, 1]]); expect(new Set(next.layers[0].cels.map(cel => cel.id)).size).toBe(2); expect(doc.layers[0].cels).toHaveLength(1) })
  it('rejects a split at a drawing boundary or empty frame', () => { const { doc, layerId } = fixture(); expect(() => splitCel(doc, layerId, 0)).toThrow(); expect(() => splitCel(doc, layerId, 5)).toThrow() })
  it('moves drawings and expands shot length, rejecting overlap', () => { const { doc, layerId, first } = fixture(); expect(moveCel(doc, layerId, first.id, 30).duration).toBe(32); const next = insertCel(doc, layerId, 2, 2); expect(() => moveCel(next.document, layerId, next.cel.id, 1)).toThrow(/overlap/) })
  it('never edits locked drawing or timing content', () => { const { doc, layerId, first } = fixture(); doc.layers[0].locked = true; expect(() => insertCel(doc, layerId, 2, 2)).toThrow(/Unlock/); expect(() => splitCel(doc, layerId, 1)).toThrow(/Unlock/); expect(() => setExposure(doc, layerId, first.id, 4)).toThrow(/Unlock/); expect(() => moveCel(doc, layerId, first.id, 4)).toThrow(/Unlock/) })
  it('onion skins count drawings rather than held frames', () => { const { doc, layerId } = fixture(); const next = insertCel(insertCel(doc, layerId, 2, 4).document, layerId, 6, 2).document; const result = onionCels(next.layers[0], 4, 1, 1); expect(result.map(item => [item.cel.start, item.direction])).toEqual([[0, 'before'], [6, 'after']]); expect(onionCels(next.layers[0], 4, 0, 0)).toEqual([]) })
  it('uses elapsed time for playback and handles loop boundaries', () => { expect(playbackFrame(0, 1000, 12, 24, true)).toEqual({ frame: 12, ended: false }); expect(playbackFrame(20, 500, 12, 24, true).frame).toBe(2); expect(playbackFrame(20, 500, 12, 24, false)).toEqual({ frame: 23, ended: true }) })
})

describe('animation document validation', () => {
  it('copies valid documents and preserves timing', () => { const doc = createDocument(); const next = validateDocument(doc); expect(next).toEqual(doc); expect(next.layers[0]).not.toBe(doc.layers[0]) })
  it.each([{ version: 2 }, { format: 'drawing' }, { width: 4096 }, { height: 0 }, { fps: 0 }, { fps: 61 }, { fps: 12.5 }, { duration: 2401 }, { duration: 1 }, { background: 'url(x)' }, { layers: [] }])('rejects invalid project fields %j', patch => expect(() => validateDocument({ ...createDocument(), ...patch })).toThrow())
  it('rejects mismatched PNG dimensions and external image URLs', () => { const doc = createDocument(); doc.layers[0].cels[0].dataUrl = 'https://example.com/image.png'; expect(() => validateDocument(doc)).toThrow(/embedded PNG/); doc.layers[0].cels[0].dataUrl = 'data:image/png;base64,invalid'; expect(() => validateDocument(doc)).toThrow() })
  it('rejects duplicate IDs and excessive layer allocations', () => { const doc = createDocument(); doc.layers.push({ ...doc.layers[0] }); expect(() => validateDocument(doc)).toThrow(/Duplicate/); doc.layers = Array.from({ length: 16 }, (_, i) => ({ ...doc.layers[0], id: `${i}`, cels: [] })); expect(() => validateDocument({ ...doc, width: 2048, height: 2048 })).toThrow(/memory/) })
  it('rejects retiming past the frame limit without changing the original', () => { const doc = createDocument(); expect(() => setExposure(doc, doc.layers[0].id, doc.layers[0].cels[0].id, 2401)).toThrow(); expect(doc.layers[0].cels[0].duration).toBe(2) })
})
