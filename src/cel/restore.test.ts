import { describe, expect, it } from 'vitest'
import {
  applyChroma,
  extractPalette,
  restorePixels,
  uniqueOpaqueColors,
  type PixelBuffer,
} from './restore'

function buffer(
  width: number,
  height: number,
  fill: [number, number, number, number] | Array<[number, number, number, number]>,
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  const pixels = Array.isArray(fill[0])
    ? (fill as Array<[number, number, number, number]>)
    : null
  const solid = pixels ? null : (fill as [number, number, number, number])
  for (let i = 0; i < width * height; i++) {
    const color = pixels?.[i] ?? pixels?.[0] ?? solid
    if (!color) continue
    const o = i * 4
    data[o] = color[0]
    data[o + 1] = color[1]
    data[o + 2] = color[2]
    data[o + 3] = color[3]
  }
  return { data, width, height }
}

function checker(width: number, height: number, a: [number, number, number, number], b: [number, number, number, number]) {
  const pixels: Array<[number, number, number, number]> = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.push((x + y) % 2 === 0 ? a : b)
    }
  }
  return buffer(width, height, pixels)
}

describe('extractPalette', () => {
  it('returns the unique colors when fewer than the requested count', () => {
    const image = checker(4, 4, [255, 0, 0, 255], [0, 0, 255, 255])
    const palette = extractPalette(image.data, 8)
    expect(palette).toHaveLength(2)
  })

  it('reduces a four-color image to two clusters', () => {
    const pixels: Array<[number, number, number, number]> = [
      [10, 10, 200, 255],
      [12, 8, 210, 255],
      [200, 20, 20, 255],
      [210, 18, 24, 255],
    ]
    const image = buffer(2, 2, pixels)
    const palette = extractPalette(image.data, 2)
    expect(palette).toHaveLength(2)
  })
})

describe('restorePixels', () => {
  it('keeps a flat color as one palette entry', () => {
    const image = buffer(6, 6, [40, 80, 160, 255])
    const restored = restorePixels(image, {
      colorCount: 16,
      maxEdge: 1024,
      denoise: false,
      inkThreshold: null,
      ignoreNearWhite: false,
    })
    expect(uniqueOpaqueColors(restored.data)).toEqual([[40, 80, 160]])
    expect(restored.palette).toHaveLength(1)
  })

  it('snaps a noisy two-tone cartoon to two colors', () => {
    const pixels: Array<[number, number, number, number]> = []
    for (let i = 0; i < 16; i++) {
      pixels.push(i < 8 ? [12, 12, 200, 255] : [200, 18, 18, 255])
    }
    pixels[0] = [20, 10, 190, 255]
    pixels[9] = [190, 30, 24, 255]
    const restored = restorePixels(buffer(4, 4, pixels), {
      colorCount: 2,
      maxEdge: 1024,
      denoise: false,
      inkThreshold: null,
      ignoreNearWhite: false,
    })
    expect(uniqueOpaqueColors(restored.data)).toHaveLength(2)
  })

  it('downscales so the longest edge matches maxEdge', () => {
    const image = buffer(20, 10, [0, 0, 0, 255])
    const restored = restorePixels(image, {
      colorCount: 2,
      maxEdge: 10,
      denoise: false,
      inkThreshold: null,
      ignoreNearWhite: false,
    })
    expect(restored.width).toBe(10)
    expect(restored.height).toBe(5)
  })

  it('knocks out near-white pixels', () => {
    const image = buffer(2, 1, [
      [10, 20, 30, 255],
      [250, 251, 252, 255],
    ])
    const restored = restorePixels(image, {
      colorCount: 8,
      maxEdge: 1024,
      denoise: false,
      inkThreshold: null,
      ignoreNearWhite: true,
    })
    expect(restored.data[7]).toBe(0)
    expect(restored.data[3]).toBe(255)
  })

  it('forces dark pixels to dedicated ink', () => {
    const image = buffer(2, 1, [
      [8, 8, 8, 255],
      [200, 40, 40, 255],
    ])
    const restored = restorePixels(image, {
      colorCount: 4,
      maxEdge: 1024,
      denoise: false,
      inkThreshold: 32,
      ignoreNearWhite: false,
    })
    expect([...restored.data.slice(0, 3)]).toEqual([0, 0, 0])
    expect(restored.palette.some((c) => c[0] === 0 && c[1] === 0 && c[2] === 0)).toBe(
      true,
    )
  })
})

describe('applyChroma', () => {
  const alphas = (image: PixelBuffer) =>
    [...image.data].filter((_, index) => index % 4 === 3)

  it('removes multiple selected colors while keeping unlisted pixels', () => {
    const image = buffer(3, 1, [
      [10, 200, 20, 255],
      [20, 30, 220, 255],
      [220, 30, 20, 255],
    ])
    applyChroma(
      image.data,
      [
        { color: [10, 200, 20], mode: 'remove' },
        { color: [20, 30, 220], mode: 'remove' },
      ],
      0,
    )
    expect(alphas(image)).toEqual([0, 0, 255])
  })

  it('retains only selected colors within the tolerance', () => {
    const image = buffer(3, 1, [
      [105, 195, 25, 255],
      [20, 30, 220, 255],
      [220, 30, 20, 255],
    ])
    applyChroma(image.data, [{ color: [100, 200, 20], mode: 'retain' }], 8)
    expect(alphas(image)).toEqual([255, 0, 0])
  })

  it('applies remove and retain rules together', () => {
    const image = buffer(4, 1, [
      [10, 200, 20, 255],
      [20, 30, 220, 255],
      [220, 30, 20, 255],
      [90, 90, 90, 255],
    ])
    applyChroma(
      image.data,
      [
        { color: [20, 30, 220], mode: 'retain' },
        { color: [220, 30, 20], mode: 'retain' },
        { color: [220, 30, 20], mode: 'remove' },
      ],
      0,
    )
    // Retained blue survives, the color marked both ways is removed, and
    // unlisted colors drop out because a retain whitelist exists.
    expect(alphas(image)).toEqual([0, 255, 0, 0])
  })

  it('keeps removed colors in the editable palette', () => {
    const image = buffer(2, 1, [
      [20, 200, 30, 255],
      [200, 30, 20, 255],
    ])
    const restored = restorePixels(image, {
      colorCount: 2,
      maxEdge: 1024,
      denoise: false,
      inkThreshold: null,
      ignoreNearWhite: false,
      chromaRules: [{ color: [20, 200, 30], mode: 'remove' }],
      chromaTolerance: 0,
    })
    expect(restored.palette).toHaveLength(2)
    expect(restored.outputPalette).toEqual([[200, 30, 20]])
  })
})
