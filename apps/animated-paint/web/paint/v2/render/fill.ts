import { getBrushFillKind, getBrushFillProfile } from '../core/fill'
import { hashSeed, mulberry32 } from '../core/rng'
import { DEFAULT_BUDGETS, type BrushV2, type DrawItem, type StrokePointV2, type StrokeV2 } from '../core/types'
import { sampleStroke } from '../input/sampler'
import { context2d, createSurface, type PaintContext, type PaintSurface } from './surfaces'

type FillKind = NonNullable<ReturnType<typeof getBrushFillKind>>
export type StrokeFill = {
  boundary: DrawItem[]
  kind: FillKind
  color: string
  opacity: number
  size: number
  seed: number
  frame: number
  textureVariant: number
  rotationDegrees: number
  distortion: number
  stampsPerPoint: number
  blur: number
  glow: number
  shadow: BrushV2['shadow']
}

const TAU = Math.PI * 2
const EPSILON = 1e-6

/** Non-collinearity rather than signed area also admits figure-eight/even-odd shapes. */
export function canClosePath(points: StrokePointV2[]): boolean {
  if (points.length < 3) return false
  const first = points[0]
  const other = points.find(point => Math.hypot(point.x - first.x, point.y - first.y) > EPSILON)
  if (!other) return false
  const dx = other.x - first.x, dy = other.y - first.y
  return points.some(point => Math.abs(dx * (point.y - first.y) - dy * (point.x - first.x)) > EPSILON * Math.max(1, Math.hypot(dx, dy)))
}

export function usesClosedPath(stroke: StrokeV2): boolean {
  const brush = stroke.brushSnapshot
  return Boolean((brush.closedPath || brush.fill?.enabled) && getBrushFillProfile(brush) && canClosePath(stroke.points))
}

/** Resample every edge including last→first; preserve corners even at coarse spacing. */
export function sampleClosedPath(points: StrokePointV2[], spacing: number): StrokePointV2[] {
  const source: StrokePointV2[] = []
  for (const point of points.slice(0, DEFAULT_BUDGETS.maxSourcePoints)) {
    const previous = source.at(-1)
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > EPSILON) source.push(point)
  }
  if (source.length > 1 && Math.hypot(source[0].x - source.at(-1)!.x, source[0].y - source.at(-1)!.y) < EPSILON) source.pop()
  if (source.length < 3) return source
  const limit = DEFAULT_BUDGETS.maxSampledPoints - 1
  // Very long imported contours use an even subset before adding edge samples.
  const vertices = source.length > limit
    ? Array.from({ length: limit }, (_, i) => source[Math.floor(i * source.length / limit)]) : source
  const lengths = vertices.map((point, i) => Math.hypot(vertices[(i + 1) % vertices.length].x - point.x, vertices[(i + 1) % vertices.length].y - point.y))
  const perimeter = lengths.reduce((sum, length) => sum + length, 0)
  const extraBudget = limit - vertices.length
  const desiredExtras = lengths.map(length => Math.max(0, Math.ceil(length / Math.max(0.5, spacing)) - 1))
  const extras = desiredExtras.reduce((sum, count) => sum + count, 0)
  const result: StrokePointV2[] = []
  for (let i = 0; i < vertices.length; i++) {
    const from = vertices[i], to = vertices[(i + 1) % vertices.length]
    const segments = 1 + (extras <= extraBudget ? desiredExtras[i] : Math.floor(extraBudget * lengths[i] / Math.max(EPSILON, perimeter)))
    for (let j = 0; j < segments; j++) {
      const mix = j / segments
      result.push({ ...from, x: from.x + (to.x - from.x) * mix, y: from.y + (to.y - from.y) * mix,
        pressure: from.pressure + (to.pressure - from.pressure) * mix })
    }
  }
  result.push({ ...result[0] })
  return result
}

export function sampleStrokeForFrame(stroke: StrokeV2): StrokePointV2[] {
  return usesClosedPath(stroke) ? sampleClosedPath(stroke.points, stroke.brushSnapshot.spacing)
    : sampleStroke(stroke.points, stroke.brushSnapshot, stroke.seed)
}

function random(seed: number, cell: number, salt: number, frame = 0) {
  const value = Math.sin(cell * 127.1 + salt * 311.7 + frame * 74.7 + seed * 0.017) * 43758.5453
  return value - Math.floor(value)
}
function periodicNoise(seed: number, along: number, nodes: number, salt: number, frame: number) {
  const scaled = along * nodes, cell = Math.floor(scaled)
  let mix = scaled - cell
  mix = mix * mix * (3 - 2 * mix)
  const a = random(seed, cell % nodes, salt, frame) * 2 - 1
  const b = random(seed, (cell + 1) % nodes, salt, frame) * 2 - 1
  return a + (b - a) * mix
}
export function textureVariant(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return Math.min(3, Math.floor((value - Math.floor(value)) * 4))
}

