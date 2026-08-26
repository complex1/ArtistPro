import { beforeEach, describe, expect, it } from 'vitest'
import { createShape } from '../model/nodes'
import { boundsOf } from '../model/scene'
import type { EditorDocumentV2, SymbolInstanceNode } from '../model/types'
import {
  activeAnimation,
  activeChildren,
  activeHeight,
  activeWidth,
  useEditorStore,
} from './editorStore'

const store = () => useEditorStore.getState()

const documentV2 = (): EditorDocumentV2 => {
  const document = store().document
  if (document.version !== 2) throw new Error('expected a v2 document')
  return document
}

const symbolInstance = (id: string): SymbolInstanceNode => {
  const node = documentV2().children
    .flatMap((item) => (item.type === 'group' ? item.children : [item]))
    .find((item) => item.id === id)
  if (!node || node.type !== 'symbol') throw new Error('expected a symbol instance')
  return node
}

beforeEach(() => {
  const fresh = createShape('rect')
  useEditorStore.setState((state) => ({
    document: {
      ...state.document,
      version: 2,
      children: [fresh],
      animation: { duration: 3, tracks: [] },
      symbols: [],
    },
    editingSymbolId: null,
    selectedIds: [fresh.id],
    selectedKeyIds: [],
    playhead: 0,
    playing: false,
    mode: 'draw',
  }))
  store().clearHistory()
})

