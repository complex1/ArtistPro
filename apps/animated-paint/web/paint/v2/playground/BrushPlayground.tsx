import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowLeft,
  Copy,
  Download,
  Info,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { navigate } from '../../../app/routes'
import { Button, IconButton } from '../../../ui/controls'
import { duplicateBrush, getBrushV2, saveCustomBrush } from '../brushLibrary'
import { brushFileName, exportBrushJson, importBrushJson } from '../brushTransfer'
import { createBrushV2, createDocumentV2 } from '../core/defaults'
import { parseBrush } from '../core/schema'
import type { BrushV2, StrokePointV2, StrokeV2 } from '../core/types'
import {
  fromPointer,
  randomStrokeSeed,
  snapshotStroke,
  stabilizePoint,
} from '../input/sampler'
import { BUILTIN_BRUSHES } from '../presets'
import { renderDocumentV2, releaseRenderCache } from '../render/engine'
import { createPaintScheduler } from '../render/scheduler'
import { nextDocumentFrame } from '../render/timing'
import { onStampAssetReady } from '../render/canvas2d'
import { BrushInspector } from '../ui/BrushInspector'
import { brushPreviewPoints, usesClosedPreview } from '../ui/brushPreviewPath'
import { AnimationCodeEditor } from './AnimationCodeEditor'
import { BrushLibraryPage } from './BrushLibraryPage'

const CANVAS_W = 640
const CANVAS_H = 400
const MIN_PANEL_PERCENT = 24

function demoPoints(brush: BrushV2) {
  return brushPreviewPoints(brush, CANVAS_W, CANVAS_H)
}

function demoStroke(brush: BrushV2): StrokeV2 {
  const stroke = snapshotStroke(
    brush,
    demoPoints(brush),
    'playground',
  )
  stroke.createdAt = 0
  return stroke
}

export function BrushPlayground({ brushId }: { brushId?: string }) {
  if (!brushId) return <BrushLibraryPage />
  return <BrushEditor key={brushId} brushId={brushId} />
}

