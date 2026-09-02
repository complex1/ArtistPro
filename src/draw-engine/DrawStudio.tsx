import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { navigate } from '../app/routes'
import { applyShapeMask } from '../paint/v2/core/stamp'
import { builtinBrushes, createBrush } from './presets'
import { createEngine, type DrawEngine, type TransformState } from './engine'
import { importBrushFile } from './schema'
import {
  applyHandleDrag,
  handlePoints,
  hitHandle,
  lassoLength,
  selectionTint,
  transformedCorners,
  type HandleId,
} from './overlay'
import type { AffineTransform, BrushConfig, TransformMode } from './types'

type Tool = 'brush' | 'lasso' | 'fill' | 'transform' | 'liquify'

const DOC_WIDTH = 900
const DOC_HEIGHT = 600

function pointFromEvent(
  event: ReactPointerEvent<HTMLElement>,
  canvas: HTMLElement,
  width: number,
  height: number,
) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
    t: event.timeStamp,
    pressure: event.pressure || 0.5,
  }
}

let tintScratch: HTMLCanvasElement | null = null

function tintCanvas(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  if (!tintScratch) tintScratch = document.createElement('canvas')
  if (tintScratch.width !== width) tintScratch.width = width
  if (tintScratch.height !== height) tintScratch.height = height
  tintScratch.getContext('2d')?.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0,
  )
  return tintScratch
}

function strokePath(
  context: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  close: boolean,
) {
  if (points.length === 0) return
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y)
  if (close && points.length > 2) context.closePath()
}

