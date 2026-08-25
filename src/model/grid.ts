import type { GridSettings, Vec2 } from './types'

/**
 * Pure grid geometry. Every guide is produced already clipped to the artboard
 * rectangle so a renderer can draw the result without extra bookkeeping.
 *
 * These helpers deliberately ignore `settings.enabled` and `settings.snap` so a
 * caller can preview or measure a grid that is currently switched off.
 */

export type GridPrimitiveRole = 'axis' | 'grid' | 'horizon' | 'ray' | 'arc'

export type GridLine = {
  kind: 'line'
  role: GridPrimitiveRole
  /** Index of the direction this guide belongs to: an axis, or a vanishing point. */
  family?: number
  a: Vec2
  b: Vec2
}

export type GridPolyline = {
  kind: 'polyline'
  role: GridPrimitiveRole
  family?: number
  points: Vec2[]
}

export type GridPrimitive = GridLine | GridPolyline

export type GridSnap = {
  point: Vec2
  guide?: GridPrimitive
}

/** Hard ceiling on emitted guides, so a bad setting cannot stall a redraw. */
export const GRID_PRIMITIVE_LIMIT = 600

const MAX_LINES_PER_FAMILY = 160
const MAX_RAYS_PER_POINT = 96
const FISHEYE_LINES_PER_AXIS = 40
const CURVE_SAMPLES = 32
const CIRCLE_SAMPLES = 72
const MIN_SPACING = 0.5
const PARALLEL_TOLERANCE = 0.2
const EPSILON = 1e-9

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x
const length = (value: Vec2) => Math.hypot(value.x, value.y)
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)
const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback
const positive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback
const safePoint = (point: Vec2 | undefined, fallback: Vec2): Vec2 =>
  point
    ? { x: finite(point.x, fallback.x), y: finite(point.y, fallback.y) }
    : fallback

function unit(value: Vec2): Vec2 {
  const size = length(value)
  return size < EPSILON ? { x: 0, y: 0 } : { x: value.x / size, y: value.y / size }
}

const corners = (width: number, height: number): Vec2[] => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: 0, y: height },
  { x: width, y: height },
]

/**
 * Grows the requested spacing until a family fits inside `maxLines`. Scaling by
 * a whole multiple keeps every surviving line on an original grid offset.
 */
function effectiveSpacing(spacing: number, span: number, maxLines: number) {
  const base = positive(spacing, MIN_SPACING)
  const step = Math.max(base, MIN_SPACING)
  const needed = Math.floor(Math.max(span, 0) / step) + 1
  return needed <= maxLines ? step : step * Math.ceil(needed / maxLines)
}

const clampToRect = (point: Vec2, width: number, height: number): Vec2 => ({
  x: clamp(point.x, 0, width),
  y: clamp(point.y, 0, height),
})

/**
 * Liang-Barsky clip of `origin + t * direction` against the artboard for
 * `t` in [tMin, tMax]. Pass an infinite range to clip a full line, [0, 1] to
 * clip a segment.
 */
function clipParametric(
  origin: Vec2,
  direction: Vec2,
  width: number,
  height: number,
  tMin: number,
  tMax: number,
): [Vec2, Vec2] | null {
  if (length(direction) < EPSILON) return null

  let t0 = tMin
  let t1 = tMax
  const slabs: [number, number][] = [
    [-direction.x, origin.x],
    [direction.x, width - origin.x],
    [-direction.y, origin.y],
    [direction.y, height - origin.y],
  ]

  for (const [p, q] of slabs) {
    if (Math.abs(p) < EPSILON) {
      if (q < -EPSILON) return null
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return null
      if (t > t0) t0 = t
    } else {
      if (t < t0) return null
      if (t < t1) t1 = t
    }
  }

  if (!(t1 > t0 + EPSILON)) return null

  const at = (t: number) =>
    clampToRect(
      { x: origin.x + direction.x * t, y: origin.y + direction.y * t },
      width,
      height,
    )
  return [at(t0), at(t1)]
}

