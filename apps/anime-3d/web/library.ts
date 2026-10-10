import { nanoid } from 'nanoid'
import { createDocument, parseProject, validateDocument } from './model'
import type { ProjectRecord, ProjectSummary } from './types'

export type { ProjectRecord, ProjectSummary } from './types'

const DATABASE = 'artist-studio-anime-3d'
const STORE = 'projects'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser storage is unavailable. Download your project to preserve your work.'))
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
    request.onerror = () => reject(request.error ?? new Error('Could not open Anime 3D project storage.'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other Anime 3D windows, then retry opening project storage.'))
    }
  })
}

/** Resolve only after the transaction commits, never on the request's earlier success. */
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode)
      let request: IDBRequest<T> | undefined
      tx.oncomplete = () => resolve(request!.result)
      tx.onabort = () => reject(tx.error ?? request?.error ?? new Error('Project storage operation was interrupted before saving.'))
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

function validateId(id: string): void {
  if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('A valid Anime 3D project ID is required.')
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await transaction<ProjectRecord[]>('readonly', store => store.getAll())
  return records.map(record => ({
    id: record.id, name: record.document.name, createdAt: record.createdAt, updatedAt: record.updatedAt,
    width: record.document.output.width, height: record.document.output.height,
  })).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  validateId(id)
  const record = await transaction<ProjectRecord | undefined>('readonly', store => store.get(id))
  return record ? { ...record, document: validateDocument(record.document) } : undefined
}

export async function saveProject(record: ProjectRecord): Promise<ProjectRecord> {
  validateId(record.id)
  const now = Date.now()
  const saved: ProjectRecord = {
    id: record.id, createdAt: Number.isFinite(record.createdAt) && record.createdAt >= 0 ? record.createdAt : now,
    updatedAt: now, document: validateDocument(record.document),
  }
  await transaction('readwrite', store => store.put(saved))
  return saved
}

export async function createProject(name?: string, sample = false): Promise<ProjectRecord> {
  const now = Date.now()
  return saveProject({ id: nanoid(), createdAt: now, updatedAt: now, document: createDocument(name, sample) })
}

/** Validate before touching storage, then save with a fresh ID to preserve existing work. */
export async function importProject(value: unknown): Promise<ProjectRecord> {
  const candidate = value && typeof value === 'object' && Object.hasOwn(value, 'document') ? (value as { document: unknown }).document : value
  const document = typeof value === 'string' ? parseProject(value) : validateDocument(candidate)
  const now = Date.now()
  return saveProject({ id: nanoid(), createdAt: now, updatedAt: now, document })
}

export async function deleteProject(id: string): Promise<void> {
  validateId(id)
  await transaction('readwrite', store => store.delete(id))
}
