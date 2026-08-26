import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { navigate } from '../app/routes'
import { ARTBOARD_PRESETS } from '../model/document'
import {
  createProject,
  deleteProject,
  listProjects,
  type ProjectSummary,
} from '../projects/library'
import { Button, Select } from '../ui/controls'

function formatUpdated(time: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(time)
}

export function SvgToolHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>(() => listProjects())
  const [name, setName] = useState('Untitled')
  const [size, setSize] = useState('800x600')

  const preset = useMemo(
    () => ARTBOARD_PRESETS.find((item) => item.id === size) ?? ARTBOARD_PRESETS[0],
    [size],
  )

  const refresh = () => setProjects(listProjects())

  const openNew = () => {
    const project = createProject(name, preset.width, preset.height)
    navigate({ page: 'svg-editor', projectId: project.id })
  }

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <button
          type="button"
          className="studio-back"
          onClick={() => navigate({ page: 'home' })}
        >
          <ArrowLeft size={14} />
          Artist Pro
        </button>
        <div className="studio-brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SVG</strong>
            <span>Vector editor</span>
          </div>
        </div>
      </header>

      <main className="studio-main svg-home">
        <section className="new-project">
          <p className="studio-kicker">New project</p>
          <h1>Start a canvas</h1>
          <div className="new-project-row">
            <label>
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') openNew()
                }}
              />
            </label>
            <label>
              <span>Size</span>
              <Select
                aria-label="Project size"
                value={size}
                onChange={(event) => setSize(event.target.value)}
              >
                {ARTBOARD_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="primary" onClick={openNew}>
              <Plus size={14} /> Create
            </Button>
          </div>
        </section>

        <section>
          <p className="studio-kicker">Projects</p>
          {projects.length === 0 ? (
            <p className="studio-empty">
              Nothing here yet. Create a project to open the editor.
            </p>
          ) : (
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="project-card"
                    onClick={() =>
                      navigate({ page: 'svg-editor', projectId: project.id })
                    }
                  >
                    <strong>{project.name}</strong>
                    <small>
                      {project.width} × {project.height}
                      {' · '}
                      {formatUpdated(project.updatedAt)}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="project-delete"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => {
                      deleteProject(project.id)
                      refresh()
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
