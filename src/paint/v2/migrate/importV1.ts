import { createBrushV2, createLayerV2, emptyPoint } from '../core/defaults'
import { STATIC_ANIMATION_JS } from '../core/defaults'
import type { BrushV2, PaintDocumentV2, StrokePointV2, StrokeV2 } from '../core/types'
import { ANIMATION_JS_BY_V1, getBuiltinBrush } from '../presets'

type V1Point = { x: number; y: number; pressure?: number }
type V1Stroke = {
  id?: string
  presetId?: string
  renderer?: string
  animation?: string
  stamp?: string
  color?: string
  size?: number
  opacity?: number
  glow?: number
  spacing?: number
  expressions?: Record<string, unknown>
  points?: V1Point[]
  seed?: number
}
type V1Layer = {
  id?: string
  name?: string
  visible?: boolean
  opacity?: number
  blendMode?: string
  groupId?: string
  rasterDataUrl?: string | null
  strokes?: V1Stroke[]
}
type V1Document = {
  version?: number
  name?: string
  width?: number
  height?: number
  background?: string
  layers?: V1Layer[]
  activeLayerId?: string
}

function mapRenderer(value: string | undefined): BrushV2['renderer'] {
  if (value === 'ribbon') return 'ribbon'
  if (value === 'particle' || value === 'nature' || value === 'aura') return 'particle'
  if (value === 'stamp') return 'stamp'
  return 'line'
}

function brushFromV1Stroke(stroke: V1Stroke): BrushV2 {
  const builtin = stroke.presetId ? getBuiltinBrush(stroke.presetId) : null
  const animation = stroke.animation ?? 'none'
  const animationJs = ANIMATION_JS_BY_V1[animation]
  const hasExpressions = !!stroke.expressions && Object.keys(stroke.expressions).length > 0
  const animated = !hasExpressions && !!animationJs && animation !== 'none'
  return createBrushV2({
    id: stroke.presetId ?? builtin?.id ?? 'round',
    name: builtin?.name ?? stroke.presetId ?? 'Imported',
    category: builtin?.category ?? 'Imported',
    renderer: mapRenderer(stroke.renderer),
    animated,
    size: stroke.size ?? builtin?.size ?? 12,
    color: stroke.color ?? '#111111',
    opacity: stroke.opacity ?? 1,
    stamps: stroke.stamp ? [stroke.stamp] : (builtin?.stamps ?? ['dot']),
    spacing: stroke.spacing ?? builtin?.spacing ?? 10,
    glow: stroke.glow ?? 0,
    animationJs: animated ? animationJs : STATIC_ANIMATION_JS,
    seed: stroke.seed ?? 1,
    legacy: hasExpressions
      ? {
          expressions: stroke.expressions,
          animation,
          warning: 'Custom formulas imported as a static fallback',
        }
      : animationJs
        ? undefined
        : { animation, warning: 'Unknown animation imported as static' },
  })
}

function mapPoints(points: V1Point[] | undefined): StrokePointV2[] {
  return (points ?? []).map((point, index) =>
    emptyPoint(point.x, point.y, index * 0.016),
  ).map((point, index, all) => ({
    ...point,
    pressure: points?.[index]?.pressure ?? 0.5,
    velocity:
      index > 0
        ? Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) / 0.016
        : 0,
  }))
}

export function importV1Document(value: unknown): PaintDocumentV2 | null {
  if (!value || typeof value !== 'object') return null
  const source = value as V1Document
  if (source.version !== 1 || !Array.isArray(source.layers)) return null

  const layers = source.layers.map((layer, layerIndex) => {
    const next = createLayerV2(layer.name ?? `Layer ${layerIndex + 1}`)
    next.id = typeof layer.id === 'string' ? layer.id : next.id
    next.visible = layer.visible !== false
    next.opacity = typeof layer.opacity === 'number' ? layer.opacity : 1
    next.blendMode =
      layer.blendMode === 'multiply' ||
      layer.blendMode === 'screen' ||
      layer.blendMode === 'overlay' ||
      layer.blendMode === 'darken' ||
      layer.blendMode === 'lighten'
        ? layer.blendMode
        : 'source-over'
    next.groupId = typeof layer.groupId === 'string' ? layer.groupId : undefined
    next.rasterDataUrl = typeof layer.rasterDataUrl === 'string' ? layer.rasterDataUrl : null
    next.strokes = (layer.strokes ?? []).map((stroke) => {
      const mapped: StrokeV2 = {
        id: typeof stroke.id === 'string' ? stroke.id : crypto.randomUUID(),
        layerId: next.id,
        brushSnapshot: brushFromV1Stroke(stroke),
        points: mapPoints(stroke.points),
        seed: stroke.seed ?? 1,
        createdAt: 0,
      }
      return mapped
    })
    return next
  })

  const active =
    typeof source.activeLayerId === 'string' &&
    layers.some((layer) => layer.id === source.activeLayerId)
      ? source.activeLayerId
      : layers[0]?.id ?? createLayerV2().id

  return {
    version: 2,
    name: source.name ?? 'Imported',
    width: source.width ?? 900,
    height: source.height ?? 600,
    background: source.background ?? '#ffffff',
    layers: layers.length > 0 ? layers : [createLayerV2()],
    activeLayerId: active,
  }
}
