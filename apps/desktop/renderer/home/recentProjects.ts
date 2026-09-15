import { apiJson } from '@artist-studio/api-client'
import type { ToolManifest } from '@artist-studio/tool-registry'

type ProjectSummary = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
}

export type RecentProject = ProjectSummary & {
  toolId: string
  toolTitle: string
  toolRoute: string
  apiPrefix?: string
}

/**
 * Merge tool-owned project stores. Live Character works offline in IndexedDB;
 * existing tools continue using their manifest API endpoints.
 */
export async function loadRecentProjects(
  tools: ToolManifest[],
): Promise<RecentProject[]> {
  const sources = tools.filter(
    (tool) => tool.status === 'ready' && (Boolean(tool.apiPrefix) || tool.id === 'live-character'),
  )

  const batches = await Promise.all(
    sources.map(async (tool) => {
      const apiPrefix = tool.apiPrefix
      try {
        const summaries = tool.id === 'live-character'
          ? await (await import('@artist-studio/live-character/library')).listProjects()
          : await apiJson<ProjectSummary[]>(`${apiPrefix}/projects`)
        return summaries.map((summary) => ({
          ...summary,
          toolId: tool.id,
          toolTitle: tool.title,
          toolRoute: tool.route,
          apiPrefix,
        }))
      } catch {
        return undefined
      }
    }),
  )

  const answered = batches.filter((batch) => batch !== undefined)
  if (sources.length > 0 && answered.length === 0) {
    throw new Error('No tool answered with a project list')
  }

  return answered.flat().sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteRecentProject(
  project: RecentProject,
): Promise<void> {
  if (project.toolId === 'live-character') {
    await (await import('@artist-studio/live-character/library')).deleteProject(project.id)
    return
  }
  await apiJson<void>(
    `${project.apiPrefix}/projects/${encodeURIComponent(project.id)}`,
    { method: 'DELETE' },
  )
}
