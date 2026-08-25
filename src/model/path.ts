import { nanoid } from 'nanoid'
import { defaultTransform } from './transform'
import type {
  HandleMode,
  PathNode,
  PathPoint,
  Vec2,
} from './types'

const zero = (): Vec2 => ({ x: 0, y: 0 })
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const length = (value: Vec2) => Math.hypot(value.x, value.y)
const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })

export type PathSample = {
  point: Vec2
  tangent: Vec2
}

export function createPathPoint(
  anchor: Vec2,
  handleOut: Vec2 = zero(),
): PathPoint {
  const curved = length(handleOut) > 0
  return {
    id: nanoid(),
    anchor,
    handleIn: curved ? { x: -handleOut.x, y: -handleOut.y } : zero(),
    handleOut,
    handleMode: curved ? 'symmetric' : 'none',
  }
}

export function createPath(position: Vec2, firstPoint = createPathPoint(zero())): PathNode {
  return {
    id: nanoid(),
    name: 'Path',
    type: 'path',
    visible: true,
    locked: false,
    pivotPreset: 'center',
    effects: [],
    fill: 'none',
    stroke: '#4f8cff',
    strokeWidth: 2,
    closed: false,
    points: [firstPoint],
    transform: {
      ...defaultTransform(),
      position,
    },
  }
}

const hasHandle = (handle: Vec2) => length(handle) > 1e-6

function segmentCommand(from: PathPoint, to: PathPoint): string {
  if (!hasHandle(from.handleOut) && !hasHandle(to.handleIn)) {
    return `L ${to.anchor.x} ${to.anchor.y}`
  }
  const control1 = add(from.anchor, from.handleOut)
  const control2 = add(to.anchor, to.handleIn)
  return `C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${to.anchor.x} ${to.anchor.y}`
}

export function pathData(path: Pick<PathNode, 'points' | 'closed'>): string {
  const [first, ...rest] = path.points
  if (!first) return ''
  const commands = [`M ${first.anchor.x} ${first.anchor.y}`]
  let previous = first
  for (const point of rest) {
    commands.push(segmentCommand(previous, point))
    previous = point
  }
  if (path.closed && path.points.length > 1) {
    commands.push(segmentCommand(previous, first), 'Z')
  }
  return commands.join(' ')
}

type PathSegment = {
  pointAt: (progress: number) => Vec2
  tangentAt: (progress: number) => Vec2
}

const lineSegment = (from: Vec2, to: Vec2): PathSegment => ({
  pointAt: (progress) => ({
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }),
  tangentAt: () => subtract(to, from),
})

const cubicSegment = (
  start: Vec2,
  control1: Vec2,
  control2: Vec2,
  end: Vec2,
): PathSegment => ({
  pointAt: (progress) => {
    const inverse = 1 - progress
    const inverse2 = inverse * inverse
    const progress2 = progress * progress
    return {
      x:
        inverse2 * inverse * start.x +
        3 * inverse2 * progress * control1.x +
        3 * inverse * progress2 * control2.x +
        progress2 * progress * end.x,
      y:
        inverse2 * inverse * start.y +
        3 * inverse2 * progress * control1.y +
        3 * inverse * progress2 * control2.y +
        progress2 * progress * end.y,
    }
  },
  tangentAt: (progress) => {
    const inverse = 1 - progress
    return {
      x:
        3 * inverse * inverse * (control1.x - start.x) +
        6 * inverse * progress * (control2.x - control1.x) +
        3 * progress * progress * (end.x - control2.x),
      y:
        3 * inverse * inverse * (control1.y - start.y) +
        6 * inverse * progress * (control2.y - control1.y) +
        3 * progress * progress * (end.y - control2.y),
    }
  },
})

function segmentBetween(from: PathPoint, to: PathPoint): PathSegment {
  if (!hasHandle(from.handleOut) && !hasHandle(to.handleIn)) {
    return lineSegment(from.anchor, to.anchor)
  }
  return cubicSegment(
    from.anchor,
    add(from.anchor, from.handleOut),
    add(to.anchor, to.handleIn),
    to.anchor,
  )
}

const ARC_STEPS = 32

type MeasuredSegment = {
  segment: PathSegment
  lengths: number[]
  length: number
}

function measureSegment(segment: PathSegment): MeasuredSegment {
  const lengths = [0]
  let previous = segment.pointAt(0)
  let total = 0
  for (let step = 1; step <= ARC_STEPS; step += 1) {
    const point = segment.pointAt(step / ARC_STEPS)
    total += length(subtract(point, previous))
    lengths.push(total)
    previous = point
  }
  return { segment, lengths, length: total }
}

