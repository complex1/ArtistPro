import { shortcutBlocked, useShortcuts } from '@artist-studio/ui-component'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowDown, ArrowUp, Brush, Check, ChevronLeft, ChevronRight, Circle, Clapperboard, Copy, Download, Eraser, Eye, Hand, ImagePlus, Lasso, Layers, Lock, Maximize, Minus, MousePointer2, PaintBucket, Pause, Pipette, Play, Plus, Redo2, Repeat2, Save, ScanLine, SkipBack, SkipForward, Square, Trash2, Undo2, X } from 'lucide-react'
import { getProject, type ProjectRecord } from './library'
import { AnimationSession } from './session'
import { celAt, clamp, deleteTrack, editLayer, id, insertCel, lastContentFrame, onionCels, playbackFrame, rasterDocument, setExposure, splitCel, type AnimationDocument } from './model'
import { DEFAULT_BRUSH, download, DrawingEngine, exportAnimation, FrameRenderer, safeName, thumbnail, type BrushSettings, type DrawingTool, type Point, type Selection } from './raster'
import { boundsCorners, containsPoint, isValidQuad, normalizeBounds } from '../../drawing-canvas/web/engine/geometry'
import { Timeline } from './Timeline'
import type { Bounds } from '../../drawing-canvas/web/engine/types'
import { flipTransform, insideTransformQuad, numericTransform } from '../../drawing-canvas/web/transformControls'
import { dragSelection, hitSelectionHandle, type SelectionDrag } from './selectionControls'
import { SelectionOutline, SelectionOverlay } from './SelectionOverlay'
import { Range, ToolProperties } from './ToolProperties'
import './frame-by-frame.css'

const InbetweenDialog = lazy(() => import('./inbetween/InbetweenDialog').then(module => ({ default: module.InbetweenDialog })))

const message = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong.'
const tools = [
  { id: 'brush', label: 'Brush (B)', icon: Brush }, { id: 'eraser', label: 'Eraser (E)', icon: Eraser },
  { id: 'fill', label: 'Fill (G)', icon: PaintBucket }, { id: 'eyedropper', label: 'Eyedropper (I)', icon: Pipette },
  { id: 'rectangle', label: 'Rectangle (R)', icon: Square }, { id: 'ellipse', label: 'Ellipse (O)', icon: Circle },
  { id: 'select-rectangle', label: 'Select (M)', icon: ScanLine }, { id: 'lasso', label: 'Freehand lasso (L)', icon: Lasso }, { id: 'transform', label: 'Move selection or drawing (V)', icon: MousePointer2 },
  { id: 'hand', label: 'Pan (H or Alt drag)', icon: Hand },
] as const
const selectionTool = (tool: DrawingTool) => tool === 'select-rectangle' || tool === 'lasso'
type View = { x: number; y: number; zoom: number }
type Gesture = { pointer: number; tool: DrawingTool; start: Point; last: Point; view: View; clientX: number; clientY: number; points: Point[]; transform?: SelectionDrag }

export function FrameEditor({ projectId }: { projectId: string }) {
  const [record, setRecord] = useState<ProjectRecord | null>(null), [error, setError] = useState<string | null>(null)
  useEffect(() => { let active = true; void getProject(projectId).then(record => { if (active) { if (record) setRecord(record); else setError('This shot could not be found in this browser.') } }).catch(e => { if (active) setError(message(e)) }); return () => { active = false } }, [projectId])
  if (error) return <div className="fbf-load-error"><Clapperboard size={30} /><h2>Could not open this shot</h2><p>{error}</p><button className="fbf-button" onClick={() => { window.location.hash = '#/frame-by-frame' }}>Back to shots</button></div>
  if (!record) return <div className="studio-loading">Opening your animation desk…</div>
  return <AnimationDesk key={record.id} record={record} />
}

