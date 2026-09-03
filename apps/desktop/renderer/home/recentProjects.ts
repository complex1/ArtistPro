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
  apiPrefix: string
}

/**
 * Every tool stores its projects behind its own manifest apiPrefix, so the home
 * page merges the lists instead of owning a project store of its own.
 */
export async function loadRecentProjects(
  tools: ToolManifest[],
): Promise<RecentProject[]> {
  const sources = tools.filter(
    (tool) => tool.status === 'ready' && Boolean(tool.apiPrefix),
  )

  const batches = await Promise.all(
    sources.map(async (tool) => {
      const apiPrefix = tool.apiPrefix as string
      try {
        const summaries = await apiJson<ProjectSummary[]>(
          `${apiPrefix}/projects`,
        )
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
  await apiJson<void>(
    `${project.apiPrefix}/projects/${encodeURIComponent(project.id)}`,
    { method: 'DELETE' },
  )
}
