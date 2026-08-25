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
