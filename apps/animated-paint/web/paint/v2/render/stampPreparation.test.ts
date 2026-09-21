import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SHADOW } from '../core/defaults'
import {
  canvas2dRenderer, clearStampImages, onStampAssetReady, prepareStampImages,
  registerStampImage, retainStampImages, stampAssetVersion,
} from './canvas2d'

const subscriptions: (() => void)[] = []
afterEach(() => {
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe()
  clearStampImages()
  vi.unstubAllGlobals()
})

function paintImage(src: string) {
  const drawImage = vi.fn()
  const context = {
    globalAlpha: 1, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage,
  } as unknown as CanvasRenderingContext2D
  canvas2dRenderer.paint(context, [{
    x: 10, y: 20, size: 32, rotation: 0, opacity: 1, color: '#112233', stampIndex: 0,
    kind: 'stamp', blur: 0, glow: 0, shadow: DEFAULT_SHADOW,
  }], [src])
  return drawImage
}

function pendingBitmap() {
  let ready!: (bitmap: ImageBitmap) => void
  const bitmap = { width: 64, height: 64, close: vi.fn() } as unknown as ImageBitmap
  const createBitmap = vi.fn(() => new Promise<ImageBitmap>(resolve => { ready = resolve }))
  vi.stubGlobal('createImageBitmap', createBitmap)
  return { bitmap, createBitmap, ready: () => ready(bitmap) }
}

function pendingImage() {
  let ready!: () => void
  const decode = vi.fn(() => new Promise<void>((resolve) => { ready = resolve }))
  class ImageStub {
    complete = false
    naturalWidth = 0
    naturalHeight = 0
    src = ''
    decode = async () => {
      await decode()
      this.complete = true
      this.naturalWidth = this.naturalHeight = 64
    }
  }
  vi.stubGlobal('Image', ImageStub)
  return { decode, ready: () => ready() }
}

