import { nanoid } from 'nanoid'
import { createDrawingDocument, validateDocument } from './document'
import type { DrawingDocument } from './engine/types'

const DATABASE = 'artist-studio-drawing-canvas'
const STORE = 'projects'

export type ProjectRecord = {
  id: string
  createdAt: number
  updatedAt: number
  document: DrawingDocument
}

export type ProjectSummary = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
  layerCount: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser storage is unavailable. Enable IndexedDB to save Drawing Canvas projects.'))
      return
    }
    let blocked = false
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open Drawing Canvas storage.'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other Drawing Canvas windows, then try again.'))
    }
  })
}

/** Writes succeed only once the transaction commits; request success alone is insufficient. */
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode)
      let request: IDBRequest<T>
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error ?? request?.error ?? new Error('Project storage operation was interrupted.'))
      tx.onerror = () => reject(tx.error ?? request?.error ?? new Error('Could not save to browser storage.'))
      try {
        request = operation(tx.objectStore(STORE))
      } catch (reason) {
        tx.abort()
        reject(reason)
      }
    })
  } finally {
    database.close()
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await transaction<ProjectRecord[]>('readonly', (store) => store.getAll())
  return records.map((record) => {
    const document = validateDocument(record.document)
    return {
      id: record.id, name: document.name, createdAt: record.createdAt, updatedAt: record.updatedAt,
      width: document.width, height: document.height, layerCount: document.layers.length,
    }
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const record = await transaction<ProjectRecord | undefined>('readonly', (store) => store.get(id))
  if (!record) return undefined
  return { ...record, document: validateDocument(record.document) }
}

export async function saveProject(record: ProjectRecord): Promise<ProjectRecord> {
  if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 128) throw new Error('A valid project ID is required.')
  const now = Date.now()
  const saved: ProjectRecord = {
    id: record.id,
    createdAt: Number.isFinite(record.createdAt) && record.createdAt >= 0 ? record.createdAt : now,
    updatedAt: now,
    document: validateDocument(record.document),
  }
  await transaction('readwrite', (store) => store.put(saved))
  return saved
}

export async function createProject(name = 'Untitled canvas', width = 1600, height = 1200): Promise<ProjectRecord> {
  const now = Date.now()
  return saveProject({ id: nanoid(), createdAt: now, updatedAt: now, document: createDrawingDocument(name, width, height) })
}

/** Imports always create independent projects, even when the file carries a saved project ID. */
export async function importProject(value: unknown): Promise<ProjectRecord> {
  const candidate = value && typeof value === 'object' && 'document' in value ? value.document : value
  const document = validateDocument(candidate)
  const now = Date.now()
  return saveProject({ id: nanoid(), createdAt: now, updatedAt: now, document })
}

export async function deleteProject(id: string): Promise<void> {
  await transaction('readwrite', (store) => store.delete(id))
}
