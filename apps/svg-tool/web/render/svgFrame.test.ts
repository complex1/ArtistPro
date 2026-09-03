import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { defaultAnimation, upsertKeyframe } from '../model/animation'
import { createEffect } from '../model/effects'
import { createPathPoint } from '../model/path'
import { createSymbolInstance } from '../model/symbols'
import { defaultTransform } from '../model/transform'
import type {
  EditorDocumentV2,
  EditorNode,
  GroupNode,
  ImageNode,
  PathNode,
  RectNode,
  SymbolDefinition,
  SymbolInstanceNode,
  TextNode,
  Transform,
} from '../model/types'
import {
  documentFrameElement,
  imageLayout,
  pathTrimAttributes,
  renderDocumentSvg,
  serializeSvgElement,
  shapeAttributes,
} from './svgFrame'

const transform = (patch: Partial<Transform> = {}): Transform => ({
  ...defaultTransform(),
  ...patch,
})

const base = (id: string) => ({
  id,
  name: id,
  visible: true,
  locked: false,
  pivotPreset: 'top-left' as const,
  effects: [],
  transform: transform(),
})

const rect = (id: string, patch: Partial<RectNode> = {}): RectNode => ({
  ...base(id),
  type: 'rect',
  width: 100,
  height: 50,
  rx: 0,
  ry: 0,
  fill: '#ff0000',
  stroke: '#0000ff',
  strokeWidth: 2,
  ...patch,
})

const line = (id: string, patch: Partial<PathNode> = {}): PathNode => ({
  ...base(id),
  type: 'path',
  closed: false,
  points: [createPathPoint({ x: 0, y: 0 }), createPathPoint({ x: 100, y: 0 })],
  trimStart: 0,
  trimEnd: 1,
  trimOffset: 0,
  fill: 'none',
  stroke: '#000000',
  strokeWidth: 4,
  ...patch,
})

const text = (id: string, patch: Partial<TextNode> = {}): TextNode => ({
  ...base(id),
  type: 'text',
  text: 'Hello',
  width: 120,
  fontFamily: 'Inter',
  fontSize: 24,
  fontWeight: 400,
  letterSpacing: 0,
  textAlign: 'left',
  fill: '#111111',
  stroke: 'none',
  strokeWidth: 0,
  ...patch,
})

const group = (
  id: string,
  children: EditorNode[],
  patch: Partial<GroupNode> = {},
): GroupNode => ({
  ...base(id),
  type: 'group',
  children,
  ...patch,
})

const image = (id: string, patch: Partial<ImageNode> = {}): ImageNode => ({
  ...base(id),
  type: 'image',
  source: 'data:image/png;base64,AAAA',
  naturalWidth: 400,
  naturalHeight: 200,
  width: 100,
  height: 100,
  crop: { x: 100, y: 50, width: 200, height: 100 },
  adjustments: {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    chroma: { enabled: false, color: '#00ff00', tolerance: 0.12, feather: 0.08 },
  },
  ...patch,
})

const instance = (
  id: string,
  symbolId: string,
  patch: Partial<SymbolInstanceNode> = {},
): SymbolInstanceNode => ({
  ...base(id),
  type: 'symbol',
  symbolId,
  width: 100,
  height: 50,
  playback: { startTime: 0, mode: 'loop' },
  ...patch,
})

const documentWith = (
  children: EditorNode[],
  patch: Partial<EditorDocumentV2> = {},
): EditorDocumentV2 => ({
  version: 2,
  name: 'Frame',
  artboard: {
    width: 200,
    height: 100,
    background: '#fafafa',
    grid: {
      type: 'grid',
      enabled: true,
      locked: false,
      spacing: 20,
      origin: { x: 0, y: 0 },
      color: '#4f8cff',
      opacity: 0.35,
      snap: true,
      snapThreshold: 8,
    },
  },
  children,
  animation: defaultAnimation(),
  symbols: [],
  ...patch,
})

