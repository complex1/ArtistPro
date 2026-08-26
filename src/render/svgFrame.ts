import { evaluateScene } from '../model/animation'
import { brushPathData } from '../model/brush'
import { filterPrimitives, imageAdjustmentPrimitives } from '../model/effects'
import type { FilterPrimitive } from '../model/effects'
import { pathData } from '../model/path'
import { evaluateSymbolInstance } from '../model/symbols'
import { composeTransform } from '../model/transform'
import type {
  EditorDocument,
  EditorNode,
  ImageNode,
  PathNode,
  SymbolDefinition,
  TextNode,
} from '../model/types'

/**
 * The single description of how a document looks at a point in time. The canvas
 * paints these descriptors through svg.js so the editor and the frame renderer
 * cannot drift; everything editor-only (grid, handles, marquee, text editor)
 * stays in the canvas and never reaches this module.
 */

export type SvgAttributes = Record<string, string | number>

export type SvgElementSpec = {
  tag: string
  attributes: SvgAttributes
  children?: SvgElementSpec[]
  text?: string
}

export type PaintedShapeNode = Extract<
  EditorNode,
  { type: 'rect' | 'ellipse' | 'path' | 'brush' | 'text' }
>

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function pathTrimAttributes(node: PathNode): SvgAttributes {
  const start = clamp01(node.trimStart ?? 0)
  const end = clamp01(node.trimEnd ?? 1)
  const visible = end >= start ? end - start : 1 - start + end
  return {
    pathLength: 1,
    'stroke-dasharray':
      visible >= 1 - 1e-6 ? 'none' : `${visible} ${1 - visible}`,
    'stroke-dashoffset': -(start + (node.trimOffset ?? 0)),
  }
}

/** Transform and opacity, the two attributes every painted node carries. */
export function placementAttributes(node: EditorNode): SvgAttributes {
  return {
    transform: composeTransform(node.transform),
    opacity: node.transform.opacity,
  }
}

export function textLayoutAttributes(node: TextNode): SvgAttributes {
  return {
    x:
      node.textAlign === 'left'
        ? 0
        : node.textAlign === 'center'
          ? node.width / 2
          : node.width,
    y: 0,
    'font-family': node.fontFamily,
    'font-size': node.fontSize,
    'font-weight': node.fontWeight,
    'letter-spacing': node.letterSpacing,
    'text-anchor':
      node.textAlign === 'left'
        ? 'start'
        : node.textAlign === 'center'
          ? 'middle'
          : 'end',
    'dominant-baseline': 'text-before-edge',
    textLength: node.width,
    lengthAdjust: 'spacingAndGlyphs',
  }
}

export function shapeTagName(node: PaintedShapeNode): string {
  if (node.type === 'rect') return 'rect'
  if (node.type === 'ellipse') return 'ellipse'
  if (node.type === 'text') return 'text'
  return 'path'
}

function shapeGeometryAttributes(node: PaintedShapeNode): SvgAttributes {
  if (node.type === 'rect') {
    return {
      width: node.width,
      height: node.height,
      rx: node.rx,
      ry: node.ry,
    }
  }
  if (node.type === 'ellipse') {
    // svg.js anchors an ellipse by its bounding box, and `localBounds` measures
    // it from the same origin, so the centre sits one radius in on each axis.
    return { rx: node.rx, ry: node.ry, cx: node.rx, cy: node.ry }
  }
  if (node.type === 'path') return { d: pathData(node) }
  if (node.type === 'brush') return { d: brushPathData(node) }
  return {}
}

/** Every visual attribute of a leaf shape, minus editor-only chrome. */
export function shapeAttributes(node: PaintedShapeNode): SvgAttributes {
  return {
    ...shapeGeometryAttributes(node),
    fill: node.type === 'brush' ? node.settings.color : node.fill,
    stroke: node.type === 'brush' ? 'none' : node.stroke,
    'stroke-width': node.type === 'brush' ? 0 : node.strokeWidth,
    ...(node.type === 'path' ? pathTrimAttributes(node) : {}),
    ...(node.type === 'text' ? textLayoutAttributes(node) : {}),
    ...placementAttributes(node),
  }
}

