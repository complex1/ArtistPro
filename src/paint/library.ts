import { nanoid } from 'nanoid'
import { createPaintDocument } from './document'
import type { PaintDocument } from './engine/types'

export const PAINT_PROJECTS_STORAGE_KEY = 'artist-pro.paint.projects.v1'

export type PaintProjectRecord = {
  id: string
  createdAt: number
  updatedAt: number
  document: PaintDocument
}

export type PaintProjectSummary = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
}

export type PaintStorage = Pick<Storage, 'getItem' | 'setItem'>

const memory = new Map<string, string>()
const fallbackStorage: PaintStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value)
  },
}

function storage(): PaintStorage {
  try {
    if (typeof localStorage === 'undefined') return fallbackStorage
    localStorage.setItem('__paint-storage-probe__', '1')
    localStorage.removeItem('__paint-storage-probe__')
    return localStorage
  } catch {
    return fallbackStorage
  }
}

function isRecord(value: unknown): value is PaintProjectRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PaintProjectRecord>
  return (
    typeof record.id === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number' &&
    !!record.document &&
    record.document.version === 1 &&
    Array.isArray(record.document.layers)
  )
}

function readAll(store: PaintStorage): PaintProjectRecord[] {
  try {
    const parsed = JSON.parse(
      store.getItem(PAINT_PROJECTS_STORAGE_KEY) ?? '[]',
    ) as unknown
    return Array.isArray(parsed) ? parsed.filter(isRecord) : []
  } catch {
    return []
  }
}

function writeAll(
  projects: PaintProjectRecord[],
  store: PaintStorage,
): void {
  store.setItem(PAINT_PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}

export function listPaintProjects(
  store: PaintStorage = storage(),
): PaintProjectSummary[] {
  return readAll(store)
    .map(({ id, createdAt, updatedAt, document }) => ({
      id,
      createdAt,
      updatedAt,
      name: document.name || 'Untitled',
      width: document.width,
      height: document.height,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getPaintProject(
  id: string,
  store: PaintStorage = storage(),
): PaintProjectRecord | undefined {
  return readAll(store).find((project) => project.id === id)
}

export function savePaintProject(
  record: PaintProjectRecord,
  store: PaintStorage = storage(),
): PaintProjectRecord {
  const next = { ...record, updatedAt: Date.now() }
  const projects = readAll(store)
  const index = projects.findIndex((project) => project.id === next.id)
  if (index >= 0) projects[index] = next
  else projects.push(next)
  writeAll(projects, store)
  return next
}

export function createPaintProject(
  name: string,
  width: number,
  height: number,
  store: PaintStorage = storage(),
): PaintProjectRecord {
  const now = Date.now()
  return savePaintProject(
    {
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      document: createPaintDocument(name.trim() || 'Untitled', width, height),
    },
    store,
  )
}

export function deletePaintProject(
  id: string,
  store: PaintStorage = storage(),
): void {
  writeAll(
    readAll(store).filter((project) => project.id !== id),
    store,
  )
}
