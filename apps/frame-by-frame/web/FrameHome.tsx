import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Clapperboard, Copy, Film, FolderOpen, Layers, Plus, Search, Trash2, Upload } from 'lucide-react'
import { formatRelativeTime } from '@artist-studio/utils'
import { createProject, deleteProject, importProject, listProjects, type ProjectSummary } from './library'
import { createDocument, id, MAX_BYTES } from './model'
import { thumbnail } from './raster'
import './frame-by-frame.css'

const presets = [{ name: 'HD landscape', width: 1280, height: 720 }, { name: 'Square', width: 1080, height: 1080 }, { name: 'Portrait', width: 720, height: 1280 }, { name: 'Full HD', width: 1920, height: 1080 }]
const openShot = (projectId: string) => { window.location.hash = `#/frame-by-frame/${encodeURIComponent(projectId)}` }

function FilmArtwork() {
  return <div className="fbf-home-art" aria-hidden="true"><span className="fbf-art-note">ONE DRAWING. THEN ANOTHER.</span><svg viewBox="0 0 600 330"><defs><pattern id="fbf-paper-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#bba885" opacity=".4" /></pattern></defs><path d="M70 241Q275-100 523 239" stroke="#ba9a66" strokeWidth="1.5" fill="none" strokeDasharray="4 6" />{[0, 1, 2].map((index) => <g key={index} transform={`translate(${35 + index * 169} ${72 + (index === 1 ? -26 : 20)}) rotate(${[-9, 2, 10][index]} 83 93)`}><rect x="5" y="9" width="168" height="187" rx="8" fill="#0e1015" opacity=".3" /><rect width="168" height="187" rx="7" fill="#f4eddd" /><rect x="10" y="10" width="148" height="151" rx="3" fill="url(#fbf-paper-dots)" /><path d="M25 143H144" stroke="#b2a58f" strokeWidth="1.5" /><ellipse cx="86" cy="145" rx={index === 1 ? 18 : 31} ry="4" fill="#cec3ac" /><ellipse cx="85" cy={index === 1 ? 69 : 115} rx={index === 1 ? 25 : 31} ry={index === 1 ? 31 : 24} fill={index === 1 ? '#d79555' : '#90afa2'} stroke="#3d5148" strokeWidth="2" /><path d={`M76 ${index === 1 ? 77 : 120}q10 8 19-1`} fill="none" stroke="#3d5148" strokeWidth="2" strokeLinecap="round" /><circle cx="77" cy={index === 1 ? 66 : 110} r="2" fill="#3d5148" /><circle cx="95" cy={index === 1 ? 66 : 110} r="2" fill="#3d5148" /><text x="14" y="177" fontSize="8" fontFamily="monospace" fill="#7c735f">DRAWING {String(index + 1).padStart(2, '0')}</text><circle cx="148" cy="174" r="3" fill="#b29b74" /></g>)}</svg><span className="fbf-art-caption"><i />A little patience. A little magic.</span></div>
}

