import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Clapperboard,
  CircleQuestionMark,
  Bone,
  Moon,
  Paintbrush,
  Palette,
  PenTool,
  Search,
  Settings,
  Sparkles,
  Smartphone,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { parseToolManifests, type ToolManifest } from '@artist-studio/tool-registry'
import { IconButton } from '@artist-studio/ui-component'
import { projectRoute, toolHomeRoute } from './app/routes'
import { openInWindow } from './app/windows'
import { useTheme } from './app/useTheme'
import { RecentProjectCard } from './home/RecentProjectCard'
import { ToolPreview } from './home/ToolPreview'
import {
  deleteRecentProject,
  loadRecentProjects,
  type RecentProject,
} from './home/recentProjects'

const icons: Record<string, LucideIcon> = {
  'svg-tool': PenTool,
  'animated-paint': Paintbrush,
  'drawing-canvas': Palette,
  'frame-by-frame': Clapperboard,
  cel: Sparkles,
  tappilot: Smartphone,
  'live-character': Bone,
}

const modules = import.meta.glob('../../*/tool.json', {
  eager: true,
  import: 'default',
})

const tools = parseToolManifests(Object.values(modules))

const COLLAPSED_PROJECTS = 3

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => field.toLowerCase().includes(needle))
}

/** A tool is only openable once a manifest route has a screen behind it. */
function isOpenable(tool: ToolManifest): boolean {
  return tool.status === 'ready' && Boolean(toolHomeRoute(tool.route))
}

function openTool(tool: ToolManifest) {
  const route = toolHomeRoute(tool.route)
  if (!isOpenable(tool) || !route) return
  openInWindow(route)
}

function openProject(project: RecentProject) {
  const route = projectRoute(project.toolRoute, project.id)
  if (!route) return
  openInWindow(route)
}

export function ArtistHome() {
  const { theme, toggleTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [showAllProjects, setShowAllProjects] = useState(false)

  const loadProjects = useCallback(
    () =>
      loadRecentProjects(tools)
        .then((next) => {
          setProjects(next)
          setProjectsError(null)
        })
        .catch(() => {
          setProjectsError('Could not reach the local project service.')
        })
        .finally(() => setLoadingProjects(false)),
    [],
  )

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const refreshProjects = useCallback(() => {
    setLoadingProjects(true)
    void loadProjects()
  }, [loadProjects])

  const visibleTools = useMemo(
    () => tools.filter((tool) => matches(query, tool.title, tool.blurb)),
    [query],
  )

  const matchedProjects = useMemo(
    () => projects.filter((project) => matches(query, project.name, project.toolTitle)),
    [projects, query],
  )

  const listedProjects =
    showAllProjects || query
      ? matchedProjects
      : matchedProjects.slice(0, COLLAPSED_PROJECTS)

  const removeProject = (project: RecentProject) => {
    if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) {
      return
    }
    void deleteRecentProject(project)
      .then(loadProjects)
      .catch(() => setProjectsError(`Could not delete “${project.name}”.`))
  }

  return (
    <div className="home-shell">
      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-brand-mark" aria-hidden="true">
            <Sparkles size={19} strokeWidth={2} />
          </span>
          <span className="home-brand-copy">
            <strong>Artist Pro</strong>
            <small>Creative Studio</small>
          </span>
        </div>

        <div className="home-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search projects and tools"
            aria-label="Search projects and tools"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
          />
          {query && (
            <IconButton
              icon={X}
              label="Clear search"
              onClick={() => setQuery('')}
            />
          )}
        </div>

        <div className="home-topbar-actions">
          <IconButton
            icon={CircleQuestionMark}
            label="Help (coming soon)"
            disabled
          />
          <IconButton icon={Settings} label="Settings (coming soon)" disabled />
          <IconButton
            icon={theme === 'dark' ? Moon : Sun}
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          />
          <button
            type="button"
            className="home-avatar"
            title="Account (coming soon)"
            aria-label="Account (coming soon)"
            disabled
          >
            A
            <span className="home-avatar-status" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="home-section" aria-label="Tools">
          <div className="home-section-head">
            <h2 className="home-kicker">Tools</h2>
          </div>

          {visibleTools.length === 0 ? (
            <p className="home-empty">No tools match “{query}”.</p>
          ) : (
            <div className="home-tool-grid">
              {visibleTools.map((tool) => {
                const Icon = icons[tool.id]
                const ready = isOpenable(tool)
                const head = (
                  <>
                    <span className="home-tool-head">
                      <span className="home-tool-icon">
                        {Icon ? (
                          <Icon size={20} strokeWidth={1.8} />
                        ) : (
                          tool.title.charAt(0)
                        )}
                      </span>
                      <span className="home-tool-copy">
                        <strong>{tool.title}</strong>
                        <small>{tool.blurb}</small>
                      </span>
                    </span>
                    <span className="home-tool-frame">
                      <ToolPreview toolId={tool.id} />
                    </span>
                  </>
                )

                if (!ready) {
                  return (
                    <div
                      key={tool.id}
                      className="home-tool-card is-soon"
                      aria-disabled="true"
                    >
                      <span className="home-tool-badge">Coming Soon</span>
                      {head}
                    </div>
                  )
                }

                return (
                  <button
                    key={tool.id}
                    type="button"
                    className="home-tool-card is-ready"
                    onClick={() => openTool(tool)}
                  >
                    {head}
                    <span className="home-tool-open">Open</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="home-section" aria-label="Recent projects">
          <div className="home-section-head">
            <h2 className="home-kicker">Recent projects</h2>
            {!query && matchedProjects.length > COLLAPSED_PROJECTS && (
              <button
                type="button"
                className="home-section-link"
                onClick={() => setShowAllProjects((open) => !open)}
              >
                {showAllProjects
                  ? 'Show fewer'
                  : `View all projects (${matchedProjects.length})`}
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          {projectsError ? (
            <p className="home-empty">
              {projectsError}
              <button
                type="button"
                className="home-section-link"
                onClick={refreshProjects}
              >
                Try again
              </button>
            </p>
          ) : loadingProjects ? (
            <p className="home-empty">Loading projects…</p>
          ) : listedProjects.length === 0 ? (
            <p className="home-empty">
              {query
                ? `No projects match “${query}”.`
                : 'No projects yet. Start one from a tool above.'}
            </p>
          ) : (
            <div className="home-project-grid">
              {listedProjects.map((project) => (
                <RecentProjectCard
                  key={`${project.toolId}:${project.id}`}
                  project={project}
                  onOpen={() => openProject(project)}
                  onDelete={() => removeProject(project)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
