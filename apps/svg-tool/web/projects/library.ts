import { nanoid } from 'nanoid'
import { ApiError, apiBytes, apiJson } from '@artist-studio/api-client'
import { createBlankDocument } from '../model/document'
import type { EditorDocument } from '../model/types'

const PREFIX = '/v1/apps/svg-tool'

export type ProjectRecord = {
  id: string
  updatedAt: number
  createdAt: number
  document: EditorDocument
}

export type ProjectSummary = {
  id: string
  name: string
  updatedAt: number
  createdAt: number
  width: number
  height: number
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return apiJson<ProjectSummary[]>(`${PREFIX}/projects`)
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  try {
    return await apiJson<ProjectRecord>(`${PREFIX}/projects/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined
    throw error
  }
}

export async function saveProject(record: ProjectRecord): Promise<ProjectRecord> {
  return apiJson<ProjectRecord>(
    `${PREFIX}/projects/${encodeURIComponent(record.id)}`,
    { method: 'PUT', body: JSON.stringify(record) },
  )
}

export async function createProject(
  name: string,
  width: number,
  height: number,
): Promise<ProjectRecord> {
  const now = Date.now()
  const record: ProjectRecord = {
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
    document: createBlankDocument(name.trim() || 'Untitled', width, height),
  }
  return apiJson<ProjectRecord>(`${PREFIX}/projects`, {
    method: 'POST',
    body: JSON.stringify(record),
  })
}

export async function deleteProject(id: string): Promise<void> {
  await apiJson<void>(`${PREFIX}/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function putProjectAsset(
  projectId: string,
  name: string,
  body: ArrayBuffer | Blob,
): Promise<void> {
  await apiBytes(
    `${PREFIX}/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(name)}`,
    body,
  )
}
