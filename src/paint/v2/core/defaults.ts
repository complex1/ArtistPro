import type {
  BlendModeV2,
  BrushV2,
  LayerV2,
  PaintDocumentV2,
  ParticleConfig,
  RendererIdV2,
  RotationMode,
  ScatterConfig,
  ShadowConfig,
  StrokePointV2,
} from './types'

export const STATIC_ANIMATION_JS = `function animate(points, config, time) {
  return [];
}
`

export const DEFAULT_SHADOW: ShadowConfig = {
  offsetX: 0,
  offsetY: 0,
  blur: 0,
  color: '#000000',
  opacity: 0,
}

export const DEFAULT_SCATTER: ScatterConfig = {
  along: 0,
  across: 0,
  seed: 1,
}

export const DEFAULT_PARTICLE: ParticleConfig = {
  count: 1,
  lifetime: 1,
  velocity: 0,
  gravity: 0,
  spawn: 1,
}

const RENDERERS = new Set<RendererIdV2>([
  'stamp',
  'line',
  'ribbon',
  'particle',
])
const ROTATIONS = new Set<RotationMode>(['fixed', 'followPath', 'random'])
const BLENDS = new Set<BlendModeV2>([
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
])

export function isRendererId(value: unknown): value is RendererIdV2 {
  return typeof value === 'string' && RENDERERS.has(value as RendererIdV2)
}

export function isRotationMode(value: unknown): value is RotationMode {
  return typeof value === 'string' && ROTATIONS.has(value as RotationMode)
}

export function isBlendMode(value: unknown): value is BlendModeV2 {
  return typeof value === 'string' && BLENDS.has(value as BlendModeV2)
}

export function clampNumber(
  value: unknown,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  const next = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, next))
}

export function createBrushV2(partial: Partial<BrushV2> = {}): BrushV2 {
  return {
    id: partial.id ?? crypto.randomUUID(),
    version: partial.version ?? 1,
    name: partial.name ?? 'Untitled brush',
    category: partial.category ?? 'Custom',
    preview: partial.preview,
    renderer: partial.renderer ?? 'stamp',
    animated: partial.animated ?? false,
    size: partial.size ?? 12,
    color: partial.color ?? '#111111',
    opacity: partial.opacity ?? 1,
    stamps: partial.stamps ? [...partial.stamps] : ['dot'],
    spacing: partial.spacing ?? 10,
    scatter: { ...DEFAULT_SCATTER, ...partial.scatter },
    stability: partial.stability ?? 35,
    blurRadius: partial.blurRadius ?? 0,
    glow: partial.glow ?? 0,
    shadow: { ...DEFAULT_SHADOW, ...partial.shadow },
    rotation: partial.rotation ?? 'followPath',
    rotationDegrees: partial.rotationDegrees ?? 0,
    stampsPerPoint: partial.stampsPerPoint ?? 1,
    drift: partial.drift ?? 0,
    distortion: partial.distortion ?? 0,
    blendMode: partial.blendMode ?? 'source-over',
    hardness: partial.hardness ?? 1,
    particle: { ...DEFAULT_PARTICLE, ...partial.particle },
    speed: partial.speed ?? 1,
    seed: partial.seed ?? 1,
    animationJs: partial.animationJs ?? STATIC_ANIMATION_JS,
    legacy: partial.legacy,
  }
}

export function cloneBrushV2(brush: BrushV2, nextId?: string): BrushV2 {
  return createBrushV2({
    ...structuredClone(brush),
    id: nextId ?? crypto.randomUUID(),
    name: nextId ? `${brush.name} copy` : brush.name,
  })
}

export function createLayerV2(name = 'Layer 1'): LayerV2 {
  return {
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    rasterDataUrl: null,
    eraseMaskDataUrl: null,
    strokes: [],
  }
}

export function createDocumentV2(
  name = 'Untitled',
  width = 900,
  height = 600,
): PaintDocumentV2 {
  const layer = createLayerV2()
  return {
    version: 2,
    name,
    width,
    height,
    background: '#ffffff',
    layers: [layer],
    activeLayerId: layer.id,
  }
}

export function emptyPoint(x: number, y: number, t = 0): StrokePointV2 {
  return {
    x,
    y,
    t,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    altitude: 0,
    velocity: 0,
  }
}
