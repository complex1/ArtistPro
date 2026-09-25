import { describe, expect, it } from 'vitest'
import type { LayerV2 } from './types'
import { createLayerV2 } from './defaults'
import { groupLayers, layerEntries, moveLayerEntry } from './layerOrder'
const layer = (id: string, groupId?: string) => ({ ...createLayerV2(id), id, groupId })
const names = (layers: LayerV2[]) => layers.map(item => item.id)

describe('layer folders and stack ordering', () => {
  it('groups separated selections at the topmost selected position without reversing members', () => {
    const source = ['a', 'b', 'c', 'd', 'e'].map(id => layer(id))
    const next = groupLayers(source, new Set(['b', 'd']), 'g')
    expect(names(next)).toEqual(['a', 'c', 'b', 'd', 'e'])
    expect(layerEntries(next).map(entry => entry.layers.map(l => l.id))).toEqual([['e'], ['d', 'b'], ['c'], ['a']])
    expect(source.every(l => !l.groupId)).toBe(true)
  })
  it('moves entire folders as a block and preserves compositing order', () => {
    const source = [layer('a'), layer('b', 'g'), layer('c', 'g'), layer('d')]
    expect(names(moveLayerEntry(source, 'group:g', { key: 'd', edge: 'before' }))).toEqual(['a', 'd', 'b', 'c'])
    expect(names(moveLayerEntry(source, 'group:g', { key: 'a', edge: 'after' }))).toEqual(['b', 'c', 'a', 'd'])
  })
  it('moves children within, into, and out of a folder', () => {
    const source = [layer('a'), layer('b', 'g'), layer('c', 'g'), layer('d')]
    const reordered = moveLayerEntry(source, 'b', { key: 'c', edge: 'before' })
    expect(names(reordered)).toEqual(['a', 'c', 'b', 'd'])
    expect(reordered.find(l => l.id === 'b')?.groupId).toBe('g')
    const inside = moveLayerEntry(source, 'd', { key: 'group:g', edge: 'inside' })
    expect(names(inside)).toEqual(['a', 'd', 'b', 'c'])
    expect(inside.find(l => l.id === 'd')?.groupId).toBe('g')
    const outside = moveLayerEntry(source, 'b', { key: 'group:g', edge: 'before' })
    expect(names(outside)).toEqual(['a', 'c', 'b', 'd'])
    expect(outside.find(l => l.id === 'b')?.groupId).toBeUndefined()
    const movedOut = moveLayerEntry(source, 'b', { key: 'd', edge: 'before' })
    expect(names(movedOut)).toEqual(['a', 'c', 'd', 'b'])
    expect(movedOut.at(-1)?.groupId).toBeUndefined()
  })
  it('rejects self-drops, missing rows, and nested folders', () => {
    const source = [layer('a', 'g'), layer('b', 'h'), layer('c')]
    for (const [key, drop] of [
      ['group:g', { key: 'group:h', edge: 'inside' }],
      ['group:g', { key: 'b', edge: 'before' }],
      ['a', { key: 'a', edge: 'after' }],
      ['missing', { key: 'c', edge: 'after' }],
    ] as const) expect(moveLayerEntry(source, key, drop)).toBe(source)
  })
})
