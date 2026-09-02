import { describe, expect, it } from 'vitest'
import { restorePixels } from './restore'
import { imageTracerSvg, svgDocument, traceToSvg } from './trace'

function twoTone() {
  const width = 8
  const height = 8
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const left = x < 4
      data[i] = left ? 30 : 220
      data[i + 1] = left ? 90 : 40
      data[i + 2] = left ? 200 : 40
      data[i + 3] = 255
    }
  }
  return restorePixels(
    { data, width, height },
    {
      colorCount: 2,
      maxEdge: 1024,
      denoise: false,
      inkThreshold: null,
      ignoreNearWhite: false,
    },
  )
}

describe('traceToSvg', () => {
  it('emits a solid rect for a one-color restore', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 12
      data[i + 1] = 34
      data[i + 2] = 56
      data[i + 3] = 255
    }
    return traceToSvg({ data, width: 4, height: 4 }, { speckle: 8, cornerThreshold: 60 }).then(
      (svg) => {
        expect(svg).toContain('<svg')
        expect(svg).toContain('rgb(12,34,56)')
      },
    )
  })

  it('wraps inner markup in an svg document', () => {
    expect(svgDocument(10, 8, '<rect/>')).toContain('viewBox="0 0 10 8"')
  })

  it('traces a two-color cartoon with ImageTracer', () => {
    const restored = twoTone()
    const svg = imageTracerSvg(restored, { speckle: 2, cornerThreshold: 60 })
    expect(svg).toContain('<svg')
    expect(svg.toLowerCase()).toContain('<path')
  })
})
