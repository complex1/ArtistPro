import { describe, expect, it } from 'vitest'
import { SnapshotHistory } from './history'

describe('bounded snapshot history', () => {
  it('restores whole transactions and clears redo when drawing a new branch', () => {
    const history = new SnapshotHistory<string>(items => items.length)
    history.record('empty')
    history.record('stroke one')
    expect(history.undo('stroke two')).toBe('stroke one')
    expect(history.undo('stroke one')).toBe('empty')
    expect(history.redo('empty')).toBe('stroke one')
    history.record('stroke one')
    expect(history.canRedo).toBe(false)
    expect(history.undo('replacement stroke')).toBe('stroke one')
  })

  it('drops the oldest transactions when the step limit is reached', () => {
    const history = new SnapshotHistory<number>(items => items.length, 100, 3)
    for (let i = 0; i < 6; i++) history.record(i)
    expect(history.undo(6)).toBe(5)
    expect(history.undo(5)).toBe(4)
    expect(history.undo(4)).toBe(3)
    expect(history.canUndo).toBe(false)
    expect(history.redo(3)).toBe(4)
  })

  it('counts shared immutable raster buffers only once against memory', () => {
    type State = { buffers: number[]; name: string }
    const history = new SnapshotHistory<State>(items => new Set(items.flatMap(item => item.buffers)).size * 4, 12)
    history.record({ buffers: [1, 2], name: 'original' })
    history.record({ buffers: [1, 2], name: 'renamed' })
    history.record({ buffers: [1, 3], name: 'painted' })
    expect(history.undo({ buffers: [1, 3], name: 'latest' })?.name).toBe('painted')
    expect(history.undo({ buffers: [1, 3], name: 'painted' })?.name).toBe('renamed')
    expect(history.undo({ buffers: [1, 2], name: 'renamed' })?.name).toBe('original')
  })

  it('releases both directions and refuses to retain oversized snapshots', () => {
    const history = new SnapshotHistory<number[]>(items => items.reduce((sum, item) => sum + item.length, 0), 3)
    history.record([1, 2, 3, 4])
    expect(history.canUndo).toBe(false)
    history.record([1])
    history.undo([2])
    expect(history.canRedo).toBe(true)
    history.clear()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