function AnimationDesk({ record }: { record: ProjectRecord }) {
  const [session] = useState(() => new AnimationSession(record)), [, refresh] = useState(0)
  const doc = session.document
  const [frame, setFrame] = useState(0), [layerId, setLayerId] = useState(doc.layers[doc.layers.length - 1].id)
  const layer = doc.layers.find(item => item.id === layerId) ?? doc.layers[doc.layers.length - 1]
  const cel = celAt(layer, frame), key = cel?.id ?? `${layer.id}:${frame}`
  const [tool, setTool] = useState<DrawingTool>('brush'), [brush, setBrush] = useState<BrushSettings>({ ...DEFAULT_BRUSH, size: 8 })
  const [playing, setPlaying] = useState(false), [loop, setLoop] = useState(true), [onion, setOnion] = useState(true)
  const [before, setBefore] = useState(1), [after, setAfter] = useState(1), [onionOpacity, setOnionOpacity] = useState(.25), [onionOriginal, setOnionOriginal] = useState(false)
  const [exposure, setDefaultExposure] = useState(2), [filled, setFilled] = useState(false), [tolerance, setTolerance] = useState(24)
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 }), [gesture, setGesture] = useState<Gesture | null>(null), [selection, setSelection] = useState<Selection | null>(null)
  const [ready, setReady] = useState(''), [error, setError] = useState<string | null>(null), [exportOpen, setExportOpen] = useState(false), [exportProgress, setExportProgress] = useState<number | null>(null)
  const [timelineHeight, setTimelineHeight] = useState(234), [panel, setPanel] = useState<'brush' | 'shot'>('brush'), [inspectorOpen, setInspectorOpen] = useState(false)
  const [inbetween, setInbetween] = useState<{ document: AnimationDocument; revision: number; layerId: string; fromCelId?: string } | null>(null)
  const [lockAspect, setLockAspect] = useState(false), [transformBounds, setTransformBounds] = useState<Bounds | null>(null), [transformCursor, setTransformCursor] = useState('crosshair')
  const viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), imageInput = useRef<HTMLInputElement>(null)
  const active = useRef<{ key: string; data: string | null; engine: DrawingEngine } | null>(null), gestureRef = useRef<Gesture | null>(null)
  const live = useRef({ frame, layer, cel, key, view, brush, tool, playing, exposure, doc })
  live.current = { frame, layer, cel, key, view, brush, tool, playing, exposure, doc }
  const exportAbort = useRef<AbortController | null>(null), mounted = useRef(true), navigation = useRef(false)
  

  const paint = useCallback(() => { const engine = active.current?.engine, ctx = canvas.current?.getContext('2d'); if (engine && ctx) engine.render(ctx) }, [])
  const cancelGesture = useCallback(() => {
    active.current?.engine.cancelStroke(); gestureRef.current = null; setGesture(null); paint()
  }, [paint])
  const run = (action: () => void) => { try { action(); setError(null) } catch (e) { setError(message(e)) } }
  const change = (next: AnimationDocument) => { cancelGesture(); setPlaying(false); run(() => session.commit(next)) }
  const select = (nextFrame: number, nextLayer?: string) => { cancelGesture(); setPlaying(false); setFrame(clamp(nextFrame, 0, session.document.duration - 1)); if (nextLayer) setLayerId(nextLayer) }

  useEffect(() => session.subscribe(() => refresh(value => value + 1)), [session])
  useEffect(() => {
    if (!session.dirty) return
    const timer = setTimeout(() => { void session.save().catch(() => {}) }, 650)
    return () => clearTimeout(timer)
  }, [session, session.revision])
  useEffect(() => {
    setFrame(value => Math.min(value, doc.duration - 1))
    if (!doc.layers.some(item => item.id === layerId)) setLayerId(doc.layers[doc.layers.length - 1].id)
  }, [doc.duration, doc.layers, layerId])

  const leave = useCallback(async (hash: string) => {
    if (navigation.current) return
    navigation.current = true; cancelGesture(); setPlaying(false)
    try { await session.save(); window.location.hash = hash }
    catch (e) { setError(`Your shot is still open. ${message(e)} Export the project or retry saving before leaving.`) }
    finally { navigation.current = false }
  }, [session, cancelGesture])
  useEffect(() => {
    mounted.current = true
    const ownHash = `#/frame-by-frame/${encodeURIComponent(record.id)}`
    const onNavigate = (event: Event) => {
      if (window.location.hash === ownHash) return
      cancelGesture()
      if (!session.dirty) return
      const next = window.location.hash; event.preventDefault(); history.replaceState(null, '', ownHash); void leave(next)
    }
    const unload = (event: BeforeUnloadEvent) => { if (session.dirty || gestureRef.current) { event.preventDefault(); event.returnValue = '' } }
    const blur = () => { cancelGesture(); setPlaying(false) }
    window.addEventListener('artist-studio:before-route-change', onNavigate)
    window.addEventListener('beforeunload', unload); window.addEventListener('blur', blur)
    return () => { mounted.current = false; cancelGesture(); exportAbort.current?.abort(); void session.save().catch(() => {}); window.removeEventListener('artist-studio:before-route-change', onNavigate); window.removeEventListener('beforeunload', unload); window.removeEventListener('blur', blur) }
  }, [record.id, session, cancelGesture, leave])

  useEffect(() => {
    if (playing) return
    let cancelled = false
    if (active.current?.key === key && active.current.data === (cel?.dataUrl ?? null)) { setReady(key); setSelection(active.current.engine.getState().selection); setTransformBounds(active.current.engine.getTransformBounds()); paint(); return }
    setReady(''); setSelection(null); setTransformBounds(null)
    void DrawingEngine.create(rasterDocument(doc.width, doc.height, cel?.dataUrl ?? null)).then(engine => {
      if (cancelled) { engine.dispose(); return }
      active.current?.engine.dispose(); active.current = { key, data: cel?.dataUrl ?? null, engine }
      setReady(key); setTransformBounds(engine.getTransformBounds()); requestAnimationFrame(paint)
    }).catch(e => { if (!cancelled) setError(message(e)) })
    return () => { cancelled = true }
  }, [key, cel?.dataUrl, doc.width, doc.height, playing, paint])
  useEffect(() => { if (ready === key && !playing) paint() }, [ready, key, playing, layer.visible, layer.id, paint])
  useEffect(() => () => { active.current?.engine.dispose(); active.current = null }, [])

  const fit = useCallback(() => {
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return
    const zoom = Math.max(.05, Math.min((rect.width - 96) / doc.width, (rect.height - 76) / doc.height, 1))
    setView({ zoom, x: (rect.width - doc.width * zoom) / 2, y: (rect.height - doc.height * zoom) / 2 })
  }, [doc.width, doc.height])
  useEffect(() => { const observer = new ResizeObserver(fit); if (viewport.current) observer.observe(viewport.current); fit(); return () => observer.disconnect() }, [fit])
  const zoomAt = (factor: number, x?: number, y?: number) => {
    const rect = viewport.current!.getBoundingClientRect()
    setView(previous => { const zoom = clamp(previous.zoom * factor, .05, 8), px = x ?? rect.width / 2, py = y ?? rect.height / 2; return { zoom, x: px - (px - previous.x) / previous.zoom * zoom, y: py - (py - previous.y) / previous.zoom * zoom } })
  }

  useEffect(() => {
    if (!playing) return
    const startFrame = frame === doc.duration - 1 ? 0 : frame, start = performance.now()
    let request = 0
    const tick = (time: number) => { const next = playbackFrame(startFrame, time - start, doc.fps, doc.duration, loop); setFrame(next.frame); if (next.ended) setPlaying(false); else request = requestAnimationFrame(tick) }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
    // Capture the playhead only when playback begins; elapsed time controls later frames.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, doc.fps, doc.duration, loop])

  function commitPixels() {
    const value = active.current; if (!value || value.key !== live.current.key) return
    const current = live.current, pixels = value.engine.serialize().layers[0].dataUrl
    let next = session.document, target = celAt(current.layer, current.frame)
    const preview = pixels ? thumbnail(value.engine.toCanvas()) : null
    if (!target) { const upcoming = current.layer.cels.find(item => item.start > current.frame); const inserted = insertCel(next, current.layer.id, current.frame, Math.min(current.exposure, upcoming ? upcoming.start - current.frame : 2400 - current.frame)); next = inserted.document; target = inserted.cel }
    next = editLayer(next, current.layer.id, layer => ({ ...layer, cels: layer.cels.map(cel => cel.id === target!.id ? { ...cel, dataUrl: pixels, thumbnail: preview } : cel) }))
    try { session.commit(next) } catch (error) { value.engine.undo(); paint(); throw error }
    value.key = target.id; value.data = pixels; setReady(target.id)
    setSelection(value.engine.getState().selection); setTransformBounds(value.engine.getTransformBounds())
  }
  function newDrawing(duplicate = false) {
    cancelGesture(); setPlaying(false)
    run(() => { const current = live.current, at = current.cel ? current.cel.start + current.cel.duration : current.frame; const result = insertCel(session.document, current.layer.id, at, duplicate && current.cel ? current.cel.duration : current.exposure, duplicate ? current.cel : undefined); session.commit(result.document); setFrame(at) })
  }
  function removeDrawing() { if (cel) change(editLayer(doc, layer.id, item => ({ ...item, cels: item.cels.filter(item => item.id !== cel.id) }))) }
  function removeTrack(trackId: string) { run(() => {
    cancelGesture(); setPlaying(false)
    const next = deleteTrack(session.document, trackId)
    session.commit(next)
    if (trackId === layer.id) setLayerId(next.layers[next.layers.length - 1].id)
  }) }
  function addLayer() { run(() => { const next = { id: id(), name: `Layer ${doc.layers.length + 1}`, visible: true, locked: false, opacity: 1, cels: [] }; change({ ...doc, layers: [...doc.layers, next] }); if (session.document.layers.some(item => item.id === next.id)) setLayerId(next.id) }) }
  const mutable = !layer.locked && layer.visible && !playing && ready === key && exportProgress === null
  function engineEdit(edit: (engine: DrawingEngine) => void) { if (!mutable || !active.current) return; run(() => { edit(active.current!.engine); commitPixels(); paint() }) }

  const showTransform = mutable && Boolean(transformBounds) && (tool === 'transform' || selectionTool(tool) && Boolean(selection))
  function chooseTool(next: DrawingTool) { cancelGesture(); setTool(next); setPanel('brush'); setTransformCursor('crosshair') }
  function deselect() {
    cancelGesture(); const engine = active.current?.engine
    if (engine) { engine.select(null); setTransformBounds(engine.getTransformBounds()) }
    setSelection(null); paint()
  }
  function selectAll() {
    if (!mutable || !active.current) return
    cancelGesture(); active.current.engine.select({ kind: 'rectangle', bounds: { x: 0, y: 0, width: doc.width, height: doc.height } })
    setSelection(active.current.engine.getState().selection); setTransformBounds(active.current.engine.getTransformBounds()); paint()
  }

  function pointFor(event: { clientX: number; clientY: number; pressure: number; pointerType?: string }): Point {
    const rect = viewport.current!.getBoundingClientRect(), view = live.current.view
    return { x: (event.clientX - rect.left - view.x) / view.zoom, y: (event.clientY - rect.top - view.y) / view.zoom, pressure: event.pointerType === 'pen' ? event.pressure : 1 }
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1 || gestureRef.current || (event.target as HTMLElement).closest('button')) return
    const currentTool = event.altKey || event.button === 1 ? 'hand' : tool
    if (currentTool !== 'hand' && !mutable) { if (layer.locked || !layer.visible) setError('Show and unlock the active layer before drawing.'); return }
    const point = pointFor(event), engine = active.current?.engine
    let transform: SelectionDrag | undefined
    if (currentTool !== 'hand' && showTransform && transformBounds && engine) {
      const handle = hitSelectionHandle(transformBounds, point, view.zoom)
      const inside = selection ? containsPoint(selection, point.x, point.y) : insideTransformQuad(boundsCorners(transformBounds), point)
      if (handle || inside) transform = { bounds: transformBounds, handle: handle?.id ?? 'move', quad: boundsCorners(transformBounds), changed: false }
      else if (currentTool === 'transform') return
    }
    if (!transform && currentTool !== 'hand' && (point.x < 0 || point.y < 0 || point.x >= doc.width || point.y >= doc.height)) return
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
    const next: Gesture = { pointer: event.pointerId, tool: currentTool, start: point, last: point, view, clientX: event.clientX, clientY: event.clientY, points: [point], transform }
    gestureRef.current = next; setGesture(next); setError(null)
    run(() => {
      if (!engine || currentTool === 'hand' || transform) return
      if (currentTool === 'brush' || currentTool === 'eraser') engine.beginStroke(point, brush, currentTool === 'eraser')
      if (currentTool === 'fill') { engine.fill(point, brush.color, tolerance); commitPixels() }
      if (currentTool === 'eyedropper') { const color = engine.sampleColor(point); if (color) setBrush(value => ({ ...value, color })) }
      paint()
    })
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gestureRef.current, point = pointFor(event)
    if (!current) {
      if (showTransform && transformBounds) {
        const handle = hitSelectionHandle(transformBounds, point, view.zoom)
        const inside = selection ? containsPoint(selection, point.x, point.y) : insideTransformQuad(boundsCorners(transformBounds), point)
        setTransformCursor(handle?.cursor ?? (inside ? 'move' : 'crosshair'))
      }
      return
    }
    if (current.pointer !== event.pointerId) return
    if (current.tool === 'hand') { setView({ ...current.view, x: current.view.x + event.clientX - current.clientX, y: current.view.y + event.clientY - current.clientY }); return }
    const engine = active.current?.engine; if (!engine) return
    if (current.transform) {
      const quad = dragSelection(current.transform.bounds, current.transform.handle, current.start, point, lockAspect, event.shiftKey)
      if (!isValidQuad(quad)) return
      const original = boundsCorners(current.transform.bounds)
      current.last = point
      current.transform = { ...current.transform, quad, changed: quad.some((point, index) => Math.hypot(point.x - original[index].x, point.y - original[index].y) > .001) }
      const ctx = canvas.current?.getContext('2d'); if (ctx) engine.renderQuadPreview(ctx, quad)
    } else {
      current.last = { ...point, x: clamp(point.x, 0, doc.width), y: clamp(point.y, 0, doc.height) }
      if (event.shiftKey && ['rectangle', 'ellipse', 'select-rectangle'].includes(current.tool)) {
        const side = Math.min(Math.abs(current.last.x - current.start.x), Math.abs(current.last.y - current.start.y))
        current.last = { ...current.last, x: current.start.x + Math.sign(current.last.x - current.start.x) * side, y: current.start.y + Math.sign(current.last.y - current.start.y) * side }
      }
      if (current.tool === 'brush' || current.tool === 'eraser') {
        const samples = event.nativeEvent.getCoalescedEvents?.() ?? []
        for (const sample of samples.length ? samples : [event.nativeEvent]) { const next = pointFor(sample); engine.moveStroke({ ...next, x: clamp(next.x, 0, doc.width), y: clamp(next.y, 0, doc.height) }) }
        paint()
      } else if (current.tool === 'lasso') {
        const samples = event.nativeEvent.getCoalescedEvents?.() ?? []
        for (const sample of samples.length ? samples : [event.nativeEvent]) {
          const point = pointFor(sample), last = current.points[current.points.length - 1]
          const next = { ...point, x: clamp(point.x, 0, doc.width), y: clamp(point.y, 0, doc.height) }
          if (Math.hypot(last.x - next.x, last.y - next.y) >= .75 / view.zoom) current.points.push(next)
        }
      }
    }
    setGesture({ ...current, points: [...current.points] })
  }
  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gestureRef.current; if (!current || current.pointer !== event.pointerId) return
    if (!cancelled) pointerMove(event)
    gestureRef.current = null; setGesture(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const engine = active.current?.engine; if (!engine || current.tool === 'hand') return
    if (cancelled) { engine.cancelStroke(); paint(); return }
    run(() => {
      if (current.transform) { if (current.transform.changed) { engine.transformQuad(current.transform.quad); commitPixels() } }
      else if (selectionTool(current.tool)) {
        const bounds = normalizeBounds({ x: current.start.x, y: current.start.y, width: current.last.x - current.start.x, height: current.last.y - current.start.y })
        engine.select(current.tool === 'lasso' ? current.points.length > 2 ? { kind: 'lasso', points: current.points } : null : bounds.width > 1 && bounds.height > 1 ? { kind: 'rectangle', bounds } : null)
        setSelection(engine.getState().selection); setTransformBounds(engine.getTransformBounds())
      } else if (current.tool === 'brush' || current.tool === 'eraser') { engine.endStroke(); commitPixels() }
      else if (current.tool === 'rectangle' || current.tool === 'ellipse') { engine.drawShape(current.tool, current.start, current.last, brush, filled); commitPixels() }
      paint()
    })
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (shortcutBlocked(event) || event.altKey) return
      if (event.repeat && !['ArrowLeft', 'ArrowRight', '[', ']'].includes(event.key)) { event.preventDefault(); return }
      if ((event.target as HTMLElement)?.closest('input, select, textarea, [contenteditable=true]') || exportAbort.current || inbetween) return
      const key = event.key.toLowerCase(), command = event.metaKey || event.ctrlKey
      if (command) {
        if (['z', 'y', 's', 'd'].includes(key)) event.preventDefault()
        if (key === 'z' || key === 'y') { cancelGesture(); setPlaying(false); if (key === 'y' || event.shiftKey) session.redo(); else session.undo() }
        if (key === 's') void session.save().catch(e => setError(message(e)))
        if (key === 'd') deselect()
        return
      }
      if (event.code === 'Space') { event.preventDefault(); cancelGesture(); setPlaying(value => !value); return }
      if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); select(frame + (key === 'arrowleft' ? -1 : 1)); return }
      if (key === ',' || key === '.') { const starts = layer.cels.map(cel => cel.start); const target = key === ',' ? starts.filter(value => value < frame).at(-1) : starts.find(value => value > frame); if (target !== undefined) select(target); return }
      if (key === 'n') { event.preventDefault(); newDrawing(event.shiftKey); return }
      if (key === 'escape') { if (gestureRef.current) cancelGesture(); else deselect(); return }
      if (key === '0') { fit(); return }
      if (key === '[' || key === ']') { setBrush(value => ({ ...value, size: clamp(value.size + (key === '[' ? -2 : 2), 1, 300) })); return }
      const map: Record<string, DrawingTool> = { b: 'brush', e: 'eraser', g: 'fill', i: 'eyedropper', r: 'rectangle', o: 'ellipse', m: 'select-rectangle', l: 'lasso', v: 'transform', h: 'hand' }
      if (map[key]) chooseTool(map[key])
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown)
  })

  function openInbetweens() {
    cancelGesture(); setPlaying(false)
    if (layer.locked) { setError('Unlock the layer before generating in-betweens.'); return }
    setInbetween({ document: session.document, revision: session.revision, layerId: layer.id, fromCelId: cel?.id })
  }
  function applyInbetweens(next: AnimationDocument, firstFrame: number) {
    if (!inbetween || session.revision !== inbetween.revision) throw new Error('The shot changed while the preview was open. Close this window and generate a new preview.')
    session.commit(next); setInbetween(null); setFrame(firstFrame)
  }

  async function importImages(files: FileList | null) {
    if (!files?.length || !mutable) return
    const list = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    const snapshot = session.document, layerId = layer.id, startFrame = frame
    setPlaying(false)
    const controller = new AbortController(); exportAbort.current = controller; setExportProgress(0)
    try {
      let next = snapshot, at = startFrame
      for (const [index, file] of list.entries()) {
        if (controller.signal.aborted) return
        if (file.size > 40 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Import PNG, JPEG, or WebP images up to 40 MB each.')
        const url = URL.createObjectURL(file), image = new Image()
        try {
          image.src = url; await image.decode()
          if (image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error('Choose images below 32 million pixels.')
          const surface = document.createElement('canvas'); surface.width = next.width; surface.height = next.height
          const ratio = Math.min(next.width / image.naturalWidth, next.height / image.naturalHeight)
          surface.getContext('2d')!.drawImage(image, (next.width - image.naturalWidth * ratio) / 2, (next.height - image.naturalHeight * ratio) / 2, image.naturalWidth * ratio, image.naturalHeight * ratio)
          const pixels = { dataUrl: surface.toDataURL('image/png'), thumbnail: thumbnail(surface) }
          const track = next.layers.find(item => item.id === layerId)!, existing = celAt(track, at)
          if (index === 0 && existing) { next = editLayer(next, layerId, layer => ({ ...layer, cels: layer.cels.map(cel => cel.id === existing.id ? { ...cel, ...pixels } : cel) })); at = existing.start + existing.duration }
          else { const inserted = insertCel(next, layerId, at, exposure, pixels); next = inserted.document; at += exposure }
        } finally { URL.revokeObjectURL(url) }
        setExportProgress((index + 1) / list.length)
      }
      if (!controller.signal.aborted && mounted.current) { session.commit(next); setFrame(startFrame) }
    } catch (e) { if (mounted.current) setError(message(e)) }
    finally { exportAbort.current = null; if (mounted.current) setExportProgress(null) }
  }
  async function exportFile(format: 'project' | 'png' | 'gif' | 'sequence' | 'video') {
    setExportOpen(false); cancelGesture(); setPlaying(false)
    if (format === 'project') { download(new Blob([JSON.stringify(session.document)], { type: 'application/json' }), `${safeName(doc.name)}.framebyframe.json`); return }
    const controller = new AbortController(); exportAbort.current = controller; setExportProgress(0)
    try {
      if (format === 'png') { const surface = document.createElement('canvas'); surface.width = doc.width; surface.height = doc.height; await new FrameRenderer().render(doc, frame, surface); const blob = await new Promise<Blob>((resolve, reject) => surface.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png')); if (!controller.signal.aborted) download(blob, `${safeName(doc.name)}-${String(frame + 1).padStart(4, '0')}.png`) }
      else { const result = await exportAnimation(doc, format, controller.signal, value => { if (mounted.current) setExportProgress(value) }); if (!controller.signal.aborted) download(result.blob, `${safeName(doc.name)}.${result.extension}`) }
    } catch (e) { if (!controller.signal.aborted && mounted.current) setError(message(e)) }
    finally { exportAbort.current = null; if (mounted.current) setExportProgress(null) }
  }

  const previewBounds = gesture && !gesture.transform && ['rectangle', 'ellipse', 'select-rectangle'].includes(gesture.tool) ? normalizeBounds({ x: gesture.start.x, y: gesture.start.y, width: gesture.last.x - gesture.start.x, height: gesture.last.y - gesture.start.y }) : null
  const transformQuad = showTransform && transformBounds ? gesture?.transform?.quad ?? boundsCorners(transformBounds) : null
  const onions = !playing && onion && layer.visible ? onionCels(layer, frame, before, after) : []
  const updateLayer = (patch: Partial<typeof layer>) => change({ ...doc, layers: doc.layers.map(item => item.id === layer.id ? { ...item, ...patch } : item) })

  useShortcuts([{ keys: 'Mod+Shift+e', label: 'Export animation', run: () => { cancelGesture(); setPlaying(false); setExportOpen(true) } }])

  return <div className="fbf-editor" style={{ '--fbf-timeline-height': `${timelineHeight}px` } as React.CSSProperties}>
    <header className="fbf-editor-header"><button className="fbf-back" aria-label="Back to shots" onClick={() => void leave('#/frame-by-frame')}><ArrowLeft size={16} /><span>Shots</span></button><span className="fbf-header-divider" /><Clapperboard className="fbf-brand-icon" size={21} /><div className="fbf-shot-name"><input aria-label="Shot name" value={doc.name} maxLength={120} onChange={event => { if (event.target.value.trim()) run(() => session.commit({ ...doc, name: event.target.value })) }} /><button className={session.error ? 'has-error' : ''} title="Save shot" onClick={() => void session.save().catch(e => setError(message(e)))}>{session.error ? 'Save failed · retry' : session.saving ? 'Saving…' : session.dirty ? 'Unsaved changes' : <><Check size={10} />Saved on this device</>}</button></div><div className="fbf-header-actions"><button aria-label="Undo" title="Undo (⌘/Ctrl Z)" disabled={!session.canUndo} onClick={() => { cancelGesture(); setPlaying(false); session.undo() }}><Undo2 size={16} /></button><button aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)" disabled={!session.canRedo} onClick={() => { cancelGesture(); setPlaying(false); session.redo() }}><Redo2 size={16} /></button><span /><button className="fbf-import-button" disabled={!mutable} onClick={() => imageInput.current?.click()}><ImagePlus size={15} /><span>Import images</span></button><button aria-label="Save project" title="Save (⌘/Ctrl S)" onClick={() => void session.save().catch(e => setError(message(e)))}><Save size={16} /></button><div className="fbf-export-wrap"><button className="fbf-primary" onClick={() => setExportOpen(value => !value)}><Download size={15} />Export</button>{exportOpen && <div className="fbf-export-menu">{([['project', 'Editable project'], ['png', 'Current frame · PNG'], ['sequence', 'PNG sequence · ZIP'], ['gif', 'Animated GIF'], ['video', 'Video · MP4 / WebM']] as const).map(([format, label]) => <button key={format} onClick={() => void exportFile(format)}>{label}</button>)} </div>}</div></div></header>
    <div className="fbf-desk"><nav className="fbf-tools" aria-label="Drawing tools">{tools.map(item => <button key={item.id} aria-label={item.label} title={item.label} aria-pressed={tool === item.id} className={tool === item.id ? 'is-active' : ''} onClick={() => chooseTool(item.id)}><item.icon size={18} strokeWidth={1.65} /></button>)}<span /><label className="fbf-color" title="Brush color"><input type="color" aria-label="Brush color" value={brush.color} onChange={event => setBrush(value => ({ ...value, color: event.target.value }))} /></label></nav>
      <div className="fbf-stage-column"><div className="fbf-stage-top"><span>{tools.find(item => item.id === tool)?.label.split(' (')[0]}<i />{layer.name}</span><div>{selection && !playing && <button className="fbf-deselect" aria-label="Deselect region" title="Deselect (Esc or ⌘/Ctrl D)" onClick={deselect}><X size={13} />Deselect</button>}<button className={onion ? 'is-on' : ''} aria-pressed={onion} onClick={() => setOnion(value => !value)}><Copy size={13} />Onion skin</button><span>{doc.width} × {doc.height}</span><button className="fbf-settings-toggle" aria-label="Toggle drawing settings" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(value => !value)}><Layers size={14} /></button></div></div>
        <div className={`fbf-viewport tool-${tool}`} style={showTransform ? { cursor: gesture?.transform?.handle === 'rotate' ? 'grabbing' : transformCursor } : undefined} ref={viewport} tabIndex={0} role="application" aria-label="Animation drawing canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)} onPointerCancel={event => pointerEnd(event, true)} onWheel={event => { if (gestureRef.current) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.shiftKey) setView(previous => ({ ...previous, x: previous.x - event.deltaY })); else zoomAt(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top) }}>
          <div className="fbf-artboard" style={{ width: doc.width, height: doc.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, backgroundColor: doc.background ?? 'transparent', backgroundImage: doc.background ? 'none' : undefined }}>

            {doc.layers.filter(item => item.visible).map(track => { const drawing = celAt(track, frame); return <div key={track.id} className="fbf-raster-layer" style={{ opacity: track.opacity }}>{track.id === layer.id && <>{onions.map(({ cel, direction, distance }) => cel.dataUrl && (onionOriginal ? <img key={cel.id} className="fbf-onion" src={cel.dataUrl} style={{ opacity: onionOpacity / distance }} alt="" draggable={false} /> : <div key={cel.id} className="fbf-onion" style={{ background: direction === 'before' ? '#e86e77' : '#5f9cdc', opacity: onionOpacity / distance, maskImage: `url("${cel.dataUrl}")`, maskSize: '100% 100%' }} />))}</>}{track.id === layer.id && !playing ? <><canvas ref={canvas} width={doc.width} height={doc.height} style={{ visibility: ready === key ? 'visible' : 'hidden' }} />{ready !== key && drawing?.dataUrl && <img src={drawing.dataUrl} alt="" draggable={false} />}</> : drawing?.dataUrl && <img src={drawing.dataUrl} alt="" draggable={false} />}</div> })}
            <svg className="fbf-drawing-guide" width={doc.width} height={doc.height}>{!playing && ready === key && selection && !gesture && <g className="fbf-selection-outline" fill="none" stroke="#557df2" strokeWidth={1 / view.zoom} strokeDasharray={`${5 / view.zoom} ${4 / view.zoom}`}><SelectionOutline selection={selection} /></g>}{!playing && gesture?.tool === 'lasso' && !gesture.transform && <polyline points={gesture.points.map(point => `${point.x},${point.y}`).join(' ')} fill="#557df218" stroke="#557df2" strokeWidth={1 / view.zoom} strokeDasharray={`${5 / view.zoom} ${4 / view.zoom}`} />}{transformQuad && (!gesture || gesture.transform) && <SelectionOverlay quad={transformQuad} zoom={view.zoom} />}{previewBounds && (gesture?.tool === 'ellipse' ? <ellipse cx={previewBounds.x + previewBounds.width / 2} cy={previewBounds.y + previewBounds.height / 2} rx={previewBounds.width / 2} ry={previewBounds.height / 2} stroke={brush.color} fill={filled ? brush.color : 'none'} strokeWidth={brush.size} opacity={brush.opacity} /> : <rect {...previewBounds} stroke={gesture?.tool === 'select-rectangle' ? '#557df2' : brush.color} fill={gesture?.tool === 'select-rectangle' || !filled ? 'none' : brush.color} strokeWidth={gesture?.tool === 'select-rectangle' ? 1 / view.zoom : brush.size} strokeDasharray={gesture?.tool === 'select-rectangle' ? `${5 / view.zoom} ${4 / view.zoom}` : undefined} />)}</svg>
          </div><div className="fbf-canvas-badge">{playing ? 'PLAYBACK' : layer.locked ? 'LAYER LOCKED' : cel ? `DRAWING ${layer.cels.indexOf(cel) + 1} · ${cel.duration} FRAMES` : 'EMPTY FRAME · DRAW TO CREATE'}</div><div className="fbf-zoom-controls"><button aria-label="Zoom out" onClick={() => zoomAt(.8)}><Minus size={14} /></button><span>{Math.round(view.zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => zoomAt(1.25)}><Plus size={14} /></button><button aria-label="Fit canvas" title="Fit (0)" onClick={fit}><Maximize size={14} /></button></div>
        </div><div className="fbf-transport"><span className="fbf-timecode">FRAME <strong>{String(frame + 1).padStart(4, '0')}</strong><small>/ {doc.duration}</small></span><div><button aria-label="First frame" onClick={() => select(0)}><SkipBack size={15} /></button><button aria-label="Previous frame" onClick={() => select(frame - 1)}><ChevronLeft size={18} /></button><button className="fbf-play" aria-label={playing ? 'Pause animation' : 'Play animation'} title="Space" onClick={() => { cancelGesture(); setPlaying(value => !value) }}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button aria-label="Next frame" onClick={() => select(frame + 1)}><ChevronRight size={18} /></button><button aria-label="Last frame" onClick={() => select(doc.duration - 1)}><SkipForward size={15} /></button></div><div><button aria-label="Loop playback" className={loop ? 'is-on' : ''} aria-pressed={loop} onClick={() => setLoop(value => !value)}><Repeat2 size={16} /></button><span>{doc.fps} FPS</span></div></div>
      </div>
      <aside className={`fbf-inspector ${inspectorOpen ? 'is-open' : ''}`}><button className="fbf-inspector-close" aria-label="Close drawing settings" onClick={() => setInspectorOpen(false)}><X size={15} /></button><div className="fbf-inspector-tabs"><button className={panel === 'brush' ? 'is-active' : ''} onClick={() => setPanel('brush')}><Brush size={13} />Drawing</button><button className={panel === 'shot' ? 'is-active' : ''} onClick={() => setPanel('shot')}><FilmIcon />Shot</button></div><div className="fbf-inspector-scroll">
        {panel === 'brush' ? <ToolProperties key={`${key}:${tool}`} tool={tool} brush={brush} setBrush={setBrush} filled={filled} setFilled={setFilled} tolerance={tolerance} setTolerance={setTolerance} selection={selection} canEdit={mutable} lockAspect={lockAspect} setLockAspect={setLockAspect} onDeselect={deselect} onSelectAll={selectAll} onTool={chooseTool} onClear={() => engineEdit(engine => engine.clearPixels())} onTransform={(width, height, rotation) => engineEdit(engine => engine.transformQuad(numericTransform(engine.getTransformBounds(), width, height, rotation, 0, 0)))} onFlip={axis => engineEdit(engine => engine.transformQuad(flipTransform(engine.getTransformBounds(), axis)))} zoom={view.zoom} onZoom={zoomAt} onFit={fit} /> : <><section><h3>Shot settings</h3><label className="fbf-field">Frame rate<input type="number" min={1} max={60} value={doc.fps} onChange={event => run(() => change({ ...doc, fps: Number(event.target.value) }))} /></label><label className="fbf-field">Shot length (frames)<input type="number" min={lastContentFrame(doc)} max={2400} value={doc.duration} onChange={event => run(() => change({ ...doc, duration: Number(event.target.value) }))} /></label><p>{(doc.duration / doc.fps).toFixed(2)} seconds · {doc.width} × {doc.height} pixels</p><label className="fbf-check"><input type="checkbox" checked={doc.background === null} onChange={event => change({ ...doc, background: event.target.checked ? null : '#ffffff' })} />Transparent background</label>{doc.background && <label className="fbf-field">Paper color<input type="color" value={doc.background} onChange={event => change({ ...doc, background: event.target.value })} /></label>}</section>
        <section><h3>Onion skin <button aria-label="Toggle onion skin" className={onion ? 'is-on' : ''} onClick={() => setOnion(value => !value)}><Copy size={14} /></button></h3><div className="fbf-onion-count"><label><i className="before" />Before<input aria-label="Previous onion drawings" type="number" min={0} max={4} value={before} onChange={event => setBefore(clamp(Number(event.target.value), 0, 4))} /></label><label><i className="after" />After<input aria-label="Next onion drawings" type="number" min={0} max={4} value={after} onChange={event => setAfter(clamp(Number(event.target.value), 0, 4))} /></label></div><Range label="Onion opacity" value={Math.round(onionOpacity * 100)} min={5} max={80} suffix="%" onChange={value => setOnionOpacity(value / 100)} /><label className="fbf-check"><input type="checkbox" checked={onionOriginal} onChange={event => setOnionOriginal(event.target.checked)} />Use original image colors</label></section>
        <section><h3>Drawing exposure</h3><label className="fbf-field">New drawings last<select value={exposure} onChange={event => setDefaultExposure(Number(event.target.value))}>{[1, 2, 3, 4, 6, 12].map(value => <option key={value} value={value}>{value} {value === 1 ? 'frame · on ones' : value === 2 ? 'frames · on twos' : 'frames'}</option>)}</select></label>{cel && <label className="fbf-field">Current drawing (frames)<input aria-label="Current drawing exposure" type="number" min={1} max={2400} disabled={layer.locked} value={cel.duration} onChange={event => run(() => change(setExposure(doc, layer.id, cel.id, Number(event.target.value))))} /></label>}<p>Changing exposure pushes later drawings on this layer.</p></section>
        <section><h3>Active layer <Layers size={14} /></h3><label className="fbf-field">Name<input aria-label="Layer name" value={layer.name} maxLength={120} onChange={event => { if (event.target.value.trim()) updateLayer({ name: event.target.value }) }} /></label><Range label="Layer opacity" value={Math.round(layer.opacity * 100)} min={0} max={100} suffix="%" onChange={value => updateLayer({ opacity: value / 100 })} /><div className="fbf-layer-actions"><button aria-label="Move layer down" disabled={doc.layers.indexOf(layer) === 0} onClick={() => { const layers = [...doc.layers], at = layers.indexOf(layer); [layers[at - 1], layers[at]] = [layers[at], layers[at - 1]]; change({ ...doc, layers }) }}><ArrowDown size={14} /></button><button aria-label="Move layer up" disabled={doc.layers.indexOf(layer) === doc.layers.length - 1} onClick={() => { const layers = [...doc.layers], at = layers.indexOf(layer); [layers[at + 1], layers[at]] = [layers[at], layers[at + 1]]; change({ ...doc, layers }) }}><ArrowUp size={14} /></button><button aria-label="Toggle layer visibility" aria-pressed={layer.visible} onClick={() => updateLayer({ visible: !layer.visible })}><Eye size={14} /></button><button aria-label="Toggle layer lock" aria-pressed={layer.locked} onClick={() => updateLayer({ locked: !layer.locked })}><Lock size={13} /></button><button aria-label="Duplicate layer" onClick={() => { const duplicate = { ...layer, id: id(), name: `${layer.name.slice(0, 110)} copy`, locked: false, cels: layer.cels.map(cel => ({ ...cel, id: id() })) }; change({ ...doc, layers: [...doc.layers, duplicate] }) }}><Copy size={13} /></button><button aria-label="Delete layer" disabled={layer.locked} onClick={() => removeTrack(layer.id)}><Trash2 size={13} /></button></div><button className="fbf-button" disabled={!mutable} onClick={() => engineEdit(engine => engine.clearPixels())}>Clear {selection ? 'selection' : 'drawing'}</button></section>
      </>}
      </div></aside></div>
    <div className="fbf-timeline-resize" role="separator" aria-label="Resize timeline" aria-orientation="horizontal" tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') setTimelineHeight(value => clamp(value + (event.key === 'ArrowUp' ? 20 : -20), 150, 440)) }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const start = event.clientY, height = timelineHeight, target = event.currentTarget; const move = (event: PointerEvent) => setTimelineHeight(clamp(height + start - event.clientY, 150, Math.max(150, window.innerHeight - 330))); const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end) }; target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end) }} />
    <Timeline doc={doc} playing={playing} frame={frame} layerId={layer.id} onSelect={select} onChange={change} onError={setError} onNew={newDrawing} onSplit={() => run(() => change(splitCel(doc, layer.id, frame)))} onDelete={removeDrawing} onAddLayer={addLayer} onDeleteLayer={removeTrack} onInbetween={openInbetweens} />
    {inbetween && <Suspense fallback={<div className="fbf-progress-overlay" role="status">Opening in-between studio…</div>}><InbetweenDialog document={inbetween.document} layerId={inbetween.layerId} fromCelId={inbetween.fromCelId} onClose={() => setInbetween(null)} onApply={applyInbetweens} /></Suspense>}
    {error && <div className="fbf-toast" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={14} /></button></div>}
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => { const files = event.target.files; void importImages(files); event.target.value = '' }} />
    {exportProgress !== null && <div className="fbf-progress-overlay" role="dialog" aria-modal="true" aria-label="Processing animation"><div><Clapperboard size={29} /><h2>Preparing your animation</h2><progress value={exportProgress} max={1} /><p>{Math.round(exportProgress * 100)}%</p><button className="fbf-button" onClick={() => exportAbort.current?.abort()}>Cancel</button></div></div>}
  </div>
}

function FilmIcon() { return <Clapperboard size={13} /> }
