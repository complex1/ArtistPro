import { useEffect, useRef, useState } from 'react'
import { Copy, Eye, EyeOff, Lock, Minus, Plus, Scissors, Trash2, Unlock } from 'lucide-react'
import { celAt, clamp, moveCel, setExposure, type AnimationDocument, type AnimationLayer, type Cel } from './model'

type Props = { playing: boolean; doc: AnimationDocument; frame: number; layerId: string; onSelect: (frame: number, layerId?: string) => void; onChange: (doc: AnimationDocument) => void; onError: (message: string) => void; onNew: (duplicate?: boolean) => void; onSplit: () => void; onDelete: () => void; onAddLayer: () => void; onDeleteLayer: (id: string) => void }

export function Timeline({ doc, playing, frame, layerId, onSelect, onChange, onError, onNew, onSplit, onDelete, onAddLayer, onDeleteLayer }: Props) {
  const [unit, setUnit] = useState(28), [resize, setResize] = useState<{ id: string; duration: number } | null>(null)
  const dragging = useRef<{ layerId: string; celId: string; offset: number } | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const layer = doc.layers.find(item => item.id === layerId)!, current = layer && celAt(layer, frame)
  const width = doc.duration * unit
  useEffect(() => {
    const scroll = sheet.current
    if (!playing || !scroll) return
    const left = frame * unit, available = scroll.clientWidth - 186
    if (left < scroll.scrollLeft || left + unit > scroll.scrollLeft + available) scroll.scrollLeft = Math.max(0, left - available / 4)
  }, [playing, frame, unit])
  function resizeCel(event: React.PointerEvent<HTMLSpanElement>, layer: AnimationLayer, cel: Cel) {
    if (layer.locked) return
    event.stopPropagation(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const start = event.clientX, original = cel.duration, target = event.currentTarget
    let duration = original
    const move = (event: PointerEvent) => { duration = clamp(original + Math.round((event.clientX - start) / unit), 1, 2400); setResize({ id: cel.id, duration }) }
    const end = (event: PointerEvent) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end)
      setResize(null)
      if (event.type === 'pointerup' && duration !== original) try { onChange(setExposure(doc, layer.id, cel.id, duration)) } catch (error) { onError((error as Error).message) }
    }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end)
  }
  const toggle = (layer: AnimationLayer, field: 'visible' | 'locked') => onChange({ ...doc, layers: doc.layers.map(item => item.id === layer.id ? { ...item, [field]: !item[field] } : item) })
  return <section className="fbf-timeline" aria-label="Animation timeline" onKeyDown={event => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    event.preventDefault(); event.stopPropagation()
    if (event.shiftKey) { if (!layer.locked) onDeleteLayer(layer.id) }
    else if (current && !layer.locked) onDelete()
  }}><div className="fbf-timeline-toolbar"><strong>Timeline</strong><span className="fbf-timeline-summary">{doc.duration} frames <i />{(doc.duration / doc.fps).toFixed(2)} s</span><div className="fbf-timeline-actions"><button title="New drawing (N)" aria-label="New drawing" disabled={layer?.locked} onClick={() => onNew()}><Plus size={15} /><span>Drawing</span></button><button title="Duplicate drawing (Shift N)" aria-label="Duplicate drawing" disabled={!current || layer.locked} onClick={() => onNew(true)}><Copy size={14} /></button><button title="Split held drawing at playhead" aria-label="Split drawing" disabled={!current || frame === current.start || layer.locked} onClick={onSplit}><Scissors size={14} /></button><button title="Delete drawing (leave a gap)" aria-label="Delete drawing" disabled={!current || layer.locked} onClick={onDelete}><Trash2 size={14} /><span>Delete</span></button></div><div className="fbf-timeline-zoom"><button aria-label="Zoom timeline out" onClick={() => setUnit(value => Math.max(10, value - 6))}><Minus size={13} /></button><span>{Math.round(unit / 28 * 100)}%</span><button aria-label="Zoom timeline in" onClick={() => setUnit(value => Math.min(64, value + 6))}><Plus size={13} /></button></div></div>
    <div className="fbf-timeline-scroll" ref={sheet}><div className="fbf-timeline-table" style={{ width: width + 186 }}><div className="fbf-track-label fbf-track-corner"><span>DRAWING LAYERS</span><button aria-label="Add animation layer" onClick={onAddLayer}><Plus size={14} /></button></div><div className="fbf-frame-ruler" style={{ width }} onPointerDown={event => { const target = event.currentTarget, x = target.getBoundingClientRect().left; target.setPointerCapture(event.pointerId); onSelect(clamp(Math.floor((event.clientX - x) / unit), 0, doc.duration - 1)); const move = (e: PointerEvent) => onSelect(clamp(Math.floor((e.clientX - x) / unit), 0, doc.duration - 1)); const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up) }; target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up) }}>
      {Array.from({ length: doc.duration }, (_, index) => <button key={index} tabIndex={-1} style={{ left: index * unit, width: unit }} aria-label={`Go to frame ${index + 1}`} className={index === frame ? 'is-current' : ''} onClick={() => onSelect(index)}>{index === 0 || (index + 1) % (unit < 20 ? 6 : 3) === 0 ? index + 1 : <i />}</button>)}<div className="fbf-playhead" style={{ left: frame * unit, width: unit }}><span>{frame + 1}</span></div></div>
      {[...doc.layers].reverse().map(track => <div className={`fbf-track ${track.id === layerId ? 'is-active' : ''}`} key={track.id}><div className="fbf-track-label"><button className="fbf-layer-select" onClick={() => onSelect(frame, track.id)}><i /><strong>{track.name}</strong><small>{track.cels.length} drawings</small></button><button aria-label={`${track.visible ? 'Hide' : 'Show'} ${track.name}`} onClick={() => toggle(track, 'visible')}>{track.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button><button aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`} onClick={() => toggle(track, 'locked')}>{track.locked ? <Lock size={12} /> : <Unlock size={12} />}</button><button className="fbf-track-delete" aria-label={`Delete track ${track.name}`} title={track.locked ? 'Unlock this track to delete it' : doc.layers.length === 1 ? 'Delete drawings in this track (undoable)' : 'Delete track and its drawings (undoable)'} disabled={track.locked} onClick={() => onDeleteLayer(track.id)}><Trash2 size={12} /></button></div>
        <div className="fbf-track-cells" style={{ width, backgroundSize: `${unit}px 100%` }} onClick={event => { if (event.target === event.currentTarget) onSelect(clamp(Math.floor((event.clientX - event.currentTarget.getBoundingClientRect().left) / unit), 0, doc.duration - 1), track.id) }} onDragOver={event => { if (dragging.current?.layerId === track.id && !track.locked) event.preventDefault() }} onDrop={event => { event.preventDefault(); const item = dragging.current; dragging.current = null; if (!item || item.layerId !== track.id || track.locked) return; const start = clamp(Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left - item.offset) / unit), 0, 2399); try { onChange(moveCel(doc, track.id, item.celId, start)); onSelect(start, track.id) } catch (error) { onError((error as Error).message) } }}>
          <span className="fbf-current-column" style={{ left: frame * unit, width: unit }} />{track.cels.map(cel => <div key={cel.id} role="button" tabIndex={0} aria-label={`${track.name}, drawing at frame ${cel.start + 1}, ${cel.duration} frames`} className={`fbf-cel ${current?.id === cel.id && track.id === layerId ? 'is-selected' : ''} ${cel.dataUrl ? '' : 'is-blank'}`} style={{ left: cel.start * unit + 2, width: (resize?.id === cel.id ? resize.duration : cel.duration) * unit - 4 }} draggable={!track.locked && !resize} onDragStart={event => { dragging.current = { layerId: track.id, celId: cel.id, offset: event.clientX - event.currentTarget.getBoundingClientRect().left }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', cel.id) }} onDragEnd={() => { dragging.current = null }} onClick={() => onSelect(cel.start, track.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(cel.start, track.id) } }}>
            {cel.thumbnail ? <img src={cel.thumbnail} alt="" draggable={false} /> : <span className="fbf-blank-dot" />}<span className="fbf-cel-number">{cel.start + 1}</span>{cel.duration * unit > 60 && <small>{resize?.id === cel.id ? resize.duration : cel.duration}f</small>}<span className="fbf-exposure-handle" title="Drag to change exposure" onPointerDown={event => resizeCel(event, track, cel)} onClick={event => event.stopPropagation()} />
          </div>)}
        </div></div>)}
    </div></div><div className="fbf-timeline-footer"><span>Click to flip · drag drawings to move · drag a drawing’s right edge to retime</span><span>Space <b>Play</b> · ← → <b>Step</b> · N <b>New drawing</b></span></div></section>
}
