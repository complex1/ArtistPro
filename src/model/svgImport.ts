import { nanoid } from 'nanoid'
import { createText, naturalTextWidth } from './text'
import {
  affineToTransform,
  identityAffine,
  multiplyAffine,
  type Affine,
} from './transform'
import type {
  EditorNode,
  GroupNode,
  HandleMode,
  PathNode,
  PathPoint,
  TextAlign,
  Vec2,
} from './types'

type PaintStyle = {
  fill: string
  stroke: string
  strokeWidth: number
  color: string
  visible: boolean
}

type ParsedSubpath = {
  points: PathPoint[]
  closed: boolean
}

const MAX_SVG_SOURCE_LENGTH = 5_000_000
const MAX_SVG_ELEMENTS = 5_000
const MAX_SVG_DEPTH = 100
const MAX_PATH_TOKENS = 100_000
const numberPattern = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g
const pathTokenPattern = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

const zero = (): Vec2 => ({ x: 0, y: 0 })
const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback
const point = (x: number, y: number): Vec2 => ({ x, y })
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (value: Vec2, factor: number): Vec2 => ({
  x: value.x * factor,
  y: value.y * factor,
})
const length = (value: Vec2) => Math.hypot(value.x, value.y)

function numbers(value: string | null): number[] {
  return (value?.match(numberPattern) ?? []).map(Number).filter(Number.isFinite)
}

function attributeNumber(element: Element, name: string, fallback = 0): number {
  return finite(Number.parseFloat(element.getAttribute(name) ?? ''), fallback)
}

function styleMap(element: Element): Map<string, string> {
  const result = new Map<string, string>()
  for (const declaration of (element.getAttribute('style') ?? '').split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 0) continue
    const name = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (name && value) result.set(name, value)
  }
  return result
}

function styleValue(
  element: Element,
  inline: Map<string, string>,
  name: string,
): string | null {
  return inline.get(name) ?? element.getAttribute(name)
}

function normalizePaint(value: string | null, fallback: string): string {
  const paint = value?.trim()
  if (!paint || paint === 'inherit' || paint === 'currentColor') return fallback
  if (paint.startsWith('url(')) return fallback
  return paint
}

function inheritedStyle(element: Element, parent: PaintStyle): PaintStyle {
  const inline = styleMap(element)
  const display = styleValue(element, inline, 'display')
  const visibility = styleValue(element, inline, 'visibility')
  const color = normalizePaint(styleValue(element, inline, 'color'), parent.color)
  const fillValue = styleValue(element, inline, 'fill')
  const strokeValue = styleValue(element, inline, 'stroke')
  return {
    color,
    fill:
      fillValue?.trim() === 'currentColor'
        ? color
        : normalizePaint(fillValue, parent.fill),
    stroke:
      strokeValue?.trim() === 'currentColor'
        ? color
        : normalizePaint(strokeValue, parent.stroke),
    strokeWidth: Math.max(
      0,
      finite(
        Number.parseFloat(
          styleValue(element, inline, 'stroke-width') ?? String(parent.strokeWidth),
        ),
        parent.strokeWidth,
      ),
    ),
    visible:
      parent.visible &&
      display !== 'none' &&
      visibility !== 'hidden' &&
      visibility !== 'collapse',
  }
}

function elementOpacity(element: Element): number {
  const inline = styleMap(element)
  const value = finite(
    Number.parseFloat(styleValue(element, inline, 'opacity') ?? '1'),
    1,
  )
  return Math.min(1, Math.max(0, value))
}

function nodeName(element: Element, fallback: string): string {
  return (
    element.getAttribute('data-name')?.trim() ||
    element.getAttribute('aria-label')?.trim() ||
    element.getAttribute('id')?.trim() ||
    fallback
  )
}

function translation(x: number, y: number): Affine {
  return { ...identityAffine(), tx: x, ty: y }
}

