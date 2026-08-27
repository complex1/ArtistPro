import { nanoid } from 'nanoid'
import {
  BRUSH_EXPRESSION_KEYS,
  sanitizeBrushExpressions,
} from './engine/expression'
import type { BrushExpressions, BrushPreset, RendererId } from './engine/types'

export const PAINT_BRUSHES_STORAGE_KEY = 'artist-pro.paint.brushes.v1'

export type PaintBrushStorage = Pick<Storage, 'getItem' | 'setItem'>

const memory = new Map<string, string>()
const fallbackStorage: PaintBrushStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value)
  },
}

const RENDERERS = new Set<RendererId>([
  'line',
  'stamp',
  'ribbon',
  'particle',
  'nature',
  'aura',
])

function storage(): PaintBrushStorage {
  try {
    if (typeof localStorage === 'undefined') return fallbackStorage
    localStorage.setItem('__paint-brush-storage-probe__', '1')
    localStorage.removeItem('__paint-brush-storage-probe__')
    return localStorage
  } catch {
    return fallbackStorage
  }
}

function isCustomBrush(value: unknown): value is BrushPreset {
  if (!value || typeof value !== 'object') return false
  const brush = value as Partial<BrushPreset>
  const expressions = brush.expressions as
    | Record<string, unknown>
    | undefined
  return (
    typeof brush.id === 'string' &&
    typeof brush.name === 'string' &&
    brush.group === 'Custom' &&
    RENDERERS.has(brush.renderer as RendererId) &&
    brush.animation === 'none' &&
    !!expressions &&
    BRUSH_EXPRESSION_KEYS.every(
      (key) => expressions[key] === undefined || typeof expressions[key] === 'string',
    )
  )
}

export function listCustomBrushes(
  store: PaintBrushStorage = storage(),
): BrushPreset[] {
  try {
    const parsed = JSON.parse(
      store.getItem(PAINT_BRUSHES_STORAGE_KEY) ?? '[]',
    ) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isCustomBrush)
      .map((brush): BrushPreset => {
        const expressions = sanitizeBrushExpressions(brush.expressions)
        return {
          id: brush.id,
          name: brush.name,
          group: 'Custom',
          renderer: brush.renderer,
          animation: 'none',
          expressions,
        }
      })
      .filter(
        (brush): brush is BrushPreset & { expressions: BrushExpressions } =>
          Boolean(brush.expressions),
      )
  } catch {
    return []
  }
}

function writeBrushes(
  brushes: BrushPreset[],
  store: PaintBrushStorage,
): void {
  store.setItem(PAINT_BRUSHES_STORAGE_KEY, JSON.stringify(brushes))
}

export function createCustomBrush(
  input: {
    name: string
    renderer: RendererId
    expressions: BrushExpressions
  },
  store: PaintBrushStorage = storage(),
): BrushPreset {
  const expressions = sanitizeBrushExpressions(input.expressions)
  if (!expressions) throw new Error('At least one valid expression is required')
  const brush: BrushPreset = {
    id: `custom-${nanoid()}`,
    name: input.name.trim() || 'Expression Brush',
    group: 'Custom',
    renderer: input.renderer,
    animation: 'none',
    expressions,
  }
  writeBrushes([...listCustomBrushes(store), brush], store)
  return brush
}

export function deleteCustomBrush(
  id: string,
  store: PaintBrushStorage = storage(),
): void {
  writeBrushes(
    listCustomBrushes(store).filter((brush) => brush.id !== id),
    store,
  )
}
