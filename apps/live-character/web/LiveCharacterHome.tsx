import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bone,
  Boxes,
  ChevronRight,
  FolderOpen,
  Move,
  PersonStanding,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { formatUpdated } from '@artist-studio/utils'
import {
  createProject,
  deleteProject,
  importProject,
  listProjects,
  type ProjectSummary,
} from './library'
import './LiveCharacterHome.css'

function CharacterArtwork() {
  return (
    <svg
      viewBox="0 0 520 410"
      role="img"
      aria-label="An illustrated character with a visible skeleton and hand controls"
    >
      <defs>
        <pattern
          id="lch-grid"
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#b7a4f4" opacity=".22" />
        </pattern>
        <linearGradient id="lch-shirt" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#c5b7ff" />
          <stop offset="1" stopColor="#8a6cdd" />
        </linearGradient>
      </defs>
      <rect width="520" height="410" fill="url(#lch-grid)" />
      <ellipse cx="265" cy="360" rx="97" ry="13" fill="#111326" opacity=".4" />
      <g stroke="#212138" strokeWidth="4" strokeLinejoin="round">
        <path
          d="M233 260l-10 75-22 12c-9 5-7 13 3 13h36l21-91M266 265l25 76-3 11c-1 8 5 10 12 8l24-9c4-2 4-10-1-13l-21-84"
          fill="#535482"
        />
        <path
          d="M222 166l-42 40-45-20-10 22 53 23c7 3 13 1 18-3l39-27M291 167l37 28 32-44 20 12-31 54c-5 9-14 11-23 6l-47-23"
          fill="#edbba9"
        />
        <path
          d="M136 188l-10-10c-6-5-10-3-9 3l5 10-14-4c-12-3-15 5-5 11l23 11zM361 153l-1-13c0-7 5-9 7-3l4 6 7-13c5-8 11-3 7 5l-3 6 8-4c8-3 11 4 5 9l-16 17z"
          fill="#edbba9"
        />
        <path
          d="M235 146c-18 6-28 23-27 46l11 76c19 13 57 12 85-8l-12-85c-3-16-11-26-27-30"
          fill="url(#lch-shirt)"
        />
        <path d="M243 128l-3 25c8 12 18 11 26-2l-2-26" fill="#edbba9" />
        <path
          d="M216 83c-8 6-7 20-2 29 5 14 12 29 32 31 28 2 50-22 46-46l-5-27-56-9z"
          fill="#f4c7b0"
        />
        <path
          d="M216 108c-16-7-21-27-11-43 2-16 22-25 35-20 16-12 44-6 53 11 21 24 4 43-6 43l-2-22c-19 9-37 3-42-8-5 14-16 13-23 12z"
          fill="#38354f"
        />
      </g>
      <ellipse cx="239" cy="102" rx="3" ry="4" fill="#38354f" />
      <ellipse cx="267" cy="101" rx="3" ry="4" fill="#38354f" />
      <path
        d="M246 121q10 7 16-2"
        stroke="#9b5b5e"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M252 146l8 112m-1-77-77 33-58-14m137-19 73 28 38-53m-111 103-28 79m28-79 41 83"
        fill="none"
        stroke="#eef2ff"
        strokeWidth="2"
        opacity=".76"
      />
      <g fill="#23233e" stroke="#e0d5ff" strokeWidth="2">
        {[
          [252, 146],
          [260, 181],
          [261, 258],
          [182, 214],
          [334, 209],
          [233, 338],
          [302, 342],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" />
        ))}
      </g>
      <g fill="none" stroke="#f2c769" strokeWidth="2">
        <circle cx="124" cy="200" r="17" />
        <circle cx="372" cy="155" r="17" />
        <rect x="241" y="240" width="40" height="37" rx="6" />
      </g>
      <g fontFamily="Inter, sans-serif" fontSize="10" fill="#d7cee9">
        <rect x="332" y="93" width="98" height="25" rx="6" fill="#302d48" />
        <text x="345" y="109">
          Hand controller
        </text>
        <path d="M379 118v19" stroke="#d0b2fa" strokeDasharray="3 3" />
        <rect x="72" y="273" width="96" height="25" rx="6" fill="#302d48" />
        <text x="85" y="289">
          Ready to move
        </text>
        <path d="M168 284l65-24" stroke="#d0b2fa" strokeDasharray="3 3" />
      </g>
    </svg>
  )
}

