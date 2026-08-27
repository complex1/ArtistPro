import { describe, expect, it } from 'vitest'
import {
  deleteCustomBrush,
  duplicateBrush,
  getBrushV2,
  listAllBrushes,
  PAINT_BRUSHES_STORAGE_KEY_V2,
  saveCustomBrush,
  type BrushStorage,
} from './brushLibrary'
import { createBrushV2 } from './core/defaults'

function memoryStorage(): BrushStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('v2 brush library', () => {
  it('overrides built-in brushes when renamed', () => {
    const store = memoryStorage()
    const round = getBrushV2('round', store)
    expect(round).toBeDefined()
    saveCustomBrush({ ...round!, name: 'My Round' }, store)
    expect(getBrushV2('round', store)?.name).toBe('My Round')
    expect(listAllBrushes(store).filter((brush) => brush.id === 'round')).toHaveLength(1)
  })

  it('can hide a built-in brush and restore it by saving', () => {
    const store = memoryStorage()
    const round = getBrushV2('round', store)!
    deleteCustomBrush(round.id, store)
    expect(getBrushV2('round', store)).toBeUndefined()
    saveCustomBrush(round, store)
    expect(getBrushV2('round', store)?.name).toBe('Round')
  })

  it('duplicates into a new custom brush', () => {
    const store = memoryStorage()
    const copy = duplicateBrush(getBrushV2('round', store)!, store)
    expect(copy.id).not.toBe('round')
    expect(JSON.parse(store.getItem(PAINT_BRUSHES_STORAGE_KEY_V2) ?? '[]')).toHaveLength(1)
  })

  it('deletes custom brushes from storage', () => {
    const store = memoryStorage()
    const custom = saveCustomBrush(createBrushV2({ name: 'Custom' }), store)
    deleteCustomBrush(custom.id, store)
    expect(getBrushV2(custom.id, store)).toBeUndefined()
  })
})
