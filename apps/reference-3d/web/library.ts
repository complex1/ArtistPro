import { nanoid } from 'nanoid'
import { createSceneDocument, validateDocument } from './model'
import type { SceneDocument } from './types'

const DATABASE = 'artist-studio-reference-3d'
const STORE = 'projects'

export interface ProjectRecord {
  id: string
  createdAt: number
  updatedAt: number
  document: SceneDocument
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
  objectCount: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser storage is unavailable. Enable IndexedDB to save 3D Reference projects.'))
      return
    }
    let blocked = false
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage.'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other 3D Reference windows, then try again.'))
    }
  })
}

/** A request succeeding does not mean its transaction committed. */
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode)
      let request: IDBRequest<T>
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error ?? request?.error ?? new Error('Project storage operation was interrupted.'))
      tx.onerror = () => reject(tx.error ?? request?.error ?? new Error('Could not save to browser storage.'))
      try { request = operation(tx.objectStore(STORE)) } catch (error) {
        tx.abort()
        reject(error)
      }
    })
  } finally {
    database.close()
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await transaction<ProjectRecord[]>('readonly', (store) => store.getAll())
  return records.map((record) => ({
    id: record.id, name: record.document.name, createdAt: record.createdAt, updatedAt: record.updatedAt,
    width: record.document.width, height: record.document.height, objectCount: record.document.objects.length,
  })).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const record = await transaction<ProjectRecord | undefined>('readonly', (store) => store.get(id))
  return record ? { ...record, document: validateDocument(record.document) } : undefined
}

export async function saveProject(record: ProjectRecord): Promise<ProjectRecord> {
  if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 200) throw new Error('A valid project ID is required.')
  const now = Date.now()
  const saved: ProjectRecord = {
    id: record.id, createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    updatedAt: now, document: validateDocument(record.document),
  }
  await transaction('readwrite', (store) => store.put(saved))
  return saved
}

export async function createProject(name = 'Untitled scene', width = 1600, height = 1200, starter = true): Promise<ProjectRecord> {
  const now = Date.now()
  return saveProject({ id: nanoid(), createdAt: now, updatedAt: now, document: createSceneDocument(name, width, height, starter) })
}

/** Imports always receive a new project ID, even when importing a saved project record. */
export async function importProject(value: unknown): Promise<ProjectRecord> {
  const candidate = value && typeof value === 'object' && 'document' in value ? value.document : value
  const document = validateDocument(candidate)
  const now = Date.now()
  return saveProject({ id: nanoid(), createdAt: now, updatedAt: now, document })
}

export async function deleteProject(id: string): Promise<void> {
  await transaction('readwrite', (store) => store.delete(id))
}
