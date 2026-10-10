import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Clapperboard, FolderOpen, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import { createProject, deleteProject, importProject, listProjects } from './library'
import { parseProject } from './model'
import type { ProjectSummary } from './types'
import './anime.css'

export function AnimeHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState('Untitled shot')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const refresh = useCallback(() => {
    void listProjects().then(value => { setProjects(value); setError('') }).catch(error => setError(error instanceof Error ? error.message : 'Could not read your projects.')).finally(() => setLoading(false))
  }, [])
  useEffect(() => { refresh(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [refresh])
  const open = (id: string) => { window.location.hash = `#/anime-3d/${encodeURIComponent(id)}` }
  async function create(sample: boolean) {
    setBusy(true); setError('')
    try { open((await createProject(sample ? 'First wave' : name.trim() || 'Untitled shot', sample)).id) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not create your shot.') }
    finally { setBusy(false) }
  }
  async function load(file: File) {
    setBusy(true); setError('')
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose an Anime 3D project smaller than 8 MiB.')
      open((await importProject(parseProject(await file.text()))).id)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not import the project.') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  async function remove(project: ProjectSummary) {
    if (!window.confirm(`Delete “${project.name}” from this browser? Download a project copy first if you need to keep it.`)) return
    try { await deleteProject(project.id); refresh() }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not delete the project.') }
  }
  return <div className="an-theme an-home">
    <header className="an-home-header"><button className="an-button an-quiet" onClick={() => { window.location.hash = '#/' }}><ArrowLeft size={16} /> Artist Studio</button><span className="an-divider" /><Clapperboard size={20} /><strong>Anime 3D</strong><span className="an-tag">EARLY STUDIO</span></header>
    <main className="an-home-main">
      <section className="an-hero">
        <div><span className="an-eyebrow">A SMALL SHOT. A NEW DIMENSION.</span><h1>Draw a little.<br /><em>Bring it to life.</em></h1><p>Pose your character, sketch in space, and find your shot. One canvas from first idea to final frame.</p>
          <label className="an-field">Shot name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !busy) void create(false) }} /></label>
          <div className="an-actions"><button className="an-button an-primary" disabled={busy} onClick={() => void create(false)}><Plus size={16} /> New shot</button><button className="an-button" disabled={busy} onClick={() => void create(true)}><Sparkles size={16} /> Try First wave</button></div>
          <span className="an-muted">One starter character · 24 frames at 24 fps · 1280 × 720</span>
        </div>
        <div className="an-hero-art" aria-label="Anime character with a three-pose timeline" role="img">
          <div className="an-art-caption"><span>SHOT 01 / FIRST WAVE</span><span>● CEL PREVIEW</span></div>
          <svg viewBox="0 0 480 340" aria-hidden="true"><path d="M20 270 240 170 460 270 240 370Z" fill="#d5ded5" /><g stroke="#a8b6ac" strokeWidth="1" opacity=".6">{[0,1,2,3,4,5,6].map(i => <g key={i}><path d={`M${20+i*36.7} ${270-i*16.7}l220 100`} /><path d={`M${240+i*36.7} ${170+i*16.7}l-220 100`} /></g>)}</g><ellipse cx="240" cy="283" rx="70" ry="12" fill="#a8b6ac" opacity=".4" /><g stroke="#323f42" strokeWidth="4" strokeLinejoin="round"><path d="m219 217-12 64h21l12-52 9 52h21l-13-66" fill="#445667" /><path d="m220 127-36 38-31-26-10 15 42 35 42-33m31-30 35 12 16-47 17 5-16 67-54-9" fill="#f1cbb3" /><path d="m222 114-13 45 4 63q27 12 54-1l-1-63-12-44" fill="#758e77" /><path d="m230 121 9 23 10-23" fill="#f5e7d0" /><path d="M208 63q30-37 59 0l-3 35q-26 42-53 0Z" fill="#f1cbb3" /><path d="M207 85q-13-32 10-39 26-20 49 2 19 17 3 42l-8-26-16 6-6-15-15 19-14-4Z" fill="#384757" /></g><g fill="#29363b"><ellipse cx="226" cy="87" rx="3" ry="5" /><ellipse cx="252" cy="87" rx="3" ry="5" /></g><path d="M233 104q7 5 14-1" stroke="#af796d" strokeWidth="2" fill="none" /><path d="M342 66q21 20 0 42m14-49q30 31 2 57" stroke="#76987c" strokeWidth="4" fill="none" strokeLinecap="round" /><g stroke="#668b72" strokeWidth="2" fill="#e6eee5"><circle cx="315" cy="94" r="9" /><circle cx="239" cy="217" r="6" /></g><g stroke="#6d8576" strokeWidth="2" fill="none"><path d="M73 82V62h22m290 0h22v20M73 270v20h22m290 0h22v-20" /></g></svg>
          <div className="an-art-timeline"><span>01 ◆ Neutral</span><span>09 ◆ Wave</span><span>17 ◆ Turn</span><span>24</span></div>
        </div>
      </section>
      {error && <div className="an-alert" role="alert">{error}<button className="an-button" onClick={refresh}>Retry</button></div>}
      <section className="an-library"><div className="an-library-heading"><div><span className="an-eyebrow">YOUR STUDIO</span><h2>Recent shots</h2></div><div className="an-actions"><input className="an-search" type="search" aria-label="Search shots" placeholder="Find a shot…" value={query} onChange={event => setQuery(event.target.value)} /><button className="an-button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15} /> Open project file</button><input ref={fileInput} type="file" accept=".json,.anime-3d.json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void load(file) }} /></div></div>
        <p className="an-muted">Automatically saved in this browser. Download a project file to keep a portable copy.</p>
        {loading ? <p role="status">Opening your studio…</p> : <div className="an-project-grid">{projects.filter(project => project.name.toLowerCase().includes(query.toLowerCase())).map(project => <article className="an-project-card" key={project.id}><button className="an-project-open" onClick={() => open(project.id)}><div className="an-project-preview"><Clapperboard size={38} strokeWidth={1} /><span>24 FRAMES / 01 SECOND</span></div><strong>{project.name}</strong><span className="an-muted">{new Date(project.updatedAt).toLocaleString()} · 720p</span><span className="an-project-cta">Open shot <ArrowRight size={16} /></span></button><button className="an-project-delete an-button an-quiet" aria-label={`Delete ${project.name}`} onClick={() => void remove(project)}><Trash2 size={15} /></button></article>)}</div>}
        {!loading && !projects.length && <div className="an-empty"><FolderOpen size={28} strokeWidth={1.5} /><h3>Your first scene starts here</h3><p>Create a shot above or open a saved Anime 3D project.</p></div>}
        {!loading && projects.length > 0 && !projects.some(project => project.name.toLowerCase().includes(query.toLowerCase())) && <p className="an-muted">No shots match “{query}”.</p>}
      </section>
    </main>
  </div>
}