export type ImageLayout = {
  scaleX: number
  scaleY: number
  width: number
  height: number
  x: number
  y: number
}

/**
 * Crop is stored in source pixels, so the placed image is scaled by the ratio
 * between the layer box and the crop window and then shifted so the crop origin
 * lands on the layer origin.
 */
export function imageLayout(node: ImageNode): ImageLayout {
  const scaleX = node.width / Math.max(1, node.crop.width)
  const scaleY = node.height / Math.max(1, node.crop.height)
  return {
    scaleX,
    scaleY,
    width: node.naturalWidth * scaleX,
    height: node.naturalHeight * scaleY,
    x: -node.crop.x * scaleX,
    y: -node.crop.y * scaleY,
  }
}

export const imageHref = (node: ImageNode) => node.processedSource ?? node.source

export const effectsFilterId = (nodeId: string, scope = '') =>
  `effects-${scope}${nodeId}`

export const imageAdjustmentsFilterId = (nodeId: string, scope = '') =>
  `image-adjustments-${scope}${nodeId}`

export const imageClipId = (nodeId: string, scope = '') =>
  `image-clip-${scope}${nodeId}`

const primitiveElement = (primitive: FilterPrimitive): SvgElementSpec => ({
  tag: primitive.tag,
  attributes: { ...primitive.attributes },
})

export function effectsFilter(
  node: EditorNode,
  id = effectsFilterId(node.id),
): SvgElementSpec | null {
  const primitives = filterPrimitives(node.effects)
  if (primitives.length === 0) return null
  return {
    tag: 'filter',
    attributes: {
      id,
      x: '-50%',
      y: '-50%',
      width: '200%',
      height: '200%',
      'color-interpolation-filters': 'sRGB',
    },
    children: primitives.map(primitiveElement),
  }
}

export function imageAdjustmentsFilter(
  node: ImageNode,
  id = imageAdjustmentsFilterId(node.id),
): SvgElementSpec | null {
  const primitives = imageAdjustmentPrimitives(node.adjustments)
  if (primitives.length === 0) return null
  return {
    tag: 'filter',
    attributes: { id, 'color-interpolation-filters': 'sRGB' },
    children: primitives.map(primitiveElement),
  }
}

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;')

const attributeValue = (value: string | number) =>
  typeof value === 'number'
    ? escapeAttribute(String(Object.is(value, -0) ? 0 : value))
    : escapeAttribute(value)

export function serializeSvgElement(spec: SvgElementSpec): string {
  const attributes = Object.entries(spec.attributes)
    .map(([name, value]) => ` ${name}="${attributeValue(value)}"`)
    .join('')
  const children = (spec.children ?? []).map(serializeSvgElement).join('')
  const body = `${spec.text === undefined ? '' : escapeText(spec.text)}${children}`
  if (!body) return `<${spec.tag}${attributes}/>`
  return `<${spec.tag}${attributes}>${body}</${spec.tag}>`
}

type PaintContext = {
  symbols: readonly SymbolDefinition[]
  time: number
  defs: SvgElementSpec[]
}

const scopedId = (id: string, scope: string) => `${scope}${id}`

/**
 * Symbol content is evaluated per instance, so two instances of one definition
 * would otherwise emit the same element and filter ids — and a shared filter id
 * makes both instances render the first one's effects. Nesting the instance id
 * into the scope keeps every id in a frame unique and reproducible.
 */
const childScope = (scope: string, instanceId: string) => `${scope}${instanceId}-`

function withFilter(
  context: PaintContext,
  node: EditorNode,
  scope: string,
  attributes: SvgAttributes,
): SvgAttributes {
  const filter = effectsFilter(node, effectsFilterId(node.id, scope))
  if (!filter) return attributes
  context.defs.push(filter)
  return { ...attributes, filter: `url(#${filter.attributes.id})` }
}

