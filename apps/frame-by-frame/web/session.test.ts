import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from './model'
import { AnimationSession } from './session'
import { saveProject } from './library'
vi.mock('./library', () => ({ saveProject: vi.fn() }))
const save = vi.mocked(saveProject)
const make = () => new AnimationSession({ id: 'test', createdAt: 1, updatedAt: 1, document: createDocument() })
beforeEach(() => { save.mockReset(); save.mockImplementation(async record => record) })
describe('animation sessions', () => {
  it('undoes drawing and timeline changes together and clears redo on a new edit', () => { const session = make(); session.commit({ ...session.document, name: 'A' }); session.commit({ ...session.document, fps: 24 }); session.undo(); expect(session.document.fps).toBe(12); session.undo(); expect(session.document.name).toBe('Untitled shot'); session.redo(); expect(session.document.name).toBe('A'); session.commit({ ...session.document, name: 'B' }); expect(session.canRedo).toBe(false) })
  it('keeps the shot dirty and the last document available on a failed save', async () => { const session = make(); session.commit({ ...session.document, name: 'Keep me' }); save.mockRejectedValueOnce(new Error('Storage full')); await expect(session.save()).rejects.toThrow('Storage full'); expect(session.dirty).toBe(true); expect(session.document.name).toBe('Keep me'); expect(session.error).toBe('Storage full'); await session.save(); expect(session.dirty).toBe(false); expect(session.error).toBeNull() })
  it('flushes edits made during an outstanding save before reporting success', async () => { const session = make(); let finish!: () => void; save.mockImplementationOnce(record => new Promise(resolve => { finish = () => resolve(record) })); session.commit({ ...session.document, name: 'First' }); const pending = session.save(); session.commit({ ...session.document, name: 'Newest' }); expect(session.save()).toBe(pending); finish(); await pending; expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1][0].document.name).toBe('Newest'); expect(session.dirty).toBe(false) })
  it('does not add invalid changes to history', () => { const session = make(); expect(() => session.commit({ ...session.document, fps: 100 })).toThrow(); expect(session.canUndo).toBe(false); expect(session.dirty).toBe(false) })
})
