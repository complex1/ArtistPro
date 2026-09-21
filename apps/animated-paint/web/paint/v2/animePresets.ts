import { ANIME_ACCENT_BRUSHES } from './animeAccentPresets'
import { ANIME_MOTION_BRUSHES } from './animeMotionPresets'
import type { BrushV2 } from './core/types'

export const ANIME_BRUSHES: BrushV2[] = [
  ...ANIME_MOTION_BRUSHES,
  ...ANIME_ACCENT_BRUSHES,
]
