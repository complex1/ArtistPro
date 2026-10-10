import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importImagePlane, MAX_IMAGE_FILE_BYTES } from './imageAssets'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwH4YZkDkAm34L9XKwuTwAAAAASUVORK5CYII='
const pngBytes = Uint8Array.from(atob(PNG.split(',')[1]), c => c.charCodeAt(0))
let dimensions: [number, number]
let decodeFailure: boolean
let context: { drawImage: ReturnType<typeof vi.fn>; imageSmoothingEnabled: boolean; imageSmoothingQuality: string } | null
let canvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn>; toDataURL: ReturnType<typeof vi.fn> }
let revoke = vi.fn<(url: string) => void>()

class TestImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = dimensions[0]
  naturalHeight = dimensions[1]
  set src(value: string) {
    if (value) queueMicrotask(() => { if (decodeFailure) this.onerror?.(); else this.onload?.() })
  }
}

beforeEach(() => {
  dimensions = [3, 2]
  decodeFailure = false
  context = { drawImage: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: 'low' }
  canvas = {
    width: 0, height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => {
      // A fake canvas result preserving its requested output header. Real pixel decoding is covered in the browser smoke test.
      const bytes = pngBytes.slice()
      const header = new DataView(bytes.buffer)
      header.setUint32(16, canvas.width)
      header.setUint32(20, canvas.height)
      return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
    }),
  }
  revoke = vi.fn()
  vi.stubGlobal('Image', TestImage)
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-image')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('image plane import', () => {
  it('embeds a sanitized PNG with matching dimensions, an empty rig, and white default color', async () => {
    const result = await importImagePlane(new File([pngBytes], 'Reference.png', { type: 'image/png' }))
    expect(result.asset).toMatchObject({ name: 'Reference', bones: [], image: { width: 3, height: 2 } })
    expect(result.object).toMatchObject({ name: 'Reference', kind: 'image', color: '#ffffff', pose: {}, position: [0, 0, 0], scale: [1, 1, 1], assetId: result.asset.id })
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: true })
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png')
    expect(revoke).toHaveBeenCalledWith('blob:test-image')
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it.each([[6000, 3000, 2048, 1024], [2000, 8000, 512, 2048], [3, 2, 3, 2]])('resizes %s×%s without upscaling or changing aspect ratio', async (width, height, expectedWidth, expectedHeight) => {
    dimensions = [width, height]
    const result = await importImagePlane(new File([pngBytes], 'Reference.png'))
    expect(result.asset.image).toEqual({ width: expectedWidth, height: expectedHeight })
    expect(context!.drawImage).toHaveBeenCalledWith(expect.any(TestImage), 0, 0, expectedWidth, expectedHeight)
  })

  it.each([
    ['image/jpeg', 'Photo.JPG', Uint8Array.from([255, 216, 255, 224, 0, 16])],
    ['image/webp', 'Photo.webp', new TextEncoder().encode('RIFF0000WEBP')],
  ])('accepts %s content and serializes PNG', async (mime, name, bytes) => {
    const result = await importImagePlane(new File([bytes], name, { type: mime }))
    expect(result.asset.name).toBe('Photo')
    expect(result.asset.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('rejects SVG or non-raster bytes even with a misleading image extension', async () => {
    await expect(importImagePlane(new File(['<svg/>'], 'pretend.png', { type: 'image/png' }))).rejects.toThrow('not a supported raster')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects oversized files before reading or decoding them', async () => {
    const file = new File([pngBytes], 'Large.png')
    Object.defineProperty(file, 'size', { value: MAX_IMAGE_FILE_BYTES + 1 })
    const read = vi.spyOn(file, 'slice')
    await expect(importImagePlane(file)).rejects.toThrow('20 MiB')
    expect(read).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('revokes the temporary URL on decoding, dimension, and rendering errors', async () => {
    decodeFailure = true
    await expect(importImagePlane(new File([pngBytes], 'Broken.png'))).rejects.toThrow('could not be decoded')
    expect(revoke).toHaveBeenCalledTimes(1)
    decodeFailure = false
    dimensions = [0, 2]
    await expect(importImagePlane(new File([pngBytes], 'Invalid.png'))).rejects.toThrow('dimensions')
    expect(revoke).toHaveBeenCalledTimes(2)
    dimensions = [3, 2]
    context = null
    await expect(importImagePlane(new File([pngBytes], 'NoCanvas.png'))).rejects.toThrow('Canvas rendering')
    expect(revoke).toHaveBeenCalledTimes(3)
  })

  it('releases canvas pixels and the object URL when PNG serialization fails', async () => {
    canvas.toDataURL.mockImplementation(() => { throw new Error('Canvas allocation failed') })
    await expect(importImagePlane(new File([pngBytes], 'Failed.png'))).rejects.toThrow('Canvas allocation failed')
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
})
