import { describe, expect, it } from 'vitest'
import {
  createPaintProject,
  deletePaintProject,
  getPaintProject,
  listPaintProjects,
  PAINT_PROJECTS_STORAGE_KEY,
  savePaintProject,
  type PaintStorage,
} from './library'

function memoryStorage(): PaintStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('paint project library', () => {
  it('creates, lists, updates, and deletes isolated Paint projects', () => {
    const storage = memoryStorage()
    const project = createPaintProject('Living ink', 800, 600, storage)

    expect(listPaintProjects(storage)).toMatchObject([
      { id: project.id, name: 'Living ink', width: 800, height: 600 },
    ])
    expect(storage.getItem(PAINT_PROJECTS_STORAGE_KEY)).toContain('Living ink')

    savePaintProject(
      {
        ...project,
        document: { ...project.document, name: 'Renamed ink' },
      },
      storage,
    )
    expect(getPaintProject(project.id, storage)?.document.name).toBe(
      'Renamed ink',
    )

    deletePaintProject(project.id, storage)
    expect(listPaintProjects(storage)).toEqual([])
  })
})
