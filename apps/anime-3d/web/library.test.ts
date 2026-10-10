import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, deleteProject, getProject, importProject, listProjects, saveProject } from './library'
import { createDocument, serializeProject } from './model'

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Anime 3D durable project storage', () => {
  it('persists a full sample and isolates unsaved changes after reopening', async () => {
    const created = await createProject('  My wave  ', true)
    created.document.strokes = [{ id: 'effect', points: [[0, 1, 0], [1, 2, 0]], color: '#123456', width: .03 }]
    created.document.camera.position = [3, 4, 6]
    const saved = await saveProject(created)
    expect(await getProject(saved.id)).toEqual(saved)
    saved.document.keys[1].pose.head[0] = 50
    saved.document.strokes[0].points[0][0] = 50
    const reopened = await getProject(saved.id)
    expect(reopened?.document.keys[1].pose.head[0]).toBe(0)
    expect(reopened?.document.strokes[0].points[0][0]).toBe(0)
    expect(reopened?.document.name).toBe('My wave')
  })

  it('preserves creation times and sorts by the latest committed update', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = await createProject()
    expect(first.document.keys).toHaveLength(1)
    now.mockReturnValue(2000)
    const second = await createProject('Second')
    now.mockReturnValue(3000)
    await saveProject({ ...first, document: { ...first.document, name: 'Updated' } })
    expect(await listProjects()).toMatchObject([
      { id: first.id, name: 'Updated', createdAt: 1000, updatedAt: 3000, width: 1280, height: 720 },
      { id: second.id, createdAt: 2000, updatedAt: 2000 },
    ])
  })

  it('imports documents, portable text, and records under new IDs', async () => {
    const original = await createProject('Original', true)
    const imported = await importProject({ ...original, document: { ...original.document, name: 'Imported copy' } })
    expect(imported.id).not.toBe(original.id)
    expect((await getProject(original.id))?.document.name).toBe('Original')
    expect((await getProject(imported.id))?.document.name).toBe('Imported copy')
    const portable = await importProject(serializeProject(createDocument('Portable')))
    expect(portable.document.name).toBe('Portable')
    expect((await importProject(createDocument('Document'))).document.name).toBe('Document')
    expect(await listProjects()).toHaveLength(4)
  })

  it('validates imports before touching storage and preserves the last good save', async () => {
    const original = await createProject('Keep this', true)
    const put = vi.spyOn(FakeObjectStore.prototype, 'put')
    await expect(importProject({ ...original.document, fps: 12 })).rejects.toThrow('24 fps')
    expect(put).not.toHaveBeenCalled()
    original.document.keys[0].pose.head[0] = Infinity
    await expect(saveProject(original)).rejects.toThrow('finite number')
    expect(put).not.toHaveBeenCalled()
    expect((await getProject(original.id))?.document.keys[0].pose.head[0]).toBe(0)
    expect(await listProjects()).toHaveLength(1)
  })

  it('deletes only the requested project', async () => {
    const remove = await createProject('Remove')
    const keep = await createProject('Keep')
    await deleteProject(remove.id)
    expect(await getProject(remove.id)).toBeUndefined()
    expect(await getProject('missing')).toBeUndefined()
    expect((await listProjects()).map(project => project.id)).toEqual([keep.id])
  })

  it('never acknowledges a successful request whose transaction then aborts', async () => {
    const existing = await createProject('Committed')
    const originalPut = FakeObjectStore.prototype.put
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(createProject('Never committed')).rejects.toThrow('interrupted')
    await expect(saveProject({ ...existing, document: { ...existing.document, name: 'Failed overwrite' } })).rejects.toThrow('interrupted')
    expect((await getProject(existing.id))?.document.name).toBe('Committed')
    expect(await listProjects()).toHaveLength(1)
  })

  it('rejects an aborted delete without removing the existing project', async () => {
    const existing = await createProject('Keep me')
    const originalDelete = FakeObjectStore.prototype.delete
    vi.spyOn(FakeObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key) {
      const request = originalDelete.call(this, key)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(deleteProject(existing.id)).rejects.toThrow('interrupted')
    expect((await getProject(existing.id))?.document.name).toBe('Keep me')
  })

  it('propagates quota and unavailable-storage errors without an in-memory success', async () => {
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage is full.', 'QuotaExceededError') })
    await expect(createProject('No space')).rejects.toThrow('Storage is full')
    expect(await listProjects()).toEqual([])
    vi.stubGlobal('indexedDB', undefined)
    await expect(createProject('No database')).rejects.toThrow('Browser storage is unavailable')
    await expect(listProjects()).rejects.toThrow('Browser storage is unavailable')
  })

  it('reports storage-open failures and rejects invalid record IDs', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('Storage denied.', 'SecurityError') })
    await expect(listProjects()).rejects.toThrow('Storage denied')
    await expect(saveProject({ id: '', createdAt: 0, updatedAt: 0, document: createDocument() })).rejects.toThrow('valid Anime 3D project ID')
    await expect(deleteProject(' ')).rejects.toThrow('valid Anime 3D project ID')
  })
})
