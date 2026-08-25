import type {
  AnimatableProperty,
  EditorNode,
  KeyframeValue,
  LayerEffect,
} from './types'
export type { KeyframeValue } from './types'

export const TRANSFORM_PROPERTIES: AnimatableProperty[] = [
  'position.x',
  'position.y',
  'rotation',
  'scale.x',
  'scale.y',
  'skew.x',
  'skew.y',
  'opacity',
]

const COLOR_PROPERTIES = new Set<string>([
  'fill',
  'stroke',
  'brush.color',
  'chroma.color',
])

const effectPattern =
  /^effect\.([^.]+)\.(radius|opacity|color|offset\.x|offset\.y)$/

export function isColorProperty(property: AnimatableProperty) {
  return COLOR_PROPERTIES.has(property) || property.endsWith('.color')
}

export function isTransformProperty(property: AnimatableProperty) {
  return TRANSFORM_PROPERTIES.includes(property)
}

export function parseHexColor(value: string) {
  const hex = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(hex)
  if (short) {
    const [r, g, b] = short[1].split('')
    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
    }
  }
  const full = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!full) return null
  return {
    r: Number.parseInt(full[1].slice(0, 2), 16),
    g: Number.parseInt(full[1].slice(2, 4), 16),
    b: Number.parseInt(full[1].slice(4, 6), 16),
  }
}