function svgTransform(value: string | null): Affine {
  let matrix = identityAffine()
  const transformPattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null

  while ((match = transformPattern.exec(value ?? ''))) {
    const name = match[1].toLowerCase()
    const args = numbers(match[2])
    let next = identityAffine()

    if (name === 'matrix' && args.length >= 6) {
      next = {
        a: args[0],
        b: args[1],
        c: args[2],
        d: args[3],
        tx: args[4],
        ty: args[5],
      }
    } else if (name === 'translate' && args.length >= 1) {
      next = translation(args[0], args[1] ?? 0)
    } else if (name === 'scale' && args.length >= 1) {
      next = {
        a: args[0],
        b: 0,
        c: 0,
        d: args[1] ?? args[0],
        tx: 0,
        ty: 0,
      }
    } else if (name === 'rotate' && args.length >= 1) {
      const angle = (args[0] * Math.PI) / 180
      const rotation: Affine = {
        a: Math.cos(angle),
        b: Math.sin(angle),
        c: -Math.sin(angle),
        d: Math.cos(angle),
        tx: 0,
        ty: 0,
      }
      if (args.length >= 3) {
        next = multiplyAffine(
          multiplyAffine(translation(args[1], args[2]), rotation),
          translation(-args[1], -args[2]),
        )
      } else {
        next = rotation
      }
    } else if (name === 'skewx' && args.length >= 1) {
      next = {
        ...identityAffine(),
        c: Math.tan((args[0] * Math.PI) / 180),
      }
    } else if (name === 'skewy' && args.length >= 1) {
      next = {
        ...identityAffine(),
        b: Math.tan((args[0] * Math.PI) / 180),
      }
    }

    matrix = multiplyAffine(matrix, next)
  }

  return matrix
}

function geometryTransform(element: Element, x = 0, y = 0): Affine {
  return multiplyAffine(
    svgTransform(element.getAttribute('transform')),
    translation(x, y),
  )
}

function handleMode(handleIn: Vec2, handleOut: Vec2): HandleMode {
  const incoming = length(handleIn)
  const outgoing = length(handleOut)
  if (incoming < 1e-6 && outgoing < 1e-6) return 'none'
  if (incoming < 1e-6 || outgoing < 1e-6) return 'disconnected'
  const cross = handleIn.x * handleOut.y - handleIn.y * handleOut.x
  const dot = handleIn.x * handleOut.x + handleIn.y * handleOut.y
  if (Math.abs(cross) > 1e-5 || dot >= 0) return 'disconnected'
  return Math.abs(incoming - outgoing) < 1e-5 ? 'symmetric' : 'asymmetric'
}

function pathPoint(anchor: Vec2): PathPoint {
  return {
    id: nanoid(),
    anchor,
    handleIn: zero(),
    handleOut: zero(),
    handleMode: 'none',
  }
}

function finalizePoints(points: PathPoint[]) {
  for (const item of points) {
    item.handleMode = handleMode(item.handleIn, item.handleOut)
  }
}

function vectorAngle(from: Vec2, to: Vec2): number {
  const denominator = Math.max(1e-12, length(from) * length(to))
  const ratio = Math.min(1, Math.max(-1, (from.x * to.x + from.y * to.y) / denominator))
  const sign = from.x * to.y - from.y * to.x < 0 ? -1 : 1
  return sign * Math.acos(ratio)
}

