import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Camera,
  FolderOpen,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  PersonStanding,
} from 'lucide-react'
import { formatUpdated } from '@artist-studio/utils'
import {
  createProject,
  deleteProject,
  importProject,
  listProjects,
  type ProjectSummary,
} from './library'
import './reference.css'

export function SceneIllustration({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 500 340"
      fill="none"
      role="img"
      aria-label="A posed figure on a perspective grid with camera framing guides"
    >
      <path d="M0 265 250 140 500 265 250 390Z" fill="#273634" />
      <g stroke="#7eaa99" opacity=".16">
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <path d={`M${i * 25} ${265 - i * 12.5}l250 125`} />
            <path d={`M${250 + i * 25} ${140 + i * 12.5}l-250 125`} />
          </g>
        ))}
      </g>
      <ellipse cx="262" cy="279" rx="75" ry="12" fill="#0d1716" opacity=".4" />
      <path d="m353 221 53 28v-54l-53-27Z" fill="#60746c" />
      <path d="m306 194 47 27v-53l-47-25Z" fill="#8c9c8f" />
      <path d="m306 143 48-22 52 26-53 21Z" fill="#bdc8b6" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="m249 199-21 38-9 40m42-76 20 40 9 32"
          stroke="#566e67"
          strokeWidth="20"
        />
        <path
          d="m248 199-19 37-9 38m41-74 19 39 10 33"
          stroke="#b9c8b6"
          strokeWidth="15"
        />
        <path d="m218 279 15 2m55-4 15-4" stroke="#cdd8c6" strokeWidth="12" />
        <path
          d="m236 135-29 21-26-18m81-3 28 19 15-35"
          stroke="#566e67"
          strokeWidth="17"
        />
        <path
          d="m236 134-29 20-26-17m81-3 28 19 15-35"
          stroke="#c6d2c1"
          strokeWidth="12"
        />
        <path d="m246 126 6 66" stroke="#667e72" strokeWidth="39" />
        <path d="m243 128 6 63" stroke="#c6d2bd" strokeWidth="30" />
        <path d="m242 119-1-13" stroke="#ced8c5" strokeWidth="12" />
        <ellipse
          cx="240"
          cy="89"
          rx="18"
          ry="23"
          transform="rotate(-10 240 89)"
          fill="#d6dfcd"
        />
        <path d="m250 83 1 8-4 2" stroke="#a1b09e" strokeWidth="2" />
      </g>
      <g fill="#2a413a" stroke="#86d8b7" strokeWidth="2">
        {[
          [236, 134],
          [207, 154],
          [181, 137],
          [263, 135],
          [290, 153],
          [305, 118],
          [249, 194],
          [229, 237],
          [280, 240],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="4" />
        ))}
      </g>
      <g stroke="#a5e3c9" strokeWidth="1.5">
        <circle cx="305" cy="118" r="13" />
        <path
          d="M115 65V48h23m228 0h23v17m0 203v18h-23m-228 0h-23v-18"
          opacity=".5"
        />
      </g>
      {!small && (
        <g fontFamily="Inter, sans-serif" fontSize="10" fill="#a5c8b6">
          <text x="116" y="35" letterSpacing="2">
            A NEW PERSPECTIVE
          </text>
          <rect x="312" y="91" width="82" height="22" rx="5" fill="#1d302a" />
          <text x="324" y="106">
            Hand control
          </text>
          <text x="116" y="310">
            POSE · FRAME · DRAW
          </text>
          <text x="361" y="310">
            01 / 01
          </text>
        </g>
      )}
    </svg>
  )
}

