import { useMemo, useState } from 'react'
import { ArrowLeft, FlaskConical, Plus, Trash2 } from 'lucide-react'
import { navigate } from '../app/routes'
import { ARTBOARD_PRESETS } from '../model/document'
import { Button, Select } from '../ui/controls'
import {
  createPaintProjectV2,
  deletePaintProjectV2,
  listPaintProjectsV2,
  paintStorage,
  type PaintProjectSummary,
} from './v2/library'
import { importAllV1Projects, readV1Records } from './v2/migrate/importProjects'

function formatUpdated(time: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(time)
}

export function PaintHome() {
  const store = paintStorage()
  const [projects, setProjects] = useState<PaintProjectSummary[]>(() =>
    listPaintProjectsV2(store),
  )
  const [name, setName] = useState('Untitled')
  const [size, setSize] = useState('800x600')
  const v1Count = readV1Records(store).length
  const preset = useMemo(
    () =>
      ARTBOARD_PRESETS.find((item) => item.id === size) ??
      ARTBOARD_PRESETS[0],
    [size],
  )

  const refresh = () => setProjects(listPaintProjectsV2(store))

  const openNew = () => {
    const project = createPaintProjectV2(name, preset.width, preset.height, store)
    navigate({ page: 'paint-editor', projectId: project.id })
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
          <div className="brand-mark paint-brand-mark">P</div>
          <div>
            <strong>Animated Paint</strong>
            <span>Living brush studio</span>
          </div>
        </div>
      </header>

      <main className="studio-main svg-home">
        <section className="new-project">
          <p className="studio-kicker">New project</p>
          <h1>Start a living canvas</h1>
          <p className="studio-lede">
            Draw procedural strokes that wiggle, flow, pulse, and emit.
          </p>
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
            <Button onClick={() => navigate({ page: 'paint-playground' })}>
              <FlaskConical size={14} /> Playground
            </Button>
          </div>
          {v1Count > 0 ? (
            <p className="studio-lede">
              {v1Count} older Animated Paint project{v1Count === 1 ? '' : 's'} found.{' '}
              <button
                type="button"
                className="studio-crumb"
                onClick={() => {
                  importAllV1Projects(store)
                  refresh()
                }}
              >
                Import without deleting originals
              </button>
            </p>
          ) : null}
        </section>

        <section>
          <p className="studio-kicker">Animated Paint projects</p>
          {projects.length === 0 ? (
            <p className="studio-empty">
              Nothing here yet. Create a project to open Animated Paint.
            </p>
          ) : (
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="project-card"
                    onClick={() =>
                      navigate({
                        page: 'paint-editor',
                        projectId: project.id,
                      })
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
                      deletePaintProjectV2(project.id, store)
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
