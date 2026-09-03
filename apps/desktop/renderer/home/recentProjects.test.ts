import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolManifest } from '@artist-studio/tool-registry'
import { loadRecentProjects } from './recentProjects'

const tools: ToolManifest[] = [
  {
    id: 'svg-tool',
    title: 'SVG Studio',
    blurb: 'Vector motion',
    route: '/svg',
    status: 'ready',
    apiPrefix: '/v1/apps/svg-tool',
  },
  {
    id: 'animated-paint',
    title: 'Animated Paint',
    blurb: 'Procedural brushes',
    route: '/paint',
    status: 'ready',
    apiPrefix: '/v1/apps/animated-paint',
  },
  {
    id: 'cel',
    title: 'Cel Restoration',
    blurb: 'Restore artwork',
    route: '/cel',
    status: 'ready',
    apiPrefix: '/v1/apps/cel',
  },
  {
    id: 'draw',
    title: 'Draw',
    blurb: 'Raster drawing',
    route: '/draw',
    status: 'coming-soon',
  },
]

function summary(id: string, updatedAt: number) {
  return { id, name: id, createdAt: 0, updatedAt, width: 800, height: 600 }
}

function stubFetch(byPrefix: Record<string, unknown[] | 'fail'>) {
  const fetchStub = vi.fn(async (url: string) => {
    const match = Object.entries(byPrefix).find(([prefix]) =>
      url.includes(prefix),
    )
    if (match?.[1] === 'fail') {
      return new Response('not found', { status: 404 })
    }
    return new Response(JSON.stringify(match ? match[1] : []), {
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadRecentProjects', () => {
  it('merges every ready tool and sorts newest first', async () => {
    stubFetch({
      'apps/svg-tool': [summary('vector', 300), summary('logo', 100)],
      'apps/animated-paint': [summary('brush', 200)],
      'apps/cel': [summary('still', 250)],
    })

    const projects = await loadRecentProjects(tools)

    expect(projects.map((project) => project.id)).toEqual([
      'vector',
      'still',
      'brush',
      'logo',
    ])
    expect(projects.find((project) => project.id === 'brush')).toMatchObject({
      toolId: 'animated-paint',
      toolRoute: '/paint',
      apiPrefix: '/v1/apps/animated-paint',
    })
  })

  it('keeps the list when one tool has no project endpoint', async () => {
    stubFetch({
      'apps/svg-tool': [summary('vector', 300)],
      'apps/animated-paint': 'fail',
    })

    const projects = await loadRecentProjects(tools)

    expect(projects.map((project) => project.id)).toEqual(['vector'])
  })

  it('reports failure only when no tool answers', async () => {
    stubFetch({
      'apps/svg-tool': 'fail',
      'apps/animated-paint': 'fail',
      'apps/cel': 'fail',
    })

    await expect(loadRecentProjects(tools)).rejects.toThrow()
  })

  it('skips tools that are not ready or have no api', async () => {
    const fetchStub = stubFetch({})

    await loadRecentProjects(tools)

    const requested = fetchStub.mock.calls.map(([url]) => url)
    expect(requested).toHaveLength(3)
    expect(requested.some((url) => url.includes('draw'))).toBe(false)
  })
})
