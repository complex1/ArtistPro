import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, deleteProject, getProject, listProjects } from './library'

const records = new Map<string, unknown>()

beforeEach(() => {
  records.clear()
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const projectsUrl = /\/v1\/apps\/svg-tool\/projects\/?$/
      const oneUrl = /\/v1\/apps\/svg-tool\/projects\/([^/?]+)$/
      if (method === 'GET' && projectsUrl.test(url)) {
        return jsonResponse([...records.values()])
      }
      if (method === 'POST' && projectsUrl.test(url)) {
        const record = JSON.parse(String(init?.body)) as { id: string }
        records.set(record.id, record)
        return jsonResponse(record)
      }
      const match = url.match(oneUrl)
      if (match) {
        const id = decodeURIComponent(match[1])
        if (method === 'GET') {
          const record = records.get(id)
          if (!record) return jsonResponse({ detail: 'missing' }, 404)
          return jsonResponse(record)
        }
        if (method === 'PUT') {
          const record = JSON.parse(String(init?.body))
          records.set(id, record)
          return jsonResponse(record)
        }
        if (method === 'DELETE') {
          records.delete(id)
          return new Response(null, { status: 204 })
        }
      }
      return jsonResponse({ detail: 'unhandled' }, 500)
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('project library', () => {
  it('creates, lists, updates, and deletes projects via the API', async () => {
    const created = await createProject('Hero', 1280, 720)
    expect(created.document.name).toBe('Hero')
    expect(await listProjects()).toEqual([
      expect.objectContaining({ id: created.id }),
    ])

    created.document.name = 'Hero v2'
    records.set(created.id, created)
    expect((await getProject(created.id))?.document.name).toBe('Hero v2')

    await deleteProject(created.id)
    expect(await listProjects()).toEqual([])
  })
})
