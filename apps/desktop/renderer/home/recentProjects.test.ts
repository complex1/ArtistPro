import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolManifest } from '@artist-studio/tool-registry'
import { deleteRecentProject, loadRecentProjects } from './recentProjects'

const localProjects = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }))
const drawingProjects = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }))
const animationProjects = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }))
vi.mock('@artist-studio/frame-by-frame/library', () => ({ listProjects: animationProjects.list, deleteProject: animationProjects.remove }))
vi.mock('@artist-studio/drawing-canvas/library', () => ({
  listProjects: drawingProjects.list,
  deleteProject: drawingProjects.remove,
}))
vi.mock('@artist-studio/live-character/library', () => ({
  listProjects: localProjects.list,
  deleteProject: localProjects.remove,
}))

const localTool: ToolManifest = {
  id: 'live-character', title: 'Live Character', blurb: 'Character animation',
  route: '/live-character', status: 'ready',
}

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
    id: 'future',
    title: 'Future',
    blurb: 'Not shipped yet',
    route: '/future',
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
  vi.clearAllMocks()
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
    expect(requested.some((url) => url.includes('future'))).toBe(false)
  })
})


describe('browser project integration', () => {
  it('loads and deletes FrameByFrame shots without the API', async () => {
    const fetch = stubFetch({})
    const tool: ToolManifest = { id: 'frame-by-frame', title: 'FrameByFrame Animation', blurb: 'Animation', route: '/frame-by-frame', status: 'ready' }
    animationProjects.list.mockResolvedValue([summary('shot', 700)])
    animationProjects.remove.mockResolvedValue(undefined)
    const projects = await loadRecentProjects([tool])
    expect(projects).toMatchObject([{ id: 'shot', toolId: 'frame-by-frame' }])
    await deleteRecentProject(projects[0])
    expect(animationProjects.remove).toHaveBeenCalledWith('shot')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('loads and deletes Drawing Canvas projects through local storage', async () => {
    const fetchStub = stubFetch({})
    const drawingTool: ToolManifest = {
      id: 'drawing-canvas', title: 'Drawing Canvas', blurb: 'Drawing', route: '/drawing-canvas', status: 'ready',
    }
    drawingProjects.list.mockResolvedValue([summary('canvas', 600)])
    drawingProjects.remove.mockResolvedValue(undefined)
    const projects = await loadRecentProjects([drawingTool])
    expect(projects).toMatchObject([{ id: 'canvas', toolId: 'drawing-canvas', toolRoute: '/drawing-canvas' }])
    await deleteRecentProject(projects[0])
    expect(drawingProjects.remove).toHaveBeenCalledWith('canvas')
    expect(fetchStub).not.toHaveBeenCalled()
  })
  it('merges browser projects even when every API service is offline', async () => {
    stubFetch({ 'apps/svg-tool': 'fail', 'apps/animated-paint': 'fail', 'apps/cel': 'fail' })
    localProjects.list.mockResolvedValue([summary('local-rig', 500)])
    const projects = await loadRecentProjects([...tools, localTool])
    expect(projects).toMatchObject([{ id: 'local-rig', toolId: 'live-character', toolRoute: '/live-character' }])
  })

  it('deletes a local character through its store without making an API request', async () => {
    const fetchStub = stubFetch({})
    localProjects.remove.mockResolvedValue(undefined)
    await deleteRecentProject({ ...summary('local-rig', 500), toolId: localTool.id, toolTitle: localTool.title, toolRoute: localTool.route })
    expect(localProjects.remove).toHaveBeenCalledWith('local-rig')
    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('keeps available API projects when browser storage is unavailable', async () => {
    stubFetch({ 'apps/svg-tool': [summary('vector', 100)] })
    localProjects.list.mockRejectedValue(new Error('IndexedDB unavailable'))
    expect((await loadRecentProjects([...tools, localTool])).map((project) => project.id)).toEqual(['vector'])
  })
})