/** Closed variants use circular tangents and periodic motion, never open-end taper. */
export function closedStrokeFrame(stroke: StrokeV2, points: StrokePointV2[], timeMs: number): { items: DrawItem[]; fill?: StrokeFill } | null {
  if (!usesClosedPath(stroke)) return null
  const brush = stroke.brushSnapshot, profile = getBrushFillProfile(brush)!
  const kind = getBrushFillKind(brush)!
  const time = timeMs * brush.speed / 1000
  const frame = Math.floor(time * (profile === 'graphiteCrawl' ? 7 : 12))
  const count = points.length - 1
  const distances = [0]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  const perimeter = distances.at(-1) || 1
  const boundary: DrawItem[] = []
  for (let i = 0; i < count; i++) {
    const point = points[i], prev = points[(i + count - 1) % count], next = points[(i + 1) % count]
    const angle = Math.atan2(next.y - prev.y, next.x - prev.x)
    const n = distances[i] / perimeter
    let x = point.x, y = point.y
    let size = brush.size * (0.35 + point.pressure * 0.65) * (brush.renderer === 'ribbon' ? 1.65 : 1)
    if (profile === 'wiggle') {
      const wobble = Math.sin(time * 8 + n * TAU * 2) * brush.size * 0.5
      x -= Math.sin(angle) * wobble; y += Math.cos(angle) * wobble
      size = brush.size * (0.4 + point.pressure * 0.6)
    } else if (profile === 'wave') {
      y += Math.sin(time * 6 + n * TAU * 3) * brush.size * 0.7
      size = brush.size
    } else if (profile === 'boil' || profile === 'textureBoil') {
      const wobble = (periodicNoise(stroke.seed, n, 5, 1, frame) + periodicNoise(stroke.seed, n, 17, 7, frame) * 0.35) * brush.size * (profile === 'boil' ? 0.35 : 0.3)
      x -= Math.sin(angle) * wobble; y += Math.cos(angle) * wobble
      if (profile === 'boil') {
        x += (random(stroke.seed, 901, 13, frame) * 2 - 1) * brush.size * 0.12
        y += (random(stroke.seed, 902, 13, frame) * 2 - 1) * brush.size * 0.12
      }
      size = brush.size * (0.45 + point.pressure * 0.55) * (0.75 + (periodicNoise(stroke.seed, n, 4, 21, frame) + 1) * 0.2)
    }
    // A periodic displacement keeps the whole outline and its fill together.
    const driftPhase = n * TAU * 3 + random(stroke.seed, 0, 81) * TAU
    x += Math.cos(time + driftPhase) * brush.drift
    y += Math.sin(time + driftPhase) * brush.drift
    const across = (periodicNoise(stroke.seed, n, 11, brush.scatter.seed + 61, 0)) * brush.scatter.across
    const along = (periodicNoise(stroke.seed, n, 13, brush.scatter.seed + 67, 0)) * brush.scatter.along
    x += Math.cos(angle) * along - Math.sin(angle) * across
    y += Math.sin(angle) * along + Math.cos(angle) * across
    boundary.push({ x, y, size, rotation: angle, opacity: brush.opacity, color: brush.color, stampIndex: 0,
      blur: brush.blurRadius, glow: brush.glow, shadow: brush.shadow, kind: 'segment' })
  }
  boundary.push({ ...boundary[0] })
  const fill = brush.fill?.enabled ? { boundary, kind, color: brush.color, opacity: brush.opacity,
    size: brush.size, seed: stroke.seed, frame, textureVariant: textureVariant(stroke.seed),
    rotationDegrees: brush.rotationDegrees, distortion: brush.distortion, stampsPerPoint: brush.stampsPerPoint,
    blur: brush.blurRadius, glow: brush.glow, shadow: brush.shadow } : undefined
  const items = fill && !brush.fill.outline ? [] : kind !== 'solid'
    ? textureOutline(boundary, brush, stroke.seed, frame, kind) : boundary
  return { items, fill }
}

