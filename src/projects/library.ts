import { nanoid } from 'nanoid'
import { createBlankDocument } from '../model/document'
import type { EditorDocument } from '../model/types'

export const PROJECTS_STORAGE_KEY = 'artist-pro.svg.projects.v1'

export type ProjectRecord = {
  id: string
  updatedAt: number
  createdAt: number
  document: EditorDocument
}

export type ProjectSummary = {
  id: string
  name: string
  updatedAt: number
  createdAt: number
  width: number
  height: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const memory = new Map<string, string>()

const fallbackStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value)
  },
}

function storage(): StorageLike {
  try {
    if (typeof localStorage === 'undefined') return fallbackStorage
    const probe = '__artist-pro-storage__'
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return fallbackStorage
  }
}

function readAll(store: StorageLike = storage()): ProjectRecord[] {
  try {
    const raw = store.getItem(PROJECTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isProjectRecord)
  } catch {
    return []
  }
}

function writeAll(projects: ProjectRecord[], store: StorageLike = storage()): void {
  store.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as ProjectRecord
  return (
    typeof record.id === 'string' &&
    typeof record.updatedAt === 'number' &&
    typeof record.createdAt === 'number' &&
    typeof record.document === 'object' &&
    record.document !== null
  )
}

export function listProjects(store: StorageLike = storage()): ProjectSummary[] {
  return readAll(store)
    .map((project) => ({
      id: project.id,
      name: project.document.name || 'Untitled',
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
      width: project.document.artboard.width,
      height: project.document.artboard.height,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getProject(
  id: string,
  store: StorageLike = storage(),
): ProjectRecord | undefined {
  return readAll(store).find((project) => project.id === id)
}

export function saveProject(
  record: ProjectRecord,
  store: StorageLike = storage(),
): ProjectRecord {
  const next = { ...record, updatedAt: Date.now() }
  const projects = readAll(store)
  const index = projects.findIndex((project) => project.id === next.id)
  if (index >= 0) projects[index] = next
  else projects.push(next)
  writeAll(projects, store)
  return next
}

export function createProject(
  name: string,
  width: number,
  height: number,
  store: StorageLike = storage(),
): ProjectRecord {
  const now = Date.now()
  const record: ProjectRecord = {
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
    document: createBlankDocument(name.trim() || 'Untitled', width, height),
  }
  return saveProject(record, store)
}

export function deleteProject(id: string, store: StorageLike = storage()): void {
  writeAll(
    readAll(store).filter((project) => project.id !== id),
    store,
  )
}
