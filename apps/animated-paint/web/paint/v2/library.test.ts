import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPaintProjectV2,
  deletePaintProjectV2,
  getPaintProjectV2,
  importLegacyPaintProjects,
  listPaintProjectsV2,
  savePaintProjectV2,
} from './library'

const records = new Map<string, Record<string, unknown>>()

function response(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  records.clear()
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const id = url.match(/\/projects\/([^/?]+)$/)?.[1]
      if (!id && method === 'GET') {
        return response(
          [...records.values()].map((record) => {
            const document = record.document as {
              name: string
              width: number
              height: number
            }
            return {
              id: record.id,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
              name: document.name,
              width: document.width,
              height: document.height,
            }
          }),
        )
      }
      if (!id && method === 'POST') {
        const record = JSON.parse(String(init?.body))
        records.set(record.id, record)
        return response(record)
      }
      if (id && method === 'GET') {
        return records.has(id)
          ? response(records.get(id))
          : response({ detail: 'missing' }, 404)
      }
      if (id && method === 'PUT') {
        const record = JSON.parse(String(init?.body))
        records.set(id, record)
        return response(record)
      }
      if (id && method === 'DELETE') {
        records.delete(id)
        return response(null, 204)
      }
      return response({ detail: 'unhandled' }, 500)
    },
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('paint v2 project library', () => {
  it('creates, loads, updates, and deletes backend projects', async () => {
    const project = await createPaintProjectV2('Living ink', 800, 600)
    expect(project.document.version).toBe(2)
    expect(await listPaintProjectsV2()).toMatchObject([
      { id: project.id, name: 'Living ink', width: 800, height: 600 },
    ])

    await savePaintProjectV2({
      ...project,
      document: { ...project.document, name: 'Renamed ink' },
    })
    expect((await getPaintProjectV2(project.id))?.document.name).toBe(
      'Renamed ink',
    )

    await deletePaintProjectV2(project.id)
    expect(await listPaintProjectsV2()).toEqual([])
  })

  it('copies valid legacy projects without deleting browser data', async () => {
    const project = await createPaintProjectV2('Legacy ink', 320, 240)
    records.clear()
    const getItem = vi.fn(() => JSON.stringify([project]))
    vi.stubGlobal('localStorage', { getItem })

    expect(await importLegacyPaintProjects()).toBe(1)
    expect((await getPaintProjectV2(project.id))?.document.name).toBe(
      'Legacy ink',
    )
    expect(getItem).toHaveBeenCalled()
  })
})