const parse = (svg: string) =>
  new DOMParser().parseFromString(svg, 'image/svg+xml')

const tags = (svg: string, tag: string) =>
  Array.from(parse(svg).getElementsByTagName(tag))

const byId = (svg: string, tag: string, id: string) =>
  tags(svg, tag).find((element) => element.getAttribute('id') === id)

describe('renderDocumentSvg frame', () => {
  it('frames the root document and clips artwork to the artboard', () => {
    const svg = renderDocumentSvg(documentWith([rect('a')]), 0)
    const root = parse(svg).documentElement!

    expect(root.tagName).toBe('svg')
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
    expect(root.getAttribute('width')).toBe('200')
    expect(root.getAttribute('height')).toBe('100')
    expect(root.getAttribute('viewBox')).toBe('0 0 200 100')

    const background = tags(svg, 'rect').find(
      (element) => element.getAttribute('fill') === '#fafafa',
    )
    expect(background?.getAttribute('width')).toBe('200')
    expect(background?.getAttribute('height')).toBe('100')

    const clipped = tags(svg, 'g').find((element) =>
      element.getAttribute('clip-path'),
    )
    expect(clipped?.getAttribute('clip-path')).toBe('url(#artboard-clip)')
    expect(
      byId(svg, 'clipPath', 'artboard-clip')
        ?.getElementsByTagName('rect')[0]
        .getAttribute('width'),
    ).toBe('200')
    expect(clipped?.getElementsByTagName('rect')[0].getAttribute('id')).toBe('a')
  })

  it('leaves out editor overlays even when the grid is on', () => {
    const svg = renderDocumentSvg(documentWith([rect('a')]), 0)

    expect(svg).not.toContain('data-editor-overlay')
    expect(svg).not.toContain('cursor')
    // Background, artboard clip, and the layer itself: no grid guides.
    expect(tags(svg, 'rect')).toHaveLength(3)
    expect(tags(svg, 'path')).toHaveLength(0)
  })

  it('is pure and deterministic for the same document and time', () => {
    const document = documentWith([rect('a'), line('b')])
    const before = structuredClone(document)

    const first = renderDocumentSvg(document, 0.5)
    const second = renderDocumentSvg(document, 0.5)

    expect(first).toBe(second)
    expect(document).toEqual(before)
  })

  it('skips hidden layers', () => {
    const svg = renderDocumentSvg(
      documentWith([rect('a', { visible: false }), rect('b')]),
      0,
    )

    expect(byId(svg, 'rect', 'a')).toBeUndefined()
    expect(byId(svg, 'rect', 'b')).toBeDefined()
  })
})

