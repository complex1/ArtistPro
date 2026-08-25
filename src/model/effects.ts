import { nanoid } from 'nanoid'
import type { EffectType, ImageAdjustments, LayerEffect } from './types'

export type FilterPrimitive = {
  tag: 'feGaussianBlur' | 'feDropShadow' | 'feColorMatrix'
  attributes: Record<string, string | number>
}

export const effectLabels: Record<EffectType, string> = {
  blur: 'Blur',
  'drop-shadow': 'Drop Shadow',
  glow: 'Glow',
}

export function createEffect(type: EffectType): LayerEffect {
  const base = { id: nanoid(), enabled: true }
  if (type === 'blur') {
    return { ...base, type, radius: 6 }
  }
  if (type === 'drop-shadow') {
    return {
      ...base,
      type,
      offset: { x: 6, y: 8 },
      radius: 6,
      color: '#000000',
      opacity: 0.45,
    }
  }
  return {
    ...base,
    type,
    radius: 8,
    color: '#4F8CFF',
    opacity: 0.7,
  }
}

const opacity = (value: number) => Math.min(1, Math.max(0, value))

/** SVG filter primitives in the same order as the layer's effect stack. */
export function filterPrimitives(effects: LayerEffect[]): FilterPrimitive[] {
  return effects
    .filter((effect) => effect.enabled)
    .map<FilterPrimitive>((effect) => {
      if (effect.type === 'blur') {
        return {
          tag: 'feGaussianBlur',
          attributes: {
            stdDeviation: Math.max(0, effect.radius),
          } as Record<string, string | number>,
        }
      }

      return {
        tag: 'feDropShadow',
        attributes: {
          dx: effect.type === 'glow' ? 0 : effect.offset.x,
          dy: effect.type === 'glow' ? 0 : effect.offset.y,
          stdDeviation: Math.max(0, effect.radius),
          'flood-color': effect.color,
          'flood-opacity': opacity(effect.opacity),
        } as Record<string, string | number>,
      }
    })
}

export function imageAdjustmentPrimitives(
  adjustments: ImageAdjustments,
): FilterPrimitive[] {
  const primitives: FilterPrimitive[] = []
  if (adjustments.brightness !== 0) {
    const value = Math.min(1, Math.max(-1, adjustments.brightness))
    primitives.push({
      tag: 'feColorMatrix',
      attributes: {
        type: 'matrix',
        values: `1 0 0 0 ${value} 0 1 0 0 ${value} 0 0 1 0 ${value} 0 0 0 1 0`,
      },
    })
  }
  if (adjustments.contrast !== 0) {
    const contrast = Math.max(0, 1 + adjustments.contrast)
    const offset = 0.5 - contrast * 0.5
    primitives.push({
      tag: 'feColorMatrix',
      attributes: {
        type: 'matrix',
        values: `${contrast} 0 0 0 ${offset} 0 ${contrast} 0 0 ${offset} 0 0 ${contrast} 0 ${offset} 0 0 0 1 0`,
      },
    })
  }
  if (adjustments.saturation !== 0) {
    primitives.push({
      tag: 'feColorMatrix',
      attributes: {
        type: 'saturate',
        values: Math.max(0, 1 + adjustments.saturation),
      },
    })
  }
  return primitives
}
