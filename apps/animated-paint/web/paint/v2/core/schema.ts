import {
  clampNumber,
  createBrushV2,
  createDocumentV2,
  createLayerV2,
  DEFAULT_PARTICLE,
  DEFAULT_SCATTER,
  DEFAULT_SHADOW,
  isBlendMode,
  isRendererId,
  isRotationMode,
  STATIC_ANIMATION_JS,
} from './defaults'
import type {
  AnimationTiming,
  BrushV2,
  DrawItem,
  ImageLayerV2Data,
  LayerV2,
  PaintDocumentV2,
  ScatterConfig,
  ShadowConfig,
  StrokePointV2,
  StrokeV2,
} from './types'
import { DEFAULT_BUDGETS } from './types'
import { upgradeParsedBrush } from './brushUpgrades'

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function parseShadow(value: unknown): ShadowConfig {
  if (!isObject(value)) return { ...DEFAULT_SHADOW }
  return {
    offsetX: clampNumber(value.offsetX, 0, -200, 200),
    offsetY: clampNumber(value.offsetY, 0, -200, 200),
    blur: clampNumber(value.blur, 0, 0, DEFAULT_BUDGETS.maxBlurRadius),
    color: asString(value.color, '#000000'),
    opacity: clampNumber(value.opacity, 0, 0, 1),
  }
}

export function parseScatter(value: unknown): ScatterConfig {
  if (!isObject(value)) return { ...DEFAULT_SCATTER }
  return {
    along: clampNumber(value.along, 0, 0, 200),
    across: clampNumber(value.across, 0, 0, 200),
    seed: clampNumber(value.seed, 1),
  }
}

export function parsePoint(value: unknown): StrokePointV2 | null {
  if (!isObject(value)) return null
  if (typeof value.x !== 'number' || typeof value.y !== 'number') return null
  return {
    x: value.x,
    y: value.y,
    t: clampNumber(value.t, 0, 0),
    pressure: clampNumber(value.pressure, 0.5, 0, 1),
    tiltX: clampNumber(value.tiltX, 0, -1, 1),
    tiltY: clampNumber(value.tiltY, 0, -1, 1),
    altitude: clampNumber(value.altitude, 0, 0, Math.PI / 2),
    velocity: clampNumber(value.velocity, 0, 0),
  }
}

function parseTiming(value: unknown): AnimationTiming | undefined {
  if (!isObject(value) || typeof value.sourceHash !== 'string') return undefined
  if (value.mode === 'static') return { mode: 'static', sourceHash: value.sourceHash }
  if (value.mode === 'stepped') return { mode: 'stepped', sourceHash: value.sourceHash,
    fps: clampNumber(value.fps, 12, 1, 120) }
  if (value.mode === 'once') return { mode: 'once', sourceHash: value.sourceHash,
    settleSeconds: clampNumber(value.settleSeconds, 3, 0.01, 3600) }
  return undefined
}

export function parseBrush(value: unknown): BrushV2 | null {
  if (!isObject(value)) return null
  const stamps = Array.isArray(value.stamps)
    ? value.stamps.filter((item): item is string => typeof item === 'string')
    : ['dot']
  const particle = isObject(value.particle) ? value.particle : {}
  const fill = isObject(value.fill) ? value.fill : {}
  return upgradeParsedBrush(createBrushV2({
    id: asString(value.id, crypto.randomUUID()),
    version: clampNumber(value.version, 1, 1),
    name: asString(value.name, 'Untitled brush'),
    category: asString(value.category, 'Custom'),
    preview: typeof value.preview === 'string' ? value.preview : undefined,
    renderer: isRendererId(value.renderer) ? value.renderer : 'stamp',
    animated: asBoolean(value.animated, false),
    closedPath: asBoolean(value.closedPath, false),
    fill: { enabled: asBoolean(fill.enabled, false), outline: asBoolean(fill.outline, true) },
    size: clampNumber(value.size, 12, 0.5, 400),
    color: asString(value.color, '#111111'),
    opacity: clampNumber(value.opacity, 1, 0, 1),
    stamps: stamps.length > 0 ? stamps : ['dot'],
    spacing: clampNumber(value.spacing, 10, 0.5, 200),
    scatter: parseScatter(value.scatter),
    stability: clampNumber(value.stability, 35, 0, 100),
    blurRadius: clampNumber(value.blurRadius, 0, 0, DEFAULT_BUDGETS.maxBlurRadius),
    glow: clampNumber(value.glow, 0, 0, 80),
    shadow: parseShadow(value.shadow),
    rotation: isRotationMode(value.rotation) ? value.rotation : 'followPath',
    rotationDegrees: clampNumber(value.rotationDegrees, 0, -360, 360),
    stampsPerPoint: Math.round(clampNumber(value.stampsPerPoint, 1, 1, 32)),
    drift: clampNumber(value.drift, 0, 0, 200),
    distortion: clampNumber(value.distortion, 0, 0, 1),
    blendMode: isBlendMode(value.blendMode) ? value.blendMode : 'source-over',
    hardness: clampNumber(value.hardness, 1, 0, 1),
    particle: {
      count: clampNumber(particle.count, DEFAULT_PARTICLE.count, 1, 64),
      lifetime: clampNumber(particle.lifetime, DEFAULT_PARTICLE.lifetime, 0.05, 20),
      velocity: clampNumber(particle.velocity, DEFAULT_PARTICLE.velocity, 0, 400),
      gravity: clampNumber(particle.gravity, DEFAULT_PARTICLE.gravity, -400, 400),
      spawn: clampNumber(particle.spawn, DEFAULT_PARTICLE.spawn, 0, 8),
    },
    speed: clampNumber(value.speed, 1, 0, 20),
    seed: clampNumber(value.seed, 1),
    animationJs:
      typeof value.animationJs === 'string' && value.animationJs.trim()
        ? value.animationJs
        : STATIC_ANIMATION_JS,
    animationTiming: parseTiming(value.animationTiming),
    legacy: isObject(value.legacy) ? value.legacy : undefined,
  }))
}

