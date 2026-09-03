import { apiJson } from '@artist-studio/api-client'
import { createBrushV2 } from './core/defaults'
import { parseBrush } from './core/schema'
import type { BrushV2 } from './core/types'
import { BUILTIN_BRUSHES } from './presets'

const PREFIX = '/v1/apps/animated-paint/brushes'
const LEGACY_BRUSHES_KEY = 'artist-pro.paint.brushes.v2'
const LEGACY_HIDDEN_KEY = 'artist-pro.paint.hidden-brushes.v2'
let legacyMigration: Promise<void> | undefined

type BrushState = {
  custom: unknown[]
  hidden: string[]
}

async function readState(): Promise<{
  custom: BrushV2[]
  hidden: Set<string>
}> {
  const state = await apiJson<BrushState>(PREFIX)
  return {
    custom: state.custom
      .map(parseBrush)
      .filter((brush): brush is BrushV2 => brush !== null),
    hidden: new Set(state.hidden),
  }
}

async function migrateLegacyBrushes(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  const state = await readState()
  try {
    const values = JSON.parse(
      localStorage.getItem(LEGACY_BRUSHES_KEY) ?? '[]',
    ) as unknown
    if (Array.isArray(values)) {
      for (const value of values) {
        const brush = parseBrush(value)
        if (
          brush &&
          !state.custom.some((existing) => existing.id === brush.id)
        ) {
          await saveCustomBrush(brush)
        }
      }
    }
    const hidden = JSON.parse(
      localStorage.getItem(LEGACY_HIDDEN_KEY) ?? '[]',
    ) as unknown
    if (Array.isArray(hidden)) {
      for (const id of hidden) {
        if (typeof id === 'string' && !state.hidden.has(id)) {
          await apiJson<void>(
            `${PREFIX}/${encodeURIComponent(id)}?hideBuiltin=true`,
            { method: 'DELETE' },
          )
        }
      }
    }
  } catch {
    // Invalid legacy data is ignored without changing the source.
  }
}

async function ensureLegacyMigration(): Promise<void> {
  legacyMigration ??= migrateLegacyBrushes()
  await legacyMigration
}

export async function listCustomBrushesV2(): Promise<BrushV2[]> {
  await ensureLegacyMigration()
  return (await readState()).custom
}

export async function listAllBrushes(): Promise<BrushV2[]> {
  await ensureLegacyMigration()
  const { custom, hidden } = await readState()
  const overrides = new Map(custom.map((brush) => [brush.id, brush]))
  const builtinIds = new Set(BUILTIN_BRUSHES.map((brush) => brush.id))
  return [
    ...BUILTIN_BRUSHES.filter((brush) => !hidden.has(brush.id)).map(
      (brush) => overrides.get(brush.id) ?? brush,
    ),
    ...custom.filter(
      (brush) => !builtinIds.has(brush.id) && !hidden.has(brush.id),
    ),
  ]
}

export async function getBrushV2(id: string): Promise<BrushV2 | undefined> {
  return (await listAllBrushes()).find((brush) => brush.id === id)
}

export async function saveCustomBrush(brush: BrushV2): Promise<BrushV2> {
  const parsed = parseBrush(brush)
  if (!parsed) throw new Error('Invalid brush')
  return apiJson<BrushV2>(`${PREFIX}/${encodeURIComponent(parsed.id)}`, {
    method: 'PUT',
    body: JSON.stringify(parsed),
  })
}

export async function duplicateBrush(brush: BrushV2): Promise<BrushV2> {
  const copy = createBrushV2({
    ...structuredClone(brush),
    id: crypto.randomUUID(),
    name: `${brush.name} copy`,
    category: 'Custom',
  })
  return saveCustomBrush(copy)
}

export async function deleteCustomBrush(id: string): Promise<void> {
  const hideBuiltin = BUILTIN_BRUSHES.some((brush) => brush.id === id)
  await apiJson<void>(
    `${PREFIX}/${encodeURIComponent(id)}?hideBuiltin=${hideBuiltin}`,
    { method: 'DELETE' },
  )
}
