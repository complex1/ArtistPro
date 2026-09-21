import { BUILTIN_BRUSHES } from '../presets'
import type { BrushV2 } from './types'

export type BrushFillProfile = 'static' | 'wiggle' | 'wave' | 'boil' | 'textureBoil' | 'graphiteCrawl'
export type BrushFillKind = 'solid' | 'texture-boil' | 'graphite'

const supportedIds = new Set(['wiggle', 'wave', 'boil', 'textureBoil', 'graphiteCrawl'])
// Match the recipe rather than the id: copied/exported brushes keep support,
// while an edited script cannot accidentally connect unrelated marks as a fill.
const recipes = new Map(BUILTIN_BRUSHES.filter(brush => supportedIds.has(brush.id)).map(brush => [
  brush.animationJs, { profile: brush.id as BrushFillProfile, renderer: brush.renderer },
]))

export function getBrushFillProfile(brush: BrushV2): BrushFillProfile | null {
  if (!brush.animated) return brush.renderer === 'line' || brush.renderer === 'ribbon' ? 'static' : null
  const recipe = recipes.get(brush.animationJs)
  if ((recipe?.profile === 'textureBoil' || recipe?.profile === 'graphiteCrawl') &&
    (brush.stamps.length !== 1 || brush.stamps[0] !== 'dot')) return null
  return recipe?.renderer === brush.renderer ? recipe.profile : null
}

export function getBrushFillKind(brush: BrushV2): BrushFillKind | null {
  const profile = getBrushFillProfile(brush)
  if (profile === 'textureBoil') return 'texture-boil'
  if (profile === 'graphiteCrawl') return 'graphite'
  return profile ? 'solid' : null
}
