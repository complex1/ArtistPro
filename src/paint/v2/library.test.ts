import { describe, expect, it } from 'vitest'
import {
  createPaintProjectV2,
  deletePaintProjectV2,
  getPaintProjectV2,
  lastPaintProjectV2,
  listPaintProjectsV2,
  PAINT_PROJECTS_STORAGE_KEY_V2,
  rememberPaintProjectV2,
  savePaintProjectV2,
  type PaintStorage,
} from './library'

function memoryStorage(): PaintStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('paint v2 project library', () => {
  it('creates version-2 documents in an isolated namespace', () => {
    const storage = memoryStorage()
    const project = createPaintProjectV2('Living ink', 800, 600, storage)

    expect(project.document.version).toBe(2)
    expect(listPaintProjectsV2(storage)).toMatchObject([
      { id: project.id, name: 'Living ink', width: 800, height: 600 },
    ])
    expect(storage.getItem(PAINT_PROJECTS_STORAGE_KEY_V2)).toContain('Living ink')

    savePaintProjectV2(
      {
        ...project,
        document: { ...project.document, name: 'Renamed ink' },
      },
      storage,
    )
    expect(getPaintProjectV2(project.id, storage)?.document.name).toBe(
      'Renamed ink',
    )

    deletePaintProjectV2(project.id, storage)
    expect(listPaintProjectsV2(storage)).toEqual([])
  })

  it('remembers the last opened project so the brush library can return to it', () => {
    const storage = memoryStorage()
    expect(lastPaintProjectV2(storage)).toBeUndefined()

    const project = createPaintProjectV2('Living ink', 800, 600, storage)
    rememberPaintProjectV2(project.id, storage)
    expect(lastPaintProjectV2(storage)).toMatchObject({
      id: project.id,
      name: 'Living ink',
    })

    deletePaintProjectV2(project.id, storage)
    expect(lastPaintProjectV2(storage)).toBeUndefined()
  })
})
