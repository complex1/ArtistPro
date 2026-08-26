import { describe, expect, it } from 'vitest'
import { defaultAnimation, upsertKeyframe } from './animation'
import { createShape } from './nodes'
import { createPath, createPathPoint } from './path'
import { findNode } from './scene'
import {
  convertSelectionToSymbol,
  createSymbolInstance,
  evaluateSymbolInstance,
  findSymbolDefinition,
  symbolLocalTime,
} from './symbols'
import { defaultTransform } from './transform'
import type {
  EditorDocument,
  EditorDocumentV2,
  SymbolDefinition,
  SymbolInstanceNode,
} from './types'

const definition = (): SymbolDefinition => {
  const child = createShape('rect', { x: 0, y: 0 })
  if (child.type !== 'rect') throw new Error('expected rect')
  child.id = 'internal'
  let animation = defaultAnimation()
  animation.duration = 2
  animation = upsertKeyframe(animation, child.id, 'position.x', 0, 0, 'linear')
  animation = upsertKeyframe(animation, child.id, 'position.x', 2, 100, 'linear')
  return {
    id: 'symbol-a',
    name: 'Badge',
    width: 110,
    height: 140,
    children: [child],
    animation,
  }
}

const documentWith = (children: EditorDocument['children']): EditorDocumentV2 => ({
  version: 2,
  name: 'Symbols',
  artboard: {
    width: 800,
    height: 600,
    background: '#fff',
    grid: {
      type: 'grid',
      enabled: false,
      locked: false,
      spacing: 40,
      origin: { x: 0, y: 0 },
      color: '#000',
      opacity: 0.2,
      snap: false,
      snapThreshold: 8,
    },
  },
  children,
  animation: defaultAnimation(),
  symbols: [],
})

describe('symbol lookup and playback', () => {
  it('finds definitions by document-scoped id', () => {
    const item = definition()
    expect(findSymbolDefinition([item], item.id)).toBe(item)
    expect(findSymbolDefinition([item], 'missing')).toBeUndefined()
  })

  it('holds once playback at zero before start and at the final pose after duration', () => {
    const item = definition()
    const instance = createSymbolInstance(item, { x: 10, y: 20 }, {
      startTime: 3,
      mode: 'once',
    })

    expect(symbolLocalTime(instance, item, 2)).toBe(0)
    expect(symbolLocalTime(instance, item, 4)).toBe(1)
    expect(symbolLocalTime(instance, item, 8)).toBe(2)
  })

  it('wraps loop playback and handles zero-duration definitions', () => {
    const item = definition()
    const instance = createSymbolInstance(item, undefined, {
      startTime: 1,
      mode: 'loop',
    })

    expect(symbolLocalTime(instance, item, 5.5)).toBeCloseTo(0.5)
    item.animation.duration = 0
    expect(symbolLocalTime(instance, item, 10)).toBe(0)
  })
})

describe('symbol instances', () => {
  it('creates a transformed leaf sized from its definition', () => {
    const instance = createSymbolInstance(definition(), { x: 25, y: 40 })

    expect(instance).toMatchObject({
      type: 'symbol',
      symbolId: 'symbol-a',
      name: 'Badge',
      width: 110,
      height: 140,
      playback: { startTime: 0, mode: 'once' },
    })
    expect(instance.transform.position).toEqual({ x: 25, y: 40 })
    expect(instance.transform.pivot).toEqual({ x: 55, y: 70 })
  })

  it('evaluates internals separately while leaving the instance a leaf', () => {
    const item = definition()
    const instance = createSymbolInstance(item, undefined, {
      startTime: 2,
      mode: 'once',
    })
    const evaluated = evaluateSymbolInstance(instance, [item], 3)

    expect(evaluated?.instance).toBe(instance)
    expect(evaluated?.localTime).toBe(1)
    expect(evaluated?.children[0].transform.position.x).toBe(50)
    expect('children' in instance).toBe(false)
    expect(findNode([instance], 'internal')).toBeUndefined()
  })
})

