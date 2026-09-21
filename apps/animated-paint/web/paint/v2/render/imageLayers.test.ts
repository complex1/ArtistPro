import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocumentV2, createImageLayerV2 } from '../core/defaults'
import type { StrokeV2 } from '../core/types'
import { renderDocumentV2 } from './engine'
import { applyScenePatch, SceneDiffer } from './protocol'

const imageData = () => ({
  dataUrl: 'data:image/png;base64,original', naturalWidth: 800, naturalHeight: 600,
  x: 45, y: -10, width: 200, height: 150,
})

function contextStub() {
  const draws: { args: unknown[]; opacity: number; blend: string }[] = []
  const saved: { opacity: number; blend: string }[] = []
  const context = {
    canvas: { width: 900, height: 600 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() { saved.push({ opacity: this.globalAlpha, blend: this.globalCompositeOperation }) },
    restore() {
      const state = saved.pop()!
      this.globalAlpha = state.opacity; this.globalCompositeOperation = state.blend
    },
    setTransform() {}, fillRect() {}, clearRect() {},
    drawImage(...args: unknown[]) {
      draws.push({ args, opacity: this.globalAlpha, blend: this.globalCompositeOperation })
    },
  }
  return { context: context as unknown as CanvasRenderingContext2D, draws }
}

afterEach(() => vi.unstubAllGlobals())

describe('image layer rendering', () => {
  it('draws original pixels at the editable placement, preserves order and skips hidden images', () => {
    const document = createDocumentV2()
    const image = createImageLayerV2('Reference', imageData())
    document.layers.push(image, { ...image, id: 'hidden', visible: false })
    const legacyPixels = {} as HTMLCanvasElement
    const imagePixels = { width: 800, height: 600 } as HTMLCanvasElement
    const { context, draws } = contextStub()
    renderDocumentV2(context, document, 0, new Map([
      [document.layers[0].id, legacyPixels], [image.id, imagePixels], ['hidden', imagePixels],
    ]))
    expect(draws.map(draw => draw.args)).toEqual([[legacyPixels, 0, 0], [imagePixels, 45, -10, 200, 150]])
    image.image = { ...image.image!, x: 125, width: 400, height: 300 }
    renderDocumentV2(context, document, 0, new Map([[image.id, imagePixels]]))
    expect(draws.at(-1)?.args).toEqual([imagePixels, 125, -10, 400, 300])
    expect(imagePixels).toEqual({ width: 800, height: 600 })
  })

  it('composites a transformed image and its canvas mask with layer opacity and blend applied once', () => {
    const document = createDocumentV2()
    const image = createImageLayerV2('Reference', imageData())
    image.opacity = 0.4; image.blendMode = 'multiply'
    document.layers = [image]
    const imagePixels = {} as HTMLCanvasElement
    const mask = {} as HTMLCanvasElement
    const page = contextStub(), scratch = contextStub()
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => scratch.context }) })
    renderDocumentV2(page.context, document, 0,
      new Map([[image.id, imagePixels]]), new Map([[image.id, mask]]))
    expect(scratch.draws).toEqual([
      { args: [imagePixels, 45, -10, 200, 150], opacity: 1, blend: 'source-over' },
      { args: [mask, 0, 0], opacity: 1, blend: 'destination-out' },
    ])
    expect(page.draws).toEqual([
      { args: [scratch.context.canvas, 0, 0], opacity: 0.4, blend: 'multiply' },
    ])
  })

  it('sends image transforms through worker patches without repeating embedded pixels', () => {
    const document = createDocumentV2()
    const image = createImageLayerV2('Reference', imageData())
    image.rasterDataUrl = 'old raster'; image.eraseMaskDataUrl = 'mask pixels'
    document.layers = [image]
    const differ = new SceneDiffer(), strokes = new Map<string, StrokeV2>()
    const first = differ.diff(document)
    expect(JSON.stringify(first)).not.toContain('original')
    expect(JSON.stringify(first)).not.toContain('old raster')
    expect(JSON.stringify(first)).not.toContain('mask pixels')
    expect(first.layers[0].image?.dataUrl).toBe('')
    expect(image.image?.dataUrl).toBe('data:image/png;base64,original')
    const apply = () => applyScenePatch(structuredClone(differ.diff(document)), strokes)
    expect(apply().layers[0].image).toEqual({ ...image.image!, dataUrl: '' })
    const previous = { ...image.image! }
    image.image = { ...image.image!, x: 190, y: 30, width: 400, height: 300 }
    expect(apply().layers[0].image).toMatchObject({ x: 190, y: 30, width: 400, height: 300 })
    image.image = previous
    expect(apply().layers[0].image).toEqual({ ...previous, dataUrl: '' })
  })
})
