import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Film, Images, RefreshCw, Square } from 'lucide-react'
import { renderDimensions, scheduleFrames } from '../render/frameSchedule'
import { renderDocument } from '../render/renderEngine'
import {
  DEFAULT_RENDER_SETTINGS,
  RENDER_FPS,
  RENDER_RESOLUTION_SCALES,
  RENDER_SPEEDS,
  isRenderError,
  type RenderArtifact,
  type RenderFormat,
  type RenderProgress,
  type RenderSettings,
} from '../render/types'
import { useEditorStore } from '../store/editorStore'
import { Button, Select } from '../ui/controls'

function downloadArtifact(artifact: RenderArtifact): void {
  const url = URL.createObjectURL(artifact.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = artifact.filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function progressLabel(progress: RenderProgress | null): string {
  if (!progress) return 'Preparing render'
  const phase = progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1)
  return `${phase} · ${progress.frameIndex} / ${progress.frameCount} frames`
}

export function PreviewStudio() {
  const document = useEditorStore((state) => state.document)
  const [settings, setSettings] = useState<RenderSettings>({
    ...DEFAULT_RENDER_SETTINGS,
  })
  const [artifact, setArtifact] = useState<RenderArtifact | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>()
  const [progress, setProgress] = useState<RenderProgress | null>(null)
  const [rendering, setRendering] = useState<RenderFormat | null>('video')
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string>()
  const controllerRef = useRef<AbortController | null>(null)
  const videoUrlRef = useRef<string | null>(null)

  const schedule = useMemo(
    () => scheduleFrames(document.animation.duration, settings),
    [document.animation.duration, settings],
  )
  const dimensions = useMemo(
    () => renderDimensions(document.artboard, settings.resolutionScale),
    [document.artboard, settings.resolutionScale],
  )

  const replaceVideoArtifact = (output: RenderArtifact) => {
    if (output.kind !== 'video') return
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    const url = URL.createObjectURL(output.blob)
    videoUrlRef.current = url
    setVideoUrl(url)
    setArtifact(output)
  }

  const run = async (
    format: RenderFormat,
    requestSettings: RenderSettings = settings,
  ) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRendering(format)
    setProgress(null)
    setError(undefined)
    try {
      const output = await renderDocument(document, requestSettings, format, {
        signal: controller.signal,
        onProgress: setProgress,
      })
      if (format === 'video') {
        replaceVideoArtifact(output)
        setStale(false)
      } else {
        downloadArtifact(output)
      }
    } catch (cause) {
      if (isRenderError(cause) && cause.code === 'cancelled') return
      setError(
        cause instanceof Error ? cause.message : 'The render could not be completed.',
      )
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setRendering(null)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    void renderDocument(document, DEFAULT_RENDER_SETTINGS, 'video', {
      signal: controller.signal,
      onProgress: setProgress,
    })
      .then((output) => {
        replaceVideoArtifact(output)
        setStale(false)
      })
      .catch((cause) => {
        if (isRenderError(cause) && cause.code === 'cancelled') return
        setError(cause instanceof Error ? cause.message : 'Preview render failed.')
      })
      .finally(() => {
        if (controllerRef.current === controller) {
          controllerRef.current = null
          setRendering(null)
        }
      })
    return () => {
      controller.abort()
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current)
        videoUrlRef.current = null
      }
    }
  }, [document])

  const updateSettings = (next: RenderSettings) => {
    setSettings(next)
    setStale(true)
  }
  const busy = rendering !== null

  return (
    <main className="preview-studio">
      <section className="preview-stage" aria-live="polite">
        {busy ? (
          <div className="preview-rendering">
            <Film size={30} />
            <strong>
              {rendering === 'video'
                ? 'Generating preview video'
                : rendering === 'gif'
                  ? 'Encoding GIF'
                  : 'Packing image sequence'}
            </strong>
            <span>{progressLabel(progress)}</span>
            <div
              className="preview-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress?.ratio ?? 0) * 100)}
            >
              <span style={{ width: `${(progress?.ratio ?? 0) * 100}%` }} />
            </div>
            <Button onClick={() => controllerRef.current?.abort()}>
              <Square size={12} /> Cancel
            </Button>
          </div>
        ) : videoUrl ? (
          <video
            className="preview-video"
            src={videoUrl}
            controls
            loop
            autoPlay
          />
        ) : (
          <div className="preview-empty">
            <Film size={30} />
            <strong>No preview available</strong>
            <span>Adjust the settings or try rendering again.</span>
            <Button variant="primary" onClick={() => void run('video')}>
              Render Preview
            </Button>
          </div>
        )}
      </section>

      <aside className="preview-settings">
        <h2>Render Studio</h2>
        <p>
          Preview and video downloads share the same encoded file. GIF and PNG
          sequence use these settings in their own render pass.
        </p>

        <label className="preview-field">
          <span>Frames per second</span>
          <Select
            value={settings.fps}
            disabled={busy}
            onChange={(event) =>
              updateSettings({
                ...settings,
                fps: Number(event.target.value) as RenderSettings['fps'],
              })
            }
          >
            {RENDER_FPS.map((fps) => (
              <option key={fps} value={fps}>{fps} FPS</option>
            ))}
          </Select>
        </label>

        <label className="preview-field">
          <span>Playback speed</span>
          <Select
            value={settings.speed}
            disabled={busy}
            onChange={(event) =>
              updateSettings({
                ...settings,
                speed: Number(event.target.value) as RenderSettings['speed'],
              })
            }
          >
            {RENDER_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>{speed}×</option>
            ))}
          </Select>
        </label>

        <label className="preview-field">
          <span>Resolution</span>
          <Select
            value={settings.resolutionScale}
            disabled={busy}
            onChange={(event) =>
              updateSettings({
                ...settings,
                resolutionScale: Number(
                  event.target.value,
                ) as RenderSettings['resolutionScale'],
              })
            }
          >
            {RENDER_RESOLUTION_SCALES.map((scale) => (
              <option key={scale} value={scale}>{scale}×</option>
            ))}
          </Select>
        </label>

        <div className="preview-summary">
          <div><span>Pixels</span><strong>{dimensions.width} × {dimensions.height}</strong></div>
          <div><span>Duration</span><strong>{schedule.outputDuration.toFixed(2)}s</strong></div>
          <div><span>Frames</span><strong>{schedule.frameCount}</strong></div>
          <div><span>Format</span><strong>{artifact?.kind === 'video' ? artifact.mimeType.replace('video/', '').toUpperCase() : 'Auto'}</strong></div>
        </div>

        {stale && (
          <p className="preview-status">
            Settings changed. Re-render to update the preview and video download.
          </p>
        )}
        {error && <p className="preview-error">{error}</p>}

        <div className="preview-actions">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void run('video')}
          >
            <RefreshCw size={13} /> {artifact ? 'Re-render Preview' : 'Render Preview'}
          </Button>
          <Button
            disabled={busy || stale || artifact?.kind !== 'video'}
            onClick={() => artifact && downloadArtifact(artifact)}
          >
            <Download size={13} /> Download Video
          </Button>
          <Button disabled={busy} onClick={() => void run('gif')}>
            <Download size={13} /> Download GIF
          </Button>
          <Button disabled={busy} onClick={() => void run('image-sequence')}>
            <Images size={13} /> Download PNG Sequence
          </Button>
        </div>
      </aside>
    </main>
  )
}
