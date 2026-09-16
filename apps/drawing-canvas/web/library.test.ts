import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDrawingDocument } from './document'
import { createProject, deleteProject, getProject, importProject, listProjects, saveProject } from './library'

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Drawing Canvas project storage', () => {
  it('persists independent complete copies of named canvases', async () => {
    const created = await createProject('  Evening study  ', 900, 1200)
    expect(created.document).toMatchObject({ name: 'Evening study', width: 900, height: 1200 })
    expect(await getProject(created.id)).toEqual(created)
    created.document.layers[0].name = 'Unsaved rename'
    expect((await getProject(created.id))?.document.layers[0].name).toBe('Layer 1')
  })

  it('keeps creation time, changes save time, and lists most recently saved first', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = await createProject('First')
    now.mockReturnValue(2000)
    const second = await createProject('Second')
    now.mockReturnValue(3000)
    const saved = await saveProject({ ...first, document: { ...first.document, name: 'First edited' } })
    expect(saved).toMatchObject({ createdAt: 1000, updatedAt: 3000 })
    expect(await listProjects()).toEqual([
      { id: first.id, name: 'First edited', createdAt: 1000, updatedAt: 3000, width: 1600, height: 1200, layerCount: 1 },
      { id: second.id, name: 'Second', createdAt: 2000, updatedAt: 2000, width: 1600, height: 1200, layerCount: 1 },
    ])
  })

  it('imports a saved project with a new ID without overwriting the source', async () => {
    const original = await createProject('Original')
    const imported = await importProject({ ...original, document: { ...original.document, name: 'Imported copy' } })
    expect(imported.id).not.toBe(original.id)
    expect((await getProject(original.id))?.document.name).toBe('Original')
    expect(imported.document.name).toBe('Imported copy')
    expect(await listProjects()).toHaveLength(2)
  })

  it('imports a document directly and rejects malformed documents without writing', async () => {
    expect((await importProject(createDrawingDocument('Document only'))).document.name).toBe('Document only')
    await expect(importProject({ version: 1, layers: 'invalid' })).rejects.toThrow()
    await expect(createProject('Too big', 100000, 10)).rejects.toThrow('Canvas width')
    expect(await listProjects()).toHaveLength(1)
  })

  it('deletes only the requested canvas and reports absent IDs as missing', async () => {
    const first = await createProject('Delete me')
    const second = await createProject('Keep me')
    await deleteProject(first.id)
    expect(await getProject(first.id)).toBeUndefined()
    expect(await getProject('missing')).toBeUndefined()
    expect((await listProjects()).map((project) => project.id)).toEqual([second.id])
  })

  it('rejects invalid saves without replacing the last valid document', async () => {
    const project = await createProject('Keep this')
    await expect(saveProject({ ...project, document: { ...project.document, activeLayerId: 'missing' } })).rejects.toThrow('does not exist')
    await expect(saveProject({ ...project, id: '' })).rejects.toThrow('project ID')
    expect(await getProject(project.id)).toEqual(project)
  })

  it('rejects aborted writes even if their individual request succeeded', async () => {
    const originalPut = FakeObjectStore.prototype.put
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(createProject('Failed write')).rejects.toThrow('interrupted')
    expect(await listProjects()).toEqual([])
  })

  it('surfaces quota errors instead of reporting the canvas as saved', async () => {
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage quota exceeded.', 'QuotaExceededError') })
    await expect(createProject('Failed write')).rejects.toThrow('Storage quota exceeded')
    expect(await listProjects()).toEqual([])
  })

  it('reports unavailable browser storage without silently keeping temporary projects', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(createProject('Not saved')).rejects.toThrow('Browser storage is unavailable')
    await expect(listProjects()).rejects.toThrow('Browser storage is unavailable')
  })
})
