import { evaluateMathExpression } from './expression'
import type {
  AnimatedBrushPoint,
  BrushContext,
  PaintStroke,
  StrokePoint,
} from './types'

function hashNoise(value: number): number {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function animatedPoint(
  stroke: PaintStroke,
  point: StrokePoint,
  index: number,
  time: number,
  totalPoints = stroke.points.length,
): AnimatedBrushPoint {
  const speed = stroke.speed * 0.45
  const amount = stroke.motion
  const phase = time * speed + index * 0.33 + stroke.seed
  let { x, y } = point

  switch (stroke.animation) {
    case 'wiggle':
      x += Math.sin(phase * 2.1) * amount
      y += Math.cos(phase * 1.7) * amount
      break
    case 'wave':
      y += Math.sin(phase * 2.2) * amount
      break
    case 'jitter': {
      const frame = Math.floor(time * stroke.speed * 15)
      x += (hashNoise(frame + index * 13 + stroke.seed) - 0.5) * amount * 2
      y += (hashNoise(frame + index * 29 + stroke.seed) - 0.5) * amount * 2
      break
    }
    case 'bounce':
      y -= Math.abs(Math.sin(phase * 1.8)) * amount
      break
    case 'sway':
    case 'flutter':
      x += Math.sin(phase * 1.2) * amount
      break
    case 'ripple':
      y += Math.sin(phase * 2.8) * amount * Math.sin(index * 0.18)
      break
    case 'elastic':
      y +=
        Math.sin(phase * 2.4) *
        amount *
        Math.exp(-index / Math.max(12, stroke.points.length))
      break
    case 'stretch':
    case 'squash': {
      const center =
        stroke.points[Math.floor(stroke.points.length / 2)] ?? point
      const sx =
        1 +
        Math.sin(time * speed * 2) *
          amount /
          (stroke.animation === 'stretch' ? 100 : 120)
      const sy = stroke.animation === 'squash' ? 1 / sx : sx
      x = center.x + (x - center.x) * sx
      y = center.y + (y - center.y) * sy
      break
    }
    case 'drift':
      x += (time * stroke.speed * 8 + index * 2) % 40 - 20
      break
  }

  const context: BrushContext = {
    x,
    y,
    index,
    progress: index / Math.max(1, totalPoints - 1),
    time,
    speed: stroke.speed,
    amount: stroke.motion,
    pressure: point.pressure,
    seed: stroke.seed,
  }
  const expressionValue = (source: string | undefined, fallback: number) => {
    if (!source?.trim()) return fallback
    try {
      return evaluateMathExpression(source, context)
    } catch {
      return fallback
    }
  }
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value))

  return {
    x: x + expressionValue(stroke.expressions?.x, 0),
    y: y + expressionValue(stroke.expressions?.y, 0),
    pressure: point.pressure,
    size: clamp(expressionValue(stroke.expressions?.size, 1), 0.05, 10),
    rotation: expressionValue(stroke.expressions?.rotation, 0),
    opacity: clamp(expressionValue(stroke.expressions?.opacity, 1), 0, 1),
    hue: clamp(expressionValue(stroke.expressions?.hue, 0), -720, 720),
    saturation: clamp(
      expressionValue(stroke.expressions?.saturation, 1),
      0,
      5,
    ),
    lightness: clamp(
      expressionValue(stroke.expressions?.lightness, 1),
      0,
      5,
    ),
    blur: clamp(expressionValue(stroke.expressions?.blur, 0), 0, 64),
    glow: clamp(expressionValue(stroke.expressions?.glow, 0), 0, 100),
    shadowX: clamp(expressionValue(stroke.expressions?.shadowX, 0), -200, 200),
    shadowY: clamp(expressionValue(stroke.expressions?.shadowY, 0), -200, 200),
    shadowBlur: clamp(
      expressionValue(stroke.expressions?.shadowBlur, 0),
      0,
      100,
    ),
    shadowOpacity: clamp(
      expressionValue(stroke.expressions?.shadowOpacity, 1),
      0,
      1,
    ),
  }
}

export function visibleRange(
  stroke: PaintStroke,
  time: number,
): [number, number] {
  const progress = (time * Math.max(0.25, stroke.speed * 0.18)) % 1
  switch (stroke.animation) {
    case 'drawOn':
      return [0, progress]
    case 'eraseOut':
    case 'trimStart':
      return [progress, 1]
    case 'trimEnd':
      return [0, 1 - progress]
    case 'centerReveal': {
      const half = progress * 0.5
      return [0.5 - half, 0.5 + half]
    }
    default:
      return [0, 1]
  }
}