describe('shape painting', () => {
  it('writes rect, ellipse, path, brush, and text geometry', () => {
    const svg = renderDocumentSvg(
      documentWith([
        rect('r', { width: 40, height: 20, rx: 4, ry: 6 }),
        {
          ...base('e'),
          type: 'ellipse',
          rx: 15,
          ry: 25,
          fill: '#00ff00',
          stroke: 'none',
          strokeWidth: 0,
        },
        line('p'),
        {
          ...base('b'),
          type: 'brush',
          samples: [
            { x: 0, y: 0, pressure: 0.5 },
            { x: 10, y: 4, pressure: 0.6 },
            { x: 24, y: 12, pressure: 0.7 },
          ],
          settings: {
            size: 8,
            color: '#123456',
            smoothing: 0.6,
            stability: 0.55,
            pressure: 0.5,
          },
          simulatePressure: true,
          complete: true,
        },
        text('t', { textAlign: 'center', text: 'A & B < C' }),
      ]),
      0,
    )

    const painted = byId(svg, 'rect', 'r')!
    expect(painted.getAttribute('width')).toBe('40')
    expect(painted.getAttribute('rx')).toBe('4')
    expect(painted.getAttribute('ry')).toBe('6')
    expect(painted.getAttribute('fill')).toBe('#ff0000')
    expect(painted.getAttribute('stroke-width')).toBe('2')

    const ellipse = byId(svg, 'ellipse', 'e')!
    expect(ellipse.getAttribute('rx')).toBe('15')
    expect(ellipse.getAttribute('cx')).toBe('15')
    expect(ellipse.getAttribute('cy')).toBe('25')

    expect(byId(svg, 'path', 'p')?.getAttribute('d')).toBe('M 0 0 L 100 0')

    const brush = byId(svg, 'path', 'b')!
    expect(brush.getAttribute('fill')).toBe('#123456')
    expect(brush.getAttribute('stroke')).toBe('none')
    expect(brush.getAttribute('d')?.startsWith('M')).toBe(true)

    const label = byId(svg, 'text', 't')!
    expect(label.getAttribute('text-anchor')).toBe('middle')
    expect(label.getAttribute('x')).toBe('60')
    expect(label.getAttribute('font-size')).toBe('24')
    expect(label.textContent).toBe('A & B < C')
    expect(svg).toContain('A &amp; B &lt; C')
  })

  it('carries transforms and opacity onto painted nodes', () => {
    const svg = renderDocumentSvg(
      documentWith([
        rect('a', {
          transform: transform({
            position: { x: 12, y: 8 },
            rotation: 45,
            opacity: 0.4,
          }),
        }),
      ]),
      0,
    )
    const painted = byId(svg, 'rect', 'a')!

    expect(painted.getAttribute('transform')).toContain('translate(12 8)')
    expect(painted.getAttribute('transform')).toContain('rotate(45)')
    expect(painted.getAttribute('opacity')).toBe('0.4')
  })

  it('turns path trim into a dash window', () => {
    const trimmed = line('p', { trimStart: 0.25, trimEnd: 0.75, trimOffset: 0.1 })

    expect(pathTrimAttributes(trimmed)).toEqual({
      pathLength: 1,
      'stroke-dasharray': '0.5 0.5',
      'stroke-dashoffset': -0.35,
    })
    expect(pathTrimAttributes(line('p'))['stroke-dasharray']).toBe('none')

    const painted = byId(
      renderDocumentSvg(documentWith([trimmed]), 0),
      'path',
      'p',
    )!
    expect(painted.getAttribute('pathLength')).toBe('1')
    expect(painted.getAttribute('stroke-dasharray')).toBe('0.5 0.5')
  })

  it('nests group children under the group transform', () => {
    const svg = renderDocumentSvg(
      documentWith([
        group('g', [rect('child')], {
          transform: transform({ position: { x: 30, y: 0 }, opacity: 0.5 }),
        }),
      ]),
      0,
    )
    const container = byId(svg, 'g', 'g')!

    expect(container.getAttribute('transform')).toContain('translate(30 0)')
    expect(container.getAttribute('opacity')).toBe('0.5')
    expect(container.getElementsByTagName('rect')[0].getAttribute('id')).toBe(
      'child',
    )
  })
})

