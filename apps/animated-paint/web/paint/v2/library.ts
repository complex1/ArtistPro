import { nanoid } from 'nanoid'
import { ApiError, apiBytes, apiJson } from '@artist-studio/api-client'
import { getConfig, setConfig } from '@artist-studio/idb-config'
import { createDocumentV2 } from './core/defaults'
import { parseDocument } from './core/schema'
import type { PaintDocumentV2 } from './core/types'

const PREFIX = '/v1/apps/animated-paint'
const LAST_PROJECT_KEY = 'animated-paint.last-project'
const LEGACY_PROJECTS_KEY = 'artist-pro.paint.projects.v2'

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

export async function listPaintProjectsV2(): Promise<PaintProjectSummary[]> {
  return apiJson<PaintProjectSummary[]>(`${PREFIX}/projects`)
}

export async function importLegacyPaintProjects(): Promise<number> {
  if (typeof localStorage === 'undefined') return 0
  let values: unknown
  try {
    values = JSON.parse(localStorage.getItem(LEGACY_PROJECTS_KEY) ?? '[]')
  } catch {
    return 0
  }
  if (!Array.isArray(values)) return 0
  let imported = 0
  for (const value of values) {
    if (!value || typeof value !== 'object') continue
    const record = value as Partial<PaintProjectRecordV2>
    const document = parseDocument(record.document)
    if (
      typeof record.id !== 'string' ||
      typeof record.createdAt !== 'number' ||
      typeof record.updatedAt !== 'number' ||
      !document
    ) {
      continue
    }
    if (await getPaintProjectV2(record.id)) continue
    await savePaintProjectV2({
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      document,
    })
    imported += 1
  }
  return imported
}

export async function getPaintProjectV2(
  id: string,
): Promise<PaintProjectRecordV2 | undefined> {
  try {
    const record = await apiJson<PaintProjectRecordV2>(
      `${PREFIX}/projects/${encodeURIComponent(id)}`,
    )
    const document = parseDocument(record.document)
    return document ? { ...record, document } : undefined
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined
    throw error
  }
}

export async function rememberPaintProjectV2(id: string): Promise<void> {
  await setConfig(LAST_PROJECT_KEY, id)
}

export async function lastPaintProjectV2(): Promise<
  PaintProjectSummary | undefined
> {
  const id = await getConfig<string>(LAST_PROJECT_KEY)
  if (!id) return undefined
  return (await listPaintProjectsV2()).find((project) => project.id === id)
}

export async function savePaintProjectV2(
  record: PaintProjectRecordV2,
): Promise<PaintProjectRecordV2> {
  const document = parseDocument(record.document)
  if (!document) throw new Error('Invalid paint document')
  return apiJson<PaintProjectRecordV2>(
    `${PREFIX}/projects/${encodeURIComponent(record.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ ...record, document }),
    },
  )
}

export async function createPaintProjectV2(
  name: string,
  width: number,
  height: number,
): Promise<PaintProjectRecordV2> {
  const now = Date.now()
  return apiJson<PaintProjectRecordV2>(`${PREFIX}/projects`, {
    method: 'POST',
    body: JSON.stringify({
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      document: createDocumentV2(name.trim() || 'Untitled', width, height),
    }),
  })
}

export async function deletePaintProjectV2(id: string): Promise<void> {
  await apiJson<void>(`${PREFIX}/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function putPaintAsset(
  projectId: string,
  name: string,
  data: ArrayBuffer | Blob,
): Promise<void> {
  await apiBytes(
    `${PREFIX}/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(name)}`,
    data,
  )
}