function paintImage(
  node: ImageNode,
  context: PaintContext,
  scope: string,
): SvgElementSpec {
  const layout = imageLayout(node)
  const clipId = imageClipId(node.id, scope)
  context.defs.push({
    tag: 'clipPath',
    attributes: { id: clipId },
    children: [
      {
        tag: 'rect',
        attributes: { x: 0, y: 0, width: node.width, height: node.height },
      },
    ],
  })
  const adjustments = imageAdjustmentsFilter(
    node,
    imageAdjustmentsFilterId(node.id, scope),
  )
  if (adjustments) context.defs.push(adjustments)

  return {
    tag: 'image',
    attributes: {
      href: imageHref(node),
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      preserveAspectRatio: 'none',
      'clip-path': `url(#${clipId})`,
      ...(adjustments ? { filter: `url(#${adjustments.attributes.id})` } : {}),
    },
  }
}

function paintNode(
  node: EditorNode,
  context: PaintContext,
  scope: string,
): SvgElementSpec | null {
  if (!node.visible) return null

  if (node.type === 'group' || node.type === 'symbol' || node.type === 'image') {
    const children =
      node.type === 'group'
        ? paintNodes(node.children, context, scope)
        : node.type === 'symbol'
          ? paintNodes(
              evaluateSymbolInstance(node, context.symbols, context.time)
                ?.children ?? [],
              context,
              childScope(scope, node.id),
            )
          : [paintImage(node, context, scope)]

    return {
      tag: 'g',
      attributes: {
        id: scopedId(node.id, scope),
        ...placementAttributes(node),
      },
      children: [
        {
          tag: 'g',
          attributes: withFilter(context, node, scope, {}),
          children,
        },
      ],
    }
  }

  return {
    tag: shapeTagName(node),
    attributes: withFilter(context, node, scope, {
      id: scopedId(node.id, scope),
      ...shapeAttributes(node),
    }),
    ...(node.type === 'text' ? { text: node.text } : {}),
  }
}

function paintNodes(
  nodes: readonly EditorNode[],
  context: PaintContext,
  scope: string,
): SvgElementSpec[] {
  const painted: SvgElementSpec[] = []
  for (const node of nodes) {
    const element = paintNode(node, context, scope)
    if (element) painted.push(element)
  }
  return painted
}

export const ARTBOARD_CLIP_ID = 'artboard-clip'

/**
 * The frame as a descriptor tree. Pure: the document is only read, and the same
 * document and time always produce the same structure.
 */
export function documentFrameElement(
  document: EditorDocument,
  time: number,
): SvgElementSpec {
  const { width, height, background } = document.artboard
  const context: PaintContext = {
    symbols: document.version === 2 ? document.symbols : [],
    time,
    defs: [
      {
        tag: 'clipPath',
        attributes: { id: ARTBOARD_CLIP_ID },
        children: [{ tag: 'rect', attributes: { x: 0, y: 0, width, height } }],
      },
    ],
  }
  const artwork = paintNodes(
    evaluateScene(document.children, document.animation, time),
    context,
    '',
  )

  return {
    tag: 'svg',
    attributes: {
      xmlns: 'http://www.w3.org/2000/svg',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
    },
    children: [
      { tag: 'defs', attributes: {}, children: context.defs },
      { tag: 'rect', attributes: { x: 0, y: 0, width, height, fill: background } },
      {
        tag: 'g',
        attributes: { 'clip-path': `url(#${ARTBOARD_CLIP_ID})` },
        children: artwork,
      },
    ],
  }
}

/**
 * The delivered frame: the root document painted at `time`, clipped to the
 * artboard, with no editor overlays. Times outside the document duration are
 * clamped by channel evaluation; symbol instances keep their own local clocks.
 */
export function renderDocumentSvg(document: EditorDocument, time: number): string {
  return serializeSvgElement(documentFrameElement(document, time))
}
