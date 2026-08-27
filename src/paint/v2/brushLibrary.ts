import { createBrushV2 } from './core/defaults'
import { parseBrush } from './core/schema'
import type { BrushV2 } from './core/types'
import { BUILTIN_BRUSHES } from './presets'

export const PAINT_BRUSHES_STORAGE_KEY_V2 = 'artist-pro.paint.brushes.v2'
export const PAINT_HIDDEN_BRUSHES_STORAGE_KEY_V2 =
  'artist-pro.paint.hidden-brushes.v2'

export type BrushStorage = Pick<Storage, 'getItem' | 'setItem'>

const memory = new Map<string, string>()
const fallback: BrushStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value)
  },
}

function storage(): BrushStorage {
  try {
    if (typeof localStorage === 'undefined') return fallback
    localStorage.setItem('__paint-brushes-v2-probe__', '1')
    localStorage.removeItem('__paint-brushes-v2-probe__')
    return localStorage
  } catch {
    return fallback
  }
}

function readCustom(store: BrushStorage): BrushV2[] {
  try {
    const parsed = JSON.parse(store.getItem(PAINT_BRUSHES_STORAGE_KEY_V2) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(parseBrush).filter((brush): brush is BrushV2 => brush !== null)
  } catch {
    return []
  }
}

function writeCustom(brushes: BrushV2[], store: BrushStorage): void {
  store.setItem(PAINT_BRUSHES_STORAGE_KEY_V2, JSON.stringify(brushes))
}

function readHidden(store: BrushStorage): Set<string> {
  try {
    const parsed = JSON.parse(
      store.getItem(PAINT_HIDDEN_BRUSHES_STORAGE_KEY_V2) ?? '[]',
    ) as unknown
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

function writeHidden(ids: Set<string>, store: BrushStorage): void {
  store.setItem(PAINT_HIDDEN_BRUSHES_STORAGE_KEY_V2, JSON.stringify([...ids]))
}

export function listCustomBrushesV2(store: BrushStorage = storage()): BrushV2[] {
  return readCustom(store)
}

export function listAllBrushes(store: BrushStorage = storage()): BrushV2[] {
  const custom = readCustom(store)
  const overrides = new Map(custom.map((brush) => [brush.id, brush]))
  const builtinIds = new Set(BUILTIN_BRUSHES.map((brush) => brush.id))
  const hidden = readHidden(store)
  return [
    ...BUILTIN_BRUSHES.filter((brush) => !hidden.has(brush.id)).map(
      (brush) => overrides.get(brush.id) ?? brush,
    ),
    ...custom.filter((brush) => !builtinIds.has(brush.id) && !hidden.has(brush.id)),
  ]
}

export function getBrushV2(
  id: string,
  store: BrushStorage = storage(),
): BrushV2 | undefined {
  return listAllBrushes(store).find((brush) => brush.id === id)
}

export function saveCustomBrush(brush: BrushV2, store: BrushStorage = storage()): BrushV2 {
  const parsed = parseBrush(brush)
  if (!parsed) throw new Error('Invalid brush')
  const brushes = readCustom(store)
  const index = brushes.findIndex((item) => item.id === parsed.id)
  if (index >= 0) brushes[index] = parsed
  else brushes.push(parsed)
  writeCustom(brushes, store)
  const hidden = readHidden(store)
  if (hidden.delete(parsed.id)) writeHidden(hidden, store)
  return parsed
}

export function duplicateBrush(brush: BrushV2, store: BrushStorage = storage()): BrushV2 {
  const copy = createBrushV2({
    ...structuredClone(brush),
    id: crypto.randomUUID(),
    name: `${brush.name} copy`,
    category: brush.category === 'Custom' ? 'Custom' : 'Custom',
  })
  return saveCustomBrush(copy, store)
}

export function deleteCustomBrush(id: string, store: BrushStorage = storage()): void {
  writeCustom(
    readCustom(store).filter((brush) => brush.id !== id),
    store,
  )
  if (BUILTIN_BRUSHES.some((brush) => brush.id === id)) {
    const hidden = readHidden(store)
    hidden.add(id)
    writeHidden(hidden, store)
  }
}