export function DrawStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<DrawEngine | null>(null)
  const lassoDraftRef = useRef<{ x: number; y: number }[]>([])
  const dashRef = useRef(0)
  const dragRef = useRef<{
    handle: HandleId
    start: AffineTransform
    origin: { x: number; y: number }
    corners: { x: number; y: number }[]
    wrapIndex: number
  } | null>(null)
  const presets = useMemo(() => builtinBrushes(), [])
  const [tool, setTool] = useState<Tool>('brush')
  const [brushId, setBrushId] = useState('pen')
  const [color, setColor] = useState('#111111')
  const [size, setSize] = useState(16)
  const [transformMode, setTransformMode] = useState<TransformMode>('move')
  const [custom, setCustom] = useState<BrushConfig[]>([])
  const [backendKind, setBackendKind] = useState('webgl2')
  const [hasSelection, setHasSelection] = useState(false)
  const [transforming, setTransforming] = useState(false)

  const brushes = [...presets, ...custom]
  const brush = brushes.find((item) => item.id === brushId) ?? presets[0]
  const toolRef = useRef(tool)
  const transformModeRef = useRef(transformMode)
  useEffect(() => {
    toolRef.current = tool
    transformModeRef.current = transformMode
  }, [tool, transformMode])

  const tintCacheRef = useRef<HTMLCanvasElement | null>(null)
  const outlineCacheRef = useRef<{ x: number; y: number }[]>([])
  const overlayFrameRef = useRef(0)

  const rebuildTint = () => {
    const overlay = overlayRef.current
    const engine = engineRef.current
    if (!overlay || !engine) return
    const mask = engine.selectionMask()
    outlineCacheRef.current = engine.selectionPath()
    if (!mask) {
      tintCacheRef.current = null
      return
    }
    tintCacheRef.current = tintCanvas(
      selectionTint(mask, overlay.width, overlay.height),
      overlay.width,
      overlay.height,
    )
  }

  const paintOverlay = () => {
    const overlay = overlayRef.current
    const engine = engineRef.current
    if (!overlay || !engine) return
    const context = overlay.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, overlay.width, overlay.height)
    if (tintCacheRef.current && !engine.getTransform()) {
      context.drawImage(tintCacheRef.current, 0, 0)
      const outline = outlineCacheRef.current
      if (outline.length > 2) {
        context.save()
        context.lineWidth = 2
        context.setLineDash([6, 4])
        context.lineDashOffset = -dashRef.current
        context.strokeStyle = '#111318'
        strokePath(context, outline, true)
        context.stroke()
        context.strokeStyle = '#ffffff'
        context.lineDashOffset = -dashRef.current + 5
        strokePath(context, outline, true)
        context.stroke()
        context.restore()
      }
    }

    const draft = lassoDraftRef.current
    if (draft.length > 1) {
      context.fillStyle = 'rgba(74, 114, 255, 0.12)'
      context.strokeStyle = '#4a72ff'
      context.lineWidth = 1.25
      strokePath(context, draft, true)
      context.fill()
      context.stroke()
    }

    const transform = engine.getTransform()
    if (transform) drawTransformBox(context, transform, dashRef.current)
  }

  const overlayNeedsAnim = () =>
    Boolean(
      tintCacheRef.current ||
        engineRef.current?.getTransform() ||
        lassoDraftRef.current.length > 1,
    )

  const startOverlayAnim = () => {
    if (overlayFrameRef.current) return
    const tick = (time: number) => {
      if (!overlayNeedsAnim()) {
        overlayFrameRef.current = 0
        return
      }
      dashRef.current = (time / 70) % 18
      paintOverlay()
      overlayFrameRef.current = requestAnimationFrame(tick)
    }
    overlayFrameRef.current = requestAnimationFrame(tick)
  }

  const refreshOverlay = (selectionChanged = false) => {
    if (selectionChanged) rebuildTint()
    paintOverlay()
    startOverlayAnim()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = createEngine({
      canvas,
      backend: 'webgl2',
      document: { name: 'Drawing', width: DOC_WIDTH, height: DOC_HEIGHT, background: '#f4f1ea' },
    })
    engineRef.current = engine
    setBackendKind(engine.backendKind())
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (engine.getTransform()) {
          engine.cancelTransform()
          setTransforming(false)
        } else {
          engine.clearSelection()
          setHasSelection(false)
        }
        refreshOverlay(true)
        return
      }
      if (event.key === 'Enter' && engine.getTransform()) {
        event.preventDefault()
        engine.commitTransform()
        setTransforming(false)
        refreshOverlay()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) engine.redo()
        else engine.undo()
        refreshOverlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(overlayFrameRef.current)
      engine.dispose()
    }
  }, [])

  const syncSelection = () => {
    const engine = engineRef.current
    setHasSelection(engine?.hasSelection() ?? false)
    setTransforming(engine?.getTransform() != null)
    refreshOverlay(true)
  }

  const chooseTool = (next: Tool) => {
    const engine = engineRef.current
    if (!engine) {
      setTool(next)
      return
    }
    if (tool === 'transform' && next !== 'transform' && engine.getTransform()) {
      engine.commitTransform()
    }
    setTool(next)
    if (next === 'transform' && !engine.getTransform()) {
      const started = engine.beginTransform(transformMode)
      setTransforming(started != null)
    }
    if (next !== 'transform') setTransforming(false)
    refreshOverlay()
  }

  const changeTransformMode = (mode: TransformMode) => {
    setTransformMode(mode)
    const engine = engineRef.current
    if (!engine || tool !== 'transform') return
    if (engine.getTransform()) {
      engine.updateTransform({ mode })
    } else {
      setTransforming(engine.beginTransform(mode) != null)
    }
    refreshOverlay()
  }

  const activeBrush = (): BrushConfig =>
    createBrush({
      ...brush,
      color,
      size,
      blendMode: brush.preset === 'eraser' ? 'erase' : brush.blendMode,
    })

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayRef.current
    const engine = engineRef.current
    if (!overlay || !engine) return
    try {
      overlay.setPointerCapture(event.pointerId)
    } catch {
      /* pointer capture is optional */
    }
    const point = pointFromEvent(event, overlay, DOC_WIDTH, DOC_HEIGHT)
    if (tool === 'brush') engine.beginStroke(activeBrush(), point)
    else if (tool === 'lasso') lassoDraftRef.current = [{ x: point.x, y: point.y }]
    else if (tool === 'fill') engine.fill(point.x, point.y, color)
    else if (tool === 'transform') startTransformDrag(engine, point)
    else engine.beginLiquify(activeBrush(), point, 'push')
    refreshOverlay()
  }

  const startTransformDrag = (
    engine: DrawEngine,
    point: { x: number; y: number },
  ) => {
    let transform = engine.getTransform()
    if (!transform) {
      transform = engine.beginTransform(transformMode)
      setTransforming(transform != null)
    }
    if (!transform) return
    const corners =
      transform.mode === 'perspective'
        ? transform.corners
        : transformedCorners(transform.bounds, transform.affine)
    const handle = hitHandle(point.x, point.y, corners, 14)
    if (!handle) return
    let wrapIndex = -1
    if (transform.mode === 'wrap') {
      let best = Number.POSITIVE_INFINITY
      transform.wrap.points.forEach((vertex, index) => {
        const dist = Math.hypot(vertex.x - point.x, vertex.y - point.y)
        if (dist < best && dist < 16) {
          best = dist
          wrapIndex = index
        }
      })
    }
    dragRef.current = {
      handle,
      start: { ...transform.affine },
      origin: { x: point.x, y: point.y },
      corners: transform.corners.map((corner) => ({ ...corner })),
      wrapIndex,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0) return
    const overlay = overlayRef.current
    const engine = engineRef.current
    if (!overlay || !engine) return
    const point = pointFromEvent(event, overlay, DOC_WIDTH, DOC_HEIGHT)
    if (tool === 'brush') engine.moveStroke(point)
    else if (tool === 'lasso') {
      lassoDraftRef.current = [...lassoDraftRef.current, { x: point.x, y: point.y }]
    } else if (tool === 'transform') moveTransformDrag(engine, point)
    else if (tool === 'liquify') engine.moveLiquify(point)
    refreshOverlay()
  }

  const moveTransformDrag = (engine: DrawEngine, point: { x: number; y: number }) => {
    const drag = dragRef.current
    const transform = engine.getTransform()
    if (!drag || !transform) return
    if (transform.mode === 'perspective') {
      const cornerMap: Partial<Record<HandleId, number>> = { nw: 0, ne: 1, se: 2, sw: 3 }
      const index = cornerMap[drag.handle]
      if (index != null) {
        const next = drag.corners.map((corner) => ({ ...corner }))
        next[index] = { x: point.x, y: point.y }
        engine.updateTransform({ corners: next })
        return
      }
      const dx = point.x - drag.origin.x
      const dy = point.y - drag.origin.y
      engine.updateTransform({
        corners: drag.corners.map((corner) => ({ x: corner.x + dx, y: corner.y + dy })),
      })
      return
    }
    if (transform.mode === 'wrap' && drag.wrapIndex >= 0) {
      const points = transform.wrap.points.map((vertex, index) =>
        index === drag.wrapIndex ? { x: point.x, y: point.y } : { ...vertex },
      )
      engine.updateTransform({ wrap: { ...transform.wrap, points } })
      return
    }
    engine.updateTransform({
      affine: applyHandleDrag(
        drag.handle,
        drag.start,
        transform.bounds,
        drag.origin,
        point,
        transformModeRef.current === 'resize',
      ),
    })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current
    if (!engine) return
    if (tool === 'brush') engine.endStroke()
    else if (tool === 'lasso') {
      const draft = lassoDraftRef.current
      lassoDraftRef.current = []
      if (draft.length < 3 || lassoLength(draft) < 12) {
        engine.clearSelection()
      } else {
        engine.setSelectionFromLasso(draft)
      }
      setHasSelection(engine.hasSelection())
    } else if (tool === 'liquify') engine.endLiquify()
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    refreshOverlay(tool === 'lasso')
  }

  return (
    <div className="studio-shell draw-studio">
      <header className="studio-topbar">
        <button type="button" className="button ghost" onClick={() => navigate({ page: 'home' })}>
          Artist Pro
        </button>
        <strong>Draw</strong>
        <span className="draw-studio-meta">
          {backendKind}
          {hasSelection ? ' · selection' : ''}
          {transforming ? ' · transform · Enter apply · Esc cancel' : hasSelection ? ' · Esc deselect' : ''}
        </span>
      </header>
      <div className="draw-studio-body">
        <aside className="draw-studio-rail">
          {(['brush', 'lasso', 'fill', 'transform', 'liquify'] as Tool[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`button ghost${tool === id ? ' is-active' : ''}`}
              onClick={() => chooseTool(id)}
            >
              {id}
            </button>
          ))}
          <label>
            Transform
            <select
              value={transformMode}
              onChange={(event) => changeTransformMode(event.target.value as TransformMode)}
            >
              <option value="move">Move</option>
              <option value="resize">Resize</option>
              <option value="free">Free resize</option>
              <option value="perspective">Perspective</option>
              <option value="wrap">Wrap</option>
            </select>
          </label>
          {transforming ? (
            <>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  engineRef.current?.commitTransform()
                  setTransforming(false)
                  refreshOverlay()
                }}
              >
                Apply transform
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  engineRef.current?.cancelTransform()
                  setTransforming(false)
                  refreshOverlay()
                }}
              >
                Cancel transform
              </button>
            </>
          ) : null}
          <button type="button" className="button ghost" onClick={() => engineRef.current?.undo()}>
            Undo
          </button>
          <button type="button" className="button ghost" onClick={() => engineRef.current?.redo()}>
            Redo
          </button>
          <button type="button" className="button ghost" onClick={() => engineRef.current?.addLayer()}>
            Layer
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              const engine = engineRef.current
              if (!engine) return
              if (engine.getTransform()) engine.cancelTransform()
              engine.clearSelection()
              syncSelection()
            }}
          >
            Deselect
          </button>
        </aside>
        <div className="draw-stage">
          <canvas ref={canvasRef} width={DOC_WIDTH} height={DOC_HEIGHT} className="draw-studio-canvas" />
          <canvas
            ref={overlayRef}
            width={DOC_WIDTH}
            height={DOC_HEIGHT}
            className="draw-studio-overlay"
            aria-label="Drawing canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
        <aside className="draw-studio-rail">
          {brushes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`button ghost${brushId === item.id ? ' is-active' : ''}`}
              onClick={() => setBrushId(item.id)}
            >
              {item.name}
            </button>
          ))}
          <label>
            Color
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <label>
            Size {size}
            <input
              type="range"
              min={1}
              max={80}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <label>
            Import brush
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const parsed = importBrushFile(JSON.parse(await file.text()))
                if (!parsed) return
                setCustom((list) => [...list, parsed])
                setBrushId(parsed.id)
              }}
            />
          </label>
          <label>
            Stamp tip
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                const engine = engineRef.current
                if (!file || !engine) return
                const bitmap = await createImageBitmap(file)
                const canvas = document.createElement('canvas')
                canvas.width = bitmap.width
                canvas.height = bitmap.height
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                ctx.drawImage(bitmap, 0, 0)
                const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
                applyShapeMask(image.data, false)
                const next = createBrush({
                  ...activeBrush(),
                  id: crypto.randomUUID(),
                  name: file.name,
                  preset: 'stamp',
                  tip: 'stamp',
                  category: 'Custom',
                  stampImages: [{ width: image.width, height: image.height, pixels: image.data }],
                })
                setCustom((list) => [...list, next])
                setBrushId(next.id)
              }}
            />
          </label>
        </aside>
      </div>
    </div>
  )
}

function drawTransformBox(
  context: CanvasRenderingContext2D,
  transform: TransformState,
  dash: number,
) {
  const corners =
    transform.mode === 'perspective'
      ? transform.corners
      : transformedCorners(transform.bounds, transform.affine)
  context.save()
  context.lineWidth = 1
  context.setLineDash([6, 4])
  context.lineDashOffset = -dash
  context.strokeStyle = '#111318'
  strokePath(context, corners, true)
  context.stroke()
  context.strokeStyle = '#4a72ff'
  context.lineDashOffset = -dash + 5
  strokePath(context, corners, true)
  context.stroke()
  context.setLineDash([])
  const handles = handlePoints(corners)
  for (const id of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
    const point = handles[id]
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#4a72ff'
    context.fillRect(point.x - 4, point.y - 4, 8, 8)
    context.strokeRect(point.x - 4, point.y - 4, 8, 8)
  }
  if (transform.mode === 'wrap') {
    for (const point of transform.wrap.points) {
      context.beginPath()
      context.arc(point.x, point.y, 3.5, 0, Math.PI * 2)
      context.fillStyle = '#ffffff'
      context.fill()
      context.stroke()
    }
  }
  context.restore()
}
