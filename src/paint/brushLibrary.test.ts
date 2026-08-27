import { describe, expect, it } from 'vitest'
import {
  createCustomBrush,
  deleteCustomBrush,
  listCustomBrushes,
  PAINT_BRUSHES_STORAGE_KEY,
  type PaintBrushStorage,
} from './brushLibrary'

function memoryStorage(): PaintBrushStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('custom paint brush library', () => {
  it('creates, lists, and deletes expression brushes', () => {
    const storage = memoryStorage()
    const brush = createCustomBrush(
      {
        name: 'Wave maker',
        renderer: 'line',
        expressions: {
          y: 'sin(time * speed + index * 0.3) * amount',
          size: '1 + sin(time * 4) * 0.2',
        },
      },
      storage,
    )

    expect(listCustomBrushes(storage)).toEqual([brush])
    expect(storage.getItem(PAINT_BRUSHES_STORAGE_KEY)).toContain('Wave maker')

    deleteCustomBrush(brush.id, storage)
    expect(listCustomBrushes(storage)).toEqual([])
  })

  it('ignores malformed persisted brushes', () => {
    const storage = memoryStorage()
    storage.setItem(
      PAINT_BRUSHES_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'bad',
          name: 'Unsafe',
          group: 'Custom',
          renderer: 'line',
          animation: 'none',
          expressions: { x: { source: 'window.x' } },
        },
      ]),
    )

    expect(listCustomBrushes(storage)).toEqual([])
  })
})
