import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Film, Square, X } from 'lucide-react'
import { scheduleFrames } from '../../../render/frameSchedule'
import {
  RENDER_FPS,
  isRenderError,
  type RenderFormat,
  type RenderFps,
  type RenderProgress,
} from '../../../render/types'
import { Button, IconButton, Select } from '../../../ui/controls'
import type { PaintDocumentV2 } from '../core/types'
import { renderDocumentV2, releaseRenderCache, type LayerSurfaces } from '../render/engine'
import { createPaintScheduler } from '../render/scheduler'
import { nextDocumentFrame } from '../render/timing'
import { onStampAssetReady } from '../render/canvas2d'
import {
  renderPaintDocument,
  type PaintExportSettings,
} from '../render/exportEngine'

const DEFAULT_DURATION = 3

function downloadArtifact(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function formatLabel(format: RenderFormat): string {
  if (format === 'gif') return 'GIF'
  if (format === 'image-sequence') return 'PNG sequence'
  return 'Video'
}

function progressLabel(progress: RenderProgress | null): string {
  if (!progress) return 'Preparing export'
  const phase = progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1)
  return `${phase} · ${progress.frameIndex} / ${progress.frameCount} frames`
}

export function PaintExportModal({
  document: paintDocument,
  surfaces,
  onClose,
}: {
  document: PaintDocumentV2
  surfaces: LayerSurfaces
  onClose: () => void
}) {
  const modalRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const [fps, setFps] = useState<RenderFps>(30)
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [format, setFormat] = useState<RenderFormat>('video')
  const [progress, setProgress] = useState<RenderProgress | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')

  const schedule = useMemo(
    () =>
      scheduleFrames(duration, {
        fps,
        speed: 1,
        resolutionScale: 1,
      }),
    [duration, fps],
  )

  useEffect(() => {
    modalRef.current
      ?.querySelector<HTMLSelectElement>('[aria-label="Export format"]')
      ?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !controllerRef.current) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const context = previewRef.current?.getContext('2d')
    if (!context || rendering) return
    let startedAt: number | undefined
    const scheduler = createPaintScheduler((now) => {
      startedAt ??= now
      const time = (now - startedAt) % (duration * 1000)
      renderDocumentV2(context, paintDocument, time, surfaces.rasters, surfaces.masks)
      const next = nextDocumentFrame(paintDocument, time)
      return Number.isFinite(next) ? Math.min(next, duration * 1000 - time) :
        paintDocument.layers.some(layer => layer.strokes.some(stroke => stroke.brushSnapshot.animated)) ? duration * 1000 - time : Infinity
    }, fps)
    const unsubscribe = onStampAssetReady(scheduler.invalidate)
    return () => { scheduler.dispose(); unsubscribe(); releaseRenderCache(context) }
  }, [duration, paintDocument, surfaces, rendering, fps])

  useEffect(
    () => () => {
      controllerRef.current?.abort()
    },
    [],
  )

  const runExport = async () => {
    const controller = new AbortController()
    controllerRef.current = controller
    setRendering(true)
    setProgress(null)
    setError('')
    const settings: PaintExportSettings = { fps, duration, format }
    try {
      const artifact = await renderPaintDocument(
        paintDocument,
        surfaces,
        settings,
        {
          signal: controller.signal,
          onProgress: setProgress,
        },
      )
      downloadArtifact(artifact.blob, artifact.filename)
    } catch (cause) {
      if (isRenderError(cause) && cause.code === 'cancelled') return
      setError(
        cause instanceof Error
          ? cause.message
          : 'The export could not be completed.',
      )
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setRendering(false)
      }
    }
  }

  const cancel = () => controllerRef.current?.abort()

  return createPortal(
    <div
      className="paint-export-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !rendering) onClose()
      }}
    >
      <section
        ref={modalRef}
        className="paint-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paint-export-title"
      >
        <header className="paint-export-header">
          <div>
            <p className="studio-kicker">Render</p>
            <h2 id="paint-export-title">Export animated canvas</h2>
          </div>
          <IconButton
            icon={X}
            label="Close export"
            disabled={rendering}
            onClick={onClose}
          />
        </header>

        <div className="paint-export-body">
          <section className="paint-export-preview" aria-label="Export preview">
            <div className="paint-export-preview-frame">
              <canvas
                ref={previewRef}
                width={paintDocument.width}
                height={paintDocument.height}
                aria-label="Animated export preview"
              />
              {rendering ? (
                <div className="paint-export-progress-card">
                  <Film size={26} />
                  <strong>Creating {formatLabel(format)}</strong>
                  <span>{progressLabel(progress)}</span>
                  <div
                    className="preview-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((progress?.ratio ?? 0) * 100)}
                  >
                    <span
                      style={{ width: `${(progress?.ratio ?? 0) * 100}%` }}
                    />
                  </div>
                  <Button onClick={cancel}>
                    <Square size={12} /> Cancel
                  </Button>
                </div>
              ) : null}
            </div>
            <span className="paint-export-preview-caption">
              Preview loops every {duration.toFixed(1)} seconds
            </span>
          </section>

          <aside className="paint-export-settings">
            <label className="preview-field">
              <span>Format</span>
              <Select
                aria-label="Export format"
                value={format}
                disabled={rendering}
                onChange={(event) =>
                  setFormat(event.target.value as RenderFormat)
                }
              >
                <option value="video">Video (MP4 or WebM)</option>
                <option value="gif">Animated GIF</option>
                <option value="image-sequence">PNG image sequence (.zip)</option>
              </Select>
            </label>

            <label className="preview-field">
              <span>Frames per second</span>
              <Select
                aria-label="Frames per second"
                value={fps}
                disabled={rendering}
                onChange={(event) =>
                  setFps(Number(event.target.value) as RenderFps)
                }
              >
                {RENDER_FPS.map((value) => (
                  <option key={value} value={value}>
                    {value} FPS
                  </option>
                ))}
              </Select>
            </label>

            <label className="preview-field">
              <span>Duration</span>
              <div className="paint-export-duration">
                <input
                  className="text-input"
                  aria-label="Export duration"
                  type="number"
                  min={0.5}
                  max={60}
                  step={0.5}
                  value={duration}
                  disabled={rendering}
                  onChange={(event) =>
                    setDuration(
                      Math.min(
                        60,
                        Math.max(0.5, Number(event.target.value) || 0.5),
                      ),
                    )
                  }
                />
                <span>seconds</span>
              </div>
            </label>

            <div className="preview-summary">
              <div>
                <span>Pixels</span>
                <strong>
                  {paintDocument.width} × {paintDocument.height}
                </strong>
              </div>
              <div>
                <span>Frames</span>
                <strong>{schedule.frameCount}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>{schedule.outputDuration.toFixed(2)}s</strong>
              </div>
              <div>
                <span>Output</span>
                <strong>{formatLabel(format)}</strong>
              </div>
            </div>

            {format === 'video' ? (
              <p className="paint-export-note">
                Video exports as MP4 when H.264 is available, otherwise WebM.
              </p>
            ) : format === 'image-sequence' ? (
              <p className="paint-export-note">
                Every frame is saved as a numbered PNG inside a ZIP file.
              </p>
            ) : (
              <p className="paint-export-note">
                GIF works everywhere but may reduce the canvas color palette.
              </p>
            )}

            <p className="paint-export-note">
              One-shot effects such as Ink Bloom replay from the start in exports.
            </p>

            {error ? <p className="preview-error">{error}</p> : null}

            <Button
              variant="primary"
              disabled={rendering}
              onClick={() => void runExport()}
            >
              <Download size={14} />
              Download {formatLabel(format)}
            </Button>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  )
}
