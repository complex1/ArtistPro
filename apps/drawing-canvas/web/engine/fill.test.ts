import { describe, expect, it } from 'vitest'
import { floodFill } from './fill'
import type { RGBA } from './fill'
import { containsPoint } from './geometry'

const red: RGBA = [220, 20, 40, 255]
const white: RGBA = [255, 255, 255, 255]
const black: RGBA = [0, 0, 0, 255]
const buffer = (colors: readonly RGBA[]) => new Uint8ClampedArray(colors.flatMap(color => [...color]))
const pixel = (pixels: Uint8ClampedArray, index: number) => [...pixels.slice(index * 4, index * 4 + 4)]

describe('raster flood fill', () => {
  it('respects a closed boundary and does not cross diagonal contact', () => {
    const data = buffer([
      white, black, white, white, white,
      black, white, black, black, white,
      white, black, white, black, white,
      white, black, black, black, white,
      white, white, white, white, white,
    ])
    expect(floodFill(data, 5, 5, 2, 2, red)).toBe(true)
    expect(pixel(data, 12)).toEqual(red)
    expect(pixel(data, 6)).toEqual(white)
    expect(pixel(data, 0)).toEqual(white)
  })

  it('fills a connected region with branches and holes', () => {
    const data = buffer([
      white, white, white, white, white,
      white, black, white, black, white,
      white, white, white, white, white,
    ])
    floodFill(data, 5, 3, 2, 1, red)
    for (let index = 0; index < 15; index++) expect(pixel(data, index)).toEqual(index === 6 || index === 8 ? black : red)
  })

  it('treats transparent RGB garbage as the same empty area', () => {
    const data = buffer([[255, 0, 0, 0], [0, 200, 255, 0], [90, 20, 170, 0], black])
    floodFill(data, 4, 1, 0, 0, red)
    expect(pixel(data, 0)).toEqual(red)
    expect(pixel(data, 2)).toEqual(red)
    expect(pixel(data, 3)).toEqual(black)
  })

  it('compares tolerance with the original seed rather than drifting through a gradient', () => {
    const data = buffer([[100, 100, 100, 255], [110, 110, 110, 255], [120, 120, 120, 255], [130, 130, 130, 255]])
    floodFill(data, 4, 1, 0, 0, red, 15)
    expect(pixel(data, 1)).toEqual(red)
    expect(pixel(data, 2)).toEqual([120, 120, 120, 255])
  })

  it('keeps transparent and opaque pixels separate below alpha tolerance', () => {
    const data = buffer([[0, 0, 0, 0], black])
    floodFill(data, 2, 1, 0, 0, red, 254)
    expect(pixel(data, 1)).toEqual(black)
  })

  it('uses selections as connectivity barriers, including disconnected lobes', () => {
    const data = buffer(Array.from({ length: 21 }, () => white))
    floodFill(data, 7, 3, 0, 1, red, 0, x => x < 2 || x > 5)
    expect(pixel(data, 7)).toEqual(red)
    expect(pixel(data, 8)).toEqual(red)
    expect(pixel(data, 9)).toEqual(white)
    expect(pixel(data, 13)).toEqual(white)
  })

  it('clips an elliptical selection at pixel centers', () => {
    const data = buffer(Array.from({ length: 25 }, () => white))
    floodFill(data, 5, 5, 2, 2, red, 0, (x, y) => containsPoint({ kind: 'ellipse', bounds: { x: 0, y: 0, width: 5, height: 5 } }, x, y))
    expect(pixel(data, 0)).toEqual(white)
    expect(pixel(data, 12)).toEqual(red)
    expect(pixel(data, 2)).toEqual(red)
  })

  it('reports unchanged fills and rejects out-of-bounds seeds', () => {
    const data = buffer([white, white])
    expect(floodFill(data, 2, 1, -.1, 0, red)).toBe(false)
    expect(floodFill(data, 2, 1, 2, 0, red)).toBe(false)
    expect(floodFill(data, 2, 1, 0, 0, white)).toBe(false)
    expect([...data]).toEqual([...buffer([white, white])])
  })
})
