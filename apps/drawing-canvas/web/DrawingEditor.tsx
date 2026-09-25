import { shortcutBlocked, useShortcuts } from '@artist-studio/ui-component'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowUp, Brush, Check, ChevronDown, Circle,
  Copy, Download, Eraser, Eye, EyeOff, FlipHorizontal2, FlipVertical2,
  Hand, ImagePlus, Layers, Lasso, Lock, Maximize, Minus, MousePointer2,
  PaintBucket, Pipette, Plus, Redo2, Save, Scan, Square, Trash2,
  Undo2, Unlock, X, type LucideIcon,
} from 'lucide-react'
import { DrawingEngine } from './engine/engine'
import { BRUSH_PRESETS, DEFAULT_BRUSH } from './engine/brush'
import type { Bounds, BrushSettings, DrawingDocument, DrawingTool, EngineState, Point, Quad, Selection } from './engine/types'
import { boundsCorners, isValidQuad, quadBounds } from './engine/geometry'
import { dragTransform, flipTransform, hitTransformHandle, insideTransformQuad, numericTransform, type TransformHandle, type TransformMode } from './transformControls'
import { TransformOverlay } from './TransformOverlay'
import { getProject, saveProject, type ProjectRecord } from './library'
import './drawing-canvas.css'

// Fast Refresh can remount a component when its hook signature changes. Keep
// only that hot-reload handoff alive across module replacement; normal project
// navigation always loads its persisted record.
const hotSnapshots: Map<string, DrawingDocument> = import.meta.hot
  ? (import.meta.hot.data.drawingSnapshots ??= new Map<string, DrawingDocument>())
  : new Map<string, DrawingDocument>()
let moduleIsReloading = false
import.meta.hot?.dispose(() => { moduleIsReloading = true })

type View = { x: number; y: number; zoom: number }
type TransformGesture = {
  bounds: Bounds
  mode: TransformMode
  handle: TransformHandle
  quad: Quad
  valid: boolean
  changed: boolean
}
type Gesture = {
  pointerId: number
  tool: DrawingTool
  start: Point
  last: Point
  points: Point[]
  clientX: number
  clientY: number
  view: View
  outside: boolean
  transform?: TransformGesture
}

