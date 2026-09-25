import { useShortcuts } from '@artist-studio/ui-component'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  PanelLeft,
  PanelRight,
  Star,
  Settings2,
  Play,
  Pause,
  Maximize,
  ArrowDown,
  ArrowUp,
  Brush,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FlaskConical,
  Group,
  Hand,
  ImagePlus,
  MousePointer2,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Ungroup,
} from 'lucide-react'
import { navigate } from '../app/routes'
import { Button, CollapsibleSection, IconButton, Select } from '../ui/controls'
import { PropertyRow, SliderField } from '../ui/fields'
import { duplicateBrush, listAllBrushes } from './v2/brushLibrary'
import { createImageLayerV2, createLayerV2 } from './v2/core/defaults'
import type {
  BlendModeV2,
  BrushV2,
  ImageLayerV2Data,
  PaintDocumentV2,
  StrokePointV2,
  StrokeV2,
} from './v2/core/types'
import { strokeAtPoint } from './v2/input/hitTest'
import { getBrushFillKind } from './v2/core/fill'
import { importImageFile, loadImageRaster } from './v2/input/imageImport'
import { fitImageToCanvas } from './v2/input/imageTransform'
import './v2/ui/ImageLayerControls.css'
import './PaintWorkspace.css'
import {
  fromPointer,
  randomStrokeSeed,
  snapshotStroke,
  stabilizePoint,
} from './v2/input/sampler'
import { BrushInspector } from './v2/ui/BrushInspector'
import { BrushPreview } from './v2/ui/BrushPreview'
import { groupLayers, moveLayerEntry } from './v2/core/layerOrder'
import { LayerTree } from './v2/ui/LayerTree'
import { LayerThumbnail } from './v2/ui/LayerThumbnail'
import { ImageLayerTransform } from './v2/ui/ImageLayerTransform'
import { PaintExportModal } from './v2/ui/PaintExportModal'
import {
  getPaintProjectV2,
  rememberPaintProjectV2,
  savePaintProjectV2,
  type PaintProjectRecordV2,
} from './v2/library'
import { type LayerSurfaces } from './v2/render/engine'
import { PaintPreviewHost, touchSurface } from './v2/render/previewHost'
import { createPaintScheduler } from './v2/render/scheduler'
import { nextDocumentFrame } from './v2/render/timing'
import { BUILTIN_BRUSHES } from './v2/presets'

function readBrushShelf(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 100) : []
  } catch { return [] }
}

type Tool = 'brush' | 'eraser' | 'hand' | 'select'

// Property tweaks arrive one slider tick at a time; only the first edit of a
// burst becomes an undo step so the history stays usable.
const EDIT_HISTORY_GAP_MS = 600

const ZOOM_MIN = 0.25
const ZOOM_MAX = 3
const ZOOM_WHEEL_SENSITIVITY = 0.0012

const clampZoom = (value: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))

const BLEND_MODES: Array<{ value: BlendModeV2; label: string }> = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
]

function cloneDocument(document: PaintDocumentV2): PaintDocumentV2 {
  return structuredClone(document)
}

function startsEditBurst(lastEditAt: { current: number }): boolean {
  const now = Date.now()
  const isNewBurst = now - lastEditAt.current > EDIT_HISTORY_GAP_MS
  lastEditAt.current = now
  return isNewBurst
}

function paintSelectionOutline(
  context: CanvasRenderingContext2D,
  document: PaintDocumentV2,
  strokeId: string | null,
) {
  if (!strokeId) return
  const stroke = document.layers
    .flatMap((layer) => layer.strokes)
    .find((item) => item.id === strokeId)
  if (!stroke || stroke.points.length === 0) return
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.setLineDash([6, 4])
  context.lineWidth = 1.5
  context.strokeStyle = '#2f6fed'
  context.beginPath()
  context.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y)
  if (stroke.points.length === 1) {
    context.arc(stroke.points[0].x, stroke.points[0].y, 6, 0, Math.PI * 2)
  }
  context.stroke()
  context.restore()
}

function makeRaster(width: number, height: number): HTMLCanvasElement {
  const canvas = window.document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function loadRaster(dataUrl: string, canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      canvas.getContext('2d')?.drawImage(image, 0, 0)
      resolve()
    }
    image.onerror = () => resolve()
    image.src = dataUrl
  })
}