/** Splits a sampled curve into the runs that stay inside the artboard. */
function clipPolyline(points: Vec2[], width: number, height: number): Vec2[][] {
  const pieces: Vec2[][] = []
  let current: Vec2[] | null = null

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const clipped = clipParametric(
      from,
      sub(points[index + 1], from),
      width,
      height,
      0,
      1,
    )
    if (!clipped) {
      current = null
      continue
    }
    const [a, b] = clipped
    if (current && distance(current[current.length - 1], a) < 1e-6) {
      current.push(b)
    } else {
      current = [a, b]
      pieces.push(current)
    }
  }

  return pieces
}

const lineAt = (
  role: GridPrimitiveRole,
  a: Vec2,
  b: Vec2,
  family?: number,
): GridLine => ({
  kind: 'line',
  role,
  ...(family === undefined ? {} : { family }),
  a,
  b,
})

function axisAlignedGrid(
  origin: Vec2,
  spacing: number,
  width: number,
  height: number,
  out: GridPrimitive[],
) {
  const columnStep = effectiveSpacing(spacing, width, MAX_LINES_PER_FAMILY)
  for (
    let k = Math.ceil(-origin.x / columnStep);
    k <= Math.floor((width - origin.x) / columnStep);
    k += 1
  ) {
    if (out.length >= GRID_PRIMITIVE_LIMIT) return
    const x = clamp(origin.x + k * columnStep, 0, width)
    out.push(lineAt(k === 0 ? 'axis' : 'grid', { x, y: 0 }, { x, y: height }))
  }

  const rowStep = effectiveSpacing(spacing, height, MAX_LINES_PER_FAMILY)
  for (
    let k = Math.ceil(-origin.y / rowStep);
    k <= Math.floor((height - origin.y) / rowStep);
    k += 1
  ) {
    if (out.length >= GRID_PRIMITIVE_LIMIT) return
    const y = clamp(origin.y + k * rowStep, 0, height)
    out.push(lineAt(k === 0 ? 'axis' : 'grid', { x: 0, y }, { x: width, y }))
  }
}

/**
 * Parallel lines at `angleDeg`, offset along the line normal in `spacing`
 * steps, covering exactly the offsets the artboard corners span.
 */
function lineFamily(
  origin: Vec2,
  angleDeg: number,
  spacing: number,
  width: number,
  height: number,
  out: GridPrimitive[],
  family?: number,
) {
  const radians = (finite(angleDeg, 0) * Math.PI) / 180
  const direction = { x: Math.cos(radians), y: Math.sin(radians) }
  const normal = { x: -direction.y, y: direction.x }
  const offsets = corners(width, height).map((corner) =>
    dot(sub(corner, origin), normal),
  )
  const low = Math.min(...offsets)
  const high = Math.max(...offsets)
  const step = effectiveSpacing(spacing, high - low, MAX_LINES_PER_FAMILY)

  for (let k = Math.ceil(low / step); k <= Math.floor(high / step); k += 1) {
    if (out.length >= GRID_PRIMITIVE_LIMIT) return
    const offset = k * step
    const clipped = clipParametric(
      { x: origin.x + normal.x * offset, y: origin.y + normal.y * offset },
      direction,
      width,
      height,
      -Infinity,
      Infinity,
    )
    if (clipped) {
      out.push(lineAt(k === 0 ? 'axis' : 'grid', clipped[0], clipped[1], family))
    }
  }
}

/** Walks the artboard border clockwise from the top-left corner. */
function perimeterPoint(t: number, width: number, height: number): Vec2 {
  const perimeter = 2 * (width + height)
  let walked = ((t % 1) + 1) % 1
  walked *= perimeter
  if (walked <= width) return { x: walked, y: 0 }
  if (walked <= width + height) return { x: width, y: walked - width }
  if (walked <= 2 * width + height) {
    return { x: 2 * width + height - walked, y: height }
  }
  return { x: 0, y: perimeter - walked }
}

/**
 * Rays that converge on `vanishingPoint`, aimed at evenly spaced points on the
 * artboard border so the fan covers the whole canvas whether the vanishing
 * point sits inside or outside it.
 */
