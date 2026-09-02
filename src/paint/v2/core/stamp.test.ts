import { describe, expect, it } from 'vitest'
import {
  appendStamp,
  applyShapeMask,
  encodeShapeStamp,
  isImageStamp,
  isShapeStamp,
  removeStampAt,
  stampPaintSrc,
  stampPreviewSrc,
} from './stamp'

describe('stamp encoding', () => {
  it('treats shape-prefixed data URLs as image stamps with a paint src', () => {
    const dataUrl = 'data:image/png;base64,abc'
    const encoded = encodeShapeStamp(dataUrl)
    expect(isShapeStamp(encoded)).toBe(true)
    expect(isImageStamp(encoded)).toBe(true)
    expect(stampPaintSrc(encoded)).toBe(dataUrl)
    expect(stampPreviewSrc(encoded)).toBe(dataUrl)
  })

  it('leaves named stamps as vector names', () => {
    expect(isImageStamp('dot')).toBe(false)
    expect(isShapeStamp('star')).toBe(false)
    expect(stampPaintSrc('heart')).toBe('heart')
    expect(stampPreviewSrc('dot')).toBeNull()
  })
})

describe('applyShapeMask', () => {
  it('turns dark opaque pixels into white coverage', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255])
    applyShapeMask(pixels, false)
    expect([...pixels]).toEqual([255, 255, 255, 255])
  })

  it('turns light opaque pixels transparent', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255])
    applyShapeMask(pixels, false)
    expect([...pixels]).toEqual([255, 255, 255, 0])
  })

  it('inverts which luminance becomes coverage', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255])
    applyShapeMask(pixels, true)
    expect([...pixels]).toEqual([255, 255, 255, 255])
  })

  it('scales coverage by the source alpha', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 128])
    applyShapeMask(pixels, false)
    expect(pixels[3]).toBe(128)
  })
})

describe('stamp list edits', () => {
  it('appends a stamp without replacing existing ones', () => {
    expect(appendStamp(['dot'], 'data:image/png;base64,x')).toEqual([
      'dot',
      'data:image/png;base64,x',
    ])
  })

  it('falls back to a dot when the last stamp is removed', () => {
    expect(removeStampAt(['data:image/png;base64,x'], 0)).toEqual(['dot'])
  })
})
