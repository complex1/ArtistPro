import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { sanitizeSvg } from './assets'

const svg = (contents: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${contents}</svg>`

beforeEach(() => {
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
})
afterEach(() => vi.unstubAllGlobals())

describe('safe static SVG asset import', () => {
  it('retains artwork with local gradients, reusable symbols, and embedded raster images', () => {
    const source = svg(
      '<defs><linearGradient id="paint"><stop stop-color="#b4a1ff"/></linearGradient><path id="part" d="M0 0L20 20"/></defs><use href="#part" fill="url(#paint)"/><image href="data:image/png;base64,iVBORw0KGgo="/>',
    )
    expect(sanitizeSvg(source)).toContain('url(#paint)')
    expect(sanitizeSvg(source)).toContain('href="#part"')
  })

  it.each([
    '<script>alert(1)</script>',
    '<rect onclick="alert(1)"/>',
    '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>',
    '<image href="https://example.com/image.png"/>',
    '<image href="data:image/svg+xml;base64,PHN2Zz4="/>',
    '<style>@import "https://example.com/styles.css";</style>',
    '<rect fill="url(https://example.com/paint.svg#x)"/>',
    '<rect style="fill:u\\72l(https://example.com/x)"/>',
    '<svg xml:base="https://example.com/"><use href="#part"/></svg>',
    '<animate attributeName="href" values="#part;https://example.com"/>',
  ])('rejects active or externally dependent content: %s', (contents) => {
    expect(() => sanitizeSvg(svg(contents))).toThrow()
  })

  it('rejects XML entities before parsing', () => {
    expect(() =>
      sanitizeSvg(
        `<!DOCTYPE svg [<!ENTITY x "test">]>${svg('<text>&x;</text>')}`,
      ),
    ).toThrow(/entities/)
  })

  it('rejects XML stylesheet processing instructions', () => {
    expect(() =>
      sanitizeSvg(
        `<?xml-stylesheet href="https://example.com/x.css"?>${svg('')}`,
      ),
    ).toThrow(/processing instructions/)
  })
})