describe('effects and images', () => {
  it('emits a filter for layer effects and references it from the layer', () => {
    const blur = { ...createEffect('blur'), id: 'fx', radius: 4 }
    const svg = renderDocumentSvg(documentWith([rect('a', { effects: [blur] })]), 0)

    const filter = byId(svg, 'filter', 'effects-a')!
    expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB')
    expect(
      filter.getElementsByTagName('feGaussianBlur')[0].getAttribute('stdDeviation'),
    ).toBe('4')
    expect(byId(svg, 'rect', 'a')?.getAttribute('filter')).toBe('url(#effects-a)')
  })

  it('applies group effects to the group content', () => {
    const shadow = { ...createEffect('drop-shadow'), id: 'fx' }
    const svg = renderDocumentSvg(
      documentWith([group('g', [rect('child')], { effects: [shadow] })]),
      0,
    )

    expect(
      byId(svg, 'filter', 'effects-g')?.getElementsByTagName('feDropShadow'),
    ).toHaveLength(1)
    const content = byId(svg, 'g', 'g')!.getElementsByTagName('g')[0]
    expect(content.getAttribute('filter')).toBe('url(#effects-g)')
  })

  it('scales and clips an image to its crop window', () => {
    const node = image('img')
    expect(imageLayout(node)).toEqual({
      scaleX: 0.5,
      scaleY: 1,
      width: 200,
      height: 200,
      x: -50,
      y: -50,
    })

    const svg = renderDocumentSvg(documentWith([node]), 0)
    const painted = tags(svg, 'image')[0]
    expect(painted.getAttribute('href')).toBe('data:image/png;base64,AAAA')
    expect(painted.getAttribute('width')).toBe('200')
    expect(painted.getAttribute('x')).toBe('-50')
    expect(painted.getAttribute('preserveAspectRatio')).toBe('none')
    expect(painted.getAttribute('clip-path')).toBe('url(#image-clip-img)')

    const clip = byId(svg, 'clipPath', 'image-clip-img')!
    expect(clip.getElementsByTagName('rect')[0].getAttribute('width')).toBe('100')
  })

  it('prefers the processed source and filters image adjustments', () => {
    const node = image('img', {
      processedSource: 'data:image/png;base64,BBBB',
      adjustments: {
        brightness: 0.2,
        contrast: 0,
        saturation: -0.5,
        chroma: {
          enabled: true,
          color: '#00ff00',
          tolerance: 0.1,
          feather: 0.05,
        },
      },
    })
    const svg = renderDocumentSvg(documentWith([node]), 0)
    const painted = tags(svg, 'image')[0]

    expect(painted.getAttribute('href')).toBe('data:image/png;base64,BBBB')
    expect(painted.getAttribute('filter')).toBe('url(#image-adjustments-img)')
    expect(
      byId(svg, 'filter', 'image-adjustments-img')?.getElementsByTagName(
        'feColorMatrix',
      ),
    ).toHaveLength(2)
  })
})

describe('time evaluation', () => {
  it('paints animated channels at the requested source time', () => {
    let animation = defaultAnimation()
    animation = upsertKeyframe(animation, 'a', 'position.x', 0, 0, 'linear')
    animation = upsertKeyframe(animation, 'a', 'position.x', 2, 100, 'linear')
    animation = upsertKeyframe(animation, 'a', 'fill', 0, '#000000', 'linear')
    animation = upsertKeyframe(animation, 'a', 'fill', 2, '#ffffff', 'linear')
    const document = documentWith([rect('a')], { animation })

    const start = byId(renderDocumentSvg(document, 0), 'rect', 'a')!
    const middle = byId(renderDocumentSvg(document, 1), 'rect', 'a')!

    expect(start.getAttribute('transform')).toContain('translate(0 0)')
    expect(start.getAttribute('fill')).toBe('#000000')
    expect(middle.getAttribute('transform')).toContain('translate(50 0)')
    expect(middle.getAttribute('fill')).toBe('#808080')
  })

  it('offsets a motion-path follower onto its path', () => {
    const follower = rect('follower', {
      motionPath: { pathId: 'p', progress: 0.5, autoRotate: false },
    })
    const svg = renderDocumentSvg(documentWith([line('p'), follower]), 0)

    expect(byId(svg, 'rect', 'follower')?.getAttribute('transform')).toContain(
      'translate(50 0)',
    )
  })
})

