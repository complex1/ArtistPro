import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { beforeAll, describe, expect, it } from 'vitest'
import { transformToAffine } from './transform'
import { importSvgText, parsePathData } from './svgImport'

beforeAll(() => {
  globalThis.DOMParser = XmlDomParser as unknown as typeof DOMParser
})

describe('parsePathData', () => {
  it('converts relative, shorthand, and quadratic commands into editable points', () => {
    const [path] = parsePathData('M 10 10 h 20 v 10 q 10 20 20 0 t 20 0 z')

    expect(path.closed).toBe(true)
    expect(path.points.map((item) => item.anchor)).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 20 },
      { x: 50, y: 20 },
      { x: 70, y: 20 },
    ])
    expect(path.points[2].handleOut).not.toEqual({ x: 0, y: 0 })
    expect(path.points[3].handleIn).not.toEqual({ x: 0, y: 0 })
  })

  it('splits disconnected subpaths into separate controlled paths', () => {
    const paths = parsePathData('M0 0 L10 0 M20 20 L30 20')

    expect(paths).toHaveLength(2)
    expect(paths[0].points).toHaveLength(2)
    expect(paths[1].points[0].anchor).toEqual({ x: 20, y: 20 })
  })

  it('approximates arc commands with cubic handles and preserves the endpoint', () => {
    const [path] = parsePathData('M 0 50 A 50 50 0 0 1 50 0')
    const end = path.points.at(-1)

    expect(path.points.length).toBeGreaterThan(1)
    expect(path.points[0].handleOut).not.toEqual({ x: 0, y: 0 })
    expect(end?.handleIn).not.toEqual({ x: 0, y: 0 })
    expect(end?.anchor.x).toBeCloseTo(50)
    expect(end?.anchor.y).toBeCloseTo(0)
  })
})

describe('importSvgText', () => {
  it('imports basic SVG artwork as editable nodes without returning canvas settings', () => {
    const nodes = importSvgText(`
      <svg width="1200" height="900" viewBox="0 0 1200 900">
        <rect id="card" x="20" y="30" width="200" height="100" rx="12"
          fill="#ff0000" stroke="#0000ff" stroke-width="3" />
        <circle id="dot" cx="300" cy="80" r="40" fill="#00ff00" />
        <polygon id="triangle" points="0,0 40,0 20,30" />
      </svg>
    `)

    expect(nodes).toHaveLength(3)
    expect(nodes.map((node) => node.type)).toEqual(['rect', 'ellipse', 'path'])

    const rect = nodes[0]
    expect(rect.type).toBe('rect')
    if (rect.type !== 'rect') return
    expect(rect).toMatchObject({
      name: 'card',
      width: 200,
      height: 100,
      rx: 12,
      fill: '#ff0000',
      stroke: '#0000ff',
      strokeWidth: 3,
    })
    expect(transformToAffine(rect.transform)).toMatchObject({ tx: 20, ty: 30 })
    expect('artboard' in rect).toBe(false)
  })

  it('preserves groups, inherited paint, visibility, and transforms', () => {
    const [group] = importSvgText(`
      <svg fill="#123456">
        <g id="shifted" transform="translate(40 50)" opacity="0.5">
          <rect x="5" y="6" width="20" height="10" />
          <g display="none"><circle cx="10" cy="10" r="5" /></g>
        </g>
      </svg>
    `)

    expect(group.type).toBe('group')
    if (group.type !== 'group') return
    expect(group.name).toBe('shifted')
    expect(group.transform.opacity).toBe(0.5)
    expect(transformToAffine(group.transform)).toMatchObject({ tx: 40, ty: 50 })
    expect(group.children[0]).toMatchObject({ type: 'rect', fill: '#123456' })
    expect(group.children[1]).toMatchObject({ type: 'group', visible: false })
  })

  it('imports multiple path subpaths as one controllable group', () => {
    const [group] = importSvgText(`
      <svg><path id="mark" d="M0 0L10 0 M20 0L30 0" transform="translate(7 9)" /></svg>
    `)

    expect(group.type).toBe('group')
    if (group.type !== 'group') return
    expect(group.children).toHaveLength(2)
    expect(group.children.every((child) => child.type === 'path')).toBe(true)
    for (const child of group.children) {
      expect(transformToAffine(child.transform)).toMatchObject({ tx: 7, ty: 9 })
    }
  })

  it('uses the viewBox origin only for layer placement, not as a canvas size', () => {
    const [group] = importSvgText(`
      <svg width="2000" height="1000" viewBox="100 50 400 200" color="#abcdef">
        <rect x="100" y="50" width="20" height="10" fill="currentColor" />
      </svg>
    `)

    expect(group.type).toBe('group')
    if (group.type !== 'group') return
    expect(transformToAffine(group.transform)).toMatchObject({ tx: -100, ty: -50 })
    expect(group.children[0]).toMatchObject({ type: 'rect', fill: '#abcdef' })
    expect('width' in group && group.width === 2000).toBe(false)
  })

  it('rejects invalid files and files without supported artwork', () => {
    expect(() => importSvgText('<html />')).toThrow('SVG root')
    expect(() => importSvgText('<svg><defs><path d="M0 0L1 1"/></defs></svg>')).toThrow(
      'supported editable artwork',
    )
  })

  it('rejects unsafe complexity before creating layers', () => {
    expect(() => importSvgText(`<svg>${'<g>'.repeat(102)}<rect width="1" height="1"/>${'</g>'.repeat(102)}</svg>`)).toThrow(
      'nesting is too deep',
    )
  })
})
