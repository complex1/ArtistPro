import { nanoid } from 'nanoid'
import { createDocumentV2 } from './core/defaults'
import { parseDocument } from './core/schema'
import type { PaintDocumentV2 } from './core/types'

export const PAINT_PROJECTS_STORAGE_KEY_V2 = 'artist-pro.paint.projects.v2'
export const PAINT_LAST_PROJECT_STORAGE_KEY_V2 = 'artist-pro.paint.last-project.v2'

export type PaintProjectRecordV2 = {
  id: string
  createdAt: number
  updatedAt: number
  document: PaintDocumentV2
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

export function paintStorage(): PaintStorage {
  try {
    if (typeof localStorage === 'undefined') return fallbackStorage
    localStorage.setItem('__paint-storage-v2-probe__', '1')
    localStorage.removeItem('__paint-storage-v2-probe__')
    return localStorage
  } catch {
    return fallbackStorage
  }
}

function isRecord(value: unknown): value is PaintProjectRecordV2 {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PaintProjectRecordV2>
  return (
    typeof record.id === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number' &&
    !!parseDocument(record.document)
  )
}

function readAll(store: PaintStorage): PaintProjectRecordV2[] {
  try {
    const parsed = JSON.parse(
      store.getItem(PAINT_PROJECTS_STORAGE_KEY_V2) ?? '[]',
    ) as unknown
    return Array.isArray(parsed) ? parsed.filter(isRecord) : []
  } catch {
    return []
  }
}

function writeAll(projects: PaintProjectRecordV2[], store: PaintStorage): void {
  store.setItem(PAINT_PROJECTS_STORAGE_KEY_V2, JSON.stringify(projects))
}

export function listPaintProjectsV2(
  store: PaintStorage = paintStorage(),
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

export function getPaintProjectV2(
  id: string,
  store: PaintStorage = paintStorage(),
): PaintProjectRecordV2 | undefined {
  return readAll(store).find((project) => project.id === id)
}

// The brush library is opened from inside a project, so it needs a way back to
// the canvas the artist left. Hash history is unreliable here because the
// library is also reachable by deep link and from the project list.
export function rememberPaintProjectV2(
  id: string,
  store: PaintStorage = paintStorage(),
): void {
  store.setItem(PAINT_LAST_PROJECT_STORAGE_KEY_V2, id)
}

export function lastPaintProjectV2(
  store: PaintStorage = paintStorage(),
): PaintProjectSummary | undefined {
  const id = store.getItem(PAINT_LAST_PROJECT_STORAGE_KEY_V2)
  if (!id) return undefined
  return listPaintProjectsV2(store).find((project) => project.id === id)
}

export function savePaintProjectV2(
  record: PaintProjectRecordV2,
  store: PaintStorage = paintStorage(),
): PaintProjectRecordV2 {
  const document = parseDocument(record.document)
  if (!document) throw new Error('Invalid paint document')
  const next = { ...record, document, updatedAt: Date.now() }
  const projects = readAll(store)
  const index = projects.findIndex((project) => project.id === next.id)
  if (index >= 0) projects[index] = next
  else projects.push(next)
  writeAll(projects, store)
  return next
}

export function createPaintProjectV2(
  name: string,
  width: number,
  height: number,
  store: PaintStorage = paintStorage(),
): PaintProjectRecordV2 {
  const now = Date.now()
  return savePaintProjectV2(
    {
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      document: createDocumentV2(name.trim() || 'Untitled', width, height),
    },
    store,
  )
}

export function deletePaintProjectV2(
  id: string,
  store: PaintStorage = paintStorage(),
): void {
  writeAll(
    readAll(store).filter((project) => project.id !== id),
    store,
  )
}