export function LiveCharacterHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState('My character')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(
    () =>
      listProjects()
        .then((next) => {
          setProjects(next)
          setError(null)
        })
        .catch((reason: unknown) => {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load your characters.',
          )
        })
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const open = (id: string) => {
    window.location.hash = `#/live-character/${encodeURIComponent(id)}`
  }
  const create = async (starter: boolean) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      open((await createProject(name, starter)).id)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not create your character.',
      )
    } finally {
      setBusy(false)
    }
  }
  const importFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error('Choose a project file smaller than 50 MB.')
      open((await importProject(JSON.parse(await file.text()))).id)
    } catch (reason) {
      setError(
        reason instanceof SyntaxError
          ? 'This file is not valid project JSON.'
          : reason instanceof Error
            ? reason.message
            : 'Could not import this project.',
      )
    } finally {
      setBusy(false)
    }
  }
  const remove = async (project: ProjectSummary) => {
    if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`))
      return
    try {
      await deleteProject(project.id)
      await refresh()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not delete this character.',
      )
    }
  }
  const visibleProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="lch-shell">
      <header className="lch-topbar">
        <button
          type="button"
          className="lch-back"
          onClick={() => {
            window.location.hash = '#/'
          }}
        >
          <ArrowLeft size={15} /> Artist Pro
        </button>
        <span className="lch-divider" />
        <span className="lch-brand">
          <PersonStanding size={20} />
          <strong>Live Character</strong>
        </span>
        <span className="lch-local">Your browser. Your studio.</span>
      </header>
      <main className="lch-main">
        <section className="lch-hero">
          <div className="lch-hero-copy">
            <span className="lch-eyebrow">
              <span /> A little art. A lot of life.
            </span>
            <h1>
              Characters made
              <br />
              to <em>move.</em>
            </h1>
            <p>
              Build a character, give it a rig, and bring your next story to
              life. All in one creative space.
            </p>
            <label className="lch-name">
              <span>Character name</span>
              <input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void create(false)
                }}
              />
            </label>
            <div className="lch-create-actions">
              <button
                type="button"
                className="lch-primary"
                disabled={busy}
                onClick={() => {
                  void create(false)
                }}
              >
                <Plus size={16} /> Create character
              </button>
              <button
                type="button"
                className="lch-secondary"
                disabled={busy}
                onClick={() => {
                  void create(true)
                }}
              >
                <Sparkles size={15} /> Try a starter rig{' '}
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="lch-workflow" aria-label="Workflow">
              {['Create', 'Assemble', 'Mesh', 'Rig', 'Animate', 'Export'].map(
                (step, index) => (
                  <span key={step}>
                    {index > 0 && <ChevronRight size={12} />}
                    {step}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="lch-art">
            <CharacterArtwork />
            <span className="lch-art-caption">
              <span /> From a drawing to a personality
            </span>
          </div>
        </section>
        <div className="lch-feature-strip">
          <span>
            <Boxes size={18} />
            <strong>Make it yours</strong>
            <small>Draw or import layered artwork</small>
          </span>
          <span>
            <Bone size={18} />
            <strong>Give it structure</strong>
            <small>Meshes, bones, weights & IK</small>
          </span>
          <span>
            <Move size={18} />
            <strong>Find the movement</strong>
            <small>Controllers, poses & keyframes</small>
          </span>
        </div>
        {error && (
          <p className="lch-error" role="alert">
            {error}
          </p>
        )}
        <section className="lch-library" aria-label="Your characters">
          <div className="lch-section-head">
            <div>
              <h2>
                Your characters <span>{projects.length}</span>
              </h2>
              <p>
                Saved in this browser. Export a project to keep a portable copy.
              </p>
            </div>
            <div className="lch-library-actions">
              {projects.length > 0 && (
                <label className="lch-search">
                  <Search size={14} />
                  <input
                    aria-label="Search characters"
                    placeholder="Search characters"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              )}
              <button
                type="button"
                className="lch-secondary"
                disabled={busy}
                onClick={() => importInput.current?.click()}
              >
                <Upload size={14} /> Import project
              </button>
              <input
                ref={importInput}
                hidden
                type="file"
                accept=".json,.live-character.json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void importFile(file)
                }}
              />
            </div>
          </div>
          {loading ? (
            <p className="lch-empty">Opening your character library…</p>
          ) : visibleProjects.length === 0 ? (
            <div className="lch-empty">
              <FolderOpen size={27} />
              <strong>
                {query ? 'No matching characters' : 'Your cast starts here'}
              </strong>
              <span>
                {query
                  ? 'Try another character name.'
                  : 'Start with a blank canvas or explore the starter rig above.'}
              </span>
            </div>
          ) : (
            <div className="lch-projects">
              {visibleProjects.map((project) => (
                <article className="lch-project" key={project.id}>
                  <button
                    type="button"
                    className="lch-project-open"
                    onClick={() => open(project.id)}
                  >
                    <div className="lch-project-art">
                      <PersonStanding size={62} strokeWidth={1} />
                      <span>
                        {project.boneCount > 0
                          ? `${project.boneCount} bones`
                          : 'New canvas'}
                      </span>
                    </div>
                    <strong>{project.name}</strong>
                    <small>
                      {project.layerCount} layers · {project.width} ×{' '}
                      {project.height}
                    </small>
                    <small className="lch-project-date">
                      {formatUpdated(project.updatedAt)}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="lch-delete"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => {
                      void remove(project)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