function perspectiveRays(
  vanishingPoint: Vec2,
  density: number,
  width: number,
  height: number,
  out: GridPrimitive[],
  family?: number,
) {
  const count = clamp(Math.round(positive(density, 12)), 2, MAX_RAYS_PER_POINT)
  const seen = new Set<string>()

  for (let index = 0; index < count; index += 1) {
    if (out.length >= GRID_PRIMITIVE_LIMIT) return
    const target = perimeterPoint((index + 0.5) / count, width, height)
    const clipped = clipParametric(
      vanishingPoint,
      sub(target, vanishingPoint),
      width,
      height,
      0,
      1,
    )
    if (!clipped) continue

    const [a, b] = clipped
    if (distance(a, b) < 1e-3) continue
    const key = [a.x, a.y, b.x, b.y].map((v) => v.toFixed(2)).join(':')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(lineAt('ray', a, b, family))
  }
}

function vanishingPointsFor(
  type: 'perspective-1' | 'perspective-2' | 'perspective-3',
  provided: Vec2[] | undefined,
  width: number,
  height: number,
): Vec2[] {
  const count = type === 'perspective-1' ? 1 : type === 'perspective-2' ? 2 : 3
  const horizon = height * 0.45
  const fallbacks: Vec2[] =
    count === 1
      ? [{ x: width / 2, y: horizon }]
      : [
          { x: -width * 0.6, y: horizon },
          { x: width * 1.6, y: horizon },
          { x: width / 2, y: horizon + height * 2 },
        ]

  return fallbacks
    .slice(0, count)
    .map((fallback, index) => safePoint(provided?.[index], fallback))
}

function perspectiveHorizon(
  settings: Extract<GridSettings, { type: `perspective-${1 | 2 | 3}` }>,
  vanishingPoints: Vec2[],
  width: number,
  height: number,
): GridLine | null {
  const origin = vanishingPoints[0]
  if (!origin) return null

  const direction =
    settings.type === 'perspective-1'
      ? {
          x: Math.cos((finite(settings.horizonAngle, 0) * Math.PI) / 180),
          y: Math.sin((finite(settings.horizonAngle, 0) * Math.PI) / 180),
        }
      : (() => {
          const between = vanishingPoints[1]
            ? sub(vanishingPoints[1], origin)
            : { x: 1, y: 0 }
          return length(between) > EPSILON ? between : { x: 1, y: 0 }
        })()

  const clipped = clipParametric(
    origin,
    direction,
    width,
    height,
    -Infinity,
    Infinity,
  )
  return clipped ? lineAt('horizon', clipped[0], clipped[1]) : null
}

/**
 * Maps the plane into the lens disc with `r' = radius * tanh(r / radius)`. The
 * derivative is 1 at the centre, so scale is preserved there while the rest of
 * the plane compresses smoothly towards the rim.
 */
export function fisheyeProject(
  point: Vec2,
  center: Vec2,
  radius: number,
): Vec2 {
  if (!(radius > 0)) return { x: point.x, y: point.y }

  const offset = sub(point, center)
  const size = length(offset)
  if (size < EPSILON) return { x: center.x, y: center.y }

  const scale = (radius * Math.tanh(size / radius)) / size
  return { x: center.x + offset.x * scale, y: center.y + offset.y * scale }
}