export function formatHexColor(r: number, g: number, b: number) {
  const byte = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

export function mixHex(from: string, to: string, progress: number) {
  const start = parseHexColor(from)
  const end = parseHexColor(to)
  if (!start || !end) return progress < 1 ? from : to
  return formatHexColor(
    start.r + (end.r - start.r) * progress,
    start.g + (end.g - start.g) * progress,
    start.b + (end.b - start.b) * progress,
  )
}

export function parseEffectChannel(property: AnimatableProperty) {
  const match = effectPattern.exec(property)
  if (!match) return null
  return {
    effectId: match[1],
    field: match[2] as 'radius' | 'opacity' | 'color' | 'offset.x' | 'offset.y',
  }
}

export function readChannel(
  node: EditorNode,
  property: AnimatableProperty,
): KeyframeValue | undefined {
  const effect = parseEffectChannel(property)
  if (effect) {
    const item = node.effects.find((entry) => entry.id === effect.effectId)
    if (!item) return undefined
    if (effect.field === 'radius') return item.radius
    if (effect.field === 'opacity' && 'opacity' in item) return item.opacity
    if (effect.field === 'color' && 'color' in item) return item.color
    if (effect.field === 'offset.x' && 'offset' in item) return item.offset.x
    if (effect.field === 'offset.y' && 'offset' in item) return item.offset.y
    return undefined
  }

  switch (property) {
    case 'position.x':
      return node.transform.position.x
    case 'position.y':
      return node.transform.position.y
    case 'rotation':
      return node.transform.rotation
    case 'scale.x':
      return node.transform.scale.x
    case 'scale.y':
      return node.transform.scale.y
    case 'skew.x':
      return node.transform.skew.x
    case 'skew.y':
      return node.transform.skew.y
    case 'opacity':
      return node.transform.opacity
    case 'fill':
      return 'fill' in node ? node.fill : undefined
    case 'stroke':
      return 'stroke' in node ? node.stroke : undefined
    case 'strokeWidth':
      return 'strokeWidth' in node ? node.strokeWidth : undefined
    case 'path.trimStart':
      return node.type === 'path' ? node.trimStart : undefined
    case 'path.trimEnd':
      return node.type === 'path' ? node.trimEnd : undefined
    case 'path.trimOffset':
      return node.type === 'path' ? node.trimOffset : undefined
    case 'width':
      return 'width' in node ? node.width : undefined
    case 'height':
      return 'height' in node ? node.height : undefined
    case 'rx':
      return 'rx' in node ? node.rx : undefined
    case 'ry':
      return 'ry' in node ? node.ry : undefined
    case 'fontSize':
      return node.type === 'text' ? node.fontSize : undefined
    case 'letterSpacing':
      return node.type === 'text' ? node.letterSpacing : undefined
    case 'fontWeight':
      return node.type === 'text' ? node.fontWeight : undefined
    case 'brush.size':
      return node.type === 'brush' ? node.settings.size : undefined
    case 'brush.color':
      return node.type === 'brush' ? node.settings.color : undefined
    case 'brightness':
      return node.type === 'image' ? node.adjustments.brightness : undefined
    case 'contrast':
      return node.type === 'image' ? node.adjustments.contrast : undefined
    case 'saturation':
      return node.type === 'image' ? node.adjustments.saturation : undefined
    case 'chroma.color':
      return node.type === 'image' ? node.adjustments.chroma.color : undefined
    case 'chroma.tolerance':
      return node.type === 'image' ? node.adjustments.chroma.tolerance : undefined
    case 'chroma.feather':
      return node.type === 'image' ? node.adjustments.chroma.feather : undefined
    case 'crop.x':
      return node.type === 'image' ? node.crop.x : undefined
    case 'crop.y':
      return node.type === 'image' ? node.crop.y : undefined
    case 'crop.width':
      return node.type === 'image' ? node.crop.width : undefined
    case 'crop.height':
      return node.type === 'image' ? node.crop.height : undefined
    case 'path.points':
      return node.type === 'path' ? node.points : undefined
    case 'motionPath.progress':
      return node.motionPath?.progress
  }
}

export function writeChannel(
  node: EditorNode,
  property: AnimatableProperty,
  value: KeyframeValue,
): EditorNode {
  const effect = parseEffectChannel(property)
  if (effect) {
    return {
      ...node,
      effects: node.effects.map((item) =>
        patchEffect(item, effect.effectId, effect.field, value),
      ),
    }
  }

  const amount = typeof value === 'number' ? value : Number(value)
  switch (property) {
    case 'position.x':
      return {
        ...node,
        transform: {
          ...node.transform,
          position: { ...node.transform.position, x: amount },
        },
      }
    case 'position.y':
      return {
        ...node,
        transform: {
          ...node.transform,
          position: { ...node.transform.position, y: amount },
        },
      }
    case 'rotation':
      return { ...node, transform: { ...node.transform, rotation: amount } }
    case 'scale.x':
      return {
        ...node,
        transform: {
          ...node.transform,
          scale: { ...node.transform.scale, x: amount },
        },
      }
    case 'scale.y':
      return {
        ...node,
        transform: {
          ...node.transform,
          scale: { ...node.transform.scale, y: amount },
        },
      }
    case 'skew.x':
      return {
        ...node,
        transform: {
          ...node.transform,
          skew: { ...node.transform.skew, x: amount },
        },
      }
    case 'skew.y':
      return {
        ...node,
        transform: {
          ...node.transform,
          skew: { ...node.transform.skew, y: amount },
        },
      }
    case 'opacity':
      return { ...node, transform: { ...node.transform, opacity: amount } }
    case 'fill':
      return 'fill' in node ? { ...node, fill: String(value) } : node
    case 'stroke':
      return 'stroke' in node ? { ...node, stroke: String(value) } : node
    case 'strokeWidth':
      return 'strokeWidth' in node ? { ...node, strokeWidth: amount } : node
    case 'path.trimStart':
      return node.type === 'path' ? { ...node, trimStart: amount } : node
    case 'path.trimEnd':
      return node.type === 'path' ? { ...node, trimEnd: amount } : node
    case 'path.trimOffset':
      return node.type === 'path' ? { ...node, trimOffset: amount } : node
    case 'width':
      return 'width' in node ? { ...node, width: amount } : node
    case 'height':
      return 'height' in node ? { ...node, height: amount } : node
    case 'rx':
      return 'rx' in node ? { ...node, rx: amount } : node
    case 'ry':
      return 'ry' in node ? { ...node, ry: amount } : node
    case 'fontSize':
      return node.type === 'text' ? { ...node, fontSize: amount } : node
    case 'letterSpacing':
      return node.type === 'text' ? { ...node, letterSpacing: amount } : node
    case 'fontWeight':
      return node.type === 'text' ? { ...node, fontWeight: amount } : node
    case 'brush.size':
      return node.type === 'brush'
        ? { ...node, settings: { ...node.settings, size: amount } }
        : node
    case 'brush.color':
      return node.type === 'brush'
        ? { ...node, settings: { ...node.settings, color: String(value) } }
        : node
    case 'brightness':
      return node.type === 'image'
        ? {
            ...node,
            adjustments: { ...node.adjustments, brightness: amount },
          }
        : node
    case 'contrast':
      return node.type === 'image'
        ? { ...node, adjustments: { ...node.adjustments, contrast: amount } }
        : node
    case 'saturation':
      return node.type === 'image'
        ? {
            ...node,
            adjustments: { ...node.adjustments, saturation: amount },
          }
        : node
    case 'chroma.color':
      return node.type === 'image'
        ? {
            ...node,
            adjustments: {
              ...node.adjustments,
              chroma: { ...node.adjustments.chroma, color: String(value) },
            },
          }
        : node
    case 'chroma.tolerance':
      return node.type === 'image'
        ? {
            ...node,
            adjustments: {
              ...node.adjustments,
              chroma: { ...node.adjustments.chroma, tolerance: amount },
            },
          }
        : node
    case 'chroma.feather':
      return node.type === 'image'
        ? {
            ...node,
            adjustments: {
              ...node.adjustments,
              chroma: { ...node.adjustments.chroma, feather: amount },
            },
          }
        : node
    case 'crop.x':
      return node.type === 'image'
        ? { ...node, crop: { ...node.crop, x: amount } }
        : node
    case 'crop.y':
      return node.type === 'image'
        ? { ...node, crop: { ...node.crop, y: amount } }
        : node
    case 'crop.width':
      return node.type === 'image'
        ? { ...node, crop: { ...node.crop, width: amount } }
        : node
    case 'crop.height':
      return node.type === 'image'
        ? { ...node, crop: { ...node.crop, height: amount } }
        : node
    case 'path.points':
      return node.type === 'path' && Array.isArray(value)
        ? { ...node, points: value }
        : node
    case 'motionPath.progress':
      return node.motionPath
        ? {
            ...node,
            motionPath: {
              ...node.motionPath,
              progress: Math.min(1, Math.max(0, amount)),
            },
          }
        : node
    default:
      return node
  }
}

function patchEffect(
  item: LayerEffect,
  effectId: string,
  field: 'radius' | 'opacity' | 'color' | 'offset.x' | 'offset.y',
  value: KeyframeValue,
): LayerEffect {
  if (item.id !== effectId) return item
  const amount = typeof value === 'number' ? value : Number(value)
  if (field === 'radius') return { ...item, radius: amount }
  if (field === 'opacity' && 'opacity' in item) {
    return { ...item, opacity: amount }
  }
  if (field === 'color' && 'color' in item) {
    return { ...item, color: String(value) }
  }
  if (field === 'offset.x' && 'offset' in item) {
    return { ...item, offset: { ...item.offset, x: amount } }
  }
  if (field === 'offset.y' && 'offset' in item) {
    return { ...item, offset: { ...item.offset, y: amount } }
  }
  return item
}

export function animatedEditsFromPatch(update: Record<string, unknown>) {
  const edits: { property: AnimatableProperty; value: KeyframeValue }[] = []
  const push = (property: AnimatableProperty, value: unknown) => {
    if (value === undefined) return
    edits.push({ property, value: value as KeyframeValue })
  }

  push('fill', update.fill)
  push('stroke', update.stroke)
  push('strokeWidth', update.strokeWidth)
  push('width', update.width)
  push('height', update.height)
  push('rx', update.rx)
  push('ry', update.ry)
  push('fontSize', update.fontSize)
  push('letterSpacing', update.letterSpacing)
  push('fontWeight', update.fontWeight)
  push('path.points', update.points)
  push('path.trimStart', update.trimStart)
  push('path.trimEnd', update.trimEnd)
  push('path.trimOffset', update.trimOffset)

  const motionPath = update.motionPath as { progress?: number } | undefined
  if (motionPath) push('motionPath.progress', motionPath.progress)

  const settings = update.settings as { size?: number; color?: string } | undefined
  if (settings) {
    push('brush.size', settings.size)
    push('brush.color', settings.color)
  }
  const adjustments = update.adjustments as
    | {
        brightness?: number
        contrast?: number
        saturation?: number
        chroma?: { color?: string; tolerance?: number; feather?: number }
      }
    | undefined
  if (adjustments) {
    push('brightness', adjustments.brightness)
    push('contrast', adjustments.contrast)
    push('saturation', adjustments.saturation)
    if (adjustments.chroma) {
      push('chroma.color', adjustments.chroma.color)
      push('chroma.tolerance', adjustments.chroma.tolerance)
      push('chroma.feather', adjustments.chroma.feather)
    }
  }
  const crop = update.crop as
    | { x?: number; y?: number; width?: number; height?: number }
    | undefined
  if (crop) {
    push('crop.x', crop.x)
    push('crop.y', crop.y)
    push('crop.width', crop.width)
    push('crop.height', crop.height)
  }
  const effects = update.effects as LayerEffect[] | undefined
  if (effects) {
    for (const effect of effects) {
      push(`effect.${effect.id}.radius`, effect.radius)
      if ('opacity' in effect) push(`effect.${effect.id}.opacity`, effect.opacity)
      if ('color' in effect) push(`effect.${effect.id}.color`, effect.color)
      if ('offset' in effect) {
        push(`effect.${effect.id}.offset.x`, effect.offset.x)
        push(`effect.${effect.id}.offset.y`, effect.offset.y)
      }
    }
  }
  return edits
}
