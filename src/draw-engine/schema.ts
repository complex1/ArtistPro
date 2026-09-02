import { applyShapeMask, isImageStamp, isShapeStamp, stampPaintSrc } from '../paint/v2/core/stamp'
import { createBrush } from './presets'
import { isBlendMode } from './document'
import type { BlendMode, BrushConfig, RotationMode, StampImage, TipKind } from './types'
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function clampNumber(
  value: unknown,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  const next = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, next))
}

const TIPS: TipKind[] = ['round', 'oval', 'grain', 'stamp']
const ROTATIONS: RotationMode[] = ['fixed', 'followPath', 'random']
const PRESETS = ['pen', 'pencil', 'marker', 'eraser', 'brush', 'stamp', 'soft', 'custom'] as const

function isTip(value: unknown): value is TipKind {
  return typeof value === 'string' && TIPS.includes(value as TipKind)
}

function isRotation(value: unknown): value is RotationMode {
  return typeof value === 'string' && ROTATIONS.includes(value as RotationMode)
}

function mapRendererToTip(renderer: unknown, stamps: string[]): TipKind {
  if (isTip(renderer)) return renderer
  if (renderer === 'line' || renderer === 'ribbon') return 'round'
  if (renderer === 'particle' || renderer === 'stamp') {
    return stamps.some((item) => isImageStamp(item) || isShapeStamp(item))
      ? 'stamp'
      : 'round'
  }
  return 'round'
}

export function parseBrush(value: unknown): BrushConfig | null {
  if (!isObject(value)) return null
  const stamps = Array.isArray(value.stamps)
    ? value.stamps.filter((item): item is string => typeof item === 'string')
    : ['dot']
  const resolvedStamps = stamps.length > 0 ? stamps : ['dot']
  const preset = PRESETS.includes(value.preset as (typeof PRESETS)[number])
    ? (value.preset as BrushConfig['preset'])
    : 'custom'
  const scatter = isObject(value.scatter) ? value.scatter : {}
  const pressure = isObject(value.pressure) ? value.pressure : {}
  const blend: BlendMode =
    value.preset === 'eraser' || value.blendMode === 'erase'
      ? 'erase'
      : isBlendMode(value.blendMode)
        ? value.blendMode
        : 'source-over'
  return createBrush({
    id: asString(value.id, crypto.randomUUID()),
    version: clampNumber(value.version, 1, 1),
    name: asString(value.name, 'Untitled brush'),
    category: asString(value.category, 'Custom'),
    preset,
    tip: mapRendererToTip(value.tip ?? value.renderer, resolvedStamps),
    size: clampNumber(value.size, 16, 0.5, 400),
    minSize: clampNumber(value.minSize, 1, 0.5, 400),
    color: asString(value.color, '#111111'),
    opacity: clampNumber(value.opacity, 1, 0, 1),
    flow: clampNumber(value.flow, 0.8, 0, 1),
    hardness: clampNumber(value.hardness, 0.85, 0, 1),
    spacing: clampNumber(value.spacing, 4, 0.5, 200),
    scatter: {
      along: clampNumber(scatter.along, 0, 0, 200),
      across: clampNumber(scatter.across, 0, 0, 200),
      seed: clampNumber(scatter.seed, 1),
    },
    stability: clampNumber(value.stability, 20, 0, 100),
    rotation: isRotation(value.rotation) ? value.rotation : 'followPath',
    rotationDegrees: clampNumber(value.rotationDegrees, 0, -360, 360),
    blendMode: blend,
    pressure: {
      size: clampNumber(pressure.size, 0.7, 0, 1),
      opacity: clampNumber(pressure.opacity, 0, 0, 1),
      flow: clampNumber(pressure.flow, 0.4, 0, 1),
    },
    stamps: resolvedStamps,
    stampImages: Array.isArray(value.stampImages)
      ? value.stampImages
          .map(parseStampImage)
          .filter((item): item is StampImage => item !== null)
      : [],
    seed: clampNumber(value.seed, 1),
  })
}

export function parseStampImage(value: unknown): StampImage | null {
  if (!isObject(value)) return null
  if (typeof value.width !== 'number' || typeof value.height !== 'number') return null
  const width = Math.max(1, Math.round(value.width))
  const height = Math.max(1, Math.round(value.height))
  const source = value.pixels
  const pixels = new Uint8ClampedArray(width * height * 4)
  if (source instanceof Uint8ClampedArray || source instanceof Uint8Array) {
    pixels.set(source.subarray(0, pixels.length))
  } else if (Array.isArray(source)) {
    for (let i = 0; i < pixels.length && i < source.length; i += 1) {
      const n = source[i]
      if (typeof n === 'number') pixels[i] = n
    }
  } else {
    return null
  }
  return { width, height, pixels }
}

export function stampImageFromCoverage(
  pixels: Uint8ClampedArray,
  invert: boolean,
): Uint8ClampedArray {
  const copy = new Uint8ClampedArray(pixels)
  applyShapeMask(copy, invert)
  return copy
}

export function importBrushFile(value: unknown): BrushConfig | null {
  const brush = parseBrush(value)
  if (!brush) return null
  brush.id = crypto.randomUUID()
  brush.category = 'Custom'
  brush.preset = 'custom'
  return brush
}

export { stampPaintSrc, isImageStamp, isShapeStamp }
