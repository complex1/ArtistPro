import { describe, expect, it } from 'vitest'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  saveProject,
} from './library'

const memory = () => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('project library', () => {
  it('creates, lists, updates, and deletes projects', () => {
    const store = memory()
    const created = createProject('Hero', 1280, 720, store)
    expect(created.document.name).toBe('Hero')
    expect(listProjects(store)).toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Hero',
        width: 1280,
        height: 720,
      }),
    ])

    created.document.name = 'Hero v2'
    saveProject(created, store)
    expect(getProject(created.id, store)?.document.name).toBe('Hero v2')

    deleteProject(created.id, store)
    expect(listProjects(store)).toEqual([])
  })

  it('sorts recents by last update', () => {
    const store = memory()
    const first = createProject('A', 800, 600, store)
    const second = createProject('B', 800, 600, store)
    first.document.name = 'A updated'
    saveProject(first, store)
    expect(listProjects(store).map((project) => project.id)).toEqual([
      first.id,
      second.id,
    ])
  })
})