export function ReferenceHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState('Untitled scene')
  const [format, setFormat] = useState('1600x1200')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const refresh = useCallback(() => {
    void listProjects()
      .then(setProjects)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  const open = (id: string) => {
    window.location.hash = `#/reference-3d/${encodeURIComponent(id)}`
  }
  async function create(starter: boolean) {
    setBusy(true)
    setError('')
    try {
      const [width, height] = format.split('x').map(Number)
      open((await createProject(name, width, height, starter)).id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create scene.')
    } finally {
      setBusy(false)
    }
  }
  async function load(file: File) {
    setBusy(true)
    setError('')
    try {
      if (file.size > 96 * 1024 * 1024)
        throw new Error('Choose a project smaller than 96 MB.')
      open((await importProject(JSON.parse(await file.text()))).id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open project.')
    } finally {
      setBusy(false)
    }
  }
  async function remove(project: ProjectSummary) {
    if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`))
      return
    try {
      await deleteProject(project.id)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete scene.')
    }
  }
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div className="ref-home ref-theme">
      <header className="ref-home-header">
        <button
          onClick={() => {
            window.location.hash = '#/'
          }}
          className="ref-text-button"
        >
          <ArrowLeft size={15} /> Artist Studio
        </button>
        <span className="ref-divider" />
        <Box size={20} className="ref-accent" />
        <strong>3D Reference</strong>
        <span className="ref-local">A space to see your ideas.</span>
      </header>
      <main className="ref-home-main">
        <section className="ref-hero">
          <div className="ref-hero-copy">
            <span className="ref-eyebrow">
              <span /> YOUR NEXT DRAWING STARTS HERE
            </span>
            <h1>
              Find the pose.
              <br />
              <em>See the possibility.</em>
            </h1>
            <p>
              Build a little scene. Find your angle. Bring a new sense of depth
              to your next drawing.
            </p>
            <div className="ref-create-fields">
              <label>
                Scene name
                <input
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !busy) void create(true)
                  }}
                />
              </label>
              <label>
                Canvas format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="1600x1200">Landscape · 4:3</option>
                  <option value="1200x1600">Portrait · 3:4</option>
                  <option value="1600x1600">Square · 1:1</option>
                  <option value="1920x1080">Widescreen · 16:9</option>
                </select>
              </label>
            </div>
            <div className="ref-actions">
              <button
                className="ref-primary"
                disabled={busy}
                onClick={() => void create(true)}
              >
                <Plus size={16} /> Create scene <ArrowRight size={15} />
              </button>
              <button
                className="ref-button"
                disabled={busy}
                onClick={() => void create(false)}
              >
                Start empty
              </button>
            </div>
            <div className="ref-hero-steps">
              <span>
                <PersonStanding size={15} /> Pose
              </span>
              <i>→</i>
              <span>
                <Camera size={15} /> Frame
              </span>
              <i>→</i>
              <span>
                <Sun size={15} /> Light
              </span>
              <i>→</i>
              <span>Draw</span>
            </div>
          </div>
          <div className="ref-hero-art">
            <SceneIllustration />
          </div>
        </section>
        {error && (
          <div role="alert" className="ref-error">
            {error}
          </div>
        )}
        <section className="ref-gallery">
          <div className="ref-section-top">
            <div>
              <h2>
                Your scenes <span>{projects.length}</span>
              </h2>
              <p>
                Saved on this device. Export a project to keep a portable copy.
              </p>
            </div>
            <div className="ref-actions">
              <label className="ref-search">
                <Search size={15} />
                <input
                  aria-label="Search scenes"
                  placeholder="Search scenes…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                className="ref-button"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Upload size={14} /> Import project
              </button>
              <input
                type="file"
                hidden
                ref={input}
                accept=".json,.reference-3d.json"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void load(f)
                }}
              />
            </div>
          </div>
          {loading ? (
            <div className="ref-empty">Opening your scene library…</div>
          ) : !filtered.length ? (
            <div className="ref-empty">
              <FolderOpen size={30} />
              <strong>
                {query
                  ? 'No matching scenes'
                  : 'Make room for your imagination'}
              </strong>
              <span>
                {query
                  ? 'Try another scene name.'
                  : 'Create your first scene with a figure, a floor, and a little light.'}
              </span>
            </div>
          ) : (
            <div className="ref-projects">
              {filtered.map((project) => (
                <article className="ref-project" key={project.id}>
                  <button
                    className="ref-project-open"
                    onClick={() => open(project.id)}
                  >
                    <div className="ref-project-image">
                      <SceneIllustration small />
                      <span>{project.objectCount} objects</span>
                    </div>
                    <strong>{project.name}</strong>
                    <small>
                      {project.width} × {project.height} <span>·</span>{' '}
                      {formatUpdated(project.updatedAt)}
                    </small>
                  </button>
                  <button
                    className="ref-project-delete"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => void remove(project)}
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
