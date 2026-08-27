import { createBrushV2 } from './core/defaults'
import { parseBrush } from './core/schema'
import type { BrushV2 } from './core/types'

export function exportBrushJson(brush: BrushV2): string {
  return JSON.stringify(parseBrush(brush), null, 2)
}

export function importBrushJson(source: string): BrushV2 | null {
  try {
    const parsed = parseBrush(JSON.parse(source))
    if (!parsed) return null
    return createBrushV2({
      ...parsed,
      id: crypto.randomUUID(),
      category: 'Custom',
    })
  } catch {
    return null
  }
}

export function brushFileName(brush: BrushV2): string {
  const safe = brush.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${safe || 'brush'}.artist-brush.json`
}
