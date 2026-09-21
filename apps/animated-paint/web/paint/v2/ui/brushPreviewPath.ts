import { emptyPoint } from '../core/defaults'
import { getBrushFillKind } from '../core/fill'
import type { BrushV2 } from '../core/types'
import { WEATHER_BRUSHES } from '../weatherPresets'

export function usesClosedPreview(brush: BrushV2): boolean {
  return getBrushFillKind(brush) !== null && (brush.closedPath || brush.fill.enabled)
}

export function closedPreviewPoints(width: number, height: number) {
  return Array.from({ length: 64 }, (_, index) => {
    const progress = index / 63
    const angle = progress * Math.PI * 2
    return {
      ...emptyPoint(
        width * (0.5 + Math.cos(angle) * 0.33),
        height * (0.51 + Math.sin(angle) * 0.3),
        progress * 0.8,
      ),
      pressure: 0.7 + Math.sin(angle) * 0.15,
    }
  })
}

/** Leave room for weather to travel, and demonstrate captured pressure/speed. */
export function brushPreviewPoints(brush: BrushV2, width: number, height: number) {
  if (usesClosedPreview(brush)) return closedPreviewPoints(width, height)
  // Match the recipe so imported or duplicated brushes get the same useful pose.
  const weather = WEATHER_BRUSHES.find((preset) => preset.animationJs === brush.animationJs)?.id
  return Array.from({ length: 64 }, (_, index) => {
    const progress = index / 63
    const baseline = weather === 'rainStreaks' ? 0.14 : weather === 'softSmoke' ? 0.78 : 0.515625
    const amplitude = weather ? 0.025 : 0.1953125
    return {
      ...emptyPoint(
        width * (0.108333 + progress * 0.783334),
        height * (baseline + Math.sin(progress * Math.PI * 2) * amplitude),
        progress * 0.8,
      ),
      pressure: 0.55 + Math.sin(progress * Math.PI) * 0.4,
      velocity: 30 + (0.5 + Math.sin(progress * Math.PI * 2) * 0.5) * 470,
    }
  })
}
