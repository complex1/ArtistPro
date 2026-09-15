import { nanoid } from 'nanoid'
import { createCharacterDocument, validateDocument } from './engine'
import type { CharacterDocument } from './model'

const DATABASE = 'artist-studio-live-character'
const STORE = 'projects'

export type ProjectRecord = {
  id: string
  createdAt: number
  updatedAt: number
  document: CharacterDocument
}

export type ProjectSummary = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
  layerCount: number
  boneCount: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error(
          'Browser storage is unavailable. Enable IndexedDB to save Live Character projects.',
        ),
      )
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
      else resolve(request.result)
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open project storage.'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other Live Character windows, then try again.'))
    }
  })
}

/** Resolve writes only after commit, so quota/transaction failures cannot appear saved. */
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode)
      const request = operation(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () =>
        reject(
          tx.error ??
            request.error ??
            new Error('Project storage operation was interrupted.'),
        )
      tx.onerror = () =>
        reject(
          tx.error ??
            request.error ??
            new Error('Could not save to browser storage.'),
        )
    })
  } finally {
    database.close()
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await transaction<ProjectRecord[]>('readonly', (store) =>
    store.getAll(),
  )
  return records
    .map((record) => ({
      id: record.id,
      name: record.document.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      width: record.document.width,
      height: record.document.height,
      layerCount: record.document.layers.length,
      boneCount: record.document.bones.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(
  id: string,
): Promise<ProjectRecord | undefined> {
  const record = await transaction<ProjectRecord | undefined>(
    'readonly',
    (store) => store.get(id),
  )
  if (!record) return undefined
  return { ...record, document: validateDocument(record.document) }
}

export async function saveProject(
  record: ProjectRecord,
): Promise<ProjectRecord> {
  if (!record.id?.trim()) throw new Error('A project ID is required.')
  const now = Date.now()
  const saved: ProjectRecord = {
    id: record.id,
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    updatedAt: now,
    document: validateDocument(record.document),
  }
  await transaction('readwrite', (store) => store.put(saved))
  return saved
}

export async function createProject(
  name = 'Untitled character',
  starter = false,
): Promise<ProjectRecord> {
  const now = Date.now()
  return saveProject({
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
    document: createCharacterDocument(
      name.trim() || 'Untitled character',
      starter,
    ),
  })
}

/** Imported files become independent projects; an embedded ID never overwrites work. */
export async function importProject(value: unknown): Promise<ProjectRecord> {
  const candidate =
    value && typeof value === 'object' && 'document' in value
      ? value.document
      : value
  const document = validateDocument(candidate)
  const now = Date.now()
  return saveProject({ id: nanoid(), createdAt: now, updatedAt: now, document })
}

export async function deleteProject(id: string): Promise<void> {
  await transaction('readwrite', (store) => store.delete(id))
}
