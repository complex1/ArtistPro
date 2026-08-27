import { describe, expect, it } from 'vitest'
import { importV1Document } from './importV1'
import { importAllV1Projects } from './importProjects'
import { PAINT_PROJECTS_STORAGE_KEY } from '../../library'
import { listPaintProjectsV2, type PaintStorage } from '../library'

function memoryStorage(): PaintStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('import v1 paint documents', () => {
  it('preserves geometry, layers, rasters, and known animations', () => {
    const imported = importV1Document({
      version: 1,
      name: 'Old ink',
      width: 400,
      height: 300,
      background: '#fafafa',
      activeLayerId: 'a',
      layers: [
        {
          id: 'a',
          name: 'Ink',
          visible: true,
          opacity: 0.8,
          blendMode: 'multiply',
          rasterDataUrl: 'data:image/png;base64,abc',
          strokes: [
            {
              id: 's1',
              presetId: 'wiggle',
              renderer: 'line',
              animation: 'wiggle',
              color: '#220000',
              size: 7,
              points: [
                { x: 1, y: 2, pressure: 0.9 },
                { x: 8, y: 4, pressure: 0.4 },
              ],
              seed: 12,
            },
          ],
        },
      ],
    })
    expect(imported).toMatchObject({
      version: 2,
      name: 'Old ink',
      width: 400,
      height: 300,
      background: '#fafafa',
    })
    const stroke = imported?.layers[0].strokes[0]
    expect(stroke?.points).toHaveLength(2)
    expect(stroke?.points[0]).toMatchObject({ x: 1, y: 2, pressure: 0.9 })
    expect(stroke?.brushSnapshot.animated).toBe(true)
    expect(stroke?.brushSnapshot.animationJs).toContain('function animate')
    expect(imported?.layers[0].rasterDataUrl).toContain('data:image/png')
    expect(imported?.layers[0].blendMode).toBe('multiply')
  })

  it('imports custom expressions as a static fallback with legacy metadata', () => {
    const imported = importV1Document({
      version: 1,
      name: 'Expr',
      width: 100,
      height: 100,
      layers: [
        {
          id: 'a',
          strokes: [
            {
              renderer: 'stamp',
              animation: 'pulse',
              expressions: { x: 'sin(time)' },
              points: [{ x: 0, y: 0 }],
            },
          ],
        },
      ],
      activeLayerId: 'a',
    })
    const brush = imported?.layers[0].strokes[0].brushSnapshot
    expect(brush?.animated).toBe(false)
    expect(brush?.legacy).toMatchObject({ warning: expect.stringContaining('static') })
  })

  it('copies v1 storage records into v2 without deleting the source', () => {
    const store = memoryStorage()
    store.setItem(
      PAINT_PROJECTS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'keep-me',
          createdAt: 1,
          updatedAt: 2,
          document: {
            version: 1,
            name: 'Legacy',
            width: 200,
            height: 150,
            layers: [{ id: 'l', name: 'L', strokes: [] }],
            activeLayerId: 'l',
          },
        },
      ]),
    )
    const imported = importAllV1Projects(store)
    expect(imported[0].document.version).toBe(2)
    expect(listPaintProjectsV2(store)[0].name).toBe('Legacy')
    expect(store.getItem(PAINT_PROJECTS_STORAGE_KEY)).toContain('Legacy')
  })
})
