import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bone, Box, Camera, Check, ChevronLeft, ChevronRight, Clapperboard, Download, Eye, EyeOff, HelpCircle, Layers, Lock, Maximize, MousePointer2, Palette, Pause, Pencil, Play, Plus, Redo2, Save, Sparkles, Trash2, Undo2, Unlock, X } from 'lucide-react'
import { getProject } from './library'
import { createPose, evaluatePose, JOINT_LABELS, JOINTS, movePoseKey, POSE_PRESETS, removePoseKey, setPoseKey } from './model'
import type { AnimeDocument, JointName, Pose, ProjectRecord, Stroke, Vec3 } from './types'
import { AnimeViewport, type AnimeViewportHandle, type AnimeViewportProps } from './AnimeViewport'
import { ColorField, NumberField, Toggle } from './Controls'
import { downloadBlob, downloadProject, safeName } from './files'
import { useProjectHistory } from './useProjectHistory'
import './anime.css'

type Workflow = AnimeViewportProps['workflow']
const WORKFLOWS: { id: Workflow; icon: typeof Box; description: string }[] = [
  { id: 'Build', icon: Box, description: 'Place your character and set the scene.' },
  { id: 'Pose', icon: Bone, description: 'Drag a hand or foot to pose. Every edit creates a pose key.' },
  { id: 'Draw', icon: Pencil, description: 'Draw on the highlighted plane. Alt + drag to look around.' },
  { id: 'Animate', icon: Clapperboard, description: 'Arrange pose keys. Each pose holds until the next key.' },
  { id: 'Camera', icon: Camera, description: 'Explore freely, then capture your view as the shot.' },
  { id: 'Render', icon: Sparkles, description: 'The shot camera defines your exported frame.' },
]

export function AnimeEditor({ projectId }: { projectId: string }) {
  const [record, setRecord] = useState<ProjectRecord>()
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setRecord(undefined); setError('')
    void getProject(projectId).then(value => {
      if (!active) return
      if (value) setRecord(value)
      else setError('This shot is not stored in this browser. Open a downloaded project file from the studio.')
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not open this shot.') })
    return () => { active = false }
  }, [projectId])
  if (!record) return <div className="an-theme an-loading"><Clapperboard size={32} /><h2>{error ? 'Could not open this shot' : 'Opening your shot…'}</h2>{error && <p role="alert">{error}</p>}<button className="an-button" onClick={() => { window.location.hash = '#/anime-3d' }}><ArrowLeft size={16} /> Anime 3D studio</button></div>
  return <Studio key={record.id} record={record} />
}