describe('symbol instances', () => {
  const definition = (id = 'sym'): SymbolDefinition => {
    let animation = defaultAnimation()
    animation.duration = 2
    animation = upsertKeyframe(animation, 'inner', 'position.x', 0, 0, 'linear')
    animation = upsertKeyframe(animation, 'inner', 'position.x', 2, 100, 'linear')
    return {
      id,
      name: 'Badge',
      width: 100,
      height: 50,
      children: [rect('inner')],
      animation,
    }
  }

  it('runs a definition on its own local clock under the instance transform', () => {
    const document = documentWith(
      [
        instance('one', 'sym', {
          transform: transform({ position: { x: 10, y: 20 } }),
          playback: { startTime: 1, mode: 'loop' },
        }),
      ],
      { symbols: [definition()] },
    )

    const atStart = renderDocumentSvg(document, 1)
    const later = renderDocumentSvg(document, 2)

    expect(byId(atStart, 'g', 'one')?.getAttribute('transform')).toContain(
      'translate(10 20)',
    )
    expect(byId(atStart, 'rect', 'one-inner')?.getAttribute('transform')).toContain(
      'translate(0 0)',
    )
    expect(byId(later, 'rect', 'one-inner')?.getAttribute('transform')).toContain(
      'translate(50 0)',
    )
  })

  it('loops a short definition across a longer root scene', () => {
    const symbol = definition()
    const looping = createSymbolInstance(symbol)
    looping.id = 'loop'
    const svg = renderDocumentSvg(
      documentWith([looping], { symbols: [symbol] }),
      2.5,
    )

    // 2.5s into a 2s definition wraps back to a local 0.5s.
    expect(byId(svg, 'rect', 'loop-inner')?.getAttribute('transform')).toContain(
      'translate(25 0)',
    )
  })

  it('keeps ids unique across instances of the same definition', () => {
    const blur = { ...createEffect('blur'), id: 'fx', radius: 3 }
    const symbol = definition()
    symbol.children = [rect('inner', { effects: [blur] })]
    const svg = renderDocumentSvg(
      documentWith([instance('one', 'sym'), instance('two', 'sym')], {
        symbols: [symbol],
      }),
      0,
    )

    expect(byId(svg, 'rect', 'one-inner')?.getAttribute('filter')).toBe(
      'url(#effects-one-inner)',
    )
    expect(byId(svg, 'rect', 'two-inner')?.getAttribute('filter')).toBe(
      'url(#effects-two-inner)',
    )
    expect(byId(svg, 'filter', 'effects-one-inner')).toBeDefined()
    expect(byId(svg, 'filter', 'effects-two-inner')).toBeDefined()
  })

  it('paints nothing for an instance whose definition is missing', () => {
    const svg = renderDocumentSvg(
      documentWith([instance('one', 'gone')], { symbols: [] }),
      0,
    )

    expect(byId(svg, 'g', 'one')?.getElementsByTagName('rect')).toHaveLength(0)
  })
})

describe('descriptor helpers', () => {
  it('shares the same attributes the canvas paints with', () => {
    const node = rect('a', { transform: transform({ opacity: 0.25 }) })

    expect(shapeAttributes(node)).toMatchObject({
      width: 100,
      height: 50,
      fill: '#ff0000',
      stroke: '#0000ff',
      'stroke-width': 2,
      opacity: 0.25,
    })
    expect(shapeAttributes(node).transform).toContain('translate(0 0)')
  })

  it('serialises attributes, text, and children safely', () => {
    expect(
      serializeSvgElement({
        tag: 'text',
        attributes: { 'font-family': 'Say "hi" & <bye>', x: -0 },
        text: '5 < 6 & 7',
      }),
    ).toBe(
      '<text font-family="Say &quot;hi&quot; &amp; &lt;bye&gt;" x="0">5 &lt; 6 &amp; 7</text>',
    )
    expect(serializeSvgElement({ tag: 'g', attributes: {}, children: [] })).toBe(
      '<g/>',
    )
  })

  it('builds the frame as a descriptor tree before serialising', () => {
    const spec = documentFrameElement(documentWith([rect('a')]), 0)

    expect(spec.tag).toBe('svg')
    expect(spec.children?.map((child) => child.tag)).toEqual([
      'defs',
      'rect',
      'g',
    ])
    expect(serializeSvgElement(spec)).toBe(
      renderDocumentSvg(documentWith([rect('a')]), 0),
    )
  })
})