describe('reusable symbols store slice', () => {
  it('uses a v2 document with an empty symbol library', () => {
    expect(documentV2().symbols).toEqual([])
    expect(store().editingSymbolId).toBeNull()
  })

  it('converts a root selection and selects its replacement instance', () => {
    const second = createShape('ellipse')
    store().addNode(second)
    store().selectMany(documentV2().children.map((node) => node.id))

    const symbolId = store().createSymbolFromSelection('Badge')

    expect(symbolId).toBeTruthy()
    expect(documentV2().symbols).toHaveLength(1)
    expect(documentV2().symbols[0].name).toBe('Badge')
    expect(documentV2().symbols[0].children).toHaveLength(2)
    expect(documentV2().children).toHaveLength(1)
    expect(store().selectedIds).toEqual([documentV2().children[0].id])
    expect(symbolInstance(store().selectedIds[0]).symbolId).toBe(symbolId)
  })

  it('creates blank masters and routes scene and animation edits while entered', () => {
    const symbolId = store().createBlankSymbol('Spinner', 240, 160, 2)
    expect(symbolId).toBeTruthy()
    if (!symbolId) throw new Error('expected symbol id')

    store().enterSymbol(symbolId)
    expect(store().editingSymbolId).toBe(symbolId)
    expect(store().selectedIds).toEqual([])
    expect(activeChildren(store())).toEqual([])
    expect(activeAnimation(store()).duration).toBe(2)
    expect(activeWidth(store())).toBe(240)
    expect(activeHeight(store())).toBe(160)

    store().addShape('ellipse')
    const masterNodeId = store().selectedIds[0]
    store().setDuration(4)
    store().updateNode(masterNodeId, { name: 'Master child' })

    expect(documentV2().children).toHaveLength(1)
    expect(documentV2().animation.duration).toBe(3)
    expect(documentV2().symbols[0].children[0].name).toBe('Master child')
    expect(documentV2().symbols[0].animation.duration).toBe(4)

    store().exitSymbol()
    expect(store().editingSymbolId).toBeNull()
    expect(store().selectedIds).toEqual([])
    expect(activeChildren(store())).toBe(documentV2().children)
  })

  it('places new shapes inside the symbol canvas that is open', () => {
    const symbolId = store().createBlankSymbol('Badge', 240, 180, 2)
    if (!symbolId) throw new Error('expected symbol id')
    store().enterSymbol(symbolId)

    store().addShape('rect')
    store().addShape('ellipse')

    for (const child of documentV2().symbols[0].children) {
      const { x, y } = child.transform.position
      const { width, height } = boundsOf([child])
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + width).toBeLessThanOrEqual(240)
      expect(y + height).toBeLessThanOrEqual(180)
    }
  })

  it('blocks nested symbol creation and placement', () => {
    const symbolId = store().createBlankSymbol('Master', 100, 100, 1)
    if (!symbolId) throw new Error('expected symbol id')
    store().enterSymbol(symbolId)
    store().addShape('rect')

    expect(store().createSymbolFromSelection('Nested')).toBeNull()
    expect(store().createBlankSymbol('Nested', 20, 20, 1)).toBeNull()
    expect(store().addSymbolInstance(symbolId)).toBeNull()
    expect(documentV2().symbols).toHaveLength(1)
  })

  it('routes Animate keyframe mutations to the active master timeline', () => {
    const symbolId = store().createBlankSymbol('Animated', 100, 100, 2)
    if (!symbolId) throw new Error('expected symbol id')
    store().enterSymbol(symbolId)
    store().addShape('rect')
    const node = activeChildren(store())[0]
    store().setMode('animate')
    store().armProperty(node.id, 'position.x')
    store().setPlayhead(1)
    store().editTransform(node.id, {
      ...node.transform,
      position: { ...node.transform.position, x: 420 },
    })

    const definition = documentV2().symbols[0]
    const track = definition.animation.tracks.find(
      (item) => item.nodeId === node.id && item.property === 'position.x',
    )
    expect(track?.keys.map((key) => key.time)).toEqual([0, 1])
    expect(track?.keys[1].value).toBe(420)
    expect(documentV2().animation.tracks).toEqual([])

    const keyId = track?.keys[1].id
    if (!keyId) throw new Error('expected key id')
    store().selectKeys([keyId])
    store().retimeKey(keyId, 1.5)
    expect(documentV2().symbols[0].animation.tracks[0].keys[1].time).toBe(1.5)
  })

  it('adds and duplicates instances without changing their symbol id', () => {
    const symbolId = store().createBlankSymbol('Dot', 20, 20, 1)
    if (!symbolId) throw new Error('expected symbol id')
    const instanceId = store().addSymbolInstance(symbolId)
    if (!instanceId) throw new Error('expected instance id')

    store().duplicateSelected()

    expect(documentV2().children).toHaveLength(3)
    expect(symbolInstance(instanceId).symbolId).toBe(symbolId)
    expect(symbolInstance(store().selectedIds[0]).symbolId).toBe(symbolId)
    expect(store().selectedIds[0]).not.toBe(instanceId)
  })

  it('renames definitions and updates instance playback', () => {
    const symbolId = store().createBlankSymbol('Old', 20, 20, 1)
    if (!symbolId) throw new Error('expected symbol id')
    const instanceId = store().addSymbolInstance(symbolId)
    if (!instanceId) throw new Error('expected instance id')

    store().renameSymbol(symbolId, 'New')
    store().updateSymbolInstancePlayback(instanceId, {
      startTime: 1.25,
      mode: 'loop',
    })

    expect(documentV2().symbols[0].name).toBe('New')
    expect(symbolInstance(instanceId).playback).toEqual({
      startTime: 1.25,
      mode: 'loop',
    })
  })

  it('removes only definitions with no root or grouped instance references', () => {
    const symbolId = store().createBlankSymbol('Used', 20, 20, 1)
    if (!symbolId) throw new Error('expected symbol id')
    const instanceId = store().addSymbolInstance(symbolId)
    if (!instanceId) throw new Error('expected instance id')
    const other = createShape('ellipse')
    store().addNode(other)
    store().selectMany([instanceId, other.id])
    store().groupSelected()

    store().removeUnusedSymbol(symbolId)
    expect(documentV2().symbols).toHaveLength(1)

    store().removeSelected()
    store().removeUnusedSymbol(symbolId)
    expect(documentV2().symbols).toEqual([])
  })

  it('undoes and redoes masters and instances as document snapshots', () => {
    const symbolId = store().createBlankSymbol('Undoable', 20, 20, 1)
    if (!symbolId) throw new Error('expected symbol id')
    const instanceId = store().addSymbolInstance(symbolId)
    expect(instanceId).toBeTruthy()

    store().undo()
    expect(documentV2().symbols).toHaveLength(1)
    expect(documentV2().children.some((node) => node.type === 'symbol')).toBe(false)

    store().undo()
    expect(documentV2().symbols).toEqual([])

    store().redo()
    store().redo()
    expect(documentV2().symbols[0].id).toBe(symbolId)
    expect(documentV2().children.some((node) => node.type === 'symbol')).toBe(true)
  })

  it('exits master edit mode when undo removes the active definition', () => {
    const rootSelection = [...store().selectedIds]
    const symbolId = store().createBlankSymbol('Transient', 20, 20, 1)
    if (!symbolId) throw new Error('expected symbol id')
    store().enterSymbol(symbolId)
    expect(store().selectedIds).toEqual([])

    store().undo()

    expect(documentV2().symbols).toEqual([])
    expect(store().editingSymbolId).toBeNull()
    expect(store().selectedIds).toEqual(rootSelection)
  })
})