function BrushEditor({ brushId }: { brushId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<StrokePointV2 | null>(null)
  const lastTime = useRef<number | null>(null)
  const [brush, setBrush] = useState<BrushV2>(() =>
    structuredClone(
      BUILTIN_BRUSHES.find((item) => item.id === brushId) ??
        BUILTIN_BRUSHES.find((item) => item.id === 'wiggle') ??
        createBrushV2(),
    ),
  )
  const [strokes, setStrokes] = useState<StrokeV2[]>(() => [demoStroke(brush)])
  const demoStrokeId = useRef(strokes[0]?.id)
  const [playing, setPlaying] = useState(true)
  const [message, setMessage] = useState('')
  const [previewPercent, setPreviewPercent] = useState(50)
  const [showHelp, setShowHelp] = useState(false)
  const strokesRef = useRef(strokes)
  const playingRef = useRef(playing)
  const timeRef = useRef(0)
  const schedulerRef = useRef<ReturnType<typeof createPaintScheduler> | null>(null)

  useEffect(() => {
    let cancelled = false
    void getBrushV2(brushId).then((loaded) => {
      if (cancelled || !loaded) return
      const next = structuredClone(loaded)
      timeRef.current = 0
      setBrush(next)
      const sample = demoStroke(next)
      demoStrokeId.current = sample.id
      setStrokes([sample])
    })
    return () => {
      cancelled = true
    }
  }, [brushId])

  const patch = (values: Partial<BrushV2>) => {
    setBrush((current) => ({ ...current, ...values }))
    setStrokes((current) =>
      current.map((stroke) => {
        const brushSnapshot = { ...stroke.brushSnapshot, ...values }
        const changeDemo = stroke.id === demoStrokeId.current &&
          usesClosedPreview(stroke.brushSnapshot) !== usesClosedPreview(brushSnapshot)
        return {
          ...stroke,
          points: changeDemo ? demoPoints(brushSnapshot) : stroke.points,
          brushSnapshot,
        }
      }),
    )
  }

  useEffect(() => {
    strokesRef.current = strokes
    schedulerRef.current?.invalidate()
  }, [strokes])

  useEffect(() => {
    playingRef.current = playing
    lastTime.current = null
    schedulerRef.current?.invalidate()
  }, [playing])

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const document = createDocumentV2('Playground', CANVAS_W, CANVAS_H)
    const rasters = new Map()
    const scheduler = createPaintScheduler((now) => {
      const dt = lastTime.current === null ? 0 : now - lastTime.current
      lastTime.current = now
      if (playingRef.current) timeRef.current += dt
      document.layers[0].strokes = strokesRef.current
      renderDocumentV2(context, document, timeRef.current, rasters, undefined, undefined, timeRef.current)
      return playingRef.current ? nextDocumentFrame(document, timeRef.current, timeRef.current) : Infinity
    }, 30)
    schedulerRef.current = scheduler
    const unsubscribe = onStampAssetReady(scheduler.invalidate)
    return () => { scheduler.dispose(); unsubscribe(); releaseRenderCache(context); schedulerRef.current = null }
  }, [])

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

  const beginDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = stabilizePoint(pointFromEvent(event), null, brush.stability)
    drawing.current = true
    lastPoint.current = point
    const stroke = snapshotStroke(brush, [point], 'playground', randomStrokeSeed())
    stroke.createdAt = timeRef.current
    setStrokes((current) => [...current, stroke])
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events used in tests still draw.
    }
  }

  const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !lastPoint.current) return
    const point = stabilizePoint(
      pointFromEvent(event),
      lastPoint.current,
      brush.stability,
    )
    lastPoint.current = point
    setStrokes((current) => {
      const next = [...current]
      const stroke = next[next.length - 1]
      if (!stroke) return current
      const previous = stroke.points[stroke.points.length - 1]
      if (Math.hypot(point.x - previous.x, point.y - previous.y) > 1.5) {
        stroke.points.push(point)
      }
      return next
    })
  }

  const endDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = false
    lastPoint.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const saveBrush = async () => {
    const parsed = parseBrush(brush)
    if (!parsed) {
      setMessage('Brush schema is invalid.')
      return
    }
    await saveCustomBrush(parsed)
    setMessage(`Saved “${parsed.name}”.`)
  }

  const duplicate = () => {
    void duplicateBrush(brush).then((copy) => {
      navigate({ page: 'paint-playground', brushId: copy.id })
    })
  }

  const exportBrush = () => {
    const url = URL.createObjectURL(
      new Blob([exportBrushJson(brush)], { type: 'application/json' }),
    )
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = brushFileName(brush)
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importBrush = async (file: File) => {
    const imported = importBrushJson(await file.text())
    if (!imported) {
      setMessage('That file is not a valid brush config.')
      return
    }
    await saveCustomBrush(imported)
    navigate({ page: 'paint-playground', brushId: imported.id })
  }

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const workspace = workspaceRef.current
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    const move = (moveEvent: PointerEvent) => {
      const percent = ((moveEvent.clientY - bounds.top) / bounds.height) * 100
      setPreviewPercent(
        Math.min(100 - MIN_PANEL_PERCENT, Math.max(MIN_PANEL_PERCENT, percent)),
      )
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <div className="brush-editor-page">
      <header className="app-header brush-editor-header">
        <div className="brand">
          <IconButton
            icon={ArrowLeft}
            label="Back to brushes"
            onClick={() => navigate({ page: 'paint-playground' })}
          />
          <strong>{brush.name}</strong>
          <span className="brush-editor-status">{message}</span>
        </div>
        <div className="header-actions">
          <Button onClick={() => importRef.current?.click()}>
            <Upload size={14} /> Import
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importBrush(file)
              event.currentTarget.value = ''
            }}
          />
          <Button onClick={exportBrush}>
            <Download size={14} /> Export
          </Button>
          <Button onClick={duplicate}>
            <Copy size={14} /> Duplicate
          </Button>
          <Button variant="primary" onClick={saveBrush}>
            <Save size={14} /> Save brush
          </Button>
        </div>
      </header>

      <aside className="brush-editor-properties">
        <div className="brush-editor-panel-title">
          <div>
            <p className="studio-kicker">Brush</p>
            <strong>Properties</strong>
          </div>
        </div>
        <BrushInspector
          brush={brush}
          onChange={patch}
          showAnimationEditor={false}
        />
      </aside>

      <main
        ref={workspaceRef}
        className="brush-editor-workspace"
        style={{ '--preview-percent': `${previewPercent}%` } as CSSProperties}
      >
        <section className="brush-preview-panel">
          <div className="brush-editor-panel-title brush-preview-toolbar">
            <div>
              <p className="studio-kicker">Live canvas</p>
              <strong>Preview</strong>
            </div>
            <div>
              <IconButton
                icon={playing ? Pause : Play}
                label={playing ? 'Pause preview' : 'Play preview'}
                onClick={() => setPlaying((value) => !value)}
              />
              <IconButton
                icon={RotateCcw}
                label="Reset animation time"
                onClick={() => {
                  timeRef.current = 0
                  setStrokes((current) => current.map((stroke) => ({ ...stroke, createdAt: 0 })))
                }}
              />
              <IconButton
                icon={Trash2}
                label="Clear preview"
                onClick={() => setStrokes([])}
              />
            </div>
          </div>
          <div className="brush-preview-canvas">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              role="application"
              aria-label="Brush playground canvas"
              tabIndex={0}
              onPointerDown={beginDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
            />
          </div>
        </section>

        <div
          className="brush-editor-resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize preview and code editor"
          aria-valuenow={Math.round(previewPercent)}
          tabIndex={0}
          onPointerDown={beginResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              setPreviewPercent((value) =>
                Math.max(MIN_PANEL_PERCENT, value - 5),
              )
            }
            if (event.key === 'ArrowDown') {
              setPreviewPercent((value) =>
                Math.min(100 - MIN_PANEL_PERCENT, value + 5),
              )
            }
          }}
        />

        <section className="brush-code-panel">
          <div className="brush-editor-panel-title">
            <div>
              <p className="studio-kicker">JavaScript</p>
              <strong>Animation method</strong>
            </div>
            <IconButton
              icon={Info}
              label="Animation method help"
              onClick={() => setShowHelp(true)}
            />
          </div>
          <AnimationCodeEditor
            value={brush.animationJs}
            onChange={(animationJs) => patch({ animationJs, animated: true })}
          />
        </section>
      </main>

      {showHelp ? (
        <div className="brush-help-backdrop" role="presentation">
          <section
            className="brush-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="brush-help-title"
          >
            <div className="brush-editor-panel-title">
              <div>
                <p className="studio-kicker">API reference</p>
                <strong id="brush-help-title">Writing an animation method</strong>
              </div>
              <IconButton
                icon={X}
                label="Close animation help"
                onClick={() => setShowHelp(false)}
              />
            </div>
            <div className="brush-help-content">
              <p>
                Declare <code>function animate(points, config, time, age)</code>. It
                runs once per frame and must return an array of draw items.
              </p>
              <h3>Parameters</h3>
              <ul>
                <li><code>points</code>: sampled path points with x, y, pressure, tilt, velocity, and time.</li>
                <li><code>config</code>: the complete brush snapshot, including size, color, stamps, speed, drift, and effects.</li>
                <li><code>time</code>: continuous seconds multiplied by the brush speed. Your code decides if and how it loops.</li>
                <li><code>age</code>: seconds since this stroke started, multiplied by speed. Use it for effects that spread or dry once. Export replays every stroke from age zero.</li>
              </ul>
              <h3>Return value</h3>
              <p>
                Return draw items with <code>x</code>, <code>y</code>, and
                <code>size</code>. Optional fields include <code>kind</code>,
                <code>rotation</code>, <code>opacity</code>, <code>color</code>,
                <code>stampIndex</code>, <code>blur</code>, <code>glow</code>,
                <code>shadow</code>, and <code>breakBefore</code> (start a separate line contour).
              </p>
              <pre>{`function animate(points, config, time) {
  return points.map(function (point, index) {
    return {
      x: point.x,
      y: point.y + Math.sin(time * 4 + index * 0.2) * 8,
      size: config.size * (0.4 + point.pressure * 0.6),
      kind: config.renderer === "stamp" ? "stamp" : "segment",
      rotation: 0,
      opacity: config.opacity,
      color: config.color,
      stampIndex: index % config.stamps.length,
      blur: config.blurRadius,
      glow: config.glow,
      shadow: config.shadow
    };
  });
}`}</pre>
              <p>
                A seeded <code>rng()</code> helper and <code>Math</code> are
                available. Only run brush JavaScript you trust: it runs inside
                the app, and long-running scripts can block the interface.
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
