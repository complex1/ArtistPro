import { animatedPoint, visibleRange } from './animation'
import { sampledPath } from './path'
import type {
  AnimatedBrushPoint,
  PaintDocument,
  PaintStroke,
  SampledPoint,
} from './types'

function noise(value: number): number {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

let expressionLineCanvas: HTMLCanvasElement | undefined

function expressionLineContext(
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  expressionLineCanvas ??= window.document.createElement('canvas')
  if (
    expressionLineCanvas.width !== width ||
    expressionLineCanvas.height !== height
  ) {
    expressionLineCanvas.width = width
    expressionLineCanvas.height = height
  }
  const context = expressionLineCanvas.getContext('2d')
  context?.clearRect(0, 0, width, height)
  return context
}

function setupContext(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
): void {
  context.globalAlpha *= stroke.opacity
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = stroke.size * stroke.widthScale

  if (stroke.animation === 'pulse' || stroke.animation === 'breathing') {
    context.lineWidth *=
      1 + Math.sin(time * stroke.speed * 1.5) * (stroke.motion / 60)
  }
  if (stroke.animation === 'flicker') {
    context.globalAlpha *=
      0.45 + noise(Math.floor(time * 30) + stroke.seed) * 0.55
  }
  if (stroke.animation === 'rainbow') {
    context.strokeStyle = `hsl(${(time * stroke.speed * 55 + stroke.seed) % 360} 85% 55%)`
    context.fillStyle = context.strokeStyle
  }
  if (stroke.glow > 0) {
    context.shadowBlur =
      stroke.glow + Math.sin(time * 3) * stroke.glow * 0.25
    context.shadowColor = context.strokeStyle
  }
  if (stroke.animation === 'flow') {
    context.setLineDash(
      stroke.dash ?? [stroke.size * 2, stroke.size * 1.4],
    )
    context.lineDashOffset = -(time * stroke.speed * 25)
  } else if (stroke.dash) {
    context.setLineDash(stroke.dash)
  }
}

function shadowColor(color: string, opacity: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex || opacity >= 1) return color
  const value = Number.parseInt(hex, 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`
}

function averageEffects(points: AnimatedBrushPoint[]): AnimatedBrushPoint {
  const total = points.reduce(
    (sum, point) => ({
      ...sum,
      hue: sum.hue + point.hue,
      saturation: sum.saturation + point.saturation,
      lightness: sum.lightness + point.lightness,
      blur: sum.blur + point.blur,
      glow: sum.glow + point.glow,
      shadowX: sum.shadowX + point.shadowX,
      shadowY: sum.shadowY + point.shadowY,
      shadowBlur: sum.shadowBlur + point.shadowBlur,
      shadowOpacity: sum.shadowOpacity + point.shadowOpacity,
    }),
    {
      ...points[0],
      hue: 0,
      saturation: 0,
      lightness: 0,
      blur: 0,
      glow: 0,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 0,
      shadowOpacity: 0,
    },
  )
  const count = points.length
  return {
    ...total,
    hue: total.hue / count,
    saturation: total.saturation / count,
    lightness: total.lightness / count,
    blur: total.blur / count,
    glow: total.glow / count,
    shadowX: total.shadowX / count,
    shadowY: total.shadowY / count,
    shadowBlur: total.shadowBlur / count,
    shadowOpacity: total.shadowOpacity / count,
  }
}

function hasPointEffects(stroke: PaintStroke): boolean {
  const expressions = stroke.expressions
  return Boolean(
    expressions?.hue ||
    expressions?.saturation ||
    expressions?.lightness ||
    expressions?.blur ||
    expressions?.glow ||
    expressions?.shadowX ||
    expressions?.shadowY ||
    expressions?.shadowBlur ||
    expressions?.shadowOpacity,
  )
}

function applyPointEffects(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  point: AnimatedBrushPoint,
  baseShadowBlur = context.shadowBlur,
): void {
  if (!hasPointEffects(stroke)) return
  const filters = []
  if (point.hue) filters.push(`hue-rotate(${point.hue}deg)`)
  if (point.saturation !== 1) filters.push(`saturate(${point.saturation})`)
  if (point.lightness !== 1) filters.push(`brightness(${point.lightness})`)
  if (point.blur) filters.push(`blur(${point.blur}px)`)
  context.filter = filters.length > 0 ? filters.join(' ') : 'none'

  context.shadowOffsetX = point.shadowX
  context.shadowOffsetY = point.shadowY
  context.shadowBlur = Math.max(baseShadowBlur, point.glow, point.shadowBlur)
  const color =
    typeof context.strokeStyle === 'string' ? context.strokeStyle : stroke.color
  context.shadowColor = shadowColor(color, point.shadowOpacity)
}

function renderLineRange(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
  start: number,
  end: number,
): void {
  const from = Math.max(0, Math.floor(start * (stroke.points.length - 1)))
  const to = Math.min(
    stroke.points.length - 1,
    Math.ceil(end * (stroke.points.length - 1)),
  )
  if (to < from) return

  const points = stroke.points
    .slice(from, to + 1)
    .map((point, offset) => animatedPoint(stroke, point, from + offset, time))
  if (points.length === 0) return
  const baseAlpha = context.globalAlpha
  const baseWidth = context.lineWidth
  if (hasPointEffects(stroke)) {
    applyPointEffects(context, stroke, averageEffects(points))
  }
  if (stroke.expressions) {
    const totals = points.reduce(
      (sum, point) => ({
        size: sum.size + point.size,
        opacity: sum.opacity + point.opacity,
      }),
      { size: 0, opacity: 0 },
    )
    context.lineWidth *= totals.size / points.length
    context.globalAlpha *= totals.opacity / points.length
  }

  context.beginPath()
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y)
    else context.lineTo(point.x, point.y)
  })
  context.stroke()
  context.globalAlpha = baseAlpha
  context.lineWidth = baseWidth
}

function renderExpressionLineRange(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
  start: number,
  end: number,
): void {
  const from = Math.max(0, Math.floor(start * (stroke.points.length - 1)))
  const to = Math.min(
    stroke.points.length - 1,
    Math.ceil(end * (stroke.points.length - 1)),
  )
  const points = stroke.points
    .slice(from, to + 1)
    .map((point, offset) => animatedPoint(stroke, point, from + offset, time))
  if (points.length < 2) return

  const scratch = expressionLineContext(
    context.canvas.width,
    context.canvas.height,
  )
  if (!scratch || !expressionLineCanvas) return
  scratch.save()
  setupContext(scratch, stroke, time)
  if (hasPointEffects(stroke)) {
    applyPointEffects(scratch, stroke, averageEffects(points))
  }
  const baseAlpha = scratch.globalAlpha
  const edges = points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const angle = Math.atan2(next.y - previous.y, next.x - previous.x)
    const halfWidth = stroke.size * stroke.widthScale * point.size * 0.5
    const normalX = Math.cos(angle + Math.PI / 2) * halfWidth
    const normalY = Math.sin(angle + Math.PI / 2) * halfWidth
    return {
      left: { x: point.x + normalX, y: point.y + normalY },
      right: { x: point.x - normalX, y: point.y - normalY },
      opacity: point.opacity,
    }
  })

  for (let index = 0; index < edges.length - 1; index += 1) {
    const current = edges[index]
    const next = edges[index + 1]
    scratch.globalAlpha = baseAlpha * ((current.opacity + next.opacity) / 2)
    scratch.beginPath()
    scratch.moveTo(current.left.x, current.left.y)
    scratch.lineTo(next.left.x, next.left.y)
    scratch.lineTo(next.right.x, next.right.y)
    scratch.lineTo(current.right.x, current.right.y)
    scratch.closePath()
    scratch.fill()
  }
  scratch.restore()
  context.drawImage(expressionLineCanvas, 0, 0)
}

function renderLine(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
): void {
  if (stroke.points.length === 0) return
  context.save()
  const renderRange =
    stroke.expressions?.size || stroke.expressions?.opacity
      ? renderExpressionLineRange
      : renderLineRange
  if (renderRange === renderLineRange) setupContext(context, stroke, time)
  if (stroke.animation === 'bothEnds') {
    const amount =
      ((time * Math.max(0.25, stroke.speed * 0.18)) % 1) * 0.5
    renderRange(context, stroke, time, 0, amount)
    renderRange(context, stroke, time, 1 - amount, 1)
  } else {
    const [start, end] = visibleRange(stroke, time)
    renderRange(context, stroke, time, start, end)
  }
  context.restore()
}

function stampShape(
  context: CanvasRenderingContext2D,
  shape: string,
  x: number,
  y: number,
  radius: number,
  angle: number,
): void {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.beginPath()
  if (shape === 'star' || shape === 'spark') {
    for (let index = 0; index < 10; index += 1) {
      const r = index % 2 === 0 ? radius : radius * 0.35
      const a = -Math.PI / 2 + (index * Math.PI) / 5
      if (index === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else context.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    context.closePath()
    context.fill()
  } else if (shape === 'heart') {
    context.moveTo(0, radius)
    context.bezierCurveTo(
      -radius * 1.4, 0, -radius, -radius, 0, -radius * 0.25,
    )
    context.bezierCurveTo(
      radius, -radius, radius * 1.4, 0, 0, radius,
    )
    context.fill()
  } else if (shape === 'leaf') {
    context.ellipse(0, 0, radius * 0.45, radius, 0, 0, Math.PI * 2)
    context.fill()
  } else if (shape === 'bubble') {
    context.lineWidth = Math.max(1, radius * 0.22)
    context.arc(0, 0, radius * 0.72, 0, Math.PI * 2)
    context.stroke()
  } else {
    context.arc(0, 0, radius, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function renderStamp(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
): void {
  const points = sampledPath(stroke.points, stroke.spacing)
  context.save()
  setupContext(context, stroke, time)
  const baseAlpha = context.globalAlpha
  const baseShadowBlur = context.shadowBlur
  const flowing =
    stroke.animation === 'flow' || stroke.animation === 'crawl'
  const offset = flowing ? time * stroke.speed * 30 : 0

  points.forEach((source, index) => {
    const shifted = animatedPoint(stroke, source, index, time, points.length)
    applyPointEffects(context, stroke, shifted, baseShadowBlur)
    const x =
      shifted.x +
      (flowing ? Math.cos(source.angle) * (offset % stroke.spacing) : 0)
    const y =
      shifted.y +
      (flowing ? Math.sin(source.angle) * (offset % stroke.spacing) : 0)
    if (stroke.animation === 'fadePath') {
      const phase =
        (index / Math.max(1, points.length - 1) -
          time * stroke.speed * 0.15 +
          1) %
        1
      context.globalAlpha =
        baseAlpha * (0.15 + 0.85 * (1 - phase)) * shifted.opacity
    } else {
      context.globalAlpha = baseAlpha * shifted.opacity
    }
    stampShape(
      context,
      stroke.stamp ?? 'dot',
      x,
      y,
      stroke.size * 0.65 * shifted.size,
      source.angle + shifted.rotation,
    )
  })
  context.restore()
}

function renderRibbon(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
): void {
  if (stroke.points.length < 2) return
  context.save()
  setupContext(context, stroke, time)
  context.fillStyle = context.strokeStyle
  const left: Array<{ x: number; y: number }> = []
  const right: Array<{ x: number; y: number }> = []
  const animatedPoints: AnimatedBrushPoint[] = []
  let opacityTotal = 0

  stroke.points.forEach((source, index) => {
    const point = animatedPoint(stroke, source, index, time)
    animatedPoints.push(point)
    const previous = stroke.points[Math.max(0, index - 1)]
    const next = stroke.points[Math.min(stroke.points.length - 1, index + 1)]
    const angle = Math.atan2(next.y - previous.y, next.x - previous.x)
    let width = stroke.size * 0.55 * point.size
    opacityTotal += point.opacity
    if (stroke.animation === 'twist') {
      width *= Math.cos(time * stroke.speed * 2 + index * 0.35)
    }
    left.push({
      x: point.x + Math.cos(angle + Math.PI / 2) * width,
      y: point.y + Math.sin(angle + Math.PI / 2) * width,
    })
    right.push({
      x: point.x + Math.cos(angle - Math.PI / 2) * width,
      y: point.y + Math.sin(angle - Math.PI / 2) * width,
    })
  })

  context.globalAlpha *= opacityTotal / stroke.points.length
  if (hasPointEffects(stroke)) {
    applyPointEffects(context, stroke, averageEffects(animatedPoints))
  }
  context.beginPath()
  context.moveTo(left[0].x, left[0].y)
  left.forEach((point) => context.lineTo(point.x, point.y))
  right.reverse().forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
  context.fill()
  context.restore()
}

function moveParticle(
  stroke: PaintStroke,
  point: SampledPoint,
  index: number,
  time: number,
): { x: number; y: number; age: number; radius: number } {
  const n1 = noise(index * 31 + stroke.seed)
  const n2 = noise(index * 47 + stroke.seed)
  const age = (time * stroke.speed * 0.4 + noise(index * 71 + stroke.seed)) % 1
  let x = point.x + (n1 - 0.5) * stroke.size * 3
  let y = point.y + (n2 - 0.5) * stroke.size * 3
  if (['rise', 'float', 'orbit'].includes(stroke.animation)) {
    y -= age * stroke.motion * 4
    x += Math.sin(age * Math.PI * 2 + index) * stroke.motion
  } else if (stroke.animation === 'fall') {
    y += age * stroke.motion * 5
    x += Math.sin(age * 5 + index) * stroke.motion * 0.4
  } else if (stroke.animation === 'flow') {
    x += Math.cos(point.angle) * age * stroke.motion * 3
    y += Math.sin(point.angle) * age * stroke.motion * 3
  }
  return {
    x,
    y,
    age,
    radius: Math.max(1.2, stroke.size * (0.18 + n1 * 0.28)),
  }
}

function renderParticle(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
): void {
  const spacing = Math.max(
    6,
    (stroke.size * 1.1) / Math.max(0.5, stroke.density),
  )
  const points = sampledPath(stroke.points, spacing)
  context.save()
  setupContext(context, stroke, time)
  const baseAlpha = context.globalAlpha
  const baseShadowBlur = context.shadowBlur
  points.forEach((point, index) => {
    const animated = animatedPoint(stroke, point, index, time, points.length)
    applyPointEffects(context, stroke, animated, baseShadowBlur)
    const particle = moveParticle(
      stroke,
      { ...point, x: animated.x, y: animated.y },
      index,
      time,
    )
    particle.radius *= animated.size
    if (stroke.animation === 'sequence' && particle.age < 0.35) return
    context.globalAlpha =
      baseAlpha * (1 - particle.age * 0.65) * animated.opacity
    if (stroke.particle === 'rain' || stroke.particle === 'speed') {
      context.beginPath()
      context.moveTo(particle.x, particle.y)
      context.lineTo(
        particle.x + Math.cos(point.angle) * particle.radius * 5,
        particle.y +
          Math.sin(point.angle) * particle.radius * 5 +
          (stroke.particle === 'rain' ? particle.radius * 4 : 0),
      )
      context.stroke()
    } else {
      stampShape(
        context,
        stroke.particle === 'spark' || stroke.particle === 'fire'
          ? 'spark'
          : stroke.particle ?? 'dot',
        particle.x,
        particle.y,
        particle.radius * 1.5,
        animated.rotation,
      )
    }
  })
  context.restore()
}

function renderNature(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  time: number,
): void {
  const points = sampledPath(stroke.points, Math.max(12, stroke.size * 1.8))
  context.save()
  setupContext(context, stroke, time)
  const baseAlpha = context.globalAlpha
  const baseShadowBlur = context.shadowBlur
  points.forEach((point, index) => {
    const animated = animatedPoint(stroke, point, index, time, points.length)
    applyPointEffects(context, stroke, animated, baseShadowBlur)
    const phase = time * stroke.speed + index * 0.7 + stroke.seed
    const size = stroke.size * animated.size
    context.globalAlpha = baseAlpha * animated.opacity
    if (stroke.nature === 'grass') {
      const height =
        size * (1.8 + noise(index + stroke.seed) * 1.6)
      const bend = Math.sin(phase) * stroke.motion
      context.lineWidth = Math.max(1, size * 0.18)
      context.beginPath()
      context.moveTo(animated.x, animated.y)
      context.quadraticCurveTo(
        animated.x + bend * 0.35,
        animated.y - height * 0.55,
        animated.x + bend,
        animated.y - height,
      )
      context.stroke()
    } else if (stroke.nature === 'flowers') {
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = (petal * Math.PI * 2) / 5
        stampShape(
          context,
          'dot',
          animated.x + Math.cos(angle) * size * 0.55,
          animated.y + Math.sin(angle) * size * 0.55,
          size * 0.32,
          animated.rotation,
        )
      }
    } else {
      if (
        stroke.nature === 'vine' &&
        index > (time * stroke.speed * 8) % (points.length + 8)
      ) {
        return
      }
      stampShape(
        context,
        'leaf',
        animated.x,
        animated.y + Math.sin(phase) * stroke.motion * 0.35,
        size * 0.8,
        point.angle + Math.sin(phase) * 0.6 + animated.rotation,
      )
    }
  })
  context.restore()
}

export function renderStroke(
  context: CanvasRenderingContext2D,
  stroke: PaintStroke,
  timeMs: number,
): void {
  const time = timeMs * 0.001
  switch (stroke.renderer) {
    case 'stamp':
      renderStamp(context, stroke, time)
      break
    case 'particle':
      renderParticle(context, stroke, time)
      break
    case 'ribbon':
      renderRibbon(context, stroke, time)
      break
    case 'nature':
      renderNature(context, stroke, time)
      break
    case 'aura':
      renderLine(context, stroke, time)
      renderParticle(
        context,
        { ...stroke, particle: 'spark', density: 1.2 },
        time,
      )
      break
    default:
      renderLine(context, stroke, time)
  }
}

export function renderDocument(
  context: CanvasRenderingContext2D,
  document: PaintDocument,
  timeMs: number,
  rasterLayers: ReadonlyMap<string, CanvasImageSource>,
): void {
  context.clearRect(0, 0, document.width, document.height)
  context.fillStyle = document.background
  context.fillRect(0, 0, document.width, document.height)
  for (const layer of document.layers) {
    if (!layer.visible) continue
    context.save()
    context.globalAlpha = layer.opacity ?? 1
    context.globalCompositeOperation = layer.blendMode ?? 'source-over'
    const raster = rasterLayers.get(layer.id)
    if (raster) context.drawImage(raster, 0, 0)
    layer.strokes.forEach((stroke) => renderStroke(context, stroke, timeMs))
    context.restore()
  }
}
