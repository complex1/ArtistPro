import { describe, expect, it } from 'vitest'
import { createEngine } from './engine'
import { builtinBrushes, createBrush } from './presets'
import { importBrushFile, parseBrush } from './schema'
import { dabCoverageAt } from './dabs'
import { floodFill } from './fill'
import { invertAffine } from './transform'
import { rasterizeLasso } from './selection'

const W = 32

function at(pixels: Uint8ClampedArray, x: number, y: number, width = W) {
  const i = (y * width + x) * 4
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]] as const
}

describe('draw-engine document and brushes', () => {
  it('creates a raster document with one layer', () => {
    const engine = createEngine({
      backend: 'cpu',
      document: { width: W, height: W, name: 'Test' },
    })
    const doc = engine.document()
    expect(doc.version).toBe(1)
    expect(doc.layers).toHaveLength(1)
    expect(engine.backendKind()).toBe('cpu')
  })

  it('ships seven built-in presets', () => {
    const names = builtinBrushes().map((brush) => brush.preset)
    expect(names).toEqual(['pen', 'pencil', 'marker', 'eraser', 'brush', 'stamp', 'soft'])
  })

  it('imports artist-brush JSON as a custom static brush', () => {
    const imported = importBrushFile({
      name: 'Glow',
      renderer: 'stamp',
      animated: true,
      animationJs: 'function animate() { return [] }',
      size: 20,
      hardness: 0.2,
    })
    expect(imported?.preset).toBe('custom')
    expect(imported?.category).toBe('Custom')
    expect(imported?.size).toBe(20)
    expect(parseBrush(null)).toBeNull()
  })
})

describe('draw-engine raster ops', () => {
  it('paints a rect and undoes the tiles', () => {
    const engine = createEngine({
      backend: 'cpu',
      document: { width: W, height: W, background: '#ffffff' },
    })
    engine.fillRect({ x: 4, y: 4, width: 6, height: 6 }, '#ff0000')
    expect(at(engine.readLayerPixels(), 6, 6)[0]).toBe(255)
    expect(engine.undo()).toBe(true)
    expect(at(engine.readLayerPixels(), 6, 6)[3]).toBe(0)
    expect(engine.redo()).toBe(true)
    expect(at(engine.readLayerPixels(), 6, 6)[0]).toBe(255)
  })

  it('commits a pen stroke into the layer', () => {
    const engine = createEngine({ backend: 'cpu', document: { width: W, height: W } })
    const pen = createBrush({ preset: 'pen', tip: 'round', size: 10, hardness: 1, spacing: 2 })
    engine.beginStroke(pen, { x: 8, y: 16, t: 0 })
    engine.moveStroke({ x: 24, y: 16, t: 16 })
    engine.endStroke()
    expect(at(engine.readLayerPixels(), 16, 16)[3]).toBeGreaterThan(0)
  })

  it('erases painted pixels', () => {
    const engine = createEngine({ backend: 'cpu', document: { width: W, height: W } })
    engine.fillRect({ x: 8, y: 8, width: 16, height: 16 }, '#000000')
    const eraser = createBrush({ preset: 'eraser', blendMode: 'erase', size: 20, hardness: 1, flow: 1 })
    engine.beginStroke(eraser, { x: 16, y: 16, t: 0 })
    engine.endStroke()
    expect(at(engine.readLayerPixels(), 16, 16)[3]).toBeLessThan(200)
  })
})

