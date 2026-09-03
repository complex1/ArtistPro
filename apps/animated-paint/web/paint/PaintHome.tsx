import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FlaskConical, Plus, Trash2 } from 'lucide-react'
import { ARTBOARD_PRESETS, formatUpdated } from '@artist-studio/utils'
import { navigate } from '../app/routes'
import { Button, Select } from '../ui/controls'
import {
  createPaintProjectV2,
  deletePaintProjectV2,
  importLegacyPaintProjects,
  listPaintProjectsV2,
  type PaintProjectSummary,
} from './v2/library'

export function PaintHome() {
  const [projects, setProjects] = useState<PaintProjectSummary[]>([])
  const [name, setName] = useState('Untitled')
  const [size, setSize] = useState('800x600')
  const [error, setError] = useState<string | null>(null)
  const preset = useMemo(
    () =>
      ARTBOARD_PRESETS.find((item) => item.id === size) ??
      ARTBOARD_PRESETS[0],
    [size],
  )

  const refresh = () => {
    void listPaintProjectsV2()
      .then(setProjects)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : 'Could not load projects',
        )
      })
  }

  useEffect(refresh, [])
  useEffect(() => {
    void importLegacyPaintProjects().then((count) => {
      if (count > 0) refresh()
    })
  }, [])

  const openNew = () => {
    void createPaintProjectV2(name, preset.width, preset.height).then(
      (project) => {
        navigate({ page: 'paint-editor', projectId: project.id })
      },
    )
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
        </section>

        <section>
          <p className="studio-kicker">Animated Paint projects</p>
          {error ? (
            <p className="studio-empty">{error}</p>
          ) : projects.length === 0 ? (
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
                      void deletePaintProjectV2(project.id).then(refresh)
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
