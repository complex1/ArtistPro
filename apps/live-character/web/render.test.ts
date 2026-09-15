import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLayer, generateMesh, transformPoint } from './engine'
import type { CharacterDocument } from './model'
import { drawCharacter, hitTestLayer, triangleTransform } from './render'

afterEach(() => vi.unstubAllGlobals())

function fixture(): CharacterDocument {
  const layer = createLayer('rectangle', 'Body')
  layer.id = 'body'
  layer.width = 80
  layer.height = 40
  layer.transform.x = 150
  layer.transform.y = 100
  return {
    version: 1,
    name: 'Character',
    width: 800,
    height: 600,
    fps: 24,
    duration: 119,
    layers: [layer],
    bones: [],
    controllers: [],
    keyframes: [],
  }
}

describe('triangle texture mapping', () => {
  it('maps all source corners under rotation, translation, and nonuniform scale', () => {
    const source = [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 10, y: 50 },
    ] as const
    const target = [
      { x: 200, y: 300 },
      { x: 200, y: 340 },
      { x: 110, y: 300 },
    ] as const
    const matrix = triangleTransform([...source], [...target])
    expect(matrix).not.toBeNull()
    source.forEach((vertex, index) => {
      const point = transformPoint(matrix!, vertex)
      expect(point.x).toBeCloseTo(target[index].x)
      expect(point.y).toBeCloseTo(target[index].y)
    })
  })

  it('ignores collapsed mesh triangles', () => {
    expect(
      triangleTransform(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
      ),
    ).toBeNull()
  })

  it('keeps artwork texture coordinates at the bind mesh when posed vertices move', () => {
    const rest = fixture()
    rest.layers[0].mesh = generateMesh(rest.layers[0], 1)
    const posed = structuredClone(rest)
    const movedVertex = posed.layers[0].mesh!.vertices[0]
    movedVertex.x -= 50
    movedVertex.y -= 30
    const textureContext = {
      scale: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    }
    const texture = { width: 0, height: 0, getContext: () => textureContext }
    vi.stubGlobal('document', { createElement: () => texture })
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      transform: vi.fn(),
      drawImage: vi.fn(),
    }

    drawCharacter(ctx as unknown as CanvasRenderingContext2D, rest, posed)

    const triangles = rest.layers[0].mesh.triangles
    expect(ctx.drawImage).toHaveBeenCalledTimes(triangles.length)
    triangles.forEach((indices, triangle) => {
      const [a, b, c, d, e, f] = ctx.transform.mock.calls[triangle] as number[]
      indices.forEach((index) => {
        const bindVertex = rest.layers[0].mesh!.vertices[index]
        const source = {
          x: ((bindVertex.x + 40) / 80) * texture.width,
          y: ((bindVertex.y + 20) / 40) * texture.height,
        }
        const rendered = transformPoint({ a, b, c, d, e, f }, source)
        expect(rendered.x).toBeCloseTo(
          posed.layers[0].mesh!.vertices[index].x + 150,
        )
        expect(rendered.y).toBeCloseTo(
          posed.layers[0].mesh!.vertices[index].y + 100,
        )
      })
    })
  })
})

describe('canvas layer selection', () => {
  it('selects the frontmost visible, unlocked artwork', () => {
    const doc = fixture()
    doc.layers.push({ ...doc.layers[0], id: 'front' })
    expect(hitTestLayer(doc, doc, { x: 150, y: 100 })).toBe('front')
    doc.layers[1].locked = true
    expect(hitTestLayer(doc, doc, { x: 150, y: 100 })).toBe('body')
    doc.layers[0].visible = false
    expect(hitTestLayer(doc, doc, { x: 150, y: 100 })).toBeNull()
  })

  it('uses deformed triangles when bones move the artwork', () => {
    const rest = fixture()
    rest.bones = [
      {
        id: 'arm',
        name: 'Arm',
        parentId: null,
        x: 100,
        y: 100,
        length: 100,
        rotation: 0,
      },
    ]
    rest.layers[0].mesh = generateMesh(rest.layers[0], 2)
    rest.layers[0].mesh.weights = rest.layers[0].mesh.vertices.map(() => ({
      arm: 1,
    }))
    const posed = structuredClone(rest)
    posed.bones[0].rotation = 90
    expect(hitTestLayer(rest, posed, { x: 100, y: 150 })).toBe('body')
    expect(hitTestLayer(rest, posed, { x: 180, y: 100 })).toBeNull()
  })

  it('selects animated mesh artwork using the original painted silhouette', () => {
    const rest = fixture()
    rest.layers[0].kind = 'ellipse'
    rest.layers[0].mesh = generateMesh(rest.layers[0], 2)
    const posed = structuredClone(rest)
    for (const vertex of posed.layers[0].mesh!.vertices) vertex.x += 100

    expect(hitTestLayer(rest, posed, { x: 250, y: 100 })).toBe('body')
    expect(hitTestLayer(rest, posed, { x: 150, y: 100 })).toBeNull()
    expect(hitTestLayer(rest, posed, { x: 289, y: 119 })).toBeNull()
  })

  it('respects ellipse silhouettes and parent visibility', () => {
    const doc = fixture()
    doc.layers[0].kind = 'ellipse'
    expect(hitTestLayer(doc, doc, { x: 189, y: 119 })).toBeNull()
    const parent = { ...createLayer('rectangle'), id: 'parent', visible: false }
    doc.layers[0].parentId = parent.id
    doc.layers.push(parent)
    expect(hitTestLayer(doc, doc, { x: 150, y: 100 })).toBeNull()
  })
})