describe('fill, lasso, transform, liquify', () => {
  it('flood-fills a contiguous region', () => {
    const pixels = new Uint8ClampedArray(W * W * 4)
    for (let y = 2; y < 8; y += 1) {
      for (let x = 2; x < 8; x += 1) {
        const i = (y * W + x) * 4
        pixels[i + 3] = 255
      }
    }
    const filled = floodFill(pixels, W, W, 4, 4, '#0000ff', 8)
    expect(at(filled.pixels, 4, 4)[2]).toBe(255)
    expect(at(filled.pixels, 20, 4)[2]).toBe(0)
  })

  it('clips fill to a lasso', () => {
    const engine = createEngine({ backend: 'cpu', document: { width: W, height: W } })
    engine.fillRect({ x: 0, y: 0, width: W, height: W }, '#111111')
    engine.setSelectionFromLasso([
      { x: 2, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: 10 },
      { x: 2, y: 10 },
    ])
    engine.fill(4, 4, '#00ff00', 40)
    expect(at(engine.readLayerPixels(), 5, 5)[1]).toBeGreaterThan(200)
    expect(at(engine.readLayerPixels(), 20, 20)[1]).toBeLessThan(50)
    expect(engine.hasSelection()).toBe(true)
    expect(engine.selectionBounds()).toMatchObject({ x: 2, y: 2 })
    expect(engine.selectionPath()).toHaveLength(4)
    engine.clearSelection()
    expect(engine.hasSelection()).toBe(false)
    expect(engine.selectionBounds()).toBeNull()
    expect(engine.selectionPath()).toEqual([])
  })

  it('moves pixels with the transform tool', () => {
    const engine = createEngine({ backend: 'cpu', document: { width: W, height: W } })
    engine.fillRect({ x: 2, y: 2, width: 4, height: 4 }, '#00ff00')
    engine.beginTransform('move')
    expect(engine.getTransform()?.bounds).toMatchObject({ x: 2, y: 2, width: 4, height: 4 })
    engine.updateTransform({
      affine: { scaleX: 1, scaleY: 1, rotation: 0, tx: 10, ty: 0 },
    })
    engine.commitTransform()
    expect(at(engine.readLayerPixels(), 12, 3)[1]).toBeGreaterThan(200)
    expect(at(engine.readLayerPixels(), 3, 3)[3]).toBeLessThan(40)
  })

  it('inverts affine around a pivot', () => {
    const t = { scaleX: 1, scaleY: 1, rotation: 0, tx: 5, ty: 2 }
    const mapped = invertAffine(10, 8, t, 0, 0)
    expect(mapped.x).toBeCloseTo(5)
    expect(mapped.y).toBeCloseTo(6)
  })

  it('warps with perspective and wrap', () => {
    const engine = createEngine({ backend: 'cpu', document: { width: W, height: W } })
    engine.fillRect({ x: 4, y: 4, width: 10, height: 10 }, '#0000ff')
    engine.beginTransform('perspective')
    engine.updateTransform({
      corners: [
        { x: 4, y: 4 },
        { x: 18, y: 2 },
        { x: 16, y: 16 },
        { x: 4, y: 14 },
      ],
    })
    engine.commitTransform()
    expect(engine.readLayerPixels().some((value, index) => index % 4 === 2 && value > 200)).toBe(
      true,
    )

    engine.beginTransform('wrap')
    engine.updateTransform({
      wrap: {
        cols: 4,
        rows: 4,
        points: Array.from({ length: 25 }, (_, index) => {
          const col = index % 5
          const row = Math.floor(index / 5)
          return {
            x: col * (W / 4) + (col === 2 && row === 2 ? 6 : 0),
            y: row * (W / 4),
          }
        }),
      },
    })
    engine.commitTransform()
    expect(at(engine.readLayerPixels(), 8, 8)[2] + at(engine.readLayerPixels(), 10, 8)[2]).toBeGreaterThan(
      0,
    )
  })

  it('pushes pixels with liquify', () => {
    const engine = createEngine({ backend: 'cpu', document: { width: W, height: W } })
    engine.fillRect({ x: 8, y: 8, width: 6, height: 6 }, '#ff00ff')
    const brush = createBrush({ size: 12, preset: 'brush' })
    engine.beginLiquify(brush, { x: 10, y: 11, t: 0 }, 'push')
    engine.moveLiquify({ x: 18, y: 11, t: 20 })
    engine.endLiquify()
    expect(at(engine.readLayerPixels(), 16, 11)[3]).toBeGreaterThan(0)
  })

  it('rasterizes a lasso with coverage', () => {
    const mask = rasterizeLasso(
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 8 },
        { x: 0, y: 8 },
      ],
      W,
      W,
    )
    expect(at(mask, 4, 4)[3]).toBeGreaterThan(0)
    expect(at(mask, 20, 4)[3]).toBe(0)
  })

  it('hard dabs cover the center more than the edge', () => {
    const hard = dabCoverageAt(10, 10, {
      x: 10,
      y: 10,
      size: 10,
      rotation: 0,
      hardness: 1,
      flow: 1,
      opacity: 1,
      color: { r: 0, g: 0, b: 0, a: 1 },
      erase: false,
      tip: 'round',
      seed: 1,
    })
    const edge = dabCoverageAt(14, 10, {
      x: 10,
      y: 10,
      size: 10,
      rotation: 0,
      hardness: 0,
      flow: 1,
      opacity: 1,
      color: { r: 0, g: 0, b: 0, a: 1 },
      erase: false,
      tip: 'round',
      seed: 1,
    })
    expect(hard).toBe(1)
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(1)
  })
})
