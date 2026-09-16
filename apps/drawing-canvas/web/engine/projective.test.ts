import { describe, expect, it } from 'vitest'
import { boundsCorners, homographyForQuad } from './geometry'
import { warpRaster } from './projective'
import type { Quad } from './types'

describe('projective raster sampling', () => {
  it('retains exact opaque pixels for an integer translation', () => {
    const source = { width: 2, height: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 40, 80, 120, 255]) }
    const bounds = { x: 0, y: 0, width: 2, height: 2 }, quad = boundsCorners({ ...bounds, x: 3, y: 1 })
    const result = warpRaster(source, bounds, quad, homographyForQuad(bounds, quad)!, 8, 8)!
    expect(result).toEqual({ ...source, x: 3, y: 1 })
  })

  it('interpolates premultiplied colors so hidden RGB cannot create dark or colored fringes', () => {
    const source = { width: 2, height: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0, 255, 0, 255, 0, 0]) }
    const bounds = { x: 0, y: 0, width: 2, height: 2 }, quad = boundsCorners({ ...bounds, width: 4 })
    const result = warpRaster(source, bounds, quad, homographyForQuad(bounds, quad)!, 4, 2)!
    expect([...result.data.slice(4, 8)]).toEqual([255, 0, 0, 191])
    expect([...result.data.slice(8, 12)]).toEqual([255, 0, 0, 64])
  })

  it('projects interior marks using the same homography as the four corners', () => {
    const source = { width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) }
    for (let y = 20; y < 100; y++) for (let x = 20; x < 100; x++) {
      const offset = (y * 128 + x) * 4
      source.data[offset] = y >= 58 && y < 62 ? 0 : 255
      source.data[offset + 1] = y >= 58 && y < 62 ? 255 : 0
      source.data[offset + 3] = 255
    }
    const bounds = { x: 20, y: 20, width: 80, height: 80 }
    const quad: Quad = [{ x: 40, y: 20 }, { x: 80, y: 20 }, { x: 100, y: 100 }, { x: 20, y: 100 }]
    const result = warpRaster(source, bounds, quad, homographyForQuad(bounds, quad)!, 128, 128)!
    const pixel = (x: number, y: number) => [...result.data.slice(((y - result.y) * result.width + x - result.x) * 4, ((y - result.y) * result.width + x - result.x) * 4 + 4)]
    expect(pixel(60, 46)).toEqual([0, 255, 0, 255])
    expect(pixel(60, 60)).toEqual([255, 0, 0, 255])
    expect(pixel(21, 21)[3]).toBe(0)
  })

  it('clips destination work to document bounds, including fully off-canvas results', () => {
    const source = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) }
    const bounds = { x: 0, y: 0, width: 2, height: 2 }, partial = boundsCorners({ ...bounds, x: -1, y: -1 })
    const result = warpRaster(source, bounds, partial, homographyForQuad(bounds, partial)!, 2, 2)!
    expect(result.x).toBe(0); expect(result.y).toBe(0)
    expect(result.width).toBe(1); expect(result.height).toBe(1)
    expect([...result.data]).toEqual([255, 255, 255, 255])
    const outside = boundsCorners({ ...bounds, x: 100_000, y: 100_000 })
    expect(warpRaster(source, bounds, outside, homographyForQuad(bounds, outside)!, 2, 2)).toBeNull()
  })
})