/** Converts one SVG elliptical arc into cubic Bézier segments. */
function arcCubics(
  start: Vec2,
  rawRx: number,
  rawRy: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  end: Vec2,
): [Vec2, Vec2, Vec2][] {
  if (length(sub(end, start)) < 1e-9 || rawRx === 0 || rawRy === 0) return []

  let rx = Math.abs(rawRx)
  let ry = Math.abs(rawRy)
  const phi = ((rotation % 360) * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const half = scale(sub(start, end), 0.5)
  const xPrime = cosPhi * half.x + sinPhi * half.y
  const yPrime = -sinPhi * half.x + cosPhi * half.y
  const radii = xPrime ** 2 / rx ** 2 + yPrime ** 2 / ry ** 2
  if (radii > 1) {
    const correction = Math.sqrt(radii)
    rx *= correction
    ry *= correction
  }

  const numerator = Math.max(
    0,
    rx ** 2 * ry ** 2 - rx ** 2 * yPrime ** 2 - ry ** 2 * xPrime ** 2,
  )
  const denominator = rx ** 2 * yPrime ** 2 + ry ** 2 * xPrime ** 2
  const sign = largeArc === sweep ? -1 : 1
  const coefficient = denominator < 1e-12 ? 0 : sign * Math.sqrt(numerator / denominator)
  const centerPrime = {
    x: coefficient * ((rx * yPrime) / ry),
    y: coefficient * (-(ry * xPrime) / rx),
  }
  const midpoint = scale(add(start, end), 0.5)
  const center = {
    x: cosPhi * centerPrime.x - sinPhi * centerPrime.y + midpoint.x,
    y: sinPhi * centerPrime.x + cosPhi * centerPrime.y + midpoint.y,
  }

  const startVector = {
    x: (xPrime - centerPrime.x) / rx,
    y: (yPrime - centerPrime.y) / ry,
  }
  const endVector = {
    x: (-xPrime - centerPrime.x) / rx,
    y: (-yPrime - centerPrime.y) / ry,
  }
  let theta = vectorAngle({ x: 1, y: 0 }, startVector)
  let delta = vectorAngle(startVector, endVector)
  if (!sweep && delta > 0) delta -= Math.PI * 2
  if (sweep && delta < 0) delta += Math.PI * 2

  const segmentCount = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
  const segmentAngle = delta / segmentCount
  const map = (unitPoint: Vec2): Vec2 => ({
    x: center.x + rx * cosPhi * unitPoint.x - ry * sinPhi * unitPoint.y,
    y: center.y + rx * sinPhi * unitPoint.x + ry * cosPhi * unitPoint.y,
  })
  const result: [Vec2, Vec2, Vec2][] = []

  for (let index = 0; index < segmentCount; index += 1) {
    const fromAngle = theta
    const toAngle = theta + segmentAngle
    const alpha = (4 / 3) * Math.tan((toAngle - fromAngle) / 4)
    const from = { x: Math.cos(fromAngle), y: Math.sin(fromAngle) }
    const to = { x: Math.cos(toAngle), y: Math.sin(toAngle) }
    result.push([
      map({ x: from.x - alpha * from.y, y: from.y + alpha * from.x }),
      map({ x: to.x + alpha * to.y, y: to.y - alpha * to.x }),
      map(to),
    ])
    theta = toAngle
  }

  result[result.length - 1][2] = end
  return result
}

export function parsePathData(data: string): ParsedSubpath[] {
  const tokens = data.match(pathTokenPattern) ?? []
  if (tokens.length > MAX_PATH_TOKENS) {
    throw new Error('The SVG path is too complex to import safely.')
  }
  const result: ParsedSubpath[] = []
  let index = 0
  let command = ''
  let current = zero()
  let start = zero()
  let points: PathPoint[] = []
  let closed = false
  let previousCubicControl: Vec2 | null = null
  let previousQuadraticControl: Vec2 | null = null

  const isCommand = (token: string | undefined) => !!token && /^[a-zA-Z]$/.test(token)
  const read = () => finite(Number(tokens[index++]))
  const relative = () => command === command.toLowerCase()
  const target = (x: number, y: number) =>
    relative() ? { x: current.x + x, y: current.y + y } : { x, y }
  const finish = () => {
    if (points.length > 0) {
      finalizePoints(points)
      result.push({ points, closed })
    }
    points = []
    closed = false
  }
  const lineTo = (end: Vec2) => {
    points.push(pathPoint(end))
    current = end
    previousCubicControl = null
    previousQuadraticControl = null
  }
  const cubicTo = (control1: Vec2, control2: Vec2, end: Vec2) => {
    if (points.length === 0) points.push(pathPoint(current))
    points[points.length - 1].handleOut = sub(control1, current)
    const next = pathPoint(end)
    next.handleIn = sub(control2, end)
    points.push(next)
    current = end
    previousCubicControl = control2
    previousQuadraticControl = null
  }
  const quadraticTo = (control: Vec2, end: Vec2) => {
    cubicTo(
      add(current, scale(sub(control, current), 2 / 3)),
      add(end, scale(sub(control, end), 2 / 3)),
      end,
    )
    previousCubicControl = null
    previousQuadraticControl = control
  }
  const has = (count: number) =>
    index + count <= tokens.length && !isCommand(tokens[index])

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++]
    if (!command) throw new Error('SVG path starts without a command.')
    const upper = command.toUpperCase()

    if (upper === 'Z') {
      closed = true
      current = start
      previousCubicControl = null
      previousQuadraticControl = null
      finish()
      command = ''
      continue
    }

    const required: Record<string, number> = {
      M: 2,
      L: 2,
      H: 1,
      V: 1,
      C: 6,
      S: 4,
      Q: 4,
      T: 2,
      A: 7,
    }
    const count = required[upper]
    if (!count || !has(count)) throw new Error(`Invalid SVG path command ${command}.`)

    if (upper === 'M') {
      const end = target(read(), read())
      if (points.length > 0) finish()
      current = end
      start = end
      points = [pathPoint(end)]
      previousCubicControl = null
      previousQuadraticControl = null
      command = relative() ? 'l' : 'L'
    } else if (upper === 'L') {
      lineTo(target(read(), read()))
    } else if (upper === 'H') {
      const value = read()
      lineTo({ x: relative() ? current.x + value : value, y: current.y })
    } else if (upper === 'V') {
      const value = read()
      lineTo({ x: current.x, y: relative() ? current.y + value : value })
    } else if (upper === 'C') {
      const control1 = target(read(), read())
      const control2 = target(read(), read())
      cubicTo(control1, control2, target(read(), read()))
    } else if (upper === 'S') {
      const control1 = previousCubicControl
        ? add(current, sub(current, previousCubicControl))
        : current
      const control2 = target(read(), read())
      cubicTo(control1, control2, target(read(), read()))
    } else if (upper === 'Q') {
      const control = target(read(), read())
      quadraticTo(control, target(read(), read()))
    } else if (upper === 'T') {
      const control = previousQuadraticControl
        ? add(current, sub(current, previousQuadraticControl))
        : current
      quadraticTo(control, target(read(), read()))
    } else if (upper === 'A') {
      const rx = read()
      const ry = read()
      const rotation = read()
      const largeArc = read() !== 0
      const sweep = read() !== 0
      const end = target(read(), read())
      const cubics = arcCubics(current, rx, ry, rotation, largeArc, sweep, end)
      if (cubics.length === 0) lineTo(end)
      else for (const [control1, control2, targetPoint] of cubics) {
        cubicTo(control1, control2, targetPoint)
      }
    }
  }

  finish()
  return result
}