function textureOutline(boundary: DrawItem[], brush: BrushV2, seed: number, frame: number, kind: FillKind): DrawItem[] {
  const items: DrawItem[] = [], variant = textureVariant(seed)
  const grainCounts = [4, 3, 3, 5], spread = [0.7, 0.95, 0.5, 1.2]
  const grains = kind === 'graphite' ? 6 : grainCounts[variant]
  const step = Math.max(1, Math.ceil((boundary.length - 1) * grains / DEFAULT_BUDGETS.maxDrawItems))
  for (let i = 0; i < boundary.length - 1; i += step) {
    const point = boundary[i], nx = -Math.sin(point.rotation), ny = Math.cos(point.rotation)
    for (let g = 0; g < grains; g++) {
      const cell = i * 7 + g
      if (kind !== 'graphite' && random(seed, cell, 31, frame) < [0.15, 0.36, 0.03, 0.28][variant]) continue
      const across = (random(seed, cell, 3, kind === 'graphite' ? 0 : frame) * 2 - 1) * point.size * (kind === 'graphite' ? 0.6 : spread[variant])
      const slide = (random(seed, cell, 8, frame) - 0.5) * brush.spacing * step
      items.push({ ...point, kind: 'stamp', x: point.x + nx * across + Math.cos(point.rotation) * slide,
        y: point.y + ny * across + Math.sin(point.rotation) * slide,
        size: Math.max(0.35, point.size * (kind === 'graphite' ? 0.07 + random(seed, cell, 11) * 0.1 : 0.2 + random(seed, cell, 11, frame) * 0.3)),
        opacity: brush.opacity * (0.4 + random(seed, cell, 53, frame) * 0.5),
        stampIndex: kind === 'graphite' ? 0 : variant % Math.max(1, brush.stamps.length),
        scaleX: kind === 'graphite' ? 2 + random(seed, cell, 23) * 2 : 1,
        scaleY: kind === 'graphite' ? 0.7 : 1 })
    }
  }
  return items
}

/** A tile is at most 96×96, regardless of canvas or filled area. */
export function createFillTexture(fill: StrokeFill): PaintSurface | null {
  const unit = Math.max(0.8, Math.min(3, fill.size * 0.13))
  const side = Math.ceil(unit * 32)
  const tile = createSurface(side, side), context = tile && context2d(tile)
  if (!tile || !context) return null
  const graphite = fill.kind === 'graphite'
  const rng = mulberry32(hashSeed(fill.seed, 1403 + (graphite ? 0 : fill.frame * 97)))
  context.fillStyle = fill.color
  const density = graphite ? 460 : [420, 280, 480, 320][fill.textureVariant]
  for (let i = 0; i < density; i++) {
    const x = (rng() * side + (graphite ? random(fill.seed, i, 41, fill.frame) * unit * 0.5 : 0)) % side
    const y = (rng() * side + (graphite ? random(fill.seed, i, 47, fill.frame) * unit * 0.5 : 0)) % side
    const r = unit * (0.28 + rng() * 0.72)
    const aspect = Math.max(0.05, 1 + (random(fill.seed, i, 73) * 2 - 1) * fill.distortion)
    const rx = (graphite ? r * 2.7 : fill.textureVariant === 1 ? r * 2.1 : r) * aspect
    const ry = (graphite ? r * 0.5 : fill.textureVariant === 1 ? r * 0.45 : r) / aspect
    const angle = (graphite ? -0.45 + rng() * 0.25 : fill.textureVariant === 1 ? -0.3 : rng() * TAU) + fill.rotationDegrees * Math.PI / 180
    const alpha = graphite ? 0.25 + random(fill.seed, i, 53, fill.frame) * 0.45 : 0.35 + rng() * 0.65
    // Repeated dots increase coverage without multiplying tile construction work.
    context.globalAlpha = 1 - Math.pow(1 - alpha, Math.max(1, fill.stampsPerPoint))
    const reach = Math.max(rx, ry)
    // Wrap edge grains so repeating patterns cannot reveal a tile border.
    const xs = [x], ys = [y]
    if (x < reach) xs.push(x + side)
    if (x > side - reach) xs.push(x - side)
    if (y < reach) ys.push(y + side)
    if (y > side - reach) ys.push(y - side)
    for (const px of xs) for (const py of ys) {
      context.beginPath(); context.ellipse(px, py, rx, ry, angle, 0, TAU); context.fill()
    }
  }
  return tile
}

export function paintStrokeFill(context: PaintContext, fill: StrokeFill, texture?: PaintSurface | null) {
  const pattern = fill.kind === 'solid' ? fill.color : texture ? context.createPattern(texture, 'repeat') : null
  if (!pattern) return
  context.save()
  context.globalAlpha *= fill.opacity
  context.fillStyle = pattern
  if (fill.blur > 0) context.filter = `blur(${fill.blur}px)`
  if (fill.shadow.opacity > 0) {
    // Canvas accepts CSS color alpha through the same canonical hex colors as brush shadows.
    const alpha = Math.round(fill.shadow.opacity * 255).toString(16).padStart(2, '0')
    context.shadowColor = /^#[\da-f]{6}$/i.test(fill.shadow.color) ? fill.shadow.color + alpha : fill.shadow.color
    context.shadowBlur = fill.shadow.blur
    context.shadowOffsetX = fill.shadow.offsetX; context.shadowOffsetY = fill.shadow.offsetY
  }
  if (fill.glow > 0) { context.shadowColor = fill.color; context.shadowBlur = fill.glow; context.shadowOffsetX = 0; context.shadowOffsetY = 0 }
  context.beginPath()
  for (let i = 0; i < fill.boundary.length; i++) {
    const point = fill.boundary[i]
    if (i === 0) context.moveTo(point.x, point.y)
    else context.lineTo(point.x, point.y)
  }
  context.closePath()
  context.fill('evenodd')
  context.restore()
}