function Studio({ record }: { record: ProjectRecord }) {
  const { document: doc, commit, undo, redo, canUndo, canRedo, saveState, saveError, saveNow, allowNavigation } = useProjectHistory(record)
  const [workflow, setWorkflow] = useState<Workflow>('Pose')
  const [selection, setSelection] = useState<'character' | 'drawing' | 'camera'>('character')
  const [frame, setFrame] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [view, setView] = useState<'explore' | 'shot'>('explore')
  const [joint, setJoint] = useState<JointName>('leftHand')
  const [drawSettings, setDrawSettings] = useState<AnimeViewportProps['drawSettings']>({ plane: 'front', depth: 0, color: '#425f53', width: .012 })
  const [strokeId, setStrokeId] = useState<string | null>(null)
  const [targetFrame, setTargetFrame] = useState(9)
  const [notice, setNotice] = useState('Your shot is ready. Select a hand or foot to begin.')
  const [error, setError] = useState('')
  const [title, setTitle] = useState(doc.name)
  const [help, setHelp] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportResult, setExportResult] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const viewport = useRef<AnimeViewportHandle>(null)
  const exportToken = useRef(0)
  const playStart = useRef(frame)
  const looping = useRef(loop)
  looping.current = loop
  const dialog = useRef<HTMLDialogElement>(null)
  const pose = evaluatePose(doc, frame)
  const currentKey = doc.keys.find(key => key.frame === frame)
  const heldFrom = doc.keys.filter(key => key.frame <= frame).at(-1)?.frame ?? 1
  const selectedStroke = doc.strokes.find(stroke => stroke.id === strokeId)
  const canPose = !doc.character.locked && doc.character.visible && !playing

  useEffect(() => { setTitle(doc.name); setDownloaded(false) }, [doc])
  useEffect(() => () => { exportToken.current++ }, [])
  useEffect(() => {
    if (exportOpen || help) { if (!dialog.current?.open) dialog.current?.showModal() }
    else dialog.current?.close()
  }, [exportOpen, help])

  useEffect(() => {
    if (!playing) return
    let request = 0
    const started = performance.now()
    const initial = playStart.current
    const tick = (now: number) => {
      const next = initial + Math.floor((now - started) * 24 / 1000)
      if (next > 24 && !looping.current) { setFrame(24); setPlaying(false); return }
      setFrame(((next - 1) % 24) + 1)
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [playing])

  const edit = useCallback((change: (current: AnimeDocument) => AnimeDocument, message: string) => {
    setPlaying(false)
    try { commit(change); setError(''); setNotice(message); return true }
    catch (error) { setError(error instanceof Error ? error.message : 'The change could not be applied.'); return false }
  }, [commit])
  const updatePose = useCallback((next: Pose) => {
    if (!canPose) return
    edit(current => setPoseKey(current, frame, next), `Pose key saved at frame ${frame}.`)
  }, [canPose, edit, frame])
  const addStroke = useCallback((stroke: Stroke) => {
    edit(current => ({ ...current, strokes: [...current.strokes, stroke] }), 'Stroke added in world space. Orbit to inspect its depth.')
    setStrokeId(stroke.id); setSelection('drawing')
  }, [edit])
  const reportError = useCallback((message: string) => setError(message), [])
  const chooseJoint = useCallback((next: JointName) => { setJoint(next); setSelection('character') }, [])
  function togglePlayback() {
    if (playing) setPlaying(false)
    else { playStart.current = frame === 24 ? 1 : frame; setFrame(playStart.current); setPlaying(true) }
  }
  function scrub(next: number) { setPlaying(false); setFrame(Math.max(1, Math.min(24, Math.round(next)))) }
  function switchWorkflow(next: Workflow) {
    setPlaying(false); setWorkflow(next)
    if (next === 'Draw') setSelection('drawing')
    if (next === 'Pose' || next === 'Build') setSelection('character')
    if (next === 'Camera' || next === 'Render') setSelection('camera')
    if (next === 'Render') setView('shot')
    setNotice(WORKFLOWS.find(item => item.id === next)!.description)
  }
  function download() { downloadProject(doc); setDownloaded(true); setNotice('Portable project download started. Browser autosave stays separate.') }
  function removeStroke() {
    if (!strokeId) return
    edit(current => ({ ...current, strokes: current.strokes.filter(stroke => stroke.id !== strokeId) }), 'Stroke deleted. Undo restores it.')
    setStrokeId(null)
  }
  function transferKey(from: number, to: number, duplicate = false) {
    to = Math.round(to)
    if (from === to) return
    const occupied = doc.keys.some(key => key.frame === to)
    if (occupied && !window.confirm(`Frame ${to} already has a pose. Replace it? You can undo this change.`)) return
    if (edit(current => duplicate ? setPoseKey(current, to, evaluatePose(current, from)) : movePoseKey(current, from, to, occupied), `${duplicate ? 'Copied' : 'Moved'} pose to frame ${to}.`)) scrub(to)
  }
  function changeRotation(axis: number, value: number) {
    const next = structuredClone(pose)
    next[joint][axis] = value
    updatePose(next)
  }
  async function leave() {
    setLeaving(true); setPlaying(false)
    if (saveState !== 'saved' && !(await saveNow()) && !window.confirm('This shot has changes that could not be saved. Cancel to download a project file, or leave without saving?')) { setLeaving(false); return }
    allowNavigation()
    window.location.hash = '#/anime-3d'
  }
  async function exportStill() {
    const token = ++exportToken.current
    setExporting(true); setExportResult(''); setError('')
    try {
      const output = await viewport.current?.exportPng()
      if (!output) throw new Error('The viewport is still loading. Try again in a moment.')
      if (exportToken.current !== token) return
      downloadBlob(output, `${safeName(doc.name)}-frame-${String(frame).padStart(2, '0')}.png`)
      setExportResult('Your PNG is rendered and the download has started.')
    } catch (error) {
      if (exportToken.current === token) setExportResult(error instanceof Error ? error.message : 'Could not render the frame. Your shot is still editable.')
    } finally { if (exportToken.current === token) setExporting(false) }
  }
  function closeDialog() { exportToken.current++; setExporting(false); setExportOpen(false); setHelp(false) }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (leaving) return
      const target = event.target as HTMLElement
      const typing = target.closest('input,select,textarea,[contenteditable=true]')
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        // Fields commit on blur; save the visible draft before reading the history snapshot.
        if (typing) target.blur()
        void saveNow()
        return
      }
      if (typing || exportOpen || help) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); setPlaying(false); if (event.shiftKey) redo(); else undo() }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); setPlaying(false); redo() }
      else if (event.code === 'Space') { event.preventDefault(); togglePlayback() }
      else if (event.key.toLowerCase() === 'f') { event.preventDefault(); setView('explore'); viewport.current?.frameCharacter() }
      else if (event.key === 'Escape') setPlaying(false)
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selection === 'drawing' && strokeId) { event.preventDefault(); removeStroke() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const appearance = (values: Partial<AnimeDocument['appearance']>) => edit(current => ({ ...current, appearance: { ...current.appearance, ...values } }), 'Scene appearance updated.')
  const character = (values: Partial<AnimeDocument['character']>) => edit(current => ({ ...current, character: { ...current.character, ...values } }), 'Character updated across the shot.')
  const statusLabel = saveState === 'saved' ? 'Saved in this browser' : saveState === 'saving' ? 'Saving…' : 'Save failed'

  return <div className="an-theme an-editor">
    <header className="an-topbar">
      <button className="an-button an-quiet" onClick={() => void leave()}><ArrowLeft size={16} /><span>Studio</span></button><span className="an-divider" /><Clapperboard size={21} className="an-accent" />
      <div className="an-title"><input aria-label="Shot name" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} onBlur={() => { const next = title.trim() || doc.name; setTitle(next); if (next !== doc.name) edit(current => ({ ...current, name: next }), 'Shot renamed.') }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /><span>ANIME 3D <b> / </b> SHOT 01</span></div>
      <span className={`an-save-state ${saveState}`} role="status">{saveState === 'saved' ? <Check size={13} /> : <Save size={13} />}{statusLabel}</span>
      <div className="an-actions"><button className="an-button an-icon" aria-label="Undo" title="Undo (Ctrl/Cmd Z)" disabled={!canUndo || playing} onClick={undo}><Undo2 size={16} /></button><button className="an-button an-icon" aria-label="Redo" title="Redo (Ctrl/Cmd Shift Z)" disabled={!canRedo || playing} onClick={redo}><Redo2 size={16} /></button><button className="an-button an-icon" aria-label="Save now" title="Save in this browser" onClick={() => void saveNow()}><Save size={16} /></button><button className="an-button" onClick={download}><Download size={15} /><span>Project file</span></button><button className="an-button an-primary" onClick={() => { setPlaying(false); switchWorkflow('Render'); setExportResult(''); setExportOpen(true) }}><Sparkles size={15} /> Export PNG</button><button className="an-button an-icon" aria-label="Help and shortcuts" onClick={() => setHelp(true)}><HelpCircle size={17} /></button></div>
    </header>
    <nav className="an-workflows" aria-label="Workflow">{WORKFLOWS.map(({ id, icon: Icon }) => <button key={id} aria-current={workflow === id ? 'page' : undefined} onClick={() => switchWorkflow(id)}><Icon size={16} />{id}</button>)}<span>01 SECOND <span> / </span> 24 FPS</span></nav>
    {(error || saveState === 'failed') && <div className="an-alert" role="alert"><span>{saveState === 'failed' ? `${saveError} Your current shot is still open. Download a project copy to keep it.` : error}</span>{saveState === 'failed' && <><button className="an-button" onClick={() => void saveNow()}>Retry save</button><button className="an-button" onClick={download}>Download project</button></>}<button className="an-button an-icon" aria-label="Dismiss message" onClick={() => setError('')} disabled={saveState === 'failed'}><X size={14} /></button></div>}
    <main className="an-workspace">
      <aside className="an-scene-panel"><div className="an-panel-heading"><Layers size={14} /><h2>Scene</h2><span>SHOT 01</span></div>
        <div className="an-scene-list">
          <div className={selection === 'character' ? 'an-scene-item selected' : 'an-scene-item'}><button onClick={() => setSelection('character')}><Bone size={15} /><span>Character 01<small>Starter rig</small></span></button><button aria-label={doc.character.visible ? 'Hide character' : 'Show character'} onClick={() => character({ visible: !doc.character.visible })}>{doc.character.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button><button aria-label={doc.character.locked ? 'Unlock character' : 'Lock character'} onClick={() => character({ locked: !doc.character.locked })}>{doc.character.locked ? <Lock size={13} /> : <Unlock size={13} />}</button></div>
          <div className={selection === 'drawing' ? 'an-scene-item selected' : 'an-scene-item'}><button onClick={() => setSelection('drawing')}><Pencil size={15} /><span>Drawing 01<small>{doc.strokes.length} strokes · world space</small></span></button></div>
          <div className={selection === 'camera' ? 'an-scene-item selected' : 'an-scene-item'}><button onClick={() => setSelection('camera')}><Camera size={15} /><span>Shot camera<small>Static · 16:9</small></span></button></div>
        </div>
        {selection === 'drawing' && <div className="an-stroke-list"><h3>Strokes</h3>{!doc.strokes.length && <p className="an-muted">Choose Draw and sketch on the highlighted plane.</p>}{doc.strokes.map((stroke, index) => <button className={stroke.id === strokeId ? 'selected' : ''} key={stroke.id} onClick={() => setStrokeId(stroke.id)}><span style={{ background: stroke.color }} />Stroke {index + 1}<small>{stroke.points.length} pts</small></button>)}</div>}
        <div className="an-scene-note"><span className="an-eyebrow">THE CREATIVE LOOP</span><p>Pose. Draw. Find your frame.</p><span>One character and one drawing layer, with room to explore.</span></div>
        <button className="an-button an-quiet an-wide" onClick={() => { setView('explore'); viewport.current?.frameCharacter() }}><Maximize size={14} /> Frame character</button>
      </aside>
      <section className="an-canvas-panel" aria-label="3D canvas">
        <div className="an-canvas-toolbar"><div className="an-view-switch"><button className={view === 'explore' && workflow !== 'Render' ? 'active' : ''} onClick={() => { if (workflow === 'Render') setWorkflow('Camera'); setView('explore') }}><MousePointer2 size={13} /> Explore</button><button className={view === 'shot' || workflow === 'Render' ? 'active' : ''} onClick={() => setView('shot')}><Camera size={13} /> Shot preview</button></div><span>{workflow === 'Draw' ? `${drawSettings.plane === 'view' ? 'View-facing' : drawSettings.plane} plane` : workflow === 'Pose' ? JOINT_LABELS[joint] : 'Shot 01'}</span><span className="an-canvas-frame">F {String(frame).padStart(2, '0')}</span></div>
        <div className="an-viewport-wrap"><AnimeViewport ref={viewport} document={doc} frame={frame} workflow={workflow} view={view} selectedJoint={joint} drawSettings={drawSettings} interactive={!playing && !leaving && !exporting} onPoseCommit={updatePose} onStrokeCommit={addStroke} onJointSelect={chooseJoint} onError={reportError} /></div>
        <div className="an-canvas-caption"><span>{WORKFLOWS.find(item => item.id === workflow)!.description}</span><span>{view === 'shot' || workflow === 'Render' ? 'OUTPUT CAMERA · 16:9' : 'ALT + DRAG ORBIT · WHEEL ZOOM'}</span></div>
      </section>
      <aside className="an-inspector"><div className="an-panel-heading"><Palette size={14} /><h2>{workflow === 'Animate' ? 'Pose timing' : workflow === 'Render' ? 'Render settings' : workflow}</h2><span>{workflow === 'Pose' || workflow === 'Animate' ? `F ${frame}` : 'SCENE'}</span></div><fieldset disabled={playing || exporting}>
        {workflow === 'Build' && <><div className="an-inspector-intro"><h3>Character 01</h3><p>Place the starter character. These changes apply throughout the shot.</p></div><div className="an-three-fields">{(['X','Y','Z'] as const).map((axis, index) => <NumberField key={axis} label={axis} value={doc.character.position[index]} min={-10} max={10} step={.1} suffix="m" disabled={doc.character.locked} onCommit={value => { const position: Vec3 = [...doc.character.position]; position[index] = value; character({ position }) }} />)}</div><NumberField label="Turn" value={doc.character.rotation} min={-360} max={360} disabled={doc.character.locked} onCommit={rotation => character({ rotation })} /><ColorField label="Jacket color" value={doc.appearance.characterColor} onCommit={characterColor => appearance({ characterColor })} /><ColorField label="Background" value={doc.appearance.background} onCommit={background => appearance({ background })} /><Toggle checked={doc.appearance.ground} onChange={ground => appearance({ ground })}>Show ground</Toggle><div className="an-hint">An original procedural starter character. Character and environment designers are planned for later versions.</div><button className="an-button an-primary an-wide" onClick={() => switchWorkflow('Pose')}><Bone size={15} /> Start posing</button></>}
        {workflow === 'Pose' && <><div className="an-inspector-intro"><h3>Shape a pose</h3><p>Drag the hand and foot handles, or adjust a joint here.</p></div><div className="an-pill"><span /> AUTO-KEY ON · WHOLE CHARACTER</div>{!canPose && <div className="an-hint">{doc.character.locked ? 'Unlock the character to pose it.' : 'Show the character to pose it.'}</div>}<label className="an-field">Selected joint<select value={joint} onChange={event => setJoint(event.target.value as JointName)}>{JOINTS.map(name => <option value={name} key={name}>{JOINT_LABELS[name]}</option>)}</select></label><div className="an-three-fields">{['X','Y','Z'].map((axis,index) => <NumberField key={axis} label={axis} value={pose[joint][index]} disabled={!canPose} onCommit={value => changeRotation(index,value)} />)}</div><div className="an-preset-heading">Pose presets</div><div className="an-pose-presets">{POSE_PRESETS.map(preset => <button key={preset.id} className="an-button" disabled={!canPose} onClick={() => updatePose(structuredClone(preset.pose))}>{preset.name}</button>)}</div><button className="an-button an-wide" disabled={!canPose} onClick={() => updatePose(pose)}><Plus size={14} /> Add current pose key</button><button className="an-button an-quiet an-wide" disabled={!canPose} onClick={() => updatePose(createPose())}>Reset pose at frame {frame}</button><p className="an-muted">{currentKey ? `Pose key at frame ${frame}.` : `Holding the pose from frame ${heldFrom}. An edit creates a key here.`}</p></>}
        {workflow === 'Draw' && <><div className="an-inspector-intro"><h3>Sketch in space</h3><p>Choose a plane and draw directly on the canvas.</p></div><label className="an-field">Drawing plane<select value={drawSettings.plane} onChange={event => setDrawSettings(current => ({ ...current, plane: event.target.value as typeof current.plane }))}><option value="front">Front · XY</option><option value="side">Side · YZ</option><option value="top">Top · XZ</option><option value="view">View-facing</option></select></label><NumberField label="Plane depth" value={drawSettings.depth} min={-5} max={5} step={.1} suffix="m" onCommit={depth => setDrawSettings(current => ({ ...current, depth }))} /><ColorField label="Ink color" value={drawSettings.color} onCommit={color => setDrawSettings(current => ({ ...current, color }))} /><NumberField label="Brush width" value={drawSettings.width} min={.002} max={.06} step={.002} suffix="m" onCommit={width => setDrawSettings(current => ({ ...current, width }))} /><div className="an-hint">Strokes stay in world space and appear for the whole shot. They do not move with the character.</div>{selectedStroke && <><h3>Selected stroke</h3><ColorField label="Stroke color" value={selectedStroke.color} onCommit={color => edit(current => ({ ...current, strokes: current.strokes.map(stroke => stroke.id === strokeId ? { ...stroke, color } : stroke) }), 'Stroke color changed.')} /><button className="an-button an-wide" onClick={removeStroke}><Trash2 size={14} /> Delete stroke</button></>}<span className="an-muted">{doc.strokes.length} / 200 strokes · Esc cancels a gesture</span></>}
        {workflow === 'Animate' && <><div className="an-inspector-intro"><h3>{currentKey ? `Pose key · frame ${frame}` : `Held pose · frame ${frame}`}</h3><p>A pose stays on screen until the next key. Move a key to change its timing.</p></div><div className="an-pill">HOLD · NO IN-BETWEENS</div><NumberField label="Destination frame" value={targetFrame} min={1} max={24} suffix="" onCommit={value => setTargetFrame(Math.round(value))} /><div className="an-actions"><button className="an-button" disabled={!currentKey || frame === 1 || frame === targetFrame} onClick={() => transferKey(frame, targetFrame)}>Move key</button><button className="an-button" disabled={frame === targetFrame} onClick={() => transferKey(frame,targetFrame,true)}>Copy pose</button></div><button className="an-button an-wide" onClick={() => updatePose(pose)} disabled={!canPose}><Plus size={14} /> Add pose key here</button><button className="an-button an-quiet an-wide" disabled={!currentKey || frame === 1} onClick={() => edit(current => removePoseKey(current,frame), 'Pose key removed; the previous hold extends.')}><Trash2 size={14} /> Delete this key</button><div className="an-hint">Frame 1 is the base pose. Drag later key diamonds along the timeline, or enter a destination above.</div><p className="an-muted">24 frames ÷ 24 fps = 1 second. Longer shots and smooth interpolation are planned later.</p></>}
        {workflow === 'Camera' && <><div className="an-inspector-intro"><h3>Find your shot</h3><p>Explore the scene, then save that angle as your output camera.</p></div><div className="an-actions an-camera-presets">{(['front','side','top','perspective'] as const).map(angle => <button className="an-button" key={angle} onClick={() => { setView('explore'); viewport.current?.resetView(angle) }}>{angle[0].toUpperCase()+angle.slice(1)}</button>)}</div><button className="an-button an-primary an-wide" onClick={() => { const camera = viewport.current?.captureCamera(); if (camera) { edit(current => ({ ...current, camera }), 'Shot camera captured. Undo restores the previous composition.'); setView('shot') } }}><Camera size={15} /> Use this view for shot</button><NumberField label="Field of view" value={doc.camera.fov} min={10} max={100} onCommit={fov => edit(current => ({ ...current, camera: { ...current.camera, fov } }), 'Shot field of view updated.')} /><div className="an-hint">Explore view is independent. Orbiting never moves your saved shot camera.</div><div className="an-readout"><span>Output frame</span><strong>16:9 · 1280 × 720</strong><span>Animation</span><strong>Static camera</strong></div></>}
        {workflow === 'Render' && <><div className="an-inspector-intro"><h3>Make it anime</h3><p>Preview through the shot camera. Export the current frame as a PNG.</p></div><Toggle checked={doc.appearance.celShading} onChange={celShading => appearance({ celShading })}>Two-tone cel shading</Toggle><Toggle checked={doc.appearance.outlines} onChange={outlines => appearance({ outlines })}>Character outlines</Toggle><NumberField label="Light direction" value={doc.appearance.lightAzimuth} min={-360} max={360} onCommit={lightAzimuth => appearance({ lightAzimuth })} /><Toggle checked={doc.appearance.ground} onChange={ground => appearance({ ground })}>Ground in render</Toggle><Toggle checked={doc.output.transparent} onChange={transparent => edit(current => ({ ...current, output: { ...current.output, transparent } }), 'Output background updated.')}>Transparent background</Toggle><div className="an-readout"><span>Format</span><strong>PNG still</strong><span>Resolution</span><strong>1280 × 720</strong><span>Frame</span><strong>{frame} / 24</strong></div><button className="an-button an-primary an-wide" onClick={() => { setExportResult(''); setExportOpen(true) }}><Download size={15} /> Export this frame</button><p className="an-muted">Guides and posing handles are excluded. Hide the ground for a character cutout. Animation export is planned later.</p></>}
      </fieldset></aside>
    </main>
    <section className="an-timeline" aria-label="Animation timeline" onKeyDown={event => { if ((event.target as HTMLElement).closest('input,select')) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); scrub(frame + (event.key === 'ArrowRight' ? 1 : -1)) } }}>
      <div className="an-timeline-top"><div className="an-actions"><button className="an-button an-icon" aria-label="Previous pose key" onClick={() => scrub(doc.keys.filter(key => key.frame < frame).at(-1)?.frame ?? 1)}><ChevronLeft size={16} /></button><button className="an-button an-primary an-play" aria-label={playing ? 'Pause playback' : 'Play animation'} onClick={togglePlayback}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Play'}</button><button className="an-button an-icon" aria-label="Next pose key" onClick={() => scrub(doc.keys.find(key => key.frame > frame)?.frame ?? 24)}><ChevronRight size={16} /></button><Toggle checked={loop} onChange={setLoop}>Loop</Toggle></div><div className="an-frame-readout"><strong>{String(frame).padStart(2,'0')}</strong><span>/ 24</span><span>24 FPS · 1 SECOND</span></div><span className="an-timing-label">◆ POSE KEYS <span> / </span> HOLD</span></div>
      <div className="an-timeline-track"><div className="an-track-title"><Bone size={14} /><span>Character 01<small>{doc.keys.length} pose keys</small></span></div><div className="an-frames">{Array.from({length:24},(_,index) => index+1).map(value => { const keyed = doc.keys.some(key => key.frame === value); return <button key={value} data-frame={value} aria-label={`Frame ${value}${keyed ? ', pose key' : ', held pose'}`} aria-pressed={frame === value} draggable={keyed && value !== 1 && !playing} onDragStart={event => { event.dataTransfer.setData('application/x-anime-pose-frame',String(value)); event.dataTransfer.effectAllowed = 'move' }} onDragOver={event => { if (event.dataTransfer.types.includes('application/x-anime-pose-frame')) event.preventDefault() }} onDrop={event => { event.preventDefault(); const source = Number(event.dataTransfer.getData('application/x-anime-pose-frame')); if (Number.isInteger(source) && source > 1 && source <= 24) transferKey(source,value) }} onClick={() => scrub(value)}><span>{value}</span><span className={keyed ? 'an-key' : 'an-held'}>{keyed ? '◆' : '—'}</span></button> })}</div></div>
      <div className="an-timeline-bottom"><span>Drawing · {doc.strokes.length} static strokes</span><span>Camera · static</span><span>Pose held from frame {heldFrom}</span></div>
    </section>
    <footer className="an-status"><span role="status">{notice}</span><span>{downloaded ? 'PROJECT FILE DOWNLOAD STARTED' : 'LOCAL PROJECT · NO CLOUD SYNC'}</span></footer>
    {leaving && <div className="an-busy-overlay" role="status">Saving your shot before leaving…</div>}
    <dialog className="an-dialog" ref={dialog} onCancel={event => { event.preventDefault(); closeDialog() }}><div className="an-dialog-heading"><h2>{help ? 'Your first anime shot' : 'Export PNG still'}</h2><button className="an-button an-icon" aria-label="Close dialog" onClick={closeDialog}><X size={17} /></button></div>{help ? <><p>Use the six stages to work on the same scene.</p><ol><li>Pose your character at frame 1, 9, and 17. Each edit saves a whole-character pose key.</li><li>Draw strokes on a chosen plane. They remain in world space across all frames.</li><li>Orbit in Explore, then choose Camera → Use this view for shot.</li><li>Play the three holds, export a PNG, and download a portable project copy.</li></ol><div className="an-readout"><span>Orbit / pan</span><strong>Alt + drag / right drag</strong><span>Frame character</span><strong>F</strong><span>Play / pause</span><strong>Space</strong><span>Undo / redo</span><strong>Ctrl/Cmd Z / Shift Z</strong><span>Save locally</span><strong>Ctrl/Cmd S</strong><span>Cancel gesture</span><strong>Escape</strong></div><p className="an-muted">The viewport uses an original stylized starter rig. Full character design, surface-bound drawings, and animation exports are later features.</p></> : <><p>Frame <strong>{frame}</strong> through the saved shot camera.</p><div className="an-export-summary"><Camera size={26} /><strong>{doc.name}</strong><span>1280 × 720 · {doc.output.transparent ? 'Transparent' : 'Opaque'} background</span><span>PNG still · no editor guides</span></div>{exportResult && <p role="status" className="an-export-result">{exportResult}</p>}<div className="an-actions"><button className="an-button" onClick={closeDialog}>{exporting ? 'Cancel export' : 'Back to shot'}</button><button className="an-button an-primary" disabled={exporting} onClick={() => void exportStill()}><Download size={16} />{exporting ? 'Rendering…' : 'Render & download'}</button></div></>}</dialog>
  </div>
}