function baseNode(
  element: Element,
  fallbackName: string,
  matrix: Affine,
  pivot: Vec2,
) {
  return {
    id: nanoid(),
    name: nodeName(element, fallbackName),
    visible: inheritedStyle(element, defaultStyle).visible,
    locked: false,
    pivotPreset: 'center' as const,
    effects: [],
    transform: affineToTransform(matrix, pivot, elementOpacity(element)),
  }
}

function paintedBase(
  element: Element,
  fallbackName: string,
  matrix: Affine,
  pivot: Vec2,
  style: PaintStyle,
) {
  return {
    ...baseNode(element, fallbackName, matrix, pivot),
    visible: style.visible,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
  }
}

function pathNode(
  element: Element,
  name: string,
  subpath: ParsedSubpath,
  style: PaintStyle,
): PathNode {
  const xs = subpath.points.map((item) => item.anchor.x)
  const ys = subpath.points.map((item) => item.anchor.y)
  const pivot = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
  return {
    ...paintedBase(
      element,
      name,
      svgTransform(element.getAttribute('transform')),
      pivot,
      style,
    ),
    type: 'path',
    closed: subpath.closed,
    points: subpath.points,
  }
}

function groupNode(
  element: Element,
  children: EditorNode[],
  name: string,
  matrix = svgTransform(element.getAttribute('transform')),
  opacity = elementOpacity(element),
  visible = true,
): GroupNode {
  const node: GroupNode = {
    ...baseNode(element, name, matrix, zero()),
    type: 'group',
    children,
  }
  node.transform.opacity = opacity
  node.visible = visible
  return node
}

