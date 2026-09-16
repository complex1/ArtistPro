import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Brush, Check, FolderOpen, Layers, Maximize2, Plus, Search, Trash2, Upload } from 'lucide-react'
import { formatUpdated } from '@artist-studio/utils'
import { MAX_CANVAS_DIMENSION, MAX_PROJECT_BYTES } from './document'
import { createProject, deleteProject, importProject, listProjects, type ProjectSummary } from './library'
import './drawing-home.css'

const PRESETS = [
  { id: 'landscape', name: 'Landscape', width: 1600, height: 1200 },
  { id: 'square', name: 'Square', width: 1600, height: 1600 },
  { id: 'portrait', name: 'Portrait', width: 1200, height: 1600 },
] as const

function CanvasArtwork() {
  return (
    <div className="dc-home-artwork">
      <svg viewBox="0 0 520 420" role="img" aria-label="An expressive abstract landscape painted in coral, golden yellow, and deep blue">
        <defs>
          <linearGradient id="dc-home-paper" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffedce" /><stop offset="1" stopColor="#f6d7c3" /></linearGradient>
          <clipPath id="dc-home-paper-clip"><rect x="68" y="36" width="384" height="330" rx="4" /></clipPath>
          <pattern id="dc-home-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#f2c5a9" opacity=".16" /></pattern>
        </defs>
        <rect width="520" height="420" fill="url(#dc-home-dots)" />
        <rect x="75" y="47" width="384" height="330" rx="4" fill="#151923" opacity=".35" transform="rotate(-6 260 206)" />
        <g transform="rotate(-6 260 206)">
          <rect x="68" y="36" width="384" height="330" rx="4" fill="url(#dc-home-paper)" />
          <g clipPath="url(#dc-home-paper-clip)">
            <circle cx="331" cy="135" r="51" fill="#ecae4c" />
            <path d="M43 247Q121 149 181 221T343 211T487 193V389H43Z" fill="#d88677" />
            <path d="M38 300Q141 204 222 251T346 254T491 240V395H38Z" fill="#c36362" />
            <path d="M22 349Q131 258 204 302T363 292T492 302V409H22Z" fill="#304c64" />
            <path d="M52 356Q168 304 241 341T459 333" stroke="#233b53" strokeWidth="23" fill="none" strokeLinecap="round" />
            <g stroke="#fae3bd" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".85">
              <path d="M93 160q28-24 50-21m-40 33q25-21 41-19m-29 26q21-18 37-17" />
              <path d="M376 293l17-48m-12 33 25-14m-20 4-4-21m8 17 24-15m-6 38 12-32" />
            </g>
            <g fill="#f8d399" opacity=".9"><circle cx="285" cy="202" r="3" /><circle cx="295" cy="213" r="2" /><circle cx="314" cy="200" r="2" /><circle cx="306" cy="220" r="3" /><circle cx="322" cy="213" r="2" /></g>
          </g>
        </g>
        <g transform="rotate(30 423 287)"><rect x="417" y="215" width="12" height="122" rx="6" fill="#e9c6a0" /><rect x="417" y="316" width="12" height="21" fill="#c5a8a0" /><path d="M417 337h12l-6 19z" fill="#324354" /></g>
      </svg>
      <div className="dc-home-artwork-label"><span /><span>A little room for a big idea.</span></div>
      <div className="dc-home-palette" aria-hidden="true">{['#efb856', '#edc8a4', '#d18172', '#a94f57', '#304c64'].map((color) => <i key={color} style={{ background: color }} />)}</div>
    </div>
  )
}