describe('selection conversion', () => {
  it('rebases selected artwork and its root position tracks into a definition', () => {
    const selected = createShape('rect', { x: 80, y: 60 })
    selected.id = 'stable-child'
    const outside = createShape('ellipse', { x: 400, y: 300 })
    outside.id = 'outside'
    const document = documentWith([selected, outside])
    document.animation = upsertKeyframe(
      document.animation,
      selected.id,
      'position.x',
      0,
      80,
      'linear',
    )
    document.animation = upsertKeyframe(
      document.animation,
      selected.id,
      'position.x',
      2,
      180,
      'linear',
    )
    document.animation = upsertKeyframe(
      document.animation,
      outside.id,
      'opacity',
      0,
      0.5,
    )

    const result = convertSelectionToSymbol(document, [selected.id], 'Card')

    expect(result).not.toBeNull()
    const next = result!.document
    const item = next.symbols[0]
    const instance = next.children[0] as SymbolInstanceNode
    expect(item.name).toBe('Card')
    expect(item.children[0].id).toBe('stable-child')
    expect(item.children[0].transform.position).toEqual({ x: 0, y: 0 })
    expect(item.animation.tracks[0].keys.map((key) => key.value)).toEqual([0, 100])
    expect(item.animation.tracks[0].keys.map((key) => key.id)).toEqual(
      document.animation.tracks[0].keys.map((key) => key.id),
    )
    expect(instance.transform.position).toEqual({ x: 80, y: 60 })
    expect(next.animation.tracks.map((track) => track.nodeId)).toEqual(['outside'])
    expect(next.children[1].id).toBe('outside')
  })

  it('keeps internal motion paths and rejects cross-boundary bindings', () => {
    const path = createPath({ x: 0, y: 0 }, createPathPoint({ x: 0, y: 0 }))
    path.id = 'path'
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    const follower = createShape('rect', { x: 20, y: 20 })
    follower.id = 'follower'
    follower.motionPath = { pathId: path.id, progress: 0.5, autoRotate: false }
    const document = documentWith([path, follower])

    const internal = convertSelectionToSymbol(document, [path.id, follower.id])
    expect(internal?.document.symbols[0].children[1].motionPath?.pathId).toBe(
      path.id,
    )
    expect(convertSelectionToSymbol(document, [follower.id])).toBeNull()

    const outsideFollower = createShape('rect', { x: 200, y: 200 })
    outsideFollower.motionPath = {
      pathId: path.id,
      progress: 0,
      autoRotate: false,
    }
    expect(
      convertSelectionToSymbol(
        documentWith([path, outsideFollower]),
        [path.id],
      ),
    ).toBeNull()
  })

  it('rejects symbol instances to prevent nested symbols', () => {
    const nested = createSymbolInstance(definition())
    const document = documentWith([nested])

    expect(convertSelectionToSymbol(document, [nested.id])).toBeNull()
  })

  it('upgrades a version-one document during conversion', () => {
    const shape = createShape('rect', { x: 10, y: 20 })
    const legacy = { ...documentWith([shape]), version: 1 as const }
    const { symbols: _symbols, ...versionOne } = legacy

    const result = convertSelectionToSymbol(versionOne, [shape.id])

    expect(result?.document.version).toBe(2)
    expect(result?.document.symbols).toHaveLength(1)
  })
})

describe('definition constraints', () => {
  it('keeps the instance transform independent from definition internals', () => {
    const item = definition()
    const instance: SymbolInstanceNode = {
      id: 'instance',
      name: 'Badge',
      type: 'symbol',
      symbolId: item.id,
      width: item.width,
      height: item.height,
      visible: true,
      locked: false,
      pivotPreset: 'center',
      effects: [],
      playback: { startTime: 0, mode: 'once' },
      transform: { ...defaultTransform(), opacity: 0.4 },
    }

    const evaluated = evaluateSymbolInstance(instance, [item], 1)
    expect(evaluated?.instance.transform.opacity).toBe(0.4)
    expect(evaluated?.children[0].transform.opacity).toBe(1)
  })
})
