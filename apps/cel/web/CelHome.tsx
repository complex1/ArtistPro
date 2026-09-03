import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { formatUpdated } from '@artist-studio/utils'
import { navigate } from './app/routes'
import {
  createProject,
  deleteProject,
  listProjects,
  type ProjectSummary,
} from './projects/library'
import { Button } from './ui/controls'

export function CelHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState('Untitled')
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    void listProjects()
      .then(setProjects)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : 'Could not load projects',
        )
      })
  }

  useEffect(() => {
    refresh()
  }, [])

  const openNew = () => {
    void createProject(name).then((project) => {
      navigate({ page: 'cel-editor', projectId: project.id })
    })
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
          <div className="brand-mark cel-brand-mark">C</div>
          <div>
            <strong>Cel</strong>
            <span>Cartoon restore + vector</span>
          </div>
        </div>
      </header>

      <main className="studio-main svg-home">
        <section className="new-project">
          <p className="studio-kicker">New restoration</p>
          <h1>Start from a still</h1>
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
            <Button variant="primary" onClick={openNew}>
              <Plus size={14} /> Create
            </Button>
          </div>
        </section>

        <section>
          <p className="studio-kicker">Projects</p>
          {error ? (
            <p className="studio-empty">{error}</p>
          ) : projects.length === 0 ? (
            <p className="studio-empty">
              Nothing here yet. Create a project, then drop in a PNG, JPEG, or
              WebP.
            </p>
          ) : (
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="project-card"
                    onClick={() =>
                      navigate({ page: 'cel-editor', projectId: project.id })
                    }
                  >
                    <strong>{project.name}</strong>
                    <small>
                      {project.width > 0
                        ? `${project.width} × ${project.height}`
                        : 'No image yet'}
                      {' · '}
                      {formatUpdated(project.updatedAt)}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="project-delete"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => {
                      void deleteProject(project.id).then(refresh)
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
