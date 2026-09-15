import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCharacterDocument } from './engine'
import {
  createProject,
  deleteProject,
  getProject,
  importProject,
  listProjects,
  saveProject,
} from './library'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Live Character project storage', () => {
  it('persists a complete starter rig and returns independent structured copies', async () => {
    const created = await createProject('  Aster  ', true)
    expect(created.document.name).toBe('Aster')
    expect(created.document.layers.length).toBeGreaterThan(0)
    expect(created.document.bones.length).toBeGreaterThan(0)
    expect(await getProject(created.id)).toEqual(created)
    created.document.layers[0].name = 'Unsaved rename'
    expect((await getProject(created.id))?.document.layers[0].name).not.toBe(
      'Unsaved rename',
    )
  })

  it('creates an empty document when no starter is requested', async () => {
    const created = await createProject('  ')
    expect(created.document.name).toBe('Untitled character')
    expect(created.document.layers).toEqual([])
    expect(created.document.bones).toEqual([])
  })

  it('keeps creation time, updates save time and lists the newest project first', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = await createProject('First')
    now.mockReturnValue(2000)
    const second = await createProject('Second')
    now.mockReturnValue(3000)
    const saved = await saveProject({
      ...first,
      document: { ...first.document, name: 'First edited' },
    })
    expect(saved.createdAt).toBe(1000)
    expect(saved.updatedAt).toBe(3000)
    expect(await listProjects()).toMatchObject([
      { id: first.id, name: 'First edited', updatedAt: 3000, layerCount: 0 },
      { id: second.id, name: 'Second', updatedAt: 2000 },
    ])
  })

  it('imports records under a new ID without overwriting the original', async () => {
    const original = await createProject('Original', true)
    const imported = await importProject({
      ...original,
      document: { ...original.document, name: 'Imported copy' },
    })
    expect(imported.id).not.toBe(original.id)
    expect((await getProject(original.id))?.document.name).toBe('Original')
    expect(imported.document.name).toBe('Imported copy')
    expect(await listProjects()).toHaveLength(2)
  })

  it('imports a standalone document and rejects malformed files before writing', async () => {
    const imported = await importProject(
      createCharacterDocument('Document only'),
    )
    expect(imported.document.name).toBe('Document only')
    await expect(
      importProject({ version: 1, layers: 'invalid' }),
    ).rejects.toThrow()
    expect(await listProjects()).toHaveLength(1)
  })

  it('deletes only the requested project and reports missing projects', async () => {
    const first = await createProject('Delete me')
    const second = await createProject('Keep me')
    await deleteProject(first.id)
    expect(await getProject(first.id)).toBeUndefined()
    expect(await getProject('not-present')).toBeUndefined()
    expect((await listProjects()).map((project) => project.id)).toEqual([
      second.id,
    ])
  })

  it('rejects aborted transactions instead of acknowledging an uncommitted save', async () => {
    const originalPut = FakeObjectStore.prototype.put
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      const request = originalPut.call(this, value, key)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(createProject('Failed write')).rejects.toThrow('interrupted')
    expect(await listProjects()).toEqual([])
  })

  it('reports unavailable browser storage without pretending projects were saved', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(createProject('Not saved')).rejects.toThrow(
      'Browser storage is unavailable',
    )
    await expect(listProjects()).rejects.toThrow(
      'Browser storage is unavailable',
    )
  })
})
