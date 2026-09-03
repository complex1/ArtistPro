const DB_NAME = 'artist-studio-config'
const STORE = 'kv'
const VERSION = 1

const memory = new Map<string, unknown>()

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getConfig<T>(key: string): Promise<T | undefined> {
  if (!hasIndexedDb()) {
    return memory.get(key) as T | undefined
  }
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function setConfig<T>(key: string, value: T): Promise<void> {
  if (!hasIndexedDb()) {
    memory.set(key, value)
    return
  }
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .put(value, key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function deleteConfig(key: string): Promise<void> {
  if (!hasIndexedDb()) {
    memory.delete(key)
    return
  }
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}