export function DrawingHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState('Untitled canvas')
  const [preset, setPreset] = useState('landscape')
  const [width, setWidth] = useState('1600')
  const [height, setHeight] = useState('1200')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const active = useRef(true)
  const refresh = useCallback(async () => {
    try {
      const next = await listProjects()
      if (active.current) setProjects(next)
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'Could not open your canvas library.')
    } finally {
      if (active.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    active.current = true
    void Promise.resolve().then(refresh)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { active.current = false; window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const open = (id: string) => { window.location.hash = `#/drawing-canvas/${encodeURIComponent(id)}` }
  const create = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try { open((await createProject(name, Number(width), Number(height))).id) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this canvas.') }
    finally { setBusy(false) }
  }
  const importFile = async (file: File) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (file.size > MAX_PROJECT_BYTES + 1024 * 1024) throw new Error('Choose a Drawing Canvas project smaller than 129 MB.')
      open((await importProject(JSON.parse(await file.text()))).id)
    } catch (reason) {
      setError(reason instanceof SyntaxError ? 'This file is not valid project JSON.' : reason instanceof Error ? reason.message : 'Could not import this project.')
    } finally { setBusy(false) }
  }
  const remove = async (project: ProjectSummary) => {
    if (busy || !window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try { await deleteProject(project.id); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this canvas.') }
    finally { setBusy(false) }
  }
  const visibleProjects = projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="dc-home-shell">
      <header className="dc-home-topbar">
        <button type="button" className="dc-home-back" onClick={() => { window.location.hash = '#/' }}><ArrowLeft size={15} /> Artist Pro</button>
        <span className="dc-home-divider" />
        <span className="dc-home-brand"><Brush size={19} /><strong>Drawing Canvas</strong></span>
        <span className="dc-home-local">Your browser. Your sketchbook.</span>
      </header>
      <main className="dc-home-main">
        <section className="dc-home-hero">
          <div className="dc-home-copy">
            <span className="dc-home-eyebrow"><span /> MAKE ROOM FOR YOUR IDEAS</span>
            <h1>Every idea starts<br />with a <em>mark.</em></h1>
            <p>Sketch, paint, and find your own rhythm. A canvas with expressive brushes, layers, and room to experiment.</p>
            <form className="dc-home-create-form" onSubmit={(event) => { event.preventDefault(); void create() }}>
              <label className="dc-home-name"><span>Canvas name</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Give your idea a name" /></label>
              <fieldset className="dc-home-presets"><legend>Choose your canvas</legend>
                {PRESETS.map((option) => (
                  <button type="button" key={option.id} className={preset === option.id ? 'is-selected' : ''} aria-pressed={preset === option.id} onClick={() => { setPreset(option.id); setWidth(String(option.width)); setHeight(String(option.height)) }}>
                    <i style={{ aspectRatio: `${option.width} / ${option.height}`, width: option.id === 'portrait' ? 13 : 18 }} />
                    <span>{option.name}</span>{preset === option.id && <Check size={11} />}
                  </button>
                ))}
                <button type="button" className={preset === 'custom' ? 'is-selected' : ''} aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}><Maximize2 size={15} /><span>Custom</span></button>
              </fieldset>
              <div className="dc-home-dimensions">
                {preset === 'custom' ? <>
                  <label><span>Width</span><input type="number" min="1" max={MAX_CANVAS_DIMENSION} step="1" required value={width} onChange={(event) => setWidth(event.target.value)} /> px</label>
                  <span aria-hidden="true">×</span>
                  <label><span>Height</span><input type="number" min="1" max={MAX_CANVAS_DIMENSION} step="1" required value={height} onChange={(event) => setHeight(event.target.value)} /> px</label>
                </> : <span>{width} × {height} px <i /> White background</span>}
              </div>
              <button className="dc-home-primary" type="submit" disabled={busy}><Plus size={16} />{busy ? 'Opening canvas…' : 'Create canvas'}<ArrowUpRight size={15} /></button>
            </form>
          </div>
          <CanvasArtwork />
        </section>
        <div className="dc-home-features">
          <span><Brush size={20} /><strong>Find your brush</strong><small>Ink, pencil, marker, airbrush & flat</small></span>
          <span><Layers size={20} /><strong>Build it in layers</strong><small>Blend, organize, and keep experimenting</small></span>
          <span><Maximize2 size={20} /><strong>Make your next move</strong><small>Select, move, scale & rotate your artwork</small></span>
        </div>
        {error && <p className="dc-home-error" role="alert">{error}</p>}
        <section className="dc-home-library" aria-label="Your canvases">
          <div className="dc-home-section-head">
            <div><h2>Your canvases <span>{projects.length}</span></h2><p>Saved in this browser. Export a project from the editor to keep a portable copy.</p></div>
            <div className="dc-home-library-actions">
              {projects.length > 0 && <label className="dc-home-search"><Search size={14} /><input aria-label="Search canvases" placeholder="Search canvases" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
              <button type="button" className="dc-home-secondary" disabled={busy} onClick={() => importInput.current?.click()}><Upload size={14} />Import project</button>
              <input ref={importInput} hidden type="file" accept=".json,.drawing-canvas.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} />
            </div>
          </div>
          {loading ? <div className="dc-home-empty" role="status">Opening your canvas library…</div> : visibleProjects.length === 0 ? (
            <div className="dc-home-empty"><FolderOpen size={28} /><strong>{query ? 'No matching canvases' : 'Your next favorite drawing starts here'}</strong><span>{query ? 'Try another canvas name.' : 'Choose a size above, pick a brush, and make your first mark.'}</span></div>
          ) : <div className="dc-home-projects">{visibleProjects.map((project) => (
            <article className="dc-home-project" key={project.id}>
              <button type="button" className="dc-home-project-open" disabled={busy} onClick={() => open(project.id)}>
                <div className="dc-home-project-art"><div className="dc-home-mini-canvas" style={{ aspectRatio: `${project.width} / ${project.height}` }}><Brush size={26} strokeWidth={1.2} /></div><span>{project.width} × {project.height}</span></div>
                <strong>{project.name}</strong><small>{project.layerCount} {project.layerCount === 1 ? 'layer' : 'layers'} · {formatUpdated(project.updatedAt)}</small>
              </button>
              <button type="button" className="dc-home-delete" disabled={busy} aria-label={`Delete ${project.name}`} onClick={() => { void remove(project) }}><Trash2 size={14} /></button>
            </article>
          ))}</div>}
        </section>
      </main>
    </div>
  )
}