async function demoShot() {
  const doc = createDocument('Bouncing ball · study', 960, 540, 12)
  const canvas = document.createElement('canvas'); canvas.width = doc.width; canvas.height = doc.height
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = '#c4b9a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(100, 435); ctx.lineTo(860, 435); ctx.stroke()
  const ground = { id: id(), name: 'Ground', visible: true, locked: true, opacity: 1, cels: [{ id: id(), start: 0, duration: 24, dataUrl: canvas.toDataURL(), thumbnail: thumbnail(canvas) }] }
  const cels = Array.from({ length: 12 }, (_, index) => {
    ctx.clearRect(0, 0, doc.width, doc.height)
    const lift = Math.sin(Math.PI * index / 12), y = 390 - lift * 235
    ctx.fillStyle = '#dfa665'; ctx.strokeStyle = '#574c40'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.ellipse(480, y, 49 - lift * 6, 41 + lift * 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#574c40'; ctx.beginPath(); ctx.arc(464, y - 6, 3, 0, Math.PI * 2); ctx.arc(495, y - 6, 3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.moveTo(466, y + 10); ctx.quadraticCurveTo(480, y + 22, 496, y + 10); ctx.stroke()
    return { id: id(), start: index * 2, duration: 2, dataUrl: canvas.toDataURL(), thumbnail: thumbnail(canvas) }
  })
  return importProject({ ...doc, layers: [ground, { ...doc.layers[0], name: 'Bouncing ball', cels }] })
}

export function FrameHome() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]), [name, setName] = useState('Untitled shot')
  const [preset, setPreset] = useState(0), [fps, setFps] = useState(12), [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null), busyRef = useRef(false)
  const refresh = async () => { try { setProjects(await listProjects()); setError(null) } catch (e) { setError(String(e instanceof Error ? e.message : e)) } finally { setLoading(false) } }
  useEffect(() => { let active = true; void listProjects().then(projects => { if (active) setProjects(projects) }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load shots.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(null)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete this action.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  const filtered = projects.filter(project => project.name.toLowerCase().includes(query.toLowerCase()))
  return <div className="fbf-home"><header className="fbf-home-header"><button onClick={() => { window.location.hash = '#/' }}><ArrowLeft size={15} />Artist Pro</button><span /><Clapperboard size={20} /><strong>FrameByFrame Animation</strong><small>Your animation sketchbook</small></header><main className="fbf-home-main">
    <div className="fbf-home-kicker"><i />MAKE EVERY FRAME COUNT<span>Hand-drawn stories start here.</span></div>
    <section className="fbf-home-hero"><div><span className="fbf-eyebrow">A STUDIO FOR THE IN-BETWEEN MOMENTS</span><h1>Little drawings.<br /><em>Living stories.</em></h1><p>Find the movement between your ideas. Draw a pose, turn the page, and bring your story to life—one frame at a time.</p><button className="fbf-demo" disabled={busy} onClick={() => void run(async () => openShot((await demoShot()).id))}><Film size={15} />Explore a bouncing ball study<ArrowRight size={15} /></button></div><FilmArtwork /></section>
    <form className="fbf-create-row" onSubmit={event => { event.preventDefault(); void run(async () => { const size = presets[preset]; openShot((await createProject(name, size.width, size.height, fps)).id) }) }}><div className="fbf-create-title"><Plus size={21} /><span><strong>A fresh start</strong><small>Create your next shot</small></span></div><label>Shot name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label><label>Canvas<select value={preset} onChange={event => setPreset(Number(event.target.value))}>{presets.map((item, index) => <option key={item.name} value={index}>{item.name} · {item.width} × {item.height}</option>)}</select></label><label>Frame rate<select value={fps} onChange={event => setFps(Number(event.target.value))}>{[8, 12, 24, 25, 30, 60].map(value => <option key={value} value={value}>{value} fps</option>)}</select></label><button className="fbf-primary" disabled={busy}>{busy ? 'Opening…' : 'Create shot'}<ArrowRight size={15} /></button></form>
    <div className="fbf-home-features"><span><Copy size={19} /><strong>See the motion</strong><small>Colored onion skins guide your next drawing.</small></span><span><Film size={19} /><strong>Find your rhythm</strong><small>Hold drawings, adjust timing, and play it back.</small></span><span><Layers size={19} /><strong>Build your scene</strong><small>Keep characters and backgrounds on separate layers.</small></span></div>
    {error && <div className="fbf-error" role="alert">{error}<button onClick={() => void refresh()}>Retry</button></div>}
    <section className="fbf-shot-library"><div className="fbf-library-title"><div><span className="fbf-eyebrow">PICK UP YOUR PENCIL</span><h2>Your shots <small>{projects.length}</small></h2><p>Saved in this browser. Export a project to keep a portable copy.</p></div><label className="fbf-search"><Search size={14} /><input value={query} placeholder="Search shots" aria-label="Search shots" onChange={event => setQuery(event.target.value)} /></label><button className="fbf-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={14} />Import project</button><input ref={input} type="file" accept=".json,.framebyframe.json" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { if (file.size > MAX_BYTES * 1.1) throw new Error('Choose a project smaller than 140 MB.'); openShot((await importProject(JSON.parse(await file.text()))).id) }) }} /></div>
      {loading ? <p className="fbf-empty">Loading your shots…</p> : !filtered.length ? <div className="fbf-empty"><FolderOpen size={28} /><strong>{query ? 'No matching shots' : 'Your first story is waiting to happen.'}</strong><span>{query ? 'Try a different name.' : 'Start a fresh shot or open the bouncing ball study above.'}</span></div> : <div className="fbf-shot-grid">{filtered.map(project => <article key={project.id}><button className="fbf-shot-open" onClick={() => openShot(project.id)}><div className="fbf-shot-cover"><Film size={40} strokeWidth={1} /><span>{project.fps} FPS</span><i>{project.duration} FRAMES</i></div><strong>{project.name}</strong><small>{project.width} × {project.height} · {formatRelativeTime(project.updatedAt)}</small></button><button className="fbf-shot-delete" aria-label={`Delete ${project.name}`} onClick={() => { if (window.confirm(`Delete “${project.name}”? This cannot be undone.`)) void run(async () => { await deleteProject(project.id); await refresh() }) }}><Trash2 size={14} /></button></article>)}</div>}
    </section></main></div>
}
