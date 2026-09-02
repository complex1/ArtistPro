import {
  MAX_DOCUMENT_SIZE,
  MIN_DOCUMENT_SIZE,
  type BlendMode,
  type DrawDocument,
  type DrawLayer,
} from './types'

export function clampSize(value: number, fallback: number): number {
  const next = Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(MAX_DOCUMENT_SIZE, Math.max(MIN_DOCUMENT_SIZE, next))
}

export function createLayer(name = 'Layer 1'): DrawLayer {
  return {
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
  }
}

export function createDocument(
  name = 'Untitled',
  width = 800,
  height = 600,
): DrawDocument {
  const layer = createLayer()
  return {
    version: 1,
    name,
    width: clampSize(width, 800),
    height: clampSize(height, 600),
    background: '#ffffff',
    layers: [layer],
    activeLayerId: layer.id,
  }
}

export const BLEND_MODES: BlendMode[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'erase',
]

export function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && BLEND_MODES.includes(value as BlendMode)
}
