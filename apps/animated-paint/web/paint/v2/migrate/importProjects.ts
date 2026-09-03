import { PAINT_PROJECTS_STORAGE_KEY } from '../../library'
import { importV1Document } from './importV1'
import {
  getPaintProjectV2,
  savePaintProjectV2,
  type PaintProjectRecordV2,
} from '../library'

export type LegacyPaintStorage = Pick<Storage, 'getItem'>

type V1Record = {
  id: string
  createdAt: number
  updatedAt: number
  document: unknown
}

export function readV1Records(store: LegacyPaintStorage): V1Record[] {
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

export async function importV1ProjectRecord(
  record: V1Record,
): Promise<PaintProjectRecordV2 | null> {
  const existing = await getPaintProjectV2(record.id)
  if (existing) return existing
  const document = importV1Document(record.document)
  if (!document) return null
  return savePaintProjectV2({
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    document,
  })
}

export async function importAllV1Projects(
  store: LegacyPaintStorage,
): Promise<PaintProjectRecordV2[]> {
  const imported = await Promise.all(
    readV1Records(store).map(importV1ProjectRecord),
  )
  return imported.filter(
    (record): record is PaintProjectRecordV2 => record !== null,
  )
}