function fisheyeGuides(
  center: Vec2,
  radius: number,
  spacing: number,
  width: number,
  height: number,
  out: GridPrimitive[],
) {
  const ring: Vec2[] = []
  for (let index = 0; index <= CIRCLE_SAMPLES; index += 1) {
    const angle = (index / CIRCLE_SAMPLES) * Math.PI * 2
    ring.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  for (const points of clipPolyline(ring, width, height)) {
    out.push({ kind: 'polyline', role: 'arc', points })
  }

  const offsetExtent = radius * 1.75
  const sampleExtent = radius * 3
  const step = effectiveSpacing(
    spacing,
    offsetExtent * 2,
    FISHEYE_LINES_PER_AXIS,
  )
  const lastIndex = Math.floor(offsetExtent / step)

  for (const axis of ['x', 'y'] as const) {
    for (let k = -lastIndex; k <= lastIndex; k += 1) {
      if (out.length >= GRID_PRIMITIVE_LIMIT) return
      const offset = k * step
      const samples: Vec2[] = []
      for (let index = 0; index <= CURVE_SAMPLES; index += 1) {
        const along = -sampleExtent + (2 * sampleExtent * index) / CURVE_SAMPLES
        const source =
          axis === 'x'
            ? { x: center.x + offset, y: center.y + along }
            : { x: center.x + along, y: center.y + offset }
        samples.push(fisheyeProject(source, center, radius))
      }
      for (const points of clipPolyline(samples, width, height)) {
        out.push({ kind: 'polyline', role: k === 0 ? 'axis' : 'arc', points })
      }
    }
  }
}

/** Builds every guide for `settings`, clipped to the artboard and capped. */
export function generateGridPrimitives(
  settings: GridSettings,
  width: number,
  height: number,
): GridPrimitive[] {
  if (!(width > 0) || !(height > 0)) return []

  const out: GridPrimitive[] = []

  switch (settings.type) {
    case 'grid': {
      const origin = safePoint(settings.origin, { x: 0, y: 0 })
      axisAlignedGrid(origin, settings.spacing, width, height, out)
      break
    }
    case 'orthographic': {
      const origin = safePoint(settings.origin, {
        x: width / 2,
        y: height / 2,
      })
      settings.angles.forEach((angle, family) => {
        lineFamily(origin, angle, settings.spacing, width, height, out, family)
      })
      break
    }
    case 'perspective-1':
    case 'perspective-2':
    case 'perspective-3': {
      const vanishingPoints = vanishingPointsFor(
        settings.type,
        settings.vanishingPoints,
        width,
        height,
      )
      const horizonLine = perspectiveHorizon(
        settings,
        vanishingPoints,
        width,
        height,
      )
      if (horizonLine) {
        out.push(horizonLine)
      }
      vanishingPoints.forEach((vanishingPoint, family) => {
        perspectiveRays(
          vanishingPoint,
          settings.density,
          width,
          height,
          out,
          family,
        )
      })
      break
    }
    case 'fisheye': {
      const center = safePoint(settings.center, {
        x: width / 2,
        y: height / 2,
      })
      const radius = positive(settings.radius, Math.min(width, height) / 2)
      fisheyeGuides(center, radius, settings.spacing, width, height, out)
      break
    }
  }

  return out.length > GRID_PRIMITIVE_LIMIT
    ? out.slice(0, GRID_PRIMITIVE_LIMIT)
    : out
}

type SnapCandidate = {
  primitive: GridPrimitive
  a: Vec2
  b: Vec2
  projected: Vec2
  distance: number
}

function considerSegment(
  point: Vec2,
  primitive: GridPrimitive,
  a: Vec2,
  b: Vec2,
  threshold: number,
  out: SnapCandidate[],
) {
  const span = sub(b, a)
  const size = length(span)
  if (size < EPSILON) return

  const t = clamp(dot(sub(point, a), span) / (size * size), 0, 1)
  const projected = { x: a.x + span.x * t, y: a.y + span.y * t }
  const gap = distance(point, projected)
  if (gap <= threshold) out.push({ primitive, a, b, projected, distance: gap })
}

function intersect(first: SnapCandidate, second: SnapCandidate): Vec2 | null {
  const firstSpan = sub(first.b, first.a)
  const secondSpan = sub(second.b, second.a)
  const denominator = cross(firstSpan, secondSpan)
  if (Math.abs(denominator) < EPSILON) return null

  const t = cross(sub(second.a, first.a), secondSpan) / denominator
  return { x: first.a.x + firstSpan.x * t, y: first.a.y + firstSpan.y * t }
}

/**
 * Snaps to guides that were already generated. Prefers the crossing of the two
 * nearest non-parallel guides (a grid corner, a ray/arc crossing) and otherwise
 * projects onto the nearest guide, which for sampled curves means the nearest
 * sampled segment. `guide` is the nearest guide, ready to be highlighted.
 */
export function snapPointToPrimitives(
  point: Vec2,
  primitives: GridPrimitive[],
  threshold: number,
): GridSnap | null {
  if (!(threshold > 0) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null
  }

  const candidates: SnapCandidate[] = []
  for (const primitive of primitives) {
    if (primitive.kind === 'line') {
      considerSegment(point, primitive, primitive.a, primitive.b, threshold, candidates)
      continue
    }
    for (let index = 0; index < primitive.points.length - 1; index += 1) {
      considerSegment(
        point,
        primitive,
        primitive.points[index],
        primitive.points[index + 1],
        threshold,
        candidates,
      )
    }
  }

  if (!candidates.length) return null

  candidates.sort((first, second) => first.distance - second.distance)
  const best = candidates[0]
  const bestDirection = unit(sub(best.b, best.a))
  const crossing = candidates.find(
    (candidate) =>
      Math.abs(cross(bestDirection, unit(sub(candidate.b, candidate.a)))) >
      PARALLEL_TOLERANCE,
  )

  if (crossing) {
    const corner = intersect(best, crossing)
    if (corner && distance(point, corner) <= threshold) {
      return { point: corner, guide: best.primitive }
    }
  }

  return { point: best.projected, guide: best.primitive }
}

/**
 * Snaps `point` to the grid described by `settings`. Pass precomputed guides to
 * `snapPointToPrimitives` instead when snapping repeatedly during a drag.
 */
export function snapPointToGrid(
  point: Vec2,
  settings: GridSettings,
  width: number,
  height: number,
  thresholdInArtboardUnits: number = settings.snapThreshold,
): GridSnap | null {
  if (!(thresholdInArtboardUnits > 0)) return null
  return snapPointToPrimitives(
    point,
    generateGridPrimitives(settings, width, height),
    thresholdInArtboardUnits,
  )
}

/**
 * Suggested colour per direction family, used when a grid gains directional
 * guides. Index 0 goes to the first axis or vanishing point.
 */
export const DEFAULT_GUIDE_COLORS = ['#4f8cff', '#ff8a5c', '#39c07f'] as const

/** Number of independently coloured directions a grid type exposes. */
export function guideFamilyCount(settings: GridSettings): number {
  switch (settings.type) {
    case 'orthographic':
      return settings.angles.length
    case 'perspective-1':
      return 1
    case 'perspective-2':
      return 2
    case 'perspective-3':
      return 3
    default:
      return 0
  }
}

/** Colour of one direction, falling back to the grid colour when unset. */
export function guideFamilyColor(
  settings: GridSettings,
  family: number,
): string {
  const colors =
    'guideColors' in settings && settings.guideColors ? settings.guideColors : []
  return colors[family] ?? settings.color
}

/**
 * Recolours one direction. Every family is written out, so a grid that still
 * relied on the fallback colour keeps the look it had before the edit.
 */
export function withGuideColor(
  settings: GridSettings,
  family: number,
  color: string,
): GridSettings {
  const count = guideFamilyCount(settings)
  if (family < 0 || family >= count) return settings

  const guideColors = Array.from({ length: count }, (_, index) =>
    index === family ? color : guideFamilyColor(settings, index),
  )

  switch (settings.type) {
    case 'orthographic':
    case 'perspective-1':
    case 'perspective-2':
    case 'perspective-3':
      return { ...settings, guideColors }
    default:
      return settings
  }
}

/** Colour a guide should be drawn in: its family colour, else the grid colour. */
export function guideColor(
  settings: GridSettings,
  primitive: GridPrimitive,
): string {
  if (primitive.role === 'horizon' || primitive.family === undefined) {
    return settings.color
  }
  return guideFamilyColor(settings, primitive.family)
}

const fixed = (value: number) => value.toFixed(2)

const subpath = (points: Vec2[]) =>
  points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${fixed(point.x)} ${fixed(point.y)}`,
    )
    .join(' ')

const pointsOf = (primitive: GridPrimitive) =>
  primitive.kind === 'line' ? [primitive.a, primitive.b] : primitive.points

/**
 * Splits guides into one path per colour, keeping the first-seen colour order so
 * a renderer can draw each direction as its own node.
 */
export function gridColorGroups(
  primitives: GridPrimitive[],
  settings: GridSettings,
): { color: string; data: string }[] {
  const groups = new Map<string, string[]>()

  for (const primitive of primitives) {
    const points = pointsOf(primitive)
    if (points.length < 2) continue
    const color = guideColor(settings, primitive)
    const parts = groups.get(color)
    if (parts) parts.push(subpath(points))
    else groups.set(color, [subpath(points)])
  }

  return [...groups].map(([color, parts]) => ({
    color,
    data: parts.join(' '),
  }))
}

/** Flattens guides into one path, so a renderer can draw them in a single node. */
export function gridPathData(primitives: GridPrimitive[]): string {
  const parts: string[] = []

  for (const primitive of primitives) {
    const points = pointsOf(primitive)
    if (points.length < 2) continue
    parts.push(subpath(points))
  }

  return parts.join(' ')
}
