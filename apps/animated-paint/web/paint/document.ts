import type {
  BrushPreset,
  PaintDocument,
  PaintLayer,
  PaintStroke,
  StrokePoint,
} from './engine/types'
import { sanitizeBrushExpressions } from './engine/expression'

export function createPaintLayer(name = 'Layer 1'): PaintLayer {
  return {
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    rasterDataUrl: null,
    strokes: [],
  }
}

export function createPaintDocument(
  name = 'Untitled',
  width = 900,
  height = 600,
): PaintDocument {
  const layer = createPaintLayer()
  return {
    version: 1,
    name,
    width,
    height,
    background: '#ffffff',
    layers: [layer],
    activeLayerId: layer.id,
  }
}

export function createPaintStroke(
  preset: BrushPreset,
  points: StrokePoint[],
  options: {
    color: string
    size: number
    motion: number
    speed: number
  },
): PaintStroke {
  return {
    id: crypto.randomUUID(),
    presetId: preset.id,
    renderer: preset.renderer,
    animation: preset.animation,
    stamp: preset.stamp,
    particle: preset.particle,
    nature: preset.nature,
    color: options.color,
    size: options.size,
    motion: options.motion,
    speed: options.speed,
    opacity: preset.opacity ?? 1,
    glow: preset.glow ?? 0,
    spacing: preset.spacing ?? 14,
    density: preset.density ?? 1,
    widthScale: preset.widthScale ?? 1,
    dash: preset.dash ?? null,
    expressions: sanitizeBrushExpressions(preset.expressions),
    points,
    seed: Math.random() * 10_000,
  }
}
