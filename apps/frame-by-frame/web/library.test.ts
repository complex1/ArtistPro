import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createProject, deleteProject, getProject, importProject, listProjects, saveProject } from './library'
describe('animation library', () => {
  it('saves and reopens named shots including frame rate and drawing timing', async () => { const shot = await createProject('Walk', 64, 48, 24); shot.document.layers[0].cels[0].duration = 4; await saveProject(shot); expect((await getProject(shot.id))?.document.layers[0].cels[0].duration).toBe(4); expect((await listProjects()).find(item => item.id === shot.id)).toMatchObject({ fps: 24, duration: 48, layerCount: 1 }); await deleteProject(shot.id); expect(await getProject(shot.id)).toBeUndefined() })
  it('imports projects independently and validates before writing', async () => { const shot = await createProject('Source', 32, 32); const copy = await importProject(shot); expect(copy.id).not.toBe(shot.id); expect(copy.document).toEqual(shot.document); await expect(importProject({ ...shot.document, fps: 0 })).rejects.toThrow(); await Promise.all([deleteProject(shot.id), deleteProject(copy.id)]) })
})