function segmentProgressAtLength(measured: MeasuredSegment, target: number) {
  if (measured.length <= 1e-9) return 0
  const clamped = Math.min(measured.length, Math.max(0, target))
  let step = 1
  while (step < measured.lengths.length && measured.lengths[step] < clamped) {
    step += 1
  }
  const previousLength = measured.lengths[step - 1]
  const nextLength = measured.lengths[step]
  const span = nextLength - previousLength
  const local = span <= 1e-9 ? 0 : (clamped - previousLength) / span
  return (step - 1 + local) / ARC_STEPS
}

/**
 * Samples a path by approximate arc length so a linear progress animation
 * produces visually even motion across lines and Bézier curves.
 */
export function samplePathAt(
  path: Pick<PathNode, 'points' | 'closed'>,
  progress: number,
): PathSample | null {
  if (path.points.length === 0) return null
  if (path.points.length === 1) {
    return { point: { ...path.points[0].anchor }, tangent: { x: 1, y: 0 } }
  }

  const measured: MeasuredSegment[] = []
  for (let index = 1; index < path.points.length; index += 1) {
    measured.push(measureSegment(segmentBetween(path.points[index - 1], path.points[index])))
  }
  if (path.closed) {
    measured.push(
      measureSegment(segmentBetween(path.points[path.points.length - 1], path.points[0])),
    )
  }

  const totalLength = measured.reduce((sum, item) => sum + item.length, 0)
  if (totalLength <= 1e-9) {
    return { point: { ...path.points[0].anchor }, tangent: { x: 1, y: 0 } }
  }

  let remaining = Math.min(1, Math.max(0, progress)) * totalLength
  let selected = measured[measured.length - 1]
  for (const item of measured) {
    if (remaining <= item.length) {
      selected = item
      break
    }
    remaining -= item.length
  }

  const localProgress = segmentProgressAtLength(selected, remaining)
  let tangent = selected.segment.tangentAt(localProgress)
  const tangentLength = length(tangent)
  if (tangentLength <= 1e-9) tangent = { x: 1, y: 0 }
  else tangent = { x: tangent.x / tangentLength, y: tangent.y / tangentLength }
  return {
    point: selected.segment.pointAt(localProgress),
    tangent,
  }
}

export function setHandleMode(point: PathPoint, mode: HandleMode): PathPoint {
  if (mode === 'none') {
    return { ...point, handleMode: mode, handleIn: zero(), handleOut: zero() }
  }
  if (mode === 'disconnected') {
    if (hasHandle(point.handleIn) || hasHandle(point.handleOut)) {
      return { ...point, handleMode: mode }
    }
    return {
      ...point,
      handleMode: mode,
      handleIn: { x: -24, y: 0 },
      handleOut: { x: 24, y: 0 },
    }
  }

  const source = hasHandle(point.handleOut)
    ? point.handleOut
    : hasHandle(point.handleIn)
      ? { x: -point.handleIn.x, y: -point.handleIn.y }
      : { x: 24, y: 0 }
  const sourceLength = length(source)
  const unit = { x: source.x / sourceLength, y: source.y / sourceLength }
  const incomingLength =
    mode === 'symmetric'
      ? sourceLength
      : hasHandle(point.handleIn)
        ? length(point.handleIn)
        : sourceLength

  return {
    ...point,
    handleMode: mode,
    handleOut: source,
    handleIn: {
      x: -unit.x * incomingLength,
      y: -unit.y * incomingLength,
    },
  }
}

export function moveHandle(
  point: PathPoint,
  side: 'in' | 'out',
  handle: Vec2,
): PathPoint {
  const opposite = side === 'in' ? 'handleOut' : 'handleIn'
  const currentOpposite = point[opposite]
  const next = { ...point, [side === 'in' ? 'handleIn' : 'handleOut']: handle }

  if (point.handleMode === 'disconnected') return next
  if (point.handleMode === 'none') {
    return { ...next, handleMode: 'disconnected' }
  }

  const movedLength = length(handle)
  if (movedLength < 1e-6) return { ...next, [opposite]: zero() }
  const oppositeLength =
    point.handleMode === 'symmetric' ? movedLength : length(currentOpposite)
  return {
    ...next,
    [opposite]: {
      x: (-handle.x / movedLength) * oppositeLength,
      y: (-handle.y / movedLength) * oppositeLength,
    },
  }
}

export function canDeletePathPoint(path: PathNode): boolean {
  return path.points.length > (path.closed ? 3 : 2)
}