export function PaintEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<
    PaintProjectRecordV2 | null | undefined
  >(undefined)

  useEffect(() => {
    let cancelled = false
    void getPaintProjectV2(projectId).then((next) => {
      if (!cancelled) setProject(next ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (project === null) navigate({ page: 'paint-home' })
  }, [project])

  if (!project) {
    return <div className="studio-loading">Opening Animated Paint project…</div>
  }

  return <PaintWorkspace key={project.id} project={project} />
}

function PaintWorkspace({ project }: { project: PaintProjectRecordV2 }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const feedbackRef = useRef<HTMLCanvasElement>(null)
  const schedulerRef = useRef<ReturnType<typeof createPaintScheduler> | null>(null)
  const renderVersion = useRef(0)
  const [previewFps, setPreviewFps] = useState(30)
  const [gpuPreview, setGpuPreview] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [renderStatus, setRenderStatus] = useState('')
  const invalidatePreview = useCallback(() => {
    renderVersion.current++
    schedulerRef.current?.invalidate()
  }, [])
  const documentRef = useRef<PaintDocumentV2>(project.document)
  const rasterLayers = useRef(new Map<string, HTMLCanvasElement>())
  const imageSources = useRef(new Map<string, { dataUrl: string; raster: HTMLCanvasElement }>())
  const rasterBuildVersion = useRef(0)
  const imageImportRef = useRef<HTMLInputElement>(null)
  const addLayerDialogRef = useRef<HTMLDialogElement>(null)
  const eraseMasks = useRef(new Map<string, HTMLCanvasElement>())
  const currentStroke = useRef<StrokeV2 | null>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<StrokePointV2 | null>(null)
  const panStart = useRef<{
    x: number
    y: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  const undoStack = useRef<PaintDocumentV2[]>([])
  const redoStack = useRef<PaintDocumentV2[]>([])
  const [document, setDocumentState] = useState(project.document)
  const [tool, setTool] = useState<Tool>('brush')
  const initialBrush =
    BUILTIN_BRUSHES.find((brush) => brush.id === 'wiggle') ??
    BUILTIN_BRUSHES[0]
  const [brushes, setBrushes] = useState(BUILTIN_BRUSHES)
  const [presetId, setPresetId] = useState('wiggle')
  const [draftBrush, setDraftBrush] = useState<BrushV2>(() =>
    structuredClone(initialBrush),
  )
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null)
  const selectedStrokeIdRef = useRef<string | null>(null)
  const lastEditAt = useRef(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [brushesHidden, setBrushesHidden] = useState(false)
  const [layersHidden, setLayersHidden] = useState(false)
  const [favorites, setFavorites] = useState(() => readBrushShelf('paint.favorite-brushes'))
  const [recentBrushes, setRecentBrushes] = useState(() => readBrushShelf('paint.recent-brushes'))
  useEffect(() => { try { localStorage.setItem('paint.favorite-brushes', JSON.stringify(favorites)) } catch { /* Session-only when storage is unavailable. */ } }, [favorites])
  useEffect(() => { try { localStorage.setItem('paint.recent-brushes', JSON.stringify(recentBrushes)) } catch { /* Session-only when storage is unavailable. */ } }, [recentBrushes])
  const [hoveredBrush, setHoveredBrush] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'layers' | 'advanced'>('layers')
  const openAdvanced = () => { setLayersHidden(false); setSidebarTab('advanced') }
  const [previewPaused, setPreviewPaused] = useState(false)
  const previewPausedRef = useRef(false)
  const previewTimeRef = useRef(0)
  const previewNowRef = useRef(0)
  const [multiSelect, setMultiSelect] = useState(false)
  useEffect(() => {
    previewPausedRef.current = previewPaused
    invalidatePreview()
  }, [previewPaused, invalidatePreview])
  const [zoom, setZoom] = useState(0.85)
  useEffect(() => {
    const stage = stageRef.current
    if (stage) setZoom(clampZoom(Math.min((stage.clientWidth - 112) / project.document.width, (stage.clientHeight - 64) / project.document.height, 1)))
  }, [project.document.width, project.document.height])
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(
    () => new Set([project.document.activeLayerId]),
  )
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 })
  const [saveError, setSaveError] = useState('')
  const [imageError, setImageError] = useState('')
  const [loadingSurfaces, setLoadingSurfaces] = useState(true)
  const [importingImage, setImportingImage] = useState(false)
  const [showAddLayerMenu, setShowAddLayerMenu] = useState(false)
  const [exportSurfaces, setExportSurfaces] = useState<LayerSurfaces | null>(
    null,
  )

  const activeLayer = document.layers.find(
    (layer) => layer.id === document.activeLayerId,
  )
  const setDocument = useCallback(
    (next: PaintDocumentV2 | ((value: PaintDocumentV2) => PaintDocumentV2)) => {
      const resolved =
        typeof next === 'function' ? next(documentRef.current) : next
      documentRef.current = resolved
      setDocumentState(resolved)
      invalidatePreview()
    },
    [invalidatePreview],
  )

  const syncHistoryState = () => {
    setHistoryState({
      undo: undoStack.current.length,
      redo: redoStack.current.length,
    })
  }

  const rebuildRasters = useCallback(async (next: PaintDocumentV2) => {
    setLoadingSurfaces(true)
    const version = ++rasterBuildVersion.current
    const rasters = new Map<string, HTMLCanvasElement>()
    const masks = new Map<string, HTMLCanvasElement>()
    const images = new Map<string, { dataUrl: string; raster: HTMLCanvasElement }>()
    for (const layer of next.layers) {
      if (layer.kind === 'image' && layer.image) {
        try {
          const cached = imageSources.current.get(layer.id)
          const raster = cached?.dataUrl === layer.image.dataUrl ? cached.raster : await loadImageRaster(layer.image.dataUrl)
          images.set(layer.id, { dataUrl: layer.image.dataUrl, raster })
          rasters.set(layer.id, raster)
        } catch {
          setImageError(`Could not load image layer “${layer.name}”.`)
        }
      } else {
        const raster = makeRaster(next.width, next.height)
        if (layer.rasterDataUrl) await loadRaster(layer.rasterDataUrl, raster)
        rasters.set(layer.id, raster)
      }
      if (layer.eraseMaskDataUrl) {
        const mask = makeRaster(next.width, next.height)
        await loadRaster(layer.eraseMaskDataUrl, mask)
        masks.set(layer.id, mask)
      }
    }
    if (version !== rasterBuildVersion.current) return false
    rasterLayers.current = rasters
    imageSources.current = images
    eraseMasks.current = masks
    setLoadingSurfaces(false)
    invalidatePreview()
    return true
  }, [invalidatePreview])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void rebuildRasters(project.document) })
    return () => { cancelled = true }
  }, [project.document, rebuildRasters])

  useEffect(() => {
    if (!showAddLayerMenu) return
    const dialog = addLayerDialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [showAddLayerMenu])

  useEffect(() => {
    void rememberPaintProjectV2(project.id)
  }, [project.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void savePaintProjectV2({
        ...project,
        document: documentRef.current,
      })
        .then(() => setSaveError(''))
        .catch(() => setSaveError('Autosave failed — project was not saved.'))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [document, project])

  useEffect(() => {
    void listAllBrushes().then((next) => {
      setBrushes(next)
      const selected =
        next.find((brush) => brush.id === 'wiggle') ?? next[0]
      if (selected) setDraftBrush(structuredClone(selected))
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let statusAt = -Infinity
    setRenderError('')
    const host = new PaintPreviewHost(canvas, {
      invalidate: invalidatePreview,
      error: (message) => { setRenderError(message); schedulerRef.current?.setPaused(true) },
      painted: (stats, worker, batches) => {
        const overlay = feedbackRef.current?.getContext('2d')
        if (overlay) {
          overlay.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height)
          paintSelectionOutline(overlay, documentRef.current, selectedStrokeIdRef.current)
        }
        if (performance.now() - statusAt > 1000) {
          statusAt = performance.now()
          setRenderStatus(`${worker ? 'Worker' : 'Canvas'}${batches ? ' + GPU' : ''} · ${stats.totalMs.toFixed(1)} ms · ${stats.itemCount.toLocaleString()} marks`)
        }
      },
    })
    const scheduler = createPaintScheduler((time) => {
      if (!previewPausedRef.current) { previewTimeRef.current = time; previewNowRef.current = Date.now() }
      const frameTime = previewTimeRef.current
      host.request({ document: documentRef.current,
        surfaces: { rasters: rasterLayers.current, masks: eraseMasks.current },
        time: frameTime, now: previewNowRef.current, version: renderVersion.current, gpu: gpuPreview })
      return previewPausedRef.current ? Infinity : nextDocumentFrame(documentRef.current, frameTime, previewNowRef.current)
    }, previewFps)
    schedulerRef.current = scheduler
    return () => { scheduler.dispose(); host.dispose(); schedulerRef.current = null }
  }, [previewFps, gpuPreview, invalidatePreview])

  useEffect(() => {
    schedulerRef.current?.setPaused(exportSurfaces !== null)
  }, [exportSurfaces, previewFps, gpuPreview])

  const paintInputFeedback = () => {
    const context = feedbackRef.current?.getContext('2d')
    const stroke = currentStroke.current
    if (!context || !stroke) return
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    context.save()
    context.strokeStyle = stroke.brushSnapshot.color
    context.globalAlpha = Math.min(0.4, stroke.brushSnapshot.opacity)
    context.lineWidth = Math.max(1, stroke.brushSnapshot.size * 0.35)
    context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath()
    stroke.points.forEach((point, i) => { if (i === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y) })
    if (stroke.points.length > 2 && (stroke.brushSnapshot.closedPath || stroke.brushSnapshot.fill.enabled) && getBrushFillKind(stroke.brushSnapshot)) context.closePath()
    context.stroke(); context.restore()
  }

  const snapshot = () => {
    undoStack.current.push(cloneDocument(documentRef.current))
    if (undoStack.current.length > 30) undoStack.current.shift()
    redoStack.current = []
    syncHistoryState()
  }

  const restore = (next: PaintDocumentV2) => {
    setDocument(next)
    setSelectedLayerIds(new Set([next.activeLayerId]))
    selectStroke(null)
    syncHistoryState()
    void rebuildRasters(next)
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(cloneDocument(documentRef.current))
    void restore(previous)
  }

  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(cloneDocument(documentRef.current))
    void restore(next)
  }

  const currentActiveLayer = () =>
    documentRef.current.layers.find(
      (layer) => layer.id === documentRef.current.activeLayerId,
    )

  const liveBrush = (): BrushV2 => structuredClone(draftBrush)

  const selectedStroke =
    document.layers
      .flatMap((layer) => layer.strokes)
      .find((stroke) => stroke.id === selectedStrokeId) ?? null

  const inspectorBrush = selectedStroke?.brushSnapshot ?? draftBrush

  const editBrush = (patch: Partial<BrushV2>) => {
    if (!selectedStroke) {
      setDraftBrush((current) => ({ ...current, ...patch }))
      return
    }
    if (startsEditBurst(lastEditAt)) snapshot()
    setDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) => ({
        ...layer,
        strokes: layer.strokes.map((stroke) =>
          stroke.id === selectedStroke.id
            ? {
                ...stroke,
                brushSnapshot: { ...stroke.brushSnapshot, ...patch },
              }
            : stroke,
        ),
      })),
    }))
  }

  const deleteSelectedStroke = () => {
    if (!selectedStroke) return
    snapshot()
    setDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) => ({
        ...layer,
        strokes: layer.strokes.filter((stroke) => stroke.id !== selectedStroke.id),
      })),
    }))
    selectStroke(null)
  }

  const selectStroke = (id: string | null) => {
    selectedStrokeIdRef.current = id
    setSelectedStrokeId(id)
    invalidatePreview()
  }

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): StrokePointV2 => {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    const native = event.nativeEvent
    return fromPointer(
      {
        x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
        y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
        t: event.timeStamp / 1000,
        pressure: event.pressure > 0 ? event.pressure : 0.5,
        tiltX: native.tiltX ? native.tiltX / 90 : 0,
        tiltY: native.tiltY ? native.tiltY / 90 : 0,
      },
      lastPoint.current,
    )
  }

  const eraseMaskContext = (layerId: string): CanvasRenderingContext2D | null => {
    let mask = eraseMasks.current.get(layerId)
    if (!mask) {
      mask = makeRaster(documentRef.current.width, documentRef.current.height)
      eraseMasks.current.set(layerId, mask)
    }
    return mask.getContext('2d')
  }

  const drawEraserSegment = (from: StrokePointV2, to: StrokePointV2) => {
    const layer = currentActiveLayer()
    if (!layer) return
    const context = eraseMaskContext(layer.id)
    if (!context) return
    const radius = Math.max(0.5, draftBrush.size / 2)
    context.save()
    context.fillStyle = '#000'
    context.strokeStyle = '#000'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = radius * 2
    context.beginPath()
    if (from.x === to.x && from.y === to.y) {
      // A zero-length line is not guaranteed to paint its round cap, so a tap
      // erases through an explicit dot instead.
      context.arc(from.x, from.y, radius, 0, Math.PI * 2)
      context.fill()
    } else {
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
    }
    context.restore()
    touchSurface(context.canvas)
    invalidatePreview()
  }

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === 'hand') {
      const stage = stageRef.current
      if (!stage) return
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Keep panning if capture is unavailable.
      }
      return
    }

    if (tool === 'select') {
      const canvas = event.currentTarget
      const bounds = canvas.getBoundingClientRect()
      const x = (event.clientX - bounds.left) * (canvas.width / bounds.width)
      const y = (event.clientY - bounds.top) * (canvas.height / bounds.height)
      for (const layer of [...documentRef.current.layers].reverse()) {
        if (!layer.visible) continue
        const image = layer.kind === 'image' ? layer.image : undefined
        const hit = strokeAtPoint([layer], x, y)
        if (hit || (image && x >= image.x && x <= image.x + image.width && y >= image.y && y <= image.y + image.height)) {
          selectStroke(hit?.id ?? null)
          setSelectedLayerIds(new Set([layer.id]))
          setDocument(current => ({ ...current, activeLayerId: layer.id }))
          return
        }
      }
      selectStroke(null)
      return
    }

    const layer = currentActiveLayer()
    if (!layer || !layer.visible || layer.kind === 'image') return
    snapshot()
    drawing.current = true
    const point = stabilizePoint(pointFromEvent(event), null, draftBrush.stability)
    lastPoint.current = point

    if (tool === 'eraser') {
      drawEraserSegment(point, point)
    } else {
      const stroke = snapshotStroke(
        liveBrush(),
        [point],
        layer.id,
        randomStrokeSeed(),
      )
      currentStroke.current = stroke
      setDocument((current) => ({
        ...current,
        layers: current.layers.map((item) =>
          item.id === current.activeLayerId
            ? { ...item, strokes: [...item.strokes, stroke] }
            : item,
        ),
      }))
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events still draw.
    }
  }

  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === 'hand' && panStart.current) {
      const stage = stageRef.current
      if (!stage) return
      stage.scrollLeft =
        panStart.current.scrollLeft - (event.clientX - panStart.current.x)
      stage.scrollTop =
        panStart.current.scrollTop - (event.clientY - panStart.current.y)
      return
    }

    if (!drawing.current || !lastPoint.current) return
    const point = stabilizePoint(
      pointFromEvent(event),
      lastPoint.current,
      draftBrush.stability,
    )
    if (tool === 'eraser') {
      drawEraserSegment(lastPoint.current, point)
    } else if (currentStroke.current) {
      const previous =
        currentStroke.current.points[currentStroke.current.points.length - 1]
      if (Math.hypot(point.x - previous.x, point.y - previous.y) > 2) {
        currentStroke.current.points.push(point)
        invalidatePreview()
        paintInputFeedback()
      }
    }
    lastPoint.current = point
  }

  const endStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === 'hand') {
      panStart.current = null
    } else if (drawing.current) {
      drawing.current = false
      currentStroke.current = null
      lastPoint.current = null
      if (tool === 'eraser') {
        const layer = currentActiveLayer()
        const mask = layer && eraseMasks.current.get(layer.id)
        if (layer && mask) {
          setDocument((current) => ({
            ...current,
            layers: current.layers.map((item) =>
              item.id === layer.id
                ? { ...item, eraseMaskDataUrl: mask.toDataURL('image/png') }
                : item,
            ),
          }))
        }
      } else {
        setDocument({ ...documentRef.current })
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const zoomCanvas = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault()
    const lineHeight =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
    const delta = Math.max(-40, Math.min(40, event.deltaY * lineHeight))
    setZoom((value) =>
      clampZoom(value * Math.exp(-delta * ZOOM_WHEEL_SENSITIVITY)),
    )
  }

  const addLayer = () => {
    setShowAddLayerMenu(false)
    snapshot()
    const layer = createLayerV2(
      `Layer ${documentRef.current.layers.length + 1}`,
    )
    rasterLayers.current.set(
      layer.id,
      makeRaster(document.width, document.height),
    )
    setDocument((current) => ({
      ...current,
      layers: [...current.layers, layer],
      activeLayerId: layer.id,
    }))
    setSelectedLayerIds(new Set([layer.id]))
    selectStroke(null)
    setTool('brush')
  }

  const addImageLayer = async (file: File) => {
    setShowAddLayerMenu(false)
    setImageError('')
    setImportingImage(true)
    try {
      const imported = await importImageFile(file)
      const current = documentRef.current
      const layer = createImageLayerV2(file.name.replace(/\.[^.]+$/, '') || 'Image', {
        dataUrl: imported.dataUrl,
        naturalWidth: imported.naturalWidth,
        naturalHeight: imported.naturalHeight,
        ...fitImageToCanvas(imported.naturalWidth, imported.naturalHeight, current.width, current.height),
      })
      snapshot()
      rasterLayers.current.set(layer.id, imported.raster)
      imageSources.current.set(layer.id, { dataUrl: imported.dataUrl, raster: imported.raster })
      setDocument(value => ({ ...value, layers: [...value.layers, layer], activeLayerId: layer.id }))
      setSelectedLayerIds(new Set([layer.id]))
      selectStroke(null)
      setTool('select')
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'This image could not be opened.')
    } finally {
      setImportingImage(false)
    }
  }

  const changeImage = (layerId: string, image: ImageLayerV2Data) => {
    setDocument(current => ({
      ...current,
      layers: current.layers.map(layer => layer.id === layerId ? { ...layer, image } : layer),
    }))
  }

  // Live dragging updates the worker immediately, then commits one undo step.
  const commitImageTransform = (layerId: string, before: ImageLayerV2Data) => {
    const current = documentRef.current
    const image = current.layers.find(layer => layer.id === layerId)?.image
    if (!image || (image.x === before.x && image.y === before.y && image.width === before.width && image.height === before.height)) return
    const previous = cloneDocument(current)
    const layer = previous.layers.find(item => item.id === layerId)
    if (!layer) return
    layer.image = structuredClone(before)
    undoStack.current.push(previous)
    if (undoStack.current.length > 30) undoStack.current.shift()
    redoStack.current = []
    syncHistoryState()
  }

  const editImageField = (field: 'x' | 'y' | 'width' | 'height', value: number) => {
    if (!activeLayer?.image || !Number.isFinite(value)) return
    const image = activeLayer.image
    const next = { ...image }
    if (field === 'x' || field === 'y') next[field] = Math.max(-100_000, Math.min(100_000, value))
    else {
      const dimension = Math.max(8, Math.min(32_768, value))
      const factor = Math.min(dimension / image[field], 32_768 / image.width, 32_768 / image.height)
      next.width = image.width * factor
      next.height = image.height * factor
    }
    if (startsEditBurst(lastEditAt)) snapshot()
    changeImage(activeLayer.id, next)
  }

  const fitActiveImage = () => {
    if (!activeLayer?.image) return
    const image = activeLayer.image
    snapshot()
    changeImage(activeLayer.id, { ...image, ...fitImageToCanvas(image.naturalWidth, image.naturalHeight, document.width, document.height) })
  }

  const selectLayer = (
    layerId: string,
    event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  ) => {
    const layer = documentRef.current.layers.find(item => item.id === layerId)
    if (layer?.kind === 'image') setTool('select')
    selectStroke(null)
    const additive = multiSelect || event.metaKey || event.ctrlKey || event.shiftKey
    setSelectedLayerIds((current) => {
      if (!additive) return new Set([layerId])
      const next = new Set(current)
      if (next.has(layerId) && next.size > 1) next.delete(layerId)
      else next.add(layerId)
      return next
    })
    setDocument((current) => ({ ...current, activeLayerId: layerId }))
  }

  const updateLayers = (update: (layers: PaintDocumentV2['layers']) => PaintDocumentV2['layers']) => {
    snapshot()
    setDocument((current) => ({ ...current, layers: update(current.layers) }))
  }

  const groupSelected = () => {
    if (selectedLayerIds.size < 2) return
    const groupId = crypto.randomUUID()
    updateLayers(layers => groupLayers(layers, selectedLayerIds, groupId))
  }

  const ungroupSelected = () => {
    updateLayers((layers) =>
      layers.map((layer) => {
        if (!selectedLayerIds.has(layer.id)) return layer
        const next = { ...layer }
        delete next.groupId
        return next
      }),
    )
  }

  const duplicateSelected = () => {
    if (selectedLayerIds.size === 0) return
    snapshot()
    const copies: PaintDocumentV2['layers'] = []
    const copiedGroups = new Map<string, string>()
    for (const layer of documentRef.current.layers) {
      if (!selectedLayerIds.has(layer.id)) continue
      const id = crypto.randomUUID()
      const source = rasterLayers.current.get(layer.id)
      const raster = makeRaster(source?.width ?? document.width, source?.height ?? document.height)
      if (source) raster.getContext('2d')?.drawImage(source, 0, 0)
      rasterLayers.current.set(id, raster)
      if (layer.kind === 'image' && layer.image && source) imageSources.current.set(id, { dataUrl: layer.image.dataUrl, raster })
      const sourceMask = eraseMasks.current.get(layer.id)
      if (sourceMask) {
        const mask = makeRaster(document.width, document.height)
        mask.getContext('2d')?.drawImage(sourceMask, 0, 0)
        eraseMasks.current.set(id, mask)
      }
      if (layer.groupId && !copiedGroups.has(layer.groupId)) copiedGroups.set(layer.groupId, crypto.randomUUID())
      copies.push({
        ...structuredClone(layer),
        groupId: layer.groupId ? copiedGroups.get(layer.groupId) : undefined,
        id,
        name: `${layer.name} copy`,
        strokes: layer.strokes.map((stroke) => ({
          ...structuredClone(stroke),
          id: crypto.randomUUID(),
          layerId: id,
        })),
      })
    }
    if (copies.length === 0) return
    setDocument((current) => ({
      ...current,
      layers: [...current.layers, ...copies],
      activeLayerId: copies[copies.length - 1].id,
    }))
    setSelectedLayerIds(new Set(copies.map((layer) => layer.id)))
  }

  const deleteSelected = () => {
    if (selectedLayerIds.size === 0) return
    snapshot()
    let remaining = documentRef.current.layers.filter(
      (layer) => !selectedLayerIds.has(layer.id),
    )
    if (remaining.length === 0) {
      const replacement = createLayerV2('Layer 1')
      remaining = [replacement]
      rasterLayers.current.set(
        replacement.id,
        makeRaster(document.width, document.height),
      )
    }
    for (const id of selectedLayerIds) { rasterLayers.current.delete(id); imageSources.current.delete(id); eraseMasks.current.delete(id) }
    const active = remaining[remaining.length - 1]
    setDocument((current) => ({
      ...current,
      layers: remaining,
      activeLayerId: active.id,
    }))
    setSelectedLayerIds(new Set([active.id]))
  }

  const updateActiveLayer = (values: Partial<PaintDocumentV2['layers'][number]>) => {
    if (!activeLayer) return
    snapshot()
    setDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === activeLayer.id ? { ...layer, ...values } : layer,
      ),
    }))
  }

  const presetGroups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matching = brushes.filter(
      (brush) =>
        (category === 'All' || brush.category === category || (category === 'Favorites' && favorites.includes(brush.id)) || (category === 'Recent' && recentBrushes.includes(brush.id))) && (!term ||
        brush.name.toLowerCase().includes(term) ||
        brush.category.toLowerCase().includes(term)),
    )
    if (category === 'Recent') matching.sort((a, b) => recentBrushes.indexOf(a.id) - recentBrushes.indexOf(b.id))
    if (category === 'Favorites' || category === 'Recent') return matching.length ? [{ group: category, presets: matching }] : []
    return [...new Set(matching.map((brush) => brush.category))].map(
      (group) => ({
        group,
        presets: matching.filter((brush) => brush.category === group),
      }),
    )
  }, [brushes, search, category, favorites, recentBrushes])

  useShortcuts([
    { keys: 'Mod+z', label: 'Undo', run: undo, enabled: historyState.undo > 0 },
    { keys: 'Mod+Shift+z', label: 'Redo', run: redo, enabled: historyState.redo > 0 },
    { keys: 'Mod+y', label: 'Redo', run: redo, enabled: historyState.redo > 0 },
    { keys: 'Mod+s', label: 'Save', run: () => { void savePaintProjectV2({ ...project, document: documentRef.current }).then(() => setSaveError('')).catch(() => setSaveError('Save failed — project was not saved.')) } },
    ...(['brush', 'eraser', 'select', 'hand'] as const).map((value, index) => ({ keys: ['b', 'e', 'v', 'h'][index], label: value[0].toUpperCase() + value.slice(1) + ' tool', run: () => { setTool(value); if (value !== 'select') selectStroke(null) } })),
    { keys: 'Space', label: 'Play / pause animation', run: () => setPreviewPaused(value => !value) },
    { keys: '[', label: 'Decrease brush size', repeat: true, run: () => editBrush({ size: Math.max(1, inspectorBrush.size - 1) }) },
    { keys: ']', label: 'Increase brush size', repeat: true, run: () => editBrush({ size: Math.min(200, inspectorBrush.size + 1) }) },
    { keys: 'Mod+=', label: 'Zoom in', repeat: true, run: () => setZoom(value => clampZoom(value + 0.1)) },
    { keys: 'Mod+-', label: 'Zoom out', repeat: true, run: () => setZoom(value => clampZoom(value - 0.1)) },
    { keys: '0', label: 'Fit canvas', run: () => { const stage = stageRef.current; if (stage) { setZoom(clampZoom(Math.min((stage.clientWidth - 112) / document.width, (stage.clientHeight - 64) / document.height))); stage.scrollTo(0, 0) } } },
    { keys: 'Mod+Shift+e', label: 'Export', run: () => setExportSurfaces({ rasters: rasterLayers.current, masks: eraseMasks.current }) },
    { keys: 'Mod+Shift+n', label: 'Add layer', run: addLayer },
    { keys: 'Mod+d', label: 'Duplicate selected layers', run: duplicateSelected },
    { keys: 'Mod+g', label: 'Group selected layers', run: groupSelected },
    { keys: 'Mod+Shift+g', label: 'Ungroup selected layers', run: ungroupSelected },
    { keys: 'Delete', label: 'Delete selected stroke', run: deleteSelectedStroke },
    { keys: 'Backspace', label: 'Delete selected stroke', run: deleteSelectedStroke },
    { keys: 'Escape', label: 'Deselect stroke', run: () => selectStroke(null) },
  ], !loadingSurfaces && !importingImage && !exportSurfaces)

  return (
    <>
    <div className={`paint-workspace paint-pen-workspace${brushesHidden ? ' is-brushes-hidden' : ''}${layersHidden ? ' is-layers-hidden' : ''}`} inert={loadingSurfaces || importingImage} aria-busy={loadingSurfaces || importingImage}>
      <header className="app-header paint-v2-header">
        <div className="brand">
          <button
            type="button"
            className="studio-crumb"
            onClick={() => navigate({ page: 'home' })}
          >
            Artist Pro
          </button>
          <b>/</b>
          <button
            type="button"
            className="studio-crumb"
            onClick={() => navigate({ page: 'paint-home' })}
          >
            Animated Paint
          </button>
          <b>/</b>
          <strong>{document.name}</strong>
        </div>
        <div className="canvas-size">
          <span>Canvas</span>
          <strong>
            {document.width} × {document.height}
          </strong>
        </div>
        {saveError ? <span className="paint-save-error">{saveError}</span> : null}
        <div className="header-actions paint-v2-header-actions">
          <IconButton icon={PanelLeft} label={brushesHidden ? 'Show brushes' : 'Hide brushes'} onClick={() => setBrushesHidden(value => !value)} />
          <IconButton icon={PanelRight} label={layersHidden ? 'Show layers' : 'Hide layers'} onClick={() => setLayersHidden(value => !value)} />
          <Button onClick={() => navigate({ page: 'paint-playground' })}>
            <FlaskConical size={14} /> Playground
          </Button>
          <Button
            aria-label="Undo"
            title="Undo (⌘Z)"
            disabled={historyState.undo === 0}
            onClick={undo}
          >
            <Undo2 size={14} /> Undo
          </Button>
          <Button
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={historyState.redo === 0}
            onClick={redo}
          >
            <Redo2 size={14} /> Redo
          </Button>
          <Button onClick={() => setPreviewPaused(value => !value)} aria-label={previewPaused ? 'Play animation' : 'Pause animation'}>
            {previewPaused ? <Play size={16} /> : <Pause size={16} />} {previewPaused ? 'Preview' : 'Pause'}
          </Button>
          <Button
            onClick={() =>
              setExportSurfaces({
                rasters: rasterLayers.current,
                masks: eraseMasks.current,
              })
            }
          >
            <Download size={14} /> Export
          </Button>
        </div>
      </header>

      <aside className="paint-v2-brushes">
        <div className="paint-v2-sidebar-title">
          <strong>Brush library</strong>
          <small>{brushes.length} presets</small>
        </div>
        <input
          className="scrub-input text-input paint-search"
          aria-label="Search brushes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search brushes…"
        />
        <div className="paint-category-tabs" aria-label="Brush categories">
          {['All', 'Favorites', 'Recent', ...new Set(brushes.map(brush => brush.category))].map(name =>
            <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
        </div>
        <div className="paint-brush-groups" aria-label="Brush presets" tabIndex={0}>
          {presetGroups.length === 0 && <p className="paint-empty">No brushes match your search.</p>}
          {presetGroups.map(({ group, presets }) => (
            <details key={group} open>
              <summary>
                <span>{group}</span>
                <small>{presets.length}</small>
              </summary>
              <div>
                {presets.map((preset) => (
                  <div className="paint-brush-card" key={preset.id}>
                  <button
                    aria-pressed={preset.id === presetId}
                    onPointerEnter={() => setHoveredBrush(preset.id)}
                    onPointerLeave={() => setHoveredBrush(null)}
                    onFocus={() => setHoveredBrush(preset.id)}
                    onBlur={() => setHoveredBrush(null)}
                    type="button"
                    className={preset.id === presetId ? 'is-active' : ''}
                    onClick={() => {
                      setPresetId(preset.id)
                      setRecentBrushes(current => [preset.id, ...current.filter(id => id !== preset.id)].slice(0, 12))
                      setTool('brush')
                      setDraftBrush(structuredClone(preset))
                      selectStroke(null)
                    }}
                  >
                    <BrushPreview brush={preset} active={hoveredBrush === preset.id} />
                    <span>{preset.name}</span>
                  </button>
                  <button type="button" className="paint-favorite-toggle" aria-label={`${favorites.includes(preset.id) ? 'Unfavorite' : 'Favorite'} ${preset.name}`} aria-pressed={favorites.includes(preset.id)} onClick={() => setFavorites(current => current.includes(preset.id) ? current.filter(id => id !== preset.id) : [...current, preset.id])}><Star size={14} fill={favorites.includes(preset.id) ? 'currentColor' : 'none'} /></button>
                  </div>

                ))}
              </div>
            </details>
          ))}
        </div>
        <Button onClick={() => openAdvanced()}><Settings2 size={18} /> Advanced brush settings</Button>
      </aside>

      <div className="paint-stage-shell">
      <nav className="paint-floating-tools" aria-label="Drawing tools">
        {([{ id: 'brush', name: 'Brush', icon: Brush }, { id: 'eraser', name: 'Eraser', icon: Eraser },
          { id: 'select', name: 'Select', icon: MousePointer2 }, { id: 'hand', name: 'Hand', icon: Hand }] as const).map(item =>
          <button type="button" key={item.id} aria-pressed={tool === item.id} onClick={() => { setTool(item.id); if (item.id !== 'select') selectStroke(null) }}>
            <item.icon size={22} /><span>{item.name}</span>
          </button>)}
      </nav>
      <main
        ref={stageRef}
        className={`paint-v2-stage${tool === 'hand' ? ' is-panning' : ''}`}
        onWheel={zoomCanvas}
      >
        <div className="paint-canvas-wrap">
          <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            role="application"
            aria-label="Living paint canvas"
            tabIndex={0}
            width={document.width}
            height={document.height}
            style={{
              width: `${document.width * zoom}px`,
              height: `${document.height * zoom}px`,
            }}
            onPointerDown={beginStroke}
            onPointerMove={moveStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
          <canvas ref={feedbackRef} aria-hidden="true" width={document.width} height={document.height}
            style={{ position: 'absolute', pointerEvents: 'none', top: 0, left: 0, background: 'transparent', boxShadow: 'none',
              width: `${document.width * zoom}px`, height: `${document.height * zoom}px` }} />
          {tool === 'select' && activeLayer?.kind === 'image' && activeLayer.visible && activeLayer.image ? (
            <ImageLayerTransform
              key={activeLayer.id}
              image={activeLayer.image}
              zoom={zoom}
              onChange={image => changeImage(activeLayer.id, image)}
              onCommit={before => commitImageTransform(activeLayer.id, before)}
            />
          ) : null}
          </div>
        </div>
      </main>
      </div>
      <div className="paint-quick-bar" aria-label="Quick brush controls">
        <label className="paint-quick-color"><input type="color" aria-label="Brush color" value={inspectorBrush.color} onChange={event => editBrush({ color: event.target.value })} /><span>Color</span></label>
        <label>Size <input aria-label="Brush size" type="range" min="1" max="200" value={inspectorBrush.size} onChange={event => editBrush({ size: Number(event.target.value) })} /><output>{Math.round(inspectorBrush.size)} px</output></label>
        <label>Opacity <input aria-label="Brush opacity" type="range" min="0" max="100" value={Math.round(inspectorBrush.opacity * 100)} onChange={event => editBrush({ opacity: Number(event.target.value) / 100 })} /><output>{Math.round(inspectorBrush.opacity * 100)}%</output></label>
        <IconButton icon={Settings2} label="Open brush settings" onClick={() => openAdvanced()} />
        <div className="zoom-controls paint-zoom-controls">
          <IconButton
            icon={ArrowDown}
            label="Zoom out"
            onClick={() => setZoom((value) => clampZoom(value - 0.1))}
          />
          <span>{Math.round(zoom * 100)}%</span>
          <IconButton
            icon={ArrowUp}
            label="Zoom in"
            onClick={() => setZoom((value) => clampZoom(value + 0.1))}
          />
          <Button onClick={() => {
            const stage = stageRef.current
            if (stage) { setZoom(clampZoom(Math.min((stage.clientWidth - 112) / document.width, (stage.clientHeight - 64) / document.height))); stage.scrollTo(0, 0) }
          }}><Maximize size={16} /> Fit</Button>
          <IconButton
            icon={Hand}
            label="Hand tool"
            active={tool === 'hand'}
            onClick={() => setTool(tool === 'hand' ? 'brush' : 'hand')}
          />
        </div>
      </div>
      <aside className="bottom-panel paint-v2-bottom">
        <div className="paint-sidebar-tabs" role="tablist" aria-label="Sidebar panels" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'layers' : event.key === 'End' ? 'advanced' : sidebarTab === 'layers' ? 'advanced' : 'layers'
          setSidebarTab(next)
          event.currentTarget.querySelector<HTMLButtonElement>(`#paint-${next}-tab`)?.focus()
        }}>
          <button type="button" role="tab" id="paint-layers-tab" tabIndex={sidebarTab === 'layers' ? 0 : -1} aria-controls="paint-layers-panel" aria-selected={sidebarTab === 'layers'} onClick={() => setSidebarTab('layers')}>Layers</button>
          <button type="button" role="tab" id="paint-advanced-tab" tabIndex={sidebarTab === 'advanced' ? 0 : -1} aria-controls="paint-advanced-panel" aria-selected={sidebarTab === 'advanced'} onClick={() => setSidebarTab('advanced')}>Advanced settings</button>
        </div>
        <div id="paint-advanced-panel" role="tabpanel" aria-labelledby="paint-advanced-tab" hidden={sidebarTab !== 'advanced'} className="paint-sidebar-panel paint-advanced-scroll">
      <aside className="inspector paint-v2-inspector paint-advanced-panel">
        <div className="paint-v2-sidebar-title">
          <strong>Tool settings</strong>
          <small>{activeLayer?.kind === 'image' ? 'Image layer' : inspectorBrush.name}</small>
        </div>
        <Button
          onClick={() => {
            void duplicateBrush(inspectorBrush).then(async (copy) => {
              setBrushes(await listAllBrushes())
              setPresetId(copy.id)
              setDraftBrush(copy)
              selectStroke(null)
            })
          }}
        >
          <Copy size={13} /> Duplicate brush
        </Button>
        <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
        <label className="preview-field">
          <span>Preview speed</span>
          <Select aria-label="Preview speed" value={previewFps} onChange={event => setPreviewFps(Number(event.target.value))}>
            <option value={30}>30 FPS · Save energy</option><option value={60}>60 FPS · Smooth</option>
          </Select>
        </label>
        <label className="preview-field">
          <span>Preview rendering</span>
          <Select aria-label="Preview rendering" value={gpuPreview ? 'fast' : 'accurate'} onChange={event => setGpuPreview(event.target.value === 'fast')}>
            <option value="accurate">Accurate</option><option value="fast">Faster grain · GPU</option>
          </Select>
        </label>
        {gpuPreview ? <small>Faster grain preview may soften tiny edges. Exports use full quality.</small> : null}
        <small aria-live="off">{renderStatus}</small>
        {renderError ? <p role="alert">{renderError}</p> : null}
        </div>
        {activeLayer?.kind === 'image' && activeLayer.image ? (
          <div className="paint-image-controls">
            <strong>{activeLayer.name}</strong>
            <p>Use Select to drag the image or resize it from a corner. Proportions stay locked.</p>
            <div className="paint-image-fields">
              {(['x', 'y', 'width', 'height'] as const).map(field => (
                <label key={field}>
                  {field === 'x' || field === 'y' ? field.toUpperCase() : field === 'width' ? 'Width' : 'Height'}
                  <input
                    type="number"
                    aria-label={`Image ${field}`}
                    value={Math.round(activeLayer.image![field] * 10) / 10}
                    min={field === 'width' || field === 'height' ? 8 : undefined}
                    step={1}
                    onChange={event => { if (event.target.value !== '') editImageField(field, Number(event.target.value)) }}
                  />
                </label>
              ))}
            </div>
            <Button onClick={fitActiveImage}>Fit image to canvas</Button>
            <p>Add a drawing layer above the image to paint over it.</p>
            <Button onClick={addLayer}><Plus size={13} /> Add drawing layer</Button>
          </div>
        ) : <>
        <div className="paint-selection-banner">
          {selectedStroke ? (
            <>
              <span>Editing selected stroke only</span>
              <div>
                <Button onClick={() => selectStroke(null)}>Deselect</Button>
                <Button onClick={deleteSelectedStroke}>
                  <Trash2 size={13} /> Delete
                </Button>
              </div>
            </>
          ) : (
            <span>
              {tool === 'select'
                ? 'Click a stroke to edit only that stroke'
                : 'Editing the brush used for new strokes'}
            </span>
          )}
        </div>
        <CollapsibleSection title={selectedStroke ? 'Stroke' : 'Brush'}>
          <div className="paint-v2-fields">
            <BrushInspector
              brush={inspectorBrush}
              onChange={editBrush}
              mode="runtime"
              showAnimationEditor={false}
            />
          </div>
        </CollapsibleSection>
        </>}
      </aside>
        </div>
        <div id="paint-layers-panel" role="tabpanel" aria-labelledby="paint-layers-tab" hidden={sidebarTab !== 'layers'} className="paint-sidebar-panel paint-layers-content">
        <section className="layers-panel paint-v2-layers">
          <div className="panel-tabs">
            <span className="is-active">Layers</span>
            <button type="button" className="paint-multi-select" aria-pressed={multiSelect} onClick={() => setMultiSelect(value => !value)}>Select multiple</button>
          </div>
          <div className="panel-actions paint-layer-toolbar">
            <Button onClick={() => setShowAddLayerMenu(true)} disabled={importingImage} aria-haspopup="dialog">
              <Plus size={13} /> Add
            </Button>
            <dialog
              ref={addLayerDialogRef}
              className="paint-layer-add-menu"
              aria-label="Add layer"
              onCancel={event => { event.preventDefault(); setShowAddLayerMenu(false) }}
              onClick={event => { if (event.target === event.currentTarget) setShowAddLayerMenu(false) }}
            >
              <h3>Add layer</h3>
              <button type="button" onClick={addLayer}><Brush size={17} /> New drawing layer</button>
              <button type="button" onClick={() => { setShowAddLayerMenu(false); imageImportRef.current?.click() }}><ImagePlus size={17} /> Image layer…</button>
              <button type="button" onClick={() => setShowAddLayerMenu(false)}>Cancel</button>
            </dialog>
            <input
              ref={imageImportRef}
              type="file"
              accept="image/*"
              aria-label="Upload image layer"
              hidden
              onChange={event => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void addImageLayer(file)
              }}
            />
            <Button aria-label="Group selected layers" title="Group selected layers" disabled={selectedLayerIds.size < 2} onClick={groupSelected}>
              <Group size={18} />
            </Button>
            <Button aria-label="Ungroup selected layers" title="Ungroup selected layers" onClick={ungroupSelected}>
              <Ungroup size={18} />
            </Button>
            <Button aria-label="Duplicate selected layers" title="Duplicate selected layers" onClick={duplicateSelected}>
              <Copy size={18} />
            </Button>
            <IconButton
              icon={Trash2}
              label="Delete selected layers"
              onClick={deleteSelected}
            />
          </div>
          <LayerTree layers={document.layers} selected={selectedLayerIds}
            onSelectGroup={ids => { setSelectedLayerIds(new Set(ids)); selectStroke(null); setDocument(current => ({ ...current, activeLayerId: ids[0] })) }}
            onMove={(source, drop) => {
              const next = moveLayerEntry(documentRef.current.layers, source, drop)
              if (next !== documentRef.current.layers) updateLayers(() => next)
            }}
            renderLayer={layer => (
              <div
                key={layer.id}
                className={[
                  'layer-row paint-layer-row',
                  layer.id === document.activeLayerId ? 'is-active' : '',
                  selectedLayerIds.has(layer.id) ? 'is-selected' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  className="layer-row-action"
                  aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                  aria-pressed={layer.visible}
                  onClick={() =>
                    setDocument((current) => ({
                      ...current,
                      layers: current.layers.map((item) =>
                        item.id === layer.id
                          ? { ...item, visible: !item.visible }
                          : item,
                      ),
                    }))
                  }
                >
                  {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button
                  type="button"
                  className="layer-name paint-layer-name"
                  aria-pressed={selectedLayerIds.has(layer.id)}
                  onClick={(event) => selectLayer(layer.id, event)}
                >
                  <LayerThumbnail layer={layer} width={document.width} height={document.height} rasters={rasterLayers} masks={eraseMasks} ready={!loadingSurfaces} />
                  <span>{layer.name}</span>
                  <small>
                    {layer.kind === 'image' ? 'Image' : `${layer.strokes.length} strokes`}
                    {layer.groupId ? ' · Grouped' : ''}
                  </small>
                </button>
              </div>
            )} />
        </section>

        <section className="paint-layer-inspector">
          <div className="panel-tabs paint-layer-inspector-title">
            <span className="is-active">Layer settings</span>
            {activeLayer?.kind === 'image' && <Button onClick={() => openAdvanced()}>Transform image</Button>}
            <small>{activeLayer?.name ?? 'No layer selected'}</small>
          </div>
          <div className="paint-layer-inspector-fields">
            <PropertyRow label="Opacity">
              <SliderField
                label="Opacity"
                value={Math.round((activeLayer?.opacity ?? 1) * 100)}
                min={0}
                max={100}
                step={1}
                display={`${Math.round((activeLayer?.opacity ?? 1) * 100)}%`}
                onValue={(value) => updateActiveLayer({ opacity: value / 100 })}
              />
            </PropertyRow>
            <PropertyRow label="Blend">
              <Select
                aria-label="Blend mode"
                value={activeLayer?.blendMode ?? 'source-over'}
                onChange={(event) =>
                  updateActiveLayer({
                    blendMode: event.target.value as BlendModeV2,
                  })
                }
              >
                {BLEND_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </PropertyRow>
          </div>
        </section>
        </div>
      </aside>
      {imageError ? <p role="alert" className="paint-image-error">{imageError}</p> : null}
      {exportSurfaces ? (
        <PaintExportModal
          document={document}
          surfaces={exportSurfaces}
          onClose={() => setExportSurfaces(null)}
        />
      ) : null}
    </div>
    {loadingSurfaces || importingImage ? <p role="status" className="paint-image-notice">{importingImage ? 'Opening image…' : 'Loading layers…'}</p> : null}
    </>
  )
}
