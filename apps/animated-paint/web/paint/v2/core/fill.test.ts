import { describe, expect, it } from 'vitest'
import { BUILTIN_BRUSHES } from '../presets'
import { exportBrushJson, importBrushJson } from '../brushTransfer'
import { createBrushV2, createDocumentV2 } from './defaults'
import { getBrushFillKind, getBrushFillProfile } from './fill'
import { parseBrush, parseDocument } from './schema'
import { snapshotStroke } from '../input/sampler'

describe('brush fill capabilities', () => {
  it('supports the initial solid and texture recipes', () => {
    const supported = BUILTIN_BRUSHES.filter(brush => getBrushFillKind(brush)).map(brush => brush.id)
    expect(supported).toEqual(['round', 'marker', 'wiggle', 'wave', 'boil', 'textureBoil', 'graphiteCrawl'])
    expect(getBrushFillKind(BUILTIN_BRUSHES.find(brush => brush.id === 'textureBoil')!)).toBe('texture-boil')
    expect(getBrushFillKind(BUILTIN_BRUSHES.find(brush => brush.id === 'graphiteCrawl')!)).toBe('graphite')
  })

  it('keeps support through brush duplication and export without trusting an id', () => {
    const original = BUILTIN_BRUSHES.find(brush => brush.id === 'wave')!
    const imported = importBrushJson(exportBrushJson({ ...original, closedPath: true, fill: { enabled: true, outline: false } }))!
    expect(imported.id).not.toBe(original.id)
    expect(getBrushFillProfile(imported)).toBe('wave')
    expect(imported.fill).toEqual({ enabled: true, outline: false })
    expect(getBrushFillProfile({ ...original, animationJs: `${original.animationJs}\n// edited` })).toBeNull()
    expect(getBrushFillProfile({ ...original, renderer: 'particle' })).toBeNull()
    const texture = BUILTIN_BRUSHES.find(brush => brush.id === 'textureBoil')!
    expect(getBrushFillKind({ ...texture, stamps: ['star'] })).toBeNull()
  })

  it('supports static lines but rejects unrelated scripts and particles', () => {
    expect(getBrushFillKind(createBrushV2({ renderer: 'line' }))).toBe('solid')
    expect(getBrushFillKind(createBrushV2({ renderer: 'ribbon' }))).toBe('solid')
    expect(getBrushFillKind(createBrushV2({ renderer: 'particle' }))).toBeNull()
    expect(getBrushFillKind(createBrushV2({ renderer: 'line', animated: true }))).toBeNull()
  })

  it('preserves existing documents as open unfilled strokes and sanitizes imported options', () => {
    expect(parseBrush({ renderer: 'line' })).toMatchObject({ closedPath: false, fill: { enabled: false, outline: true } })
    expect(parseBrush({ fill: { enabled: 'true', outline: 0 }, closedPath: 1 })).toMatchObject({ closedPath: false, fill: { enabled: false, outline: true } })
    const document = createDocumentV2()
    document.layers[0].strokes = [snapshotStroke(createBrushV2({ renderer: 'line', fill: { enabled: true, outline: false } }), [], document.activeLayerId)]
    const restored = parseDocument(JSON.parse(JSON.stringify(document)))!
    expect(restored.layers[0].strokes[0].brushSnapshot).toMatchObject({ closedPath: true, fill: { enabled: true, outline: false } })
  })
})
