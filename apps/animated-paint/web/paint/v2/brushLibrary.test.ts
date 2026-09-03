import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteCustomBrush,
  duplicateBrush,
  getBrushV2,
  listAllBrushes,
  saveCustomBrush,
} from './brushLibrary'
import { createBrushV2 } from './core/defaults'

const custom = new Map<string, unknown>()
const hidden = new Set<string>()

function response(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  custom.clear()
  hidden.clear()
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const id = url.match(/\/brushes\/([^?]+)(?:\?|$)/)?.[1]
      if (!id && method === 'GET') {
        return response({ custom: [...custom.values()], hidden: [...hidden] })
      }
      if (id && method === 'PUT') {
        const brush = JSON.parse(String(init?.body))
        custom.set(id, brush)
        hidden.delete(id)
        return response(brush)
      }
      if (id && method === 'DELETE') {
        custom.delete(id)
        if (url.includes('hideBuiltin=true')) hidden.add(id)
        return response(null, 204)
      }
      return response({ detail: 'unhandled' }, 500)
    },
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('v2 brush library', () => {
  it('overrides and restores built-in brushes', async () => {
    const round = await getBrushV2('round')
    expect(round).toBeDefined()
    await saveCustomBrush({ ...round!, name: 'My Round' })
    expect((await getBrushV2('round'))?.name).toBe('My Round')
    expect(
      (await listAllBrushes()).filter((brush) => brush.id === 'round'),
    ).toHaveLength(1)

    await deleteCustomBrush('round')
    expect(await getBrushV2('round')).toBeUndefined()
    await saveCustomBrush(round!)
    expect((await getBrushV2('round'))?.name).toBe('Round')
  })

  it('duplicates and deletes custom brushes', async () => {
    const round = await getBrushV2('round')
    const copy = await duplicateBrush(round!)
    expect(copy.id).not.toBe('round')
    expect(await getBrushV2(copy.id)).toBeDefined()

    const customBrush = await saveCustomBrush(
      createBrushV2({ name: 'Custom' }),
    )
    await deleteCustomBrush(customBrush.id)
    expect(await getBrushV2(customBrush.id)).toBeUndefined()
  })
})