type ToolDefinition = { id: DrawingTool; label: string; shortcut: string; icon: LucideIcon }
const TOOLS: ToolDefinition[] = [
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: Brush },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: Eraser },
  { id: 'fill', label: 'Fill', shortcut: 'G', icon: PaintBucket },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: Pipette },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: Circle },
  { id: 'select-rectangle', label: 'Rectangle selection', shortcut: 'M', icon: Scan },
  { id: 'select-ellipse', label: 'Ellipse selection', shortcut: 'Shift M', icon: Circle },
  { id: 'lasso', label: 'Freehand selection', shortcut: 'L', icon: Lasso },
  { id: 'transform', label: 'Transform', shortcut: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Pan', shortcut: 'H / Space', icon: Hand },
]
const COLORS = ['#171a24', '#f8f4eb', '#707789', '#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#4a72ff', '#9b7de0', '#da8fac', '#8d5b45', '#607d65']
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
const colorInputValue = (color: string) => color.length <= 5 ? `#${color.slice(1, 4).split('').map(character => character + character).join('')}` : color.slice(0, 7)
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Drawing'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function IconButton({ icon: Icon, label, active, disabled, onClick, className = '' }: {
  icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; onClick: () => void; className?: string
}) {
  return <button type="button" className={`dc-icon-button ${active ? 'is-active' : ''} ${className}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon size={17} strokeWidth={1.7} /></button>
}

function Slider({ label, value, min = 0, max = 1, step = 0.01, suffix = '%', onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; suffix?: string; onChange: (value: number) => void
}) {
  return <label className="dc-slider"><span>{label}<span className="dc-value">{suffix === '%' ? Math.round(value * 100) : Math.round(value)}{suffix}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>
}

function LayerThumbnail({ layerId, revision, renderLayer }: {
  layerId: string; revision: number; renderLayer: (id: string, context: CanvasRenderingContext2D) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (context) renderLayer(layerId, context)
  }, [layerId, revision, renderLayer])
  return <canvas ref={canvasRef} width={84} height={84} aria-hidden="true" />
}

function SelectionOutline({ selection }: { selection: Selection }) {
  if (selection.kind === 'lasso') return <polygon points={selection.points.map(point => `${point.x},${point.y}`).join(' ')} />
  const { x, y, width, height } = selection.bounds
  return selection.kind === 'ellipse' ? <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} /> : <rect x={x} y={y} width={width} height={height} />
}

function selectionFor(gesture: Gesture): Selection {
  if (gesture.tool === 'lasso') return { kind: 'lasso', points: gesture.points }
  return {
    kind: gesture.tool === 'select-ellipse' ? 'ellipse' : 'rectangle',
    bounds: { x: Math.min(gesture.start.x, gesture.last.x), y: Math.min(gesture.start.y, gesture.last.y), width: Math.abs(gesture.last.x - gesture.start.x), height: Math.abs(gesture.last.y - gesture.start.y) },
  }
}

export function DrawingEditor({ projectId }: { projectId: string }) {
  return <DrawingProjectLoader key={projectId} projectId={projectId} />
}

function DrawingProjectLoader({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void getProject(projectId).then(record => {
      if (!cancelled) {
        if (record) setProject(record)
        else setError('This drawing could not be found.')
      }
    }).catch(error => { if (!cancelled) setError(messageOf(error)) })
    return () => { cancelled = true }
  }, [projectId])
  if (!project) return <div className="dc-loading"><Brush size={30} /><h2>{error ? 'Unable to open drawing' : 'Opening your canvas…'}</h2>{error && <><p>{error}</p><a href="#/drawing-canvas">Back to gallery</a></>}</div>
  return <DrawingStudio key={project.id} project={project} />
}

function DrawingStudio({ project }: { project: ProjectRecord }) {
  const engineRef = useRef<DrawingEngine | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paintFrameRef = useRef<number | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(false)
  const recordRef = useRef(project)
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveNowRef = useRef<() => Promise<void>>(async () => {})
  const navigationTargetRef = useRef<string | null>(null)
  const navigationPromiseRef = useRef<Promise<void> | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, zoom: 1 })
  const spaceRef = useRef(false)
  const [state, setState] = useState<EngineState | null>(null)
  const [tool, setTool] = useState<DrawingTool>('brush')
  const [brush, setBrush] = useState<BrushSettings>({ ...DEFAULT_BRUSH })
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [draft, setDraft] = useState<Gesture | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [shapeFilled, setShapeFilled] = useState(false)
  const [tolerance, setTolerance] = useState(24)
  const [transformMode, setTransformMode] = useState<TransformMode>('resize')
  const [transformBounds, setTransformBounds] = useState<Bounds | null>(null)
  const [transformCursor, setTransformCursor] = useState('move')
  const [lockAspect, setLockAspect] = useState(false)
  const [widthScale, setWidthScale] = useState(100)
  const [heightScale, setHeightScale] = useState(100)
  const [skewX, setSkewX] = useState(0)
  const [skewY, setSkewY] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [panelTab, setPanelTab] = useState<'brush' | 'layers'>('brush')
  const [brushDetails, setBrushDetails] = useState(false)

  const updateView = useCallback((next: View) => { viewRef.current = next; setView(next) }, [])
  const paint = useCallback(() => {
    if (paintFrameRef.current !== null) return
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null
      const engine = engineRef.current
      const canvas = canvasRef.current
      if (!engine || !canvas) return
      const current = engine.getState()
      if (canvas.width !== current.width) canvas.width = current.width
      if (canvas.height !== current.height) canvas.height = current.height
      const context = canvas.getContext('2d')
      if (context) {
        const transform = gestureRef.current?.transform
        try {
          if (transform?.valid && transform.changed) engine.renderQuadPreview(context, transform.quad)
          else engine.render(context)
        } catch (reason) {
          engine.render(context)
          if (mountedRef.current) setError(messageOf(reason))
        }
      }
    })
  }, [])

  const renderLayer = useCallback((id: string, context: CanvasRenderingContext2D) => {
    engineRef.current?.renderLayer(id, context)
  }, [])

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    const engine = engineRef.current
    if (!engine || !dirtyRef.current) return saveQueueRef.current
    const revision = engine.getState().revision
    const nextRecord = { ...recordRef.current, updatedAt: Date.now(), document: engine.serialize() }
    if (mountedRef.current) setSaveStatus('saving')
    const operation = saveQueueRef.current.catch(() => {}).then(async () => {
      const saved = await saveProject(nextRecord)
      recordRef.current = saved
      if (engineRef.current === engine) {
        dirtyRef.current = engine.getState().revision !== revision
        if (mountedRef.current) setSaveStatus(dirtyRef.current ? 'unsaved' : 'saved')
      }
    }).catch(error => {
      if (engineRef.current === engine) dirtyRef.current = true
      if (mountedRef.current) { setSaveStatus('error'); setError(`Your latest changes could not be saved: ${messageOf(error)}`) }
      throw error
    })
    saveQueueRef.current = operation
    return operation
  }, [])
  useEffect(() => { saveNowRef.current = saveNow }, [saveNow])

  const cancelGesture = useCallback(() => {
    if (!gestureRef.current) return
    engineRef.current?.cancelStroke()
    gestureRef.current = null
    setDraft(null)
    paint()
  }, [paint])

  const navigateAfterSave = useCallback((targetHash: string): Promise<void> => {
    navigationTargetRef.current = targetHash
    if (navigationPromiseRef.current) return navigationPromiseRef.current
    const operation = (async () => {
      try {
        // Edits can finish while IndexedDB is committing. Flush the newest revision
        // before leaving, and discard only unfinished pointer gestures.
        do {
          cancelGesture()
          await saveNow()
          cancelGesture()
        } while (mountedRef.current && dirtyRef.current)
        if (mountedRef.current && navigationTargetRef.current !== null) {
          window.location.hash = navigationTargetRef.current
        }
      } catch (reason) {
        if (mountedRef.current) {
          setSaveStatus('error')
          setError(`Your latest changes could not be saved: ${messageOf(reason)}`)
        }
      } finally {
        navigationTargetRef.current = null
        navigationPromiseRef.current = null
      }
    })()
    navigationPromiseRef.current = operation
    return operation
  }, [cancelGesture, saveNow])

  useEffect(() => {
    const ownHash = `#/drawing-canvas/${encodeURIComponent(project.id)}`
    const onBeforeRouteChange = (event: Event) => {
      const destination = window.location.hash
      if (destination === ownHash) return
      cancelGesture()
      if (!dirtyRef.current && !navigationPromiseRef.current) return
      // The app router asks before replacing the editor. A failed save retains
      // both this component and its current in-memory artwork.
      event.preventDefault()
      window.history.replaceState(window.history.state, '', ownHash)
      void navigateAfterSave(destination)
    }
    window.addEventListener('artist-studio:before-route-change', onBeforeRouteChange)
    return () => window.removeEventListener('artist-studio:before-route-change', onBeforeRouteChange)
  }, [project.id, cancelGesture, navigateAfterSave])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false
    let ownedEngine: DrawingEngine | null = null
    let unsubscribe: (() => void) | undefined
    void DrawingEngine.create(hotSnapshots.get(project.id) ?? recordRef.current.document).then(engine => {
      if (cancelled) { engine.dispose(); return }
      hotSnapshots.delete(project.id)
      ownedEngine = engine
      engineRef.current = engine
      let revision = engine.getState().revision
      setState(engine.getState())
      setTransformBounds(engine.getTransformBounds())
      setDraft(null)
      gestureRef.current = null
      unsubscribe = engine.subscribe(() => {
        const next = engine.getState()
        setState(next)
        if (next.revision !== revision || !gestureRef.current) setTransformBounds(engine.getTransformBounds())
        paint()
        if (next.revision !== revision) {
          revision = next.revision
          dirtyRef.current = true
          setSaveStatus('unsaved')
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(() => { void saveNowRef.current().catch(() => {}) }, 650)
        }
      })
    }).catch(error => { if (!cancelled) setError(messageOf(error)) })
    return () => {
      cancelled = true
      mountedRef.current = false
      unsubscribe?.()
      if (ownedEngine) {
        ownedEngine.cancelStroke()
        // Preserve the latest committed artwork when effects restart during hot reload.
        recordRef.current = { ...recordRef.current, document: ownedEngine.serialize() }
        if (moduleIsReloading) hotSnapshots.set(project.id, recordRef.current.document)
        void saveNowRef.current().catch(() => {})
        ownedEngine.dispose()
        if (engineRef.current === ownedEngine) engineRef.current = null
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (paintFrameRef.current !== null) { cancelAnimationFrame(paintFrameRef.current); paintFrameRef.current = null }
    }
  }, [project, paint])

  useEffect(() => { paint() }, [state, paint])
  const fit = useCallback(() => {
    const viewport = viewportRef.current
    const current = engineRef.current?.getState()
    if (!viewport || !current) return
    const { width, height } = viewport.getBoundingClientRect()
    const zoom = clamp(Math.min((width - 96) / current.width, (height - 96) / current.height, 1), 0.05, 8)
    updateView({ x: (width - current.width * zoom) / 2, y: (height - current.height * zoom) / 2, zoom })
  }, [updateView])
  const ready = Boolean(state)
  useEffect(() => {
    if (!ready || !viewportRef.current) return
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [ready, fit])

  const zoomAt = useCallback((factor: number, x?: number, y?: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const bounds = viewport.getBoundingClientRect()
    const anchorX = x ?? bounds.width / 2
    const anchorY = y ?? bounds.height / 2
    const previous = viewRef.current
    const zoom = clamp(previous.zoom * factor, 0.05, 8)
    updateView({ zoom, x: anchorX - (anchorX - previous.x) * zoom / previous.zoom, y: anchorY - (anchorY - previous.y) * zoom / previous.zoom })
  }, [updateView])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!ready || !viewport) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (gestureRef.current) return
      if (event.shiftKey) {
        updateView({ ...viewRef.current, x: viewRef.current.x - event.deltaX, y: viewRef.current.y - event.deltaY })
      } else {
        const rect = viewport.getBoundingClientRect()
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
        zoomAt(Math.exp(-delta * 0.0015), event.clientX - rect.left, event.clientY - rect.top)
      }
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [ready, zoomAt, updateView])

  const run = useCallback((action: (engine: DrawingEngine) => void) => {
    const engine = engineRef.current
    if (!engine) return
    try { setError(null); action(engine) } catch (error) { setError(messageOf(error)) }
  }, [])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; void saveNowRef.current().catch(() => {}) } }
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutBlocked(event) || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (event.metaKey || event.ctrlKey) {
        if (key === 'z') { event.preventDefault(); cancelGesture(); run(engine => event.shiftKey ? engine.redo() : engine.undo()) }
        else if (key === 'y') { event.preventDefault(); cancelGesture(); run(engine => engine.redo()) }
        else if (key === 's') { event.preventDefault(); void saveNowRef.current().catch(() => {}) }
        else if (key === 'd') { event.preventDefault(); cancelGesture(); run(engine => engine.select(null)) }
        else if (key === '+' || key === '=') { event.preventDefault(); zoomAt(1.2) }
        else if (key === '-') { event.preventDefault(); zoomAt(1 / 1.2) }
        return
      }
      if (key === ' ') { event.preventDefault(); spaceRef.current = true; setSpaceDown(true); return }
      if (gestureRef.current && key !== 'escape') return
      const shortcuts: Record<string, DrawingTool> = { b: 'brush', e: 'eraser', g: 'fill', i: 'eyedropper', r: 'rectangle', o: 'ellipse', m: event.shiftKey ? 'select-ellipse' : 'select-rectangle', l: 'lasso', v: 'transform', h: 'hand' }
      if (shortcuts[key]) { event.preventDefault(); setTool(shortcuts[key]); if (['fill', 'rectangle', 'ellipse', 'transform'].includes(shortcuts[key])) setPanelTab('brush') }
      else if (key === '[' || key === ']') { event.preventDefault(); setBrush(previous => ({ ...previous, size: clamp(previous.size + (key === '[' ? -1 : 1) * Math.max(1, previous.size * 0.1), 1, 300) })) }
      else if (key === '0') { event.preventDefault(); fit() }
      else if (key === 'escape') {
        const wasDragging = Boolean(gestureRef.current)
        cancelGesture()
        if (!wasDragging) run(engine => engine.select(null))
      } else if (key === 'delete' || key === 'backspace') { event.preventDefault(); run(engine => engine.clearPixels()) }
    }
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === 'Space') { spaceRef.current = false; setSpaceDown(false) } }
    const onBlur = () => {
      spaceRef.current = false
      setSpaceDown(false)
      cancelGesture()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); window.removeEventListener('beforeunload', onBeforeUnload) }
  }, [cancelGesture, fit, run, zoomAt])

  function pointFor(event: { clientX: number; clientY: number; pressure: number; pointerType?: string }): Point {
    const rect = viewportRef.current!.getBoundingClientRect()
    const current = viewRef.current
    return { x: (event.clientX - rect.left - current.x) / current.zoom, y: (event.clientY - rect.top - current.y) / current.zoom, pressure: event.pointerType === 'pen' ? event.pressure : 1 }
  }
  function isInside(point: Point) { return Boolean(state && point.x >= 0 && point.y >= 0 && point.x < state.width && point.y < state.height) }
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!state || !engineRef.current || gestureRef.current || (event.button !== 0 && event.button !== 1)) return
    if ((event.target as HTMLElement).closest('button')) return
    const currentTool = spaceRef.current || event.button === 1 ? 'hand' : tool
    const point = pointFor(event)
    let transform: TransformGesture | undefined
    if (currentTool === 'transform') {
      const bounds = engineRef.current.getTransformBounds()
      const quad = boundsCorners(bounds)
      const handle = hitTransformHandle(quad, transformMode, point, viewRef.current.zoom)
      if (!handle && !insideTransformQuad(quad, point)) return
      transform = { bounds, mode: transformMode, handle: handle?.id ?? 'move', quad, valid: true, changed: false }
      setTransformCursor(handle?.cursor ?? 'move')
    } else if (currentTool !== 'hand' && !isInside(point)) return
    if (['brush', 'eraser', 'fill', 'rectangle', 'ellipse', 'transform'].includes(currentTool)) {
      const layer = engineRef.current.getState().layers.find(item => item.id === state.activeLayerId)
      if (layer?.locked || !layer?.visible) {
        setError(layer?.locked ? 'This layer is locked. Unlock it in Layers to draw.' : 'This layer is hidden. Show it in Layers to draw.')
        setPanelTab('layers')
        return
      }
    }
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    const gesture: Gesture = { pointerId: event.pointerId, tool: currentTool, start: point, last: point, points: [point], clientX: event.clientX, clientY: event.clientY, view: { ...viewRef.current }, outside: false, transform }
    gestureRef.current = gesture
    if (currentTool === 'brush' || currentTool === 'eraser') run(engine => engine.beginStroke(point, brush, currentTool === 'eraser'))
    else if (currentTool === 'fill') run(engine => engine.fill(point, brush.color, tolerance))
    else if (currentTool === 'eyedropper') run(engine => { const color = engine.sampleColor(point); if (color) setBrush(previous => ({ ...previous, color })); else setError('There is no color at this point.') })
    setDraft({ ...gesture })
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (gesture && event.pointerId !== gesture.pointerId) return
    const point = pointFor(event)
    setCursor(isInside(point) ? point : null)
    if (!gesture && tool === 'transform' && transformBounds) {
      const quad = boundsCorners(transformBounds)
      const handle = hitTransformHandle(quad, transformMode, point, viewRef.current.zoom)
      setTransformCursor(handle?.cursor ?? (insideTransformQuad(quad, point) ? 'move' : 'default'))
    }
    if (!gesture || !state) return
    if (gesture.transform) {
      const transform = gesture.transform
      const corner = transform.handle.length === 2
      const quad = dragTransform(transform.bounds, transform.mode, transform.handle, gesture.start, point, lockAspect || (event.shiftKey && corner))
      const original = boundsCorners(transform.bounds)
      gesture.last = point
      gesture.transform = { ...transform, quad, valid: isValidQuad(quad), changed: quad.some((corner, index) => Math.hypot(corner.x - original[index].x, corner.y - original[index].y) > 0.001) }
      setDraft({ ...gesture })
      paint()
      return
    }
    if (gesture.tool === 'hand') {
      updateView({ ...gesture.view, x: gesture.view.x + event.clientX - gesture.clientX, y: gesture.view.y + event.clientY - gesture.clientY })
      return
    }
    if (gesture.tool === 'brush' || gesture.tool === 'eraser') {
      if (gesture.outside) return
      const points = event.nativeEvent.getCoalescedEvents?.() ?? []
      for (const sample of points.length ? points : [event.nativeEvent]) {
        const next = pointFor(sample)
        if (!isInside(next)) {
          run(engine => engine.moveStroke({ ...next, x: clamp(next.x, 0, state.width - 0.01), y: clamp(next.y, 0, state.height - 0.01) }))
          gesture.outside = true
          break
        }
        run(engine => engine.moveStroke(next))
      }
      return
    }
    let next = { ...point, x: clamp(point.x, 0, state.width), y: clamp(point.y, 0, state.height) }
    if (event.shiftKey && ['rectangle', 'ellipse', 'select-rectangle', 'select-ellipse'].includes(gesture.tool)) {
      const side = Math.min(Math.abs(next.x - gesture.start.x), Math.abs(next.y - gesture.start.y))
      next = { ...next, x: gesture.start.x + Math.sign(next.x - gesture.start.x) * side, y: gesture.start.y + Math.sign(next.y - gesture.start.y) * side }
    }
    gesture.last = next
    if (gesture.tool === 'lasso') gesture.points.push(next)
    setDraft({ ...gesture, points: [...gesture.points] })
  }
  function finishGesture(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (!cancelled && gesture.transform) onPointerMove(event)
    gestureRef.current = null
    setDraft(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    paint()
    if (cancelled) { run(engine => engine.cancelStroke()); return }
    run(engine => {
      if (gesture.tool === 'brush' || gesture.tool === 'eraser') engine.endStroke()
      else if (gesture.tool === 'rectangle' || gesture.tool === 'ellipse') engine.drawShape(gesture.tool, gesture.start, gesture.last, brush, shapeFilled)
      else if (gesture.tool === 'lasso' || gesture.tool === 'select-rectangle' || gesture.tool === 'select-ellipse') {
        const selection = selectionFor(gesture)
        engine.select(selection.kind === 'lasso' ? selection.points.length > 2 ? selection : null : selection.bounds.width > 1 && selection.bounds.height > 1 ? selection : null)
      } else if (gesture.transform?.changed) {
        if (!gesture.transform.valid) throw new Error('Keep the corners in order without crossing or collapsing the transform box.')
        engine.transformQuad(gesture.transform.quad)
        resetTransformFields()
      }
    })
  }

  async function leaveGallery() {
    await navigateAfterSave('#/drawing-canvas')
  }
  async function exportPng() {
    const engine = engineRef.current
    if (!engine) return
    try {
      const canvas = engine.toCanvas()
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG.')), 'image/png'))
      download(blob, `${safeName(engine.getState().name)}.png`)
    } catch (error) { setError(messageOf(error)) }
  }
  function exportProject() {
    run(engine => download(new Blob([JSON.stringify(engine.serialize())], { type: 'application/json' }), `${safeName(engine.getState().name)}.drawing.json`))
  }
  async function importImage(file: File | undefined) {
    if (!file || !engineRef.current) return
    const engine = engineRef.current
    setImageBusy(true)
    const url = URL.createObjectURL(file)
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error('Choose an image smaller than 40 MB.')
      const image = new Image()
      image.src = url
      await image.decode()
      if (image.width * image.height > 32_000_000) throw new Error('Choose an image with fewer than 32 million pixels.')
      if (!mountedRef.current || engineRef.current !== engine) return
      await engine.importImage(image)
      setPanelTab('layers')
      setError(null)
    } catch (error) { if (mountedRef.current) setError(messageOf(error)) }
    finally { URL.revokeObjectURL(url); if (mountedRef.current) setImageBusy(false) }
  }

  function resetTransformFields() {
    setWidthScale(100)
    setHeightScale(100)
    setRotation(0)
    setSkewX(0)
    setSkewY(0)
  }
  function applyNumericTransform() {
    run(engine => {
      const bounds = engine.getTransformBounds()
      const quad = numericTransform(bounds, widthScale, heightScale, rotation, transformMode === 'skew' ? skewX : 0, transformMode === 'skew' ? skewY : 0)
      if (!isValidQuad(quad)) throw new Error('These values collapse the transform. Reduce the skew angles or increase its size.')
      engine.transformQuad(quad)
      resetTransformFields()
    })
  }

  const changeBrush = <K extends keyof BrushSettings>(key: K, value: BrushSettings[K]) => setBrush(previous => ({ ...previous, [key]: value }))
  const activeLayer = state?.layers.find(layer => layer.id === state.activeLayerId)
  const activeIndex = state?.layers.findIndex(layer => layer.id === state.activeLayerId) ?? -1
  const layerLimit = state ? Math.min(32, Math.floor(67_108_864 / (state.width * state.height))) : 32
  const currentTool = TOOLS.find(item => item.id === tool)!
  const CurrentIcon = currentTool.icon
  const previewSelection = draft && ['lasso', 'select-rectangle', 'select-ellipse'].includes(draft.tool) ? selectionFor(draft) : state?.selection
  const transformQuad = draft?.transform?.quad ?? (transformBounds ? boundsCorners(transformBounds) : null)
  const numericQuad = transformBounds ? numericTransform(transformBounds, widthScale, heightScale, rotation, transformMode === 'skew' ? skewX : 0, transformMode === 'skew' ? skewY : 0) : null
  const numericValid = numericQuad && isValidQuad(numericQuad) && [widthScale, heightScale].every(value => Number.isFinite(value) && value >= 1 && value <= 1000) && Number.isFinite(rotation) && Math.abs(rotation) <= 360 && [skewX, skewY].every(value => Number.isFinite(value) && Math.abs(value) <= 80)
  const transformUnavailable = activeLayer?.locked || !activeLayer?.visible || !transformBounds
  const resizing = draft?.transform?.mode === 'resize' && draft.transform.handle !== 'move' ? draft.transform : null
  const draftExtent = resizing ? quadBounds(resizing.quad) : null
  const displayedWidth = resizing && draftExtent ? Math.round(draftExtent.width / resizing.bounds.width * 100) : widthScale
  const displayedHeight = resizing && draftExtent ? Math.round(draftExtent.height / resizing.bounds.height * 100) : heightScale
  const transformHelp = draft?.transform ? draft.transform.valid ? 'Release to apply · Esc to cancel' : 'Keep corners in order; crossing is not allowed' : transformMode === 'resize' ? 'Drag handles to resize · Shift locks corner proportions' : transformMode === 'skew' ? 'Drag an edge handle to skew · Drag inside to move' : 'Drag each corner to change perspective'
  const cursorClass = spaceDown || tool === 'hand' ? draft?.tool === 'hand' ? 'is-grabbing' : 'is-hand' : tool === 'transform' ? 'is-move' : 'is-drawing'

  useShortcuts([{ keys: 'Mod+Shift+e', label: 'Export PNG', run: () => { void exportPng() } }], !!state)

  if (!state) return <div className="dc-loading"><Brush size={30} /><h2>{error || 'Preparing your canvas…'}</h2>{error && <a href="#/drawing-canvas">Back to gallery</a>}</div>
  return <div className="dc-studio">
    <header className="dc-header">
      <button className="dc-gallery-button" aria-label="Back to gallery" onClick={() => { void leaveGallery() }}><ArrowLeft size={16} /> <span>Gallery</span></button>
      <span className="dc-header-divider" />
      <div className="dc-document-heading"><input aria-label="Drawing name" value={state.name} maxLength={120} onChange={event => run(engine => engine.setName(event.target.value))} onBlur={() => { if (!engineRef.current?.getState().name.trim()) run(engine => engine.setName('Untitled drawing')) }} /><span className={`dc-save-status ${saveStatus === 'error' ? 'is-error' : ''}`} role="status">{saveStatus === 'saved' ? <Check size={11} /> : <span className="dc-status-dot" />}{saveStatus === 'saved' ? 'Saved on this device' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Unsaved changes'}{saveStatus === 'error' && <button onClick={() => { void saveNow().catch(() => {}) }}>Retry</button>}</span></div>
      <div className="dc-header-actions">
        <div className="dc-history"><IconButton icon={Undo2} label="Undo (⌘/Ctrl Z)" disabled={!state.canUndo} onClick={() => run(engine => engine.undo())} /><IconButton icon={Redo2} label="Redo (⌘/Ctrl Shift Z)" disabled={!state.canRedo} onClick={() => run(engine => engine.redo())} /></div>
        <button className="dc-button dc-import-button" aria-label="Import image" disabled={imageBusy} onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} /><span>{imageBusy ? 'Importing…' : 'Import image'}</span></button>
        <IconButton icon={Save} label="Download editable drawing project" onClick={exportProject} />
        <button className="dc-button dc-primary" aria-label="Export PNG" onClick={() => { void exportPng() }}><Download size={15} /><span>Export PNG</span></button>
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importImage(file) }} />
      </div>
    </header>
    <div className="dc-workspace">
      <nav className="dc-tools" aria-label="Drawing tools">
        <div className="dc-tool-brand"><Brush size={20} /></div>
        {TOOLS.map((item, index) => <div key={item.id} className={index === 4 || index === 6 || index === 9 ? 'dc-tool-divider' : ''}><IconButton icon={item.icon} label={`${item.label} (${item.shortcut})`} active={tool === item.id} onClick={() => { setTool(item.id); if (['fill', 'rectangle', 'ellipse', 'transform'].includes(item.id)) setPanelTab('brush') }} /></div>)}
        <div className="dc-toolbar-color"><input aria-label="Brush color" type="color" value={brush.color} onChange={event => changeBrush('color', event.target.value)} /></div>
      </nav>
      <main className="dc-stage-area">
        <div className="dc-context-bar"><div className="dc-current-tool"><CurrentIcon size={14} /><span>{currentTool.label}</span></div><div className="dc-context-description">{tool === 'transform' ? transformHelp : tool === 'lasso' || tool.startsWith('select-') ? 'Select an area to paint, move or erase' : tool === 'hand' ? 'Drag to move around your canvas' : tool === 'fill' ? 'Fill connected pixels on the active layer' : tool === 'eyedropper' ? 'Pick a color from your canvas' : tool === 'rectangle' || tool === 'ellipse' ? 'Hold Shift for equal sides' : 'Make your mark'}</div>{state.selection && <button className="dc-text-button" onClick={() => run(engine => engine.select(null))}>Deselect <X size={12} /></button>}</div>
        <div ref={viewportRef} className={`dc-viewport ${cursorClass}`} style={tool === 'transform' && !spaceDown ? { cursor: transformCursor } : undefined} tabIndex={-1} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event => finishGesture(event)} onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => finishGesture(event, true)} onPointerLeave={() => setCursor(null)} onContextMenu={event => event.preventDefault()}>
          <div className="dc-artboard" style={{ width: state.width, height: state.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <canvas ref={canvasRef} width={state.width} height={state.height} aria-label="Drawing canvas" />
            <svg className="dc-canvas-overlay" viewBox={`0 0 ${state.width} ${state.height}`} width={state.width} height={state.height}>
              {draft && (draft.tool === 'rectangle' || draft.tool === 'ellipse') && <g fill={shapeFilled ? brush.color : 'none'} stroke={shapeFilled ? 'none' : brush.color} strokeWidth={brush.size} opacity={brush.opacity}><SelectionOutline selection={{ ...selectionFor(draft), kind: draft.tool } as Selection} /></g>}
              {previewSelection && tool !== 'transform' && <g className="dc-selection"><g className="dc-selection-under"><SelectionOutline selection={previewSelection} /></g><g className="dc-selection-over"><SelectionOutline selection={previewSelection} /></g></g>}
              {tool === 'transform' && transformBounds && transformQuad && !transformUnavailable && <TransformOverlay bounds={draft?.transform?.bounds ?? transformBounds} quad={transformQuad} mode={transformMode} zoom={view.zoom} invalid={draft?.transform?.valid === false} />}
              {cursor && !spaceDown && (tool === 'brush' || tool === 'eraser') && <g className="dc-brush-cursor"><circle cx={cursor.x} cy={cursor.y} r={brush.size / 2} stroke="white" strokeWidth={2 / view.zoom} /><circle cx={cursor.x} cy={cursor.y} r={brush.size / 2} stroke="#20232c" strokeWidth={1 / view.zoom} /></g>}
            </svg>
          </div>
          <div className="dc-zoom-controls" onPointerDown={event => event.stopPropagation()}><IconButton icon={Minus} label="Zoom out" onClick={() => zoomAt(1 / 1.2)} /><button className="dc-zoom-value" title="Reset to 100%" onClick={() => zoomAt(1 / viewRef.current.zoom)}>{Math.round(view.zoom * 100)}%</button><IconButton icon={Plus} label="Zoom in" onClick={() => zoomAt(1.2)} /><span /><IconButton icon={Maximize} label="Fit canvas (0)" onClick={fit} /></div>
        </div>
        <footer className="dc-stage-footer"><span><span className="dc-canvas-dot" />{state.width.toLocaleString()} × {state.height.toLocaleString()} px</span><span className="dc-stage-help">Scroll to zoom <span>·</span> Space to pan</span><span>{activeLayer?.locked && <Lock size={11} />}{activeLayer?.name}</span></footer>
      </main>
      <aside className="dc-inspector" aria-label="Drawing settings">
        <div className="dc-panel-tabs"><button className={panelTab === 'brush' ? 'is-active' : ''} onClick={() => setPanelTab('brush')}><Brush size={14} />Studio</button><button className={panelTab === 'layers' ? 'is-active' : ''} onClick={() => setPanelTab('layers')}><Layers size={14} />Layers <span>{state.layers.length}</span></button></div>
        <div className="dc-panel-scroll">
          {panelTab === 'brush' ? <>
            {tool === 'fill' && <section className="dc-section"><div className="dc-section-heading"><h2>Fill</h2></div><Slider label="Color tolerance" value={tolerance} min={0} max={255} step={1} suffix="" onChange={setTolerance} /><p className="dc-hint">Higher tolerance includes more similar colors. Fills stay inside your selection.</p></section>}
            {(tool === 'rectangle' || tool === 'ellipse') && <section className="dc-section"><div className="dc-section-heading"><h2>Shape</h2></div><label className="dc-checkbox"><input type="checkbox" checked={shapeFilled} onChange={event => setShapeFilled(event.target.checked)} />Fill shape</label><p className="dc-hint">Brush size controls the outline width.</p></section>}
            {tool === 'transform' && <section className="dc-section dc-transform-section">
              <div className="dc-section-heading"><h2>Transform</h2><span>{state.selection ? 'Selection' : 'Active layer'}</span></div>
              <div className="dc-transform-modes" role="group" aria-label="Transform mode">{(['resize', 'skew', 'perspective'] as const).map(mode => <button key={mode} aria-pressed={transformMode === mode} className={transformMode === mode ? 'is-active' : ''} disabled={Boolean(draft?.transform)} onClick={() => { setTransformMode(mode); resetTransformFields() }}>{mode === 'resize' ? 'Resize' : mode === 'skew' ? 'Skew' : 'Perspective'}</button>)}</div>
              <p className={`dc-hint dc-transform-hint ${draft?.transform?.valid === false ? 'is-invalid' : ''}`}>{transformHelp}</p>
              <div className="dc-transform-fields">
                <label>Width (%)<input aria-label="Transform width percent" type="number" min={1} max={1000} step={1} value={displayedWidth} disabled={Boolean(draft?.transform)} onChange={event => { const value = Number(event.target.value); setWidthScale(value); if (lockAspect) setHeightScale(value) }} /></label>
                <label>Height (%)<input aria-label="Transform height percent" type="number" min={1} max={1000} step={1} value={displayedHeight} disabled={Boolean(draft?.transform)} onChange={event => { const value = Number(event.target.value); setHeightScale(value); if (lockAspect) setWidthScale(value) }} /></label>
              </div>
              <label className="dc-checkbox dc-aspect-lock"><input type="checkbox" checked={lockAspect} onChange={event => { setLockAspect(event.target.checked); if (event.target.checked) setHeightScale(widthScale) }} />Lock aspect ratio</label>
              {transformMode === 'skew' && <div className="dc-transform-fields"><label>Skew X (°)<input aria-label="Skew X degrees" type="number" min={-80} max={80} step={1} value={skewX} onChange={event => setSkewX(Number(event.target.value))} /></label><label>Skew Y (°)<input aria-label="Skew Y degrees" type="number" min={-80} max={80} step={1} value={skewY} onChange={event => setSkewY(Number(event.target.value))} /></label></div>}
              <label className="dc-field">Rotation (°)<input aria-label="Transform rotation degrees" type="number" min={-360} max={360} step={1} value={rotation} onChange={event => setRotation(Number(event.target.value))} /></label>
              {!numericValid && <p className="dc-hint dc-transform-validation">Use a size from 1–1000%, rotation from −360–360°, and skew from −80–80°. The box must have a visible area.</p>}
              <button className="dc-button dc-wide dc-transform-apply" disabled={!numericValid || transformUnavailable || Boolean(draft?.transform)} onClick={applyNumericTransform}>Apply transform</button>
              <div className="dc-flips"><button className="dc-button" disabled={transformUnavailable} onClick={() => run(engine => engine.transformQuad(flipTransform(engine.getTransformBounds(), 'horizontal')))}><FlipHorizontal2 size={14} />Flip H</button><button className="dc-button" disabled={transformUnavailable} onClick={() => run(engine => engine.transformQuad(flipTransform(engine.getTransformBounds(), 'vertical')))}><FlipVertical2 size={14} />Flip V</button></div>
              <p className="dc-hint">Each drag applies one transform. Use Undo to restore the previous pixels.</p>
            </section>}
            {tool !== 'transform' && <>
            <section className="dc-section"><div className="dc-section-heading"><h2>Brush library</h2><span>{BRUSH_PRESETS.length} brushes</span></div><div className="dc-presets">{BRUSH_PRESETS.map(preset => <button key={preset.id} className={`dc-preset ${brush.kind === preset.id ? 'is-active' : ''}`} title={preset.description} onClick={() => { setBrush({ ...preset.settings, color: brush.color }); setTool('brush') }}><span className={`dc-preset-sample dc-preset-${preset.id}`} /><span>{preset.name}</span>{brush.kind === preset.id && <Check size={13} />}</button>)}</div></section>
            <section className="dc-section"><div className="dc-section-heading"><h2>Brush settings</h2><span>{brush.kind}</span></div><Slider label="Size" value={brush.size} min={1} max={300} step={1} suffix=" px" onChange={value => changeBrush('size', value)} /><Slider label="Opacity" value={brush.opacity} onChange={value => changeBrush('opacity', value)} /><button className="dc-disclosure" aria-expanded={brushDetails} onClick={() => setBrushDetails(previous => !previous)}>Brush dynamics<ChevronDown size={13} className={brushDetails ? 'is-open' : ''} /></button>{brushDetails && <div className="dc-dynamics"><Slider label="Flow" value={brush.flow} min={0.01} onChange={value => changeBrush('flow', value)} /><Slider label="Hardness" value={brush.hardness} onChange={value => changeBrush('hardness', value)} /><Slider label="Spacing" value={brush.spacing} min={0.01} max={1} onChange={value => changeBrush('spacing', value)} /><Slider label="Smoothing" value={brush.smoothing} onChange={value => changeBrush('smoothing', value)} /><label className="dc-checkbox"><input type="checkbox" checked={brush.pressureSize} onChange={event => changeBrush('pressureSize', event.target.checked)} />Pressure affects size</label><label className="dc-checkbox"><input type="checkbox" checked={brush.pressureOpacity} onChange={event => changeBrush('pressureOpacity', event.target.checked)} />Pressure affects opacity</label></div>}</section>
            <section className="dc-section"><div className="dc-section-heading"><h2>Color</h2><span className="dc-color-hex">{brush.color.toUpperCase()}</span></div><div className="dc-color-picker"><input aria-label="Choose color" type="color" value={brush.color} onChange={event => changeBrush('color', event.target.value)} /><div><strong>Current color</strong><span>Tap to explore colors</span></div><IconButton icon={Pipette} label="Pick color from canvas (I)" active={tool === 'eyedropper'} onClick={() => setTool('eyedropper')} /></div><div className="dc-palette">{COLORS.map(color => <button key={color} title={color} aria-label={`Use color ${color}`} aria-pressed={brush.color.toLowerCase() === color} style={{ background: color }} className={brush.color.toLowerCase() === color ? 'is-active' : ''} onClick={() => changeBrush('color', color)} />)}</div></section>
            </>}
            <section className="dc-section dc-layer-summary"><button onClick={() => setPanelTab('layers')}><Layers size={16} /><span><strong>{activeLayer?.name}</strong><small>{state.layers.length} {state.layers.length === 1 ? 'layer' : 'layers'} in this drawing</small></span><ChevronDown size={14} /></button></section>
          </> : <>
            <section className="dc-section dc-layers-section"><div className="dc-section-heading"><h2>Layers</h2><IconButton icon={Plus} label={state.layers.length >= layerLimit ? `Maximum ${layerLimit} layers for this canvas` : 'Add layer'} disabled={state.layers.length >= layerLimit} onClick={() => run(engine => engine.addLayer())} /></div><p className="dc-hint dc-layer-hint">Paint on the selected layer.</p><div className="dc-layer-list">{[...state.layers].reverse().map(layer => <div key={layer.id} className={`dc-layer ${layer.id === state.activeLayerId ? 'is-active' : ''}`}><button className="dc-layer-select" aria-label={`Select ${layer.name}`} aria-pressed={layer.id === state.activeLayerId} onClick={() => run(engine => engine.setActiveLayer(layer.id))}><span className="dc-layer-thumbnail"><LayerThumbnail layerId={layer.id} revision={state.revision} renderLayer={renderLayer} /></span><span><strong>{layer.name}</strong><small>{Math.round(layer.opacity * 100)}%{layer.blendMode !== 'source-over' ? ` · ${layer.blendMode}` : ''}</small></span></button><div className="dc-layer-toggles"><IconButton icon={layer.visible ? Eye : EyeOff} label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} onClick={() => run(engine => engine.updateLayer(layer.id, { visible: !layer.visible }))} /><IconButton icon={layer.locked ? Lock : Unlock} label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`} active={layer.locked} onClick={() => run(engine => engine.updateLayer(layer.id, { locked: !layer.locked }))} /></div></div>)}</div><div className="dc-layer-actions"><IconButton icon={Copy} label={state.layers.length >= layerLimit ? `Maximum ${layerLimit} layers for this canvas` : 'Duplicate layer'} disabled={state.layers.length >= layerLimit} onClick={() => run(engine => engine.duplicateLayer())} /><IconButton icon={ArrowUp} label="Move layer up" disabled={activeIndex === state.layers.length - 1} onClick={() => run(engine => engine.moveLayer(1))} /><IconButton icon={ArrowDown} label="Move layer down" disabled={activeIndex <= 0} onClick={() => run(engine => engine.moveLayer(-1))} /><button className="dc-text-button" title="Merge visible, unlocked Normal layers into the layer below" disabled={activeIndex <= 0 || activeLayer?.locked || !activeLayer?.visible || activeLayer?.blendMode !== 'source-over' || state.layers[activeIndex - 1]?.locked || !state.layers[activeIndex - 1]?.visible || state.layers[activeIndex - 1]?.blendMode !== 'source-over'} onClick={() => run(engine => engine.mergeDown())}>Merge down</button><IconButton icon={Trash2} label="Delete layer" disabled={state.layers.length <= 1 || activeLayer?.locked || !activeLayer?.visible} onClick={() => run(engine => engine.removeLayer())} /></div></section>
            {activeLayer && <section className="dc-section"><div className="dc-section-heading"><h2>Layer settings</h2>{activeLayer.locked && <Lock size={12} />}</div><label className="dc-field">Name<input value={activeLayer.name} maxLength={80} onChange={event => run(engine => engine.updateLayer(activeLayer.id, { name: event.target.value }))} onBlur={() => { if (!activeLayer.name.trim()) run(engine => engine.updateLayer(activeLayer.id, { name: 'Layer' })) }} /></label><Slider label="Opacity" value={activeLayer.opacity} onChange={value => run(engine => engine.updateLayer(activeLayer.id, { opacity: value }))} /><label className="dc-field">Blend mode<select value={activeLayer.blendMode} onChange={event => run(engine => engine.updateLayer(activeLayer.id, { blendMode: event.target.value as typeof activeLayer.blendMode }))}><option value="source-over">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option><option value="darken">Darken</option><option value="lighten">Lighten</option></select></label><button className="dc-button dc-wide" disabled={activeLayer.locked || !activeLayer.visible} onClick={() => run(engine => engine.clearPixels())}><Eraser size={14} />{state.selection ? 'Clear selection' : 'Clear layer'}</button></section>}
            <section className="dc-section"><div className="dc-section-heading"><h2>Canvas background</h2></div><label className="dc-checkbox"><input type="checkbox" checked={state.background === null} onChange={event => run(engine => engine.setBackground(event.target.checked ? null : '#ffffff'))} />Transparent background</label>{state.background !== null && <label className="dc-background-color"><input aria-label="Canvas background color" type="color" value={colorInputValue(state.background)} onChange={event => run(engine => engine.setBackground(event.target.value))} /><span>{state.background.toUpperCase()}</span></label>}<p className="dc-hint">Background is included in your PNG export.</p></section>
          </>}
        </div>
        <div className="dc-inspector-footer"><span className="dc-live-dot" />Drawing Canvas<span>v1</span></div>
      </aside>
    </div>
    {error && <div className="dc-error-toast" role="alert"><span>{error}</span><IconButton icon={X} label="Dismiss error" onClick={() => setError(null)} /></div>}
  </div>
}
