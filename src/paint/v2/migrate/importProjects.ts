import { PAINT_PROJECTS_STORAGE_KEY } from '../../library'
import { importV1Document } from './importV1'
import {
  getPaintProjectV2,
  savePaintProjectV2,
  type PaintProjectRecordV2,
  type PaintStorage,
} from '../library'

type V1Record = {
  id: string
  createdAt: number
  updatedAt: number
  document: unknown
}

export function readV1Records(store: PaintStorage): V1Record[] {
  try {
    const parsed = JSON.parse(
      store.getItem(PAINT_PROJECTS_STORAGE_KEY) ?? '[]',
    ) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is V1Record => {
      if (!item || typeof item !== 'object') return false
      const record = item as Partial<V1Record>
      return (
        typeof record.id === 'string' &&
        typeof record.createdAt === 'number' &&
        typeof record.updatedAt === 'number'
      )
    })
  } catch {
    return []
  }
}

export function importV1ProjectRecord(
  record: V1Record,
  store: PaintStorage,
): PaintProjectRecordV2 | null {
  if (getPaintProjectV2(record.id, store)) return getPaintProjectV2(record.id, store) ?? null
  const document = importV1Document(record.document)
  if (!document) return null
  return savePaintProjectV2(
    {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      document,
    },
    store,
  )
}

export function importAllV1Projects(store: PaintStorage): PaintProjectRecordV2[] {
  const imported: PaintProjectRecordV2[] = []
  for (const record of readV1Records(store)) {
    const next = importV1ProjectRecord(record, store)
    if (next) imported.push(next)
  }
  return imported
}