describe('export stamp preparation', () => {
  it('waits for unique shape/image pixels and reuses the decoded stamp', async () => {
    const image = pendingImage()
    let finished = false
    const src = 'data:image/svg+xml,smoke'
    const preparation = prepareStampImages(['dot', `shape:${src}`, src]).then(() => { finished = true })
    expect(image.decode).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(finished).toBe(false)
    image.ready()
    await preparation
    expect(finished).toBe(true)
    await prepareStampImages([`shape:${src}`])
    expect(image.decode).toHaveBeenCalledTimes(1)
  })

  it('can cancel while an image is decoding', async () => {
    const image = pendingImage()
    const controller = new AbortController()
    const preparation = prepareStampImages(['data:image/png,pending'], controller.signal)
    controller.abort()
    await expect(preparation).rejects.toMatchObject({ name: 'AbortError' })
    image.ready()
  })

  it('rejects failed decodes instead of exporting a missing stamp', async () => {
    class BrokenImage {
      complete = true
      naturalWidth = 0
      naturalHeight = 0
      src = ''
      decode() { return Promise.reject(new Error('Broken pixels')) }
    }
    vi.stubGlobal('Image', BrokenImage)
    await expect(prepareStampImages(['data:image/png,broken'])).rejects.toThrow('Broken pixels')
  })

  it('does not allocate or decode after cancellation', async () => {
    const constructor = vi.fn()
    vi.stubGlobal('Image', constructor)
    const signal = AbortSignal.abort()
    await expect(prepareStampImages(['data:image/png,unused'], signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(constructor).not.toHaveBeenCalled()
  })

  it('shares lazy paint and export loads and only publishes normalized bitmap pixels', async () => {
    const image = pendingImage()
    const bitmap = pendingBitmap()
    const notify = vi.fn()
    subscriptions.push(onStampAssetReady(notify))
    const version = stampAssetVersion()
    const src = 'data:image/svg+xml,normalized'
    expect(paintImage(src)).not.toHaveBeenCalled()
    let finished = false
    const first = prepareStampImages([src]).then(() => { finished = true })
    const second = prepareStampImages([`shape:${src}`])
    expect(image.decode).toHaveBeenCalledTimes(1)
    image.ready()
    await vi.waitFor(() => expect(bitmap.createBitmap).toHaveBeenCalledTimes(1))
    expect(finished).toBe(false)
    expect(notify).not.toHaveBeenCalled()
    expect(stampAssetVersion()).toBe(version)
    expect(paintImage(src)).not.toHaveBeenCalled()
    bitmap.ready()
    await Promise.all([first, second])
    expect(notify).toHaveBeenCalledTimes(1)
    expect(stampAssetVersion()).toBe(version + 1)
    expect(paintImage(src).mock.calls[0][0]).toBe(bitmap.bitmap)
    await prepareStampImages([src])
    expect(bitmap.createBitmap).toHaveBeenCalledTimes(1)
  })

  it('can cancel during bitmap conversion without cancelling another consumer', async () => {
    const image = pendingImage()
    const bitmap = pendingBitmap()
    const controller = new AbortController()
    const first = prepareStampImages(['data:image/png,shared'], controller.signal)
    const second = prepareStampImages(['data:image/png,shared'])
    image.ready()
    await vi.waitFor(() => expect(bitmap.createBitmap).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    bitmap.ready()
    await second
    expect(paintImage('data:image/png,shared').mock.calls[0][0]).toBe(bitmap.bitmap)
    expect(bitmap.bitmap.close).not.toHaveBeenCalled()
  })

  it.each(['clear', 'retain'] as const)('closes late bitmap results after %s removes a pending load', async action => {
    const image = pendingImage()
    const bitmap = pendingBitmap()
    const notify = vi.fn()
    subscriptions.push(onStampAssetReady(notify))
    const preparation = prepareStampImages(['data:image/png,discard'])
    image.ready()
    await vi.waitFor(() => expect(bitmap.createBitmap).toHaveBeenCalledTimes(1))
    if (action === 'clear') clearStampImages()
    else retainStampImages(new Set())
    await expect(preparation).rejects.toThrow('discarded')
    bitmap.ready()
    await vi.waitFor(() => expect(bitmap.bitmap.close).toHaveBeenCalledTimes(1))
    expect(notify).not.toHaveBeenCalled()
  })

  it('does not normalize a decode that finishes after the load was discarded', async () => {
    const image = pendingImage()
    const bitmap = pendingBitmap()
    const preparation = prepareStampImages(['data:image/png,discard-before-decode'])
    clearStampImages()
    await expect(preparation).rejects.toThrow('discarded')
    image.ready()
    await Promise.resolve()
    await Promise.resolve()
    expect(bitmap.createBitmap).not.toHaveBeenCalled()
  })

  it('does not replace a registered worker asset with a stale lazy load', async () => {
    const image = pendingImage()
    const bitmap = pendingBitmap()
    const src = 'data:image/png,replaced'
    const preparation = prepareStampImages([src])
    image.ready()
    await vi.waitFor(() => expect(bitmap.createBitmap).toHaveBeenCalledTimes(1))
    const replacement = { width: 12, height: 12, close: vi.fn() } as unknown as ImageBitmap
    registerStampImage(src, replacement)
    await expect(preparation).rejects.toThrow('discarded')
    bitmap.ready()
    await vi.waitFor(() => expect(bitmap.bitmap.close).toHaveBeenCalledTimes(1))
    expect(paintImage(src).mock.calls[0][0]).toBe(replacement)
    expect(replacement.close).not.toHaveBeenCalled()
  })

  it('reports bitmap conversion failures without exposing unnormalized images or repeatedly retrying', async () => {
    const image = pendingImage()
    const createBitmap = vi.fn(() => Promise.reject(new Error('Bitmap conversion failed')))
    vi.stubGlobal('createImageBitmap', createBitmap)
    const src = 'data:image/svg+xml,conversion-failed'
    const preparation = prepareStampImages([src])
    image.ready()
    await expect(preparation).rejects.toThrow('Bitmap conversion failed')
    expect(paintImage(src)).not.toHaveBeenCalled()
    await expect(prepareStampImages([src])).rejects.toThrow('Bitmap conversion failed')
    expect(image.decode).toHaveBeenCalledTimes(1)
    expect(createBitmap).toHaveBeenCalledTimes(1)
  })
})
