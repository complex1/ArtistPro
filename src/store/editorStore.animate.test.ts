import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from './editorStore'
import { findNode } from '../model/scene'
import { evaluateScene, findTrack } from '../model/animation'
import { createShape } from '../model/nodes'
import type { AnimatableProperty, RectNode } from '../model/types'

const store = () => useEditorStore.getState()

const rect = (): RectNode => {
  const node = findNode(store().document.children, store().selectedIds[0])
  if (!node || node.type !== 'rect') throw new Error('expected a rect')
  return node
}

const painted = (time: number) => {
  const scene = evaluateScene(store().document.children, store().document.animation, time)
  const node = scene[0]
  if (node.type !== 'rect') throw new Error('expected a rect')
  return node
}

const keys = (property: AnimatableProperty) =>
  findTrack(store().document.animation, rect().id, property)?.keys ?? []

beforeEach(() => {
  const fresh = createShape('rect')
  useEditorStore.setState((state) => ({
    document: { ...state.document, children: [fresh], animation: { duration: 3, tracks: [] } },
    selectedIds: [fresh.id],
    selectedKeyIds: [],
    playhead: 0,
    playing: false,
    mode: 'animate',
  }))
})

describe('animate authoring', () => {
  it('keys a transform channel dragged at t>0 and leaves the rest pose alone', () => {
    const id = rect().id
    const restX = rect().transform.position.x
    store().armProperty(id, 'position.x')
    store().setPlayhead(1.5, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 500, y: rect().transform.position.y },
    })

    expect(keys('position.x').map((key) => [key.time, key.value])).toEqual([
      [0, restX],
      [1.5, 500],
    ])
    expect(rect().transform.position.x).toBe(restX)
    expect(painted(1.5).transform.position.x).toBe(500)
  })

  it('keys a colour channel edited at t>0 and leaves the rest pose alone', () => {
    const id = rect().id
    const restFill = rect().fill
    store().armProperty(id, 'fill')
    store().setPlayhead(2, true)
    store().updateNode(id, { fill: '#ff0000' })

    expect(keys('fill').map((key) => [key.time, key.value])).toEqual([
      [0, restFill],
      [2, '#ff0000'],
    ])
    expect(rect().fill).toBe(restFill)
    expect(painted(2).fill).toBe('#ff0000')
    expect(painted(0).fill).toBe(restFill)
  })

  it('interpolates a colour between its keys', () => {
    const id = rect().id
    store().updateNode(id, { fill: '#000000' })
    store().armProperty(id, 'fill')
    store().setPlayhead(2, true)
    store().updateNode(id, { fill: '#ffffff' })

    expect(painted(1).fill).toBe('#808080')
  })

  it('keys a size channel edited at t>0', () => {
    const id = rect().id
    const restWidth = rect().width
    store().armProperty(id, 'width')
    store().setPlayhead(1, true)
    store().updateNode(id, { width: 400 })

    expect(keys('width').map((key) => key.value)).toEqual([restWidth, 400])
    expect(rect().width).toBe(restWidth)
    expect(painted(1).width).toBe(400)
  })

  it('edits the rest pose when the property is not armed', () => {
    const id = rect().id
    store().setPlayhead(1, true)
    store().updateNode(id, { fill: '#00ff00' })

    expect(store().document.animation.tracks).toHaveLength(0)
    expect(rect().fill).toBe('#00ff00')
  })

  it('moves the rest pose too when editing on the first frame', () => {
    const id = rect().id
    store().armProperty(id, 'fill')
    store().updateNode(id, { fill: '#123456' })

    expect(keys('fill').map((key) => key.value)).toEqual(['#123456'])
    expect(rect().fill).toBe('#123456')
  })

  it('does not bake an animated channel into the rest pose when a sibling is edited', () => {
    const id = rect().id
    const restWidth = rect().width
    store().armProperty(id, 'width')
    store().setPlayhead(2, true)
    store().updateNode(id, { width: 400 })
    // Mimics a panel that patches several channels from the evaluated pose.
    store().updateNode(id, { width: painted(2).width, fill: '#abcdef' })

    expect(rect().width).toBe(restWidth)
    expect(rect().fill).toBe('#abcdef')
    expect(keys('width').map((key) => key.value)).toEqual([restWidth, 400])
  })

  it('drops the absorbed key when one is dragged onto another', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    store().setPlayhead(1, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 400, y: rect().transform.position.y },
    })
    const dragged = keys('position.x')[1]
    store().retimeKey(dragged.id, 0)

    expect(keys('position.x')).toHaveLength(1)
    expect(keys('position.x')[0].id).toBe(dragged.id)
    expect(keys('position.x')[0].value).toBe(400)
  })

  it('removes selected keys', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    store().setPlayhead(1, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 400, y: rect().transform.position.y },
    })
    store().selectKeys([keys('position.x')[1].id])
    store().removeSelectedKeys()

    expect(keys('position.x')).toHaveLength(1)
  })

  it('disarming a property drops its track and restores the rest pose on canvas', () => {
    const id = rect().id
    const restX = rect().transform.position.x
    store().armProperty(id, 'position.x')
    store().setPlayhead(1.5, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 500, y: rect().transform.position.y },
    })
    store().disarmProperty(id, 'position.x')

    expect(store().document.animation.tracks).toHaveLength(0)
    expect(painted(1.5).transform.position.x).toBe(restX)
  })
})