export function parseStroke(value: unknown): StrokeV2 | null {
  if (!isObject(value)) return null
  const brush = parseBrush(value.brushSnapshot)
  if (!brush) return null
  const points = Array.isArray(value.points)
    ? value.points
        .map(parsePoint)
        .filter((point): point is StrokePointV2 => point !== null)
        .slice(0, DEFAULT_BUDGETS.maxSourcePoints)
    : []
  return {
    id: asString(value.id, crypto.randomUUID()),
    layerId: asString(value.layerId, ''),
    brushSnapshot: brush,
    points,
    seed: clampNumber(value.seed, brush.seed),
    createdAt: clampNumber(value.createdAt, 0, 0),
  }
}

function parseImageLayerData(value: unknown): ImageLayerV2Data | undefined {
  if (!isObject(value) || typeof value.dataUrl !== 'string' ||
      !/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,.+/i.test(value.dataUrl)) return undefined
  if (typeof value.naturalWidth !== 'number' || !Number.isFinite(value.naturalWidth) || value.naturalWidth <= 0 ||
      typeof value.naturalHeight !== 'number' || !Number.isFinite(value.naturalHeight) || value.naturalHeight <= 0) return undefined
  const naturalWidth = clampNumber(value.naturalWidth, 1, 1, 32768)
  const naturalHeight = clampNumber(value.naturalHeight, 1, 1, 32768)
  return {
    dataUrl: value.dataUrl,
    naturalWidth,
    naturalHeight,
    x: clampNumber(value.x, 0, -1_000_000, 1_000_000),
    y: clampNumber(value.y, 0, -1_000_000, 1_000_000),
    width: clampNumber(value.width, naturalWidth, 0.5, 32768),
    height: clampNumber(value.height, naturalHeight, 0.5, 32768),
  }
}

export function parseLayer(value: unknown): LayerV2 | null {
  if (!isObject(value)) return null
  const layer = createLayerV2(asString(value.name, 'Layer'))
  layer.id = asString(value.id, layer.id)
  layer.visible = asBoolean(value.visible, true)
  layer.opacity = clampNumber(value.opacity, 1, 0, 1)
  layer.blendMode = isBlendMode(value.blendMode) ? value.blendMode : 'source-over'
  layer.groupId = typeof value.groupId === 'string' ? value.groupId : undefined
  const image = value.kind === 'image' ? parseImageLayerData(value.image) : undefined
  if (image) { layer.kind = 'image'; layer.image = image }
  layer.rasterDataUrl =
    typeof value.rasterDataUrl === 'string' ? value.rasterDataUrl : null
  layer.eraseMaskDataUrl =
    typeof value.eraseMaskDataUrl === 'string' ? value.eraseMaskDataUrl : null
  layer.strokes = Array.isArray(value.strokes)
    ? value.strokes
        .map(parseStroke)
        .filter((stroke): stroke is StrokeV2 => stroke !== null)
    : []
  return layer
}

export function parseDocument(value: unknown): PaintDocumentV2 | null {
  if (!isObject(value) || value.version !== 2) return null
  const fallback = createDocumentV2()
  const layers = Array.isArray(value.layers)
    ? value.layers
        .map(parseLayer)
        .filter((layer): layer is LayerV2 => layer !== null)
    : []
  const resolved = layers.length > 0 ? layers : fallback.layers
  const active =
    typeof value.activeLayerId === 'string' &&
    resolved.some((layer) => layer.id === value.activeLayerId)
      ? value.activeLayerId
      : resolved[0].id
  return {
    version: 2,
    name: asString(value.name, 'Untitled'),
    width: clampNumber(value.width, 900, 32, 8192),
    height: clampNumber(value.height, 600, 32, 8192),
    background: asString(value.background, '#ffffff'),
    layers: resolved,
    activeLayerId: active,
  }
}

export function parseDrawItem(value: unknown): DrawItem | null {
  if (!isObject(value)) return null
  if (typeof value.x !== 'number' || typeof value.y !== 'number') return null
  const kind =
    value.kind === 'particle' || value.kind === 'segment' ? value.kind : 'stamp'
  return {
    x: value.x,
    y: value.y,
    size: clampNumber(value.size, 8, 0.25, 400),
    rotation: clampNumber(value.rotation, 0),
    opacity: clampNumber(value.opacity, 1, 0, 1),
    color: asString(value.color, '#111111'),
    stampIndex: Math.max(0, Math.floor(clampNumber(value.stampIndex, 0, 0))),
    blur: clampNumber(value.blur, 0, 0, DEFAULT_BUDGETS.maxBlurRadius),
    glow: clampNumber(value.glow, 0, 0, 80),
    shadow: parseShadow(value.shadow),
    kind,
    breakBefore: value.breakBefore === true,
    life: typeof value.life === 'number' ? value.life : undefined,
    vx: typeof value.vx === 'number' ? value.vx : undefined,
    vy: typeof value.vy === 'number' ? value.vy : undefined,
    scaleX: clampNumber(value.scaleX, 1, 0.05, 20),
    scaleY: clampNumber(value.scaleY, 1, 0.05, 20),
  }
}

export function parseDrawList(value: unknown): DrawItem[] {
  if (!Array.isArray(value)) return []
  const items: DrawItem[] = []
  for (const entry of value) {
    if (items.length >= DEFAULT_BUDGETS.maxDrawItems) break
    const item = parseDrawItem(entry)
    if (item) items.push(item)
  }
  return items
}
