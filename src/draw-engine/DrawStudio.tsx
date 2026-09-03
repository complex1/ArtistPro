import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '../app/routes'
import { applyShapeMask } from '@artist-studio/utils'
import { createEngine, type DrawEngine } from './engine'
import { addVectorShape, PaintStage, type StageTool, type VectorItem } from './PaintStage'
import { builtinBrushes, createBrush } from './presets'
import { importBrushFile } from './schema'
import type { BrushConfig, TransformMode } from './types'

const DOC_WIDTH = 900
const DOC_HEIGHT = 600

function createRasterCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = DOC_WIDTH
  canvas.height = DOC_HEIGHT
  return canvas
}

export function DrawStudio() {
  const rasterRef = useRef<HTMLCanvasElement>(createRasterCanvas())
  const engineRef = useRef<DrawEngine | null>(null)
  const presets = useMemo(() => builtinBrushes(), [])
  const [engine, setEngine] = useState<DrawEngine | null>(null)
  const [tool, setTool] = useState<StageTool>('brush')
  const [brushId, setBrushId] = useState('pen')
  const [color, setColor] = useState('#111111')
  const [size, setSize] = useState(16)
  const [transformMode, setTransformMode] = useState<TransformMode>('free')
  const [custom, setCustom] = useState<BrushConfig[]>([])
  const [backendKind, setBackendKind] = useState('cpu')
  const [hasSelection, setHasSelection] = useState(false)
  const [transforming, setTransforming] = useState(false)
  const [vectors, setVectors] = useState<VectorItem[]>([])
  const [layers, setLayers] = useState<{ id: string; name: string }[]>([])
  const [activeLayerId, setActiveLayerId] = useState('')
  const [rasterTick, setRasterTick] = useState(0)
  const [transformTick, setTransformTick] = useState(0)

  const brushes = [...presets, ...custom]
  const brush = brushes.find((item) => item.id === brushId) ?? presets[0]
  const activeBrush = (): BrushConfig =>
    createBrush({
      ...brush,
      color,
      size,
      blendMode: brush.preset === 'eraser' ? 'erase' : brush.blendMode,
    })

  useEffect(() => {
    const next = createEngine({
      canvas: rasterRef.current,
      backend: 'cpu',
      document: { name: 'Drawing', width: DOC_WIDTH, height: DOC_HEIGHT, background: '#f4f1ea' },
    })
    engineRef.current = next
    setEngine(next)
    setBackendKind(next.backendKind())
    setLayers(next.document().layers.map((layer) => ({ id: layer.id, name: layer.name })))
    setActiveLayerId(next.document().activeLayerId)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (next.getTransform()) next.cancelTransform()
        else next.clearSelection()
        setHasSelection(next.hasSelection())
        setTransforming(false)
        setTransformTick((value) => value + 1)
        setRasterTick((value) => value + 1)
      }
      if (event.key === 'Enter' && next.getTransform()) {
        event.preventDefault()
        next.commitTransform()
        setTransforming(false)
        setTransformTick((value) => value + 1)
        setRasterTick((value) => value + 1)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) next.redo()
        else next.undo()
        setRasterTick((value) => value + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      next.dispose()
    }
  }, [])

  const bumpRaster = () => setRasterTick((value) => value + 1)
  const bumpTransform = () => {
    setTransformTick((value) => value + 1)
    bumpRaster()
  }

  const syncLayers = () => {
    const current = engineRef.current
    if (!current) return
    const doc = current.document()
    setLayers(doc.layers.map((layer) => ({ id: layer.id, name: layer.name })))
    setActiveLayerId(doc.activeLayerId)
    bumpRaster()
  }

  return (
    <div className="studio-shell draw-studio">
      <header className="studio-topbar">
        <button type="button" className="button ghost" onClick={() => navigate({ page: 'home' })}>
          Artist Pro
        </button>
        <strong>Draw</strong>
        <span className="draw-studio-meta">
          Konva + raster · {backendKind}
          {hasSelection ? ' · selection' : ''}
          {transforming ? ' · transform · Enter apply · Esc cancel' : hasSelection ? ' · Esc deselect' : ''}
        </span>
      </header>
      <div className="draw-studio-body">
        <aside className="draw-studio-rail">
          {(
            [
              'brush',
              'lasso',
              'fill',
              'transform',
              'liquify',
              'select',
            ] as StageTool[]
          ).map((id) => (
            <button
              key={id}
              type="button"
              className={`button ghost${tool === id ? ' is-active' : ''}`}
              onClick={() => setTool(id)}
            >
              {id}
            </button>
          ))}
          <label>
            Transform
            <select
              value={transformMode}
              onChange={(event) => setTransformMode(event.target.value as TransformMode)}
            >
              <option value="move">Move</option>
              <option value="resize">Resize</option>
              <option value="free">Free resize</option>
              <option value="perspective">Perspective</option>
              <option value="wrap">Wrap</option>
            </select>
          </label>
          <button
            type="button"
            className="button ghost"
            onClick={() => setVectors((list) => [...list, addVectorShape('rect', color, DOC_WIDTH, DOC_HEIGHT)])}
          >
            Add rect
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => setVectors((list) => [...list, addVectorShape('text', color, DOC_WIDTH, DOC_HEIGHT)])}
          >
            Add text
          </button>
          {transforming ? (
            <>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  engineRef.current?.commitTransform()
                  setTransforming(false)
                  bumpTransform()
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
                  bumpTransform()
                }}
              >
                Cancel transform
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              engineRef.current?.undo()
              bumpRaster()
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              engineRef.current?.redo()
              bumpRaster()
            }}
          >
            Redo
          </button>
          <p className="draw-studio-kicker">Layers</p>
          {layers.map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={`button ghost${activeLayerId === layer.id ? ' is-active' : ''}`}
              onClick={() => {
                engineRef.current?.setActiveLayer(layer.id)
                setActiveLayerId(layer.id)
              }}
            >
              {layer.name}
            </button>
          ))}
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              engineRef.current?.addLayer()
              syncLayers()
            }}
          >
            Add layer
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              const current = engineRef.current
              if (!current) return
              if (current.getTransform()) current.cancelTransform()
              current.clearSelection()
              setHasSelection(false)
              setTransforming(false)
              bumpTransform()
            }}
          >
            Deselect
          </button>
        </aside>
        <div className="draw-stage">
          {engine ? (
            <PaintStage
              width={DOC_WIDTH}
              height={DOC_HEIGHT}
              engine={engine}
              rasterCanvas={rasterRef.current}
              tool={tool}
              transformMode={transformMode}
              color={color}
              brush={activeBrush()}
              vectors={vectors}
              rasterTick={rasterTick}
              transformTick={transformTick}
              onSelectionChange={setHasSelection}
              onTransformingChange={setTransforming}
              onVectorsChange={setVectors}
            />
          ) : null}
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
                if (!file) return
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
