import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cameraView, createSceneDocument, createSceneObject, POSE_PRESETS } from './model'
import { createProject, deleteProject, getProject, importProject, listProjects, saveProject } from './library'

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('3D Reference project storage', () => {
  it('persists a composed scene through reopening and isolates unsaved mutations', async () => {
    const created = await createProject('  Gesture study  ', 1080, 1440)
    expect(created.document.name).toBe('Gesture study')
    created.document.objects[0].pose = structuredClone(POSE_PRESETS.find((pose) => pose.id === 'wave')!.pose)
    created.document.camera = { ...cameraView('front'), projection: 'orthographic' }
    created.document.savedViews.push({ id: 'front', name: 'Front', camera: cameraView('front') })
    const saved = await saveProject(created)
    expect(await getProject(saved.id)).toEqual(saved)
    saved.document.objects[0].name = 'Unsaved rename'
    expect((await getProject(saved.id))?.document.objects[0].name).toBe('Drawing figure')
    const reopened = await getProject(saved.id)
    reopened!.document.savedViews[0].camera.position[0] = 100
    expect((await getProject(saved.id))?.document.savedViews[0].camera.position[0]).toBe(0)
  })

  it('creates a blank scene on request and preserves dates while sorting latest edits first', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = await createProject(' ', 1600, 1200, false)
    expect(first.document.name).toBe('Untitled scene')
    expect(first.document.objects).toEqual([])
    now.mockReturnValue(2000)
    const second = await createProject('Second')
    now.mockReturnValue(3000)
    const saved = await saveProject({ ...first, document: { ...first.document, name: 'First edited' } })
    expect(saved.createdAt).toBe(1000)
    expect(saved.updatedAt).toBe(3000)
    expect(await listProjects()).toMatchObject([
      { id: first.id, name: 'First edited', width: 1600, height: 1200, objectCount: 0, updatedAt: 3000 },
      { id: second.id, name: 'Second', objectCount: 1, updatedAt: 2000 },
    ])
  })

  it('imports records under fresh IDs without changing their original scenes', async () => {
    const original = await createProject('Original')
    const imported = await importProject({ ...original, document: { ...original.document, name: 'Imported copy' } })
    expect(imported.id).not.toBe(original.id)
    expect((await getProject(original.id))?.document.name).toBe('Original')
    expect(imported.document.name).toBe('Imported copy')
    expect(await listProjects()).toHaveLength(2)
    const standalone = await importProject(createSceneDocument('Standalone'))
    expect(standalone.document.name).toBe('Standalone')
  })

  it('reopens a portable scene with one embedded asset shared by independent posed objects', async () => {
    const document = createSceneDocument('Imported rigs', 1600, 1200, false)
    // A valid, self-contained GLB container: its bytes, IDs and poses must survive storage unchanged.
    const dataUrl = 'data:model/gltf-binary;base64,Z2xURgIAAAAwAAAAHAAAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifX0g'
    document.assets = [{ id: 'shared-rig', name: 'Rig.glb', dataUrl, bones: ['0:Arm'] }]
    document.objects = [
      { ...createSceneObject('imported', 'First'), assetId: 'shared-rig', pose: { '0:Arm': [-.3, 0, 0] } },
      { ...createSceneObject('imported', 'Second'), assetId: 'shared-rig', pose: { '0:Arm': [-1.2, 0, 0] } },
    ]
    const saved = await importProject(JSON.parse(JSON.stringify(document)))
    const reopened = await getProject(saved.id)
    expect(reopened?.document).toEqual(document)
    expect(reopened?.document.assets).toHaveLength(1)
    reopened!.document.objects[0].pose['0:Arm'][0] = -2
    expect(reopened?.document.objects[1].pose['0:Arm'][0]).toBe(-1.2)
    expect((await getProject(saved.id))?.document.objects[0].pose['0:Arm'][0]).toBe(-.3)
  })

  it('persists image planes and portable image data across independent project imports', async () => {
    const document = createSceneDocument('Photo study', 1600, 1200, false)
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwH4YZkDkAm34L9XKwuTwAAAAASUVORK5CYII='
    document.assets.push({ id: 'image', name: 'Photo', dataUrl, bones: [], image: { width: 3, height: 2 } })
    document.objects.push({ ...createSceneObject('image'), assetId: 'image', position: [1, 0, -2], rotation: [0, .3, 0] })
    const saved = await importProject(document)
    const imported = await importProject(JSON.parse(JSON.stringify(saved)))
    expect(imported.id).not.toBe(saved.id)
    expect((await getProject(imported.id))?.document).toEqual(document)
    imported.document.objects[0].position[0] = 8
    await saveProject(imported)
    expect((await getProject(saved.id))?.document.objects[0].position[0]).toBe(1)
    expect((await getProject(imported.id))?.document.assets[0].dataUrl).toBe(dataUrl)
  })

  it('rejects corrupt imports and saves without changing the stored scene', async () => {
    const original = await createProject('Keep this')
    original.document.objects[0].scale = [1, 0, 1]
    await expect(saveProject(original)).rejects.toThrow('object scale')
    expect((await getProject(original.id))?.document.objects[0].scale).toEqual([1, 1, 1])
    await expect(importProject({ version: 1, objects: [] })).rejects.toThrow()
    expect(await listProjects()).toHaveLength(1)
  })

  it('deletes only the requested project and returns undefined for missing records', async () => {
    const first = await createProject('Remove')
    const second = await createProject('Keep')
    await deleteProject(first.id)
    expect(await getProject(first.id)).toBeUndefined()
    expect(await getProject('missing')).toBeUndefined()
    expect((await listProjects()).map((project) => project.id)).toEqual([second.id])
  })

  it('does not acknowledge an aborted transaction as a successful save', async () => {
    const existing = await createProject('Previous committed scene')
    const originalPut = FakeObjectStore.prototype.put
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(createProject('Not committed')).rejects.toThrow('interrupted')
    await expect(saveProject({ ...existing, document: { ...existing.document, name: 'Failed overwrite' } })).rejects.toThrow('interrupted')
    expect((await getProject(existing.id))?.document.name).toBe('Previous committed scene')
    expect(await listProjects()).toHaveLength(1)
  })

  it('propagates storage failures instead of falling back to temporary memory', async () => {
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage is full.', 'QuotaExceededError') })
    await expect(createProject('No space')).rejects.toThrow('Storage is full')
    expect(await listProjects()).toEqual([])
    vi.stubGlobal('indexedDB', undefined)
    await expect(createProject('No database')).rejects.toThrow('Browser storage is unavailable')
    await expect(listProjects()).rejects.toThrow('Browser storage is unavailable')
  })
})