function pointsPath(element: Element, closed: boolean): ParsedSubpath[] {
  const values = numbers(element.getAttribute('points'))
  const points: PathPoint[] = []
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push(pathPoint({ x: values[index], y: values[index + 1] }))
  }
  return points.length > 0 ? [{ points, closed }] : []
}

function elementChildren(element: Element): Element[] {
  return Array.from(element.childNodes).filter(
    (child): child is Element => child.nodeType === 1,
  )
}

const defaultStyle: PaintStyle = {
  fill: '#000000',
  stroke: 'none',
  strokeWidth: 1,
  color: '#000000',
  visible: true,
}

function importChildren(
  element: Element,
  parentStyle: PaintStyle,
  depth = 0,
): EditorNode[] {
  if (depth > MAX_SVG_DEPTH) throw new Error('The SVG nesting is too deep to import.')
  return elementChildren(element).flatMap((child) =>
    importElement(child, parentStyle, depth),
  )
}

function importElement(
  element: Element,
  parentStyle: PaintStyle,
  depth: number,
): EditorNode[] {
  const tag = element.localName.toLowerCase()
  if (
    [
      'defs',
      'style',
      'script',
      'foreignobject',
      'metadata',
      'title',
      'desc',
      'clippath',
      'mask',
      'pattern',
      'lineargradient',
      'radialgradient',
      'filter',
      'symbol',
    ].includes(tag) ||
    element.hasAttribute('data-editor-overlay')
  ) {
    return []
  }

  const style = inheritedStyle(element, parentStyle)

  if (tag === 'g' || tag === 'a' || tag === 'switch') {
    const children = importChildren(element, style, depth + 1)
    return children.length > 0
      ? [groupNode(element, children, 'Group', undefined, undefined, style.visible)]
      : []
  }

  if (tag === 'svg') {
    const children = importChildren(element, style, depth + 1)
    if (children.length === 0) return []
    const viewBox = numbers(element.getAttribute('viewBox'))
    const x = attributeNumber(element, 'x') - (viewBox[0] ?? 0)
    const y = attributeNumber(element, 'y') - (viewBox[1] ?? 0)
    const matrix = multiplyAffine(
      svgTransform(element.getAttribute('transform')),
      translation(x, y),
    )
    return [groupNode(element, children, 'SVG', matrix, undefined, style.visible)]
  }

  if (tag === 'rect') {
    const width = Math.max(0, attributeNumber(element, 'width'))
    const height = Math.max(0, attributeNumber(element, 'height'))
    if (width === 0 || height === 0) return []
    const rxValue = element.getAttribute('rx')
    const ryValue = element.getAttribute('ry')
    const rx = Math.max(
      0,
      rxValue === null
        ? attributeNumber(element, 'ry')
        : attributeNumber(element, 'rx'),
    )
    const ry = Math.max(
      0,
      ryValue === null
        ? attributeNumber(element, 'rx')
        : attributeNumber(element, 'ry'),
    )
    return [
      {
        ...paintedBase(
          element,
          'Rectangle',
          geometryTransform(
            element,
            attributeNumber(element, 'x'),
            attributeNumber(element, 'y'),
          ),
          { x: width / 2, y: height / 2 },
          style,
        ),
        type: 'rect',
        width,
        height,
        rx,
        ry,
      },
    ]
  }

  if (tag === 'circle' || tag === 'ellipse') {
    const rx = Math.max(
      0,
      tag === 'circle'
        ? attributeNumber(element, 'r')
        : attributeNumber(element, 'rx'),
    )
    const ry = Math.max(
      0,
      tag === 'circle'
        ? attributeNumber(element, 'r')
        : attributeNumber(element, 'ry'),
    )
    if (rx === 0 || ry === 0) return []
    return [
      {
        ...paintedBase(
          element,
          tag === 'circle' ? 'Circle' : 'Ellipse',
          geometryTransform(
            element,
            attributeNumber(element, 'cx') - rx,
            attributeNumber(element, 'cy') - ry,
          ),
          { x: rx, y: ry },
          style,
        ),
        type: 'ellipse',
        rx,
        ry,
      },
    ]
  }

  let subpaths: ParsedSubpath[] = []
  if (tag === 'path') subpaths = parsePathData(element.getAttribute('d') ?? '')
  else if (tag === 'polyline') subpaths = pointsPath(element, false)
  else if (tag === 'polygon') subpaths = pointsPath(element, true)
  else if (tag === 'line') {
    subpaths = [
      {
        closed: false,
        points: [
          pathPoint(point(attributeNumber(element, 'x1'), attributeNumber(element, 'y1'))),
          pathPoint(point(attributeNumber(element, 'x2'), attributeNumber(element, 'y2'))),
        ],
      },
    ]
  }

  if (subpaths.length > 0) {
    const name = tag === 'line' ? 'Line' : tag === 'polygon' ? 'Polygon' : 'Path'
    const nodes = subpaths.map((subpath) => pathNode(element, name, subpath, style))
    return nodes.length === 1
      ? nodes
      : [groupNode(element, nodes, name, identityAffine(), 1, style.visible)]
  }

  if (tag === 'text') {
    const content = element.textContent?.trim() ?? ''
    if (!content) return []
    const inline = styleMap(element)
    const fontSize = Math.max(
      1,
      finite(
        Number.parseFloat(styleValue(element, inline, 'font-size') ?? '16'),
        16,
      ),
    )
    const fontFamily =
      styleValue(element, inline, 'font-family')?.replace(/^['"]|['"]$/g, '') ||
      'Inter'
    const fontWeight = finite(
      Number.parseFloat(styleValue(element, inline, 'font-weight') ?? '400'),
      400,
    )
    const letterSpacing = finite(
      Number.parseFloat(styleValue(element, inline, 'letter-spacing') ?? '0'),
    )
    const anchor = styleValue(element, inline, 'text-anchor')
    const textAlign: TextAlign =
      anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left'
    const width = naturalTextWidth(content, {
      fontFamily,
      fontSize,
      fontWeight,
      letterSpacing,
    })
    const x = attributeNumber(element, 'x')
    const alignedX =
      textAlign === 'center' ? x - width / 2 : textAlign === 'right' ? x - width : x
    const node = createText({ x: alignedX, y: attributeNumber(element, 'y') - fontSize }, content)
    node.name = nodeName(element, 'Text')
    node.visible = style.visible
    node.fill = style.fill
    node.stroke = style.stroke
    node.strokeWidth = style.strokeWidth
    node.fontFamily = fontFamily
    node.fontSize = fontSize
    node.fontWeight = fontWeight
    node.letterSpacing = letterSpacing
    node.textAlign = textAlign
    node.width = width
    node.transform = affineToTransform(
      geometryTransform(element, alignedX, attributeNumber(element, 'y') - fontSize),
      { x: width / 2, y: fontSize / 2 },
      elementOpacity(element),
    )
    return [node]
  }

  return []
}

/**
 * Converts supported SVG artwork into editable editor nodes. Root dimensions
 * and viewBox size are intentionally not returned, so importing can never
 * replace the current artboard configuration.
 */
export function importSvgText(source: string): EditorNode[] {
  if (source.length > MAX_SVG_SOURCE_LENGTH) {
    throw new Error('The SVG file is too large to import safely.')
  }
  const parser = new DOMParser()
  const parsed = parser.parseFromString(source, 'image/svg+xml')
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The SVG file is not valid XML.')
  }
  const root = parsed.documentElement
  if (!root || root.localName.toLowerCase() !== 'svg') {
    throw new Error('The selected file does not contain an SVG root.')
  }
  if (root.getElementsByTagName('*').length > MAX_SVG_ELEMENTS) {
    throw new Error('The SVG contains too many elements to import safely.')
  }

  const rootStyle = inheritedStyle(root, defaultStyle)
  const nodes = importChildren(root, rootStyle)
  if (nodes.length === 0) {
    throw new Error('The SVG does not contain supported editable artwork.')
  }
  const viewBox = numbers(root.getAttribute('viewBox'))
  const minX = viewBox[0] ?? 0
  const minY = viewBox[1] ?? 0
  if (minX === 0 && minY === 0) return nodes

  return [
    groupNode(
      root,
      nodes,
      'SVG',
      translation(-minX, -minY),
      elementOpacity(root),
      rootStyle.visible,
    ),
  ]
}
