import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowLeft,
  Download,
  ImagePlus,
  Maximize,
  Minus,
  Plus,
} from 'lucide-react'
import { navigate } from './app/routes'
import { Button, CollapsibleSection, IconButton, Select } from './ui/controls'
import { PropertyRow, SliderField } from './ui/fields'
import {
  CEL_DEFAULT_SETTINGS,
  SOURCE_ASSET,
  type CelSettings,
} from './document'
import {
  decodeRasterFile,
  downloadBlob,
  pixelBufferToObjectUrl,
  svgToPngBlob,
} from './exportPng'
import {
  getProject,
  getProjectAsset,
  putProjectAsset,
  saveProject,
  type ProjectRecord,
} from './projects/library'
import {
  restorePixels,
  type PixelBuffer,
  type ChromaMode,
  type Rgb,
} from './restore'
import { TraceWorkerHost } from './traceHost'

type Settings = CelSettings
const DEFAULTS: Settings = CEL_DEFAULT_SETTINGS

type Viewport = { zoom: number; pan: { x: number; y: number } }
type PreviewVisibility = {
  original: boolean
  restored: boolean
  vector: boolean
}

const FIT_VIEW: Viewport = { zoom: 1, pan: { x: 0, y: 0 } }
const MIN_ZOOM = 0.2
const MAX_ZOOM = 12
// Same feel as the SVG editor workspace: one notch is a small step, a fast
// flick still crosses the range.
const ZOOM_SENSITIVITY = 0.0015

const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

const colorKey = (color: Rgb) => color.join(',')

export function CelEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectRecord | null | undefined>(
    undefined,
  )

  useEffect(() => {
    let cancelled = false
    void getProject(projectId).then((next) => {
      if (!cancelled) setProject(next ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (project === undefined) {
    return <div className="studio-loading">Opening project…</div>
  }
  if (!project) {
    return <MissingProject />
  }
  return <CelStudio key={project.id} project={project} />
}

function MissingProject() {
  useEffect(() => {
    navigate({ page: 'cel-home' })
  }, [])
  return <div className="studio-loading">Opening project…</div>
}

function CelStudio({ project }: { project: ProjectRecord }) {
  const tracer = useRef<TraceWorkerHost | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const runId = useRef(0)
  const readyRef = useRef(false)
  const recordRef = useRef(project)
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULTS,
    ...project.document.settings,
  })
  const [source, setSource] = useState<(PixelBuffer & { name: string }) | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null)
  const [svgUrl, setSvgUrl] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [palette, setPalette] = useState<Array<[number, number, number]>>([])
  const [workingSize, setWorkingSize] = useState({ width: 0, height: 0 })
  const [status, setStatus] = useState('Waiting for an image')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const previewsRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<Viewport>(FIT_VIEW)
  const [panning, setPanning] = useState(false)
  const [visible, setVisible] = useState<PreviewVisibility>({
    original: true,
    restored: true,
    vector: true,
  })
  const [chromaRemove, setChromaRemove] = useState<Rgb[]>(
    project.document.chromaRemove ?? [],
  )
  const [chromaRetain, setChromaRetain] = useState<Rgb[]>(
    project.document.chromaRetain ?? [],
  )
  const [chromaPicked, setChromaPicked] = useState<Rgb[]>([])
  const [chromaTolerance, setChromaTolerance] = useState(
    project.document.chromaTolerance ?? 24,
  )
  const [customChroma, setCustomChroma] = useState('#00ff00')
  const chromaRules = [
    ...chromaRemove.map((color) => ({ color, mode: 'remove' as const })),
    ...chromaRetain.map((color) => ({ color, mode: 'retain' as const })),
  ]

  const zoomAround = useCallback(
    (nextZoomRaw: number, anchor: { x: number; y: number }) => {
      setView((prev) => {
        const zoom = clampZoom(nextZoomRaw)
        if (zoom === prev.zoom) return prev
        // Keeps the pixel under the cursor pinned while the scale changes.
        const ratio = zoom / prev.zoom
        return {
          zoom,
          pan: {
            x: anchor.x - ratio * (anchor.x - prev.pan.x),
            y: anchor.y - ratio * (anchor.y - prev.pan.y),
          },
        }
      })
    },
    [],
  )

  // React attaches wheel handlers passively, so the zoom gesture needs its own
  // listener to keep the page from scrolling underneath it. The container only
  // exists once an image is loaded, so this re-runs when that swap happens.
  useEffect(() => {
    const previews = previewsRef.current
    if (!previews) return

    const onWheel = (event: WheelEvent) => {
      const frame = (event.target as HTMLElement | null)?.closest(
        '.cel-preview-frame',
      )
      if (!frame) return
      event.preventDefault()
      const bounds = frame.getBoundingClientRect()
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? bounds.height
            : 1
      setView((prev) => {
        const zoom = clampZoom(
          prev.zoom * Math.exp(-event.deltaY * unit * ZOOM_SENSITIVITY),
        )
        if (zoom === prev.zoom) return prev
        const anchor = {
          x: event.clientX - bounds.left - bounds.width / 2,
          y: event.clientY - bounds.top - bounds.height / 2,
        }
        const ratio = zoom / prev.zoom
        return {
          zoom,
          pan: {
            x: anchor.x - ratio * (anchor.x - prev.pan.x),
            y: anchor.y - ratio * (anchor.y - prev.pan.y),
          },
        }
      })
    }

    previews.addEventListener('wheel', onWheel, { passive: false })
    return () => previews.removeEventListener('wheel', onWheel)
  }, [source])

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault()
    let last = { x: event.clientX, y: event.clientY }
    setPanning(true)

    const move = (moveEvent: PointerEvent) => {
      const delta = {
        x: moveEvent.clientX - last.x,
        y: moveEvent.clientY - last.y,
      }
      last = { x: moveEvent.clientX, y: moveEvent.clientY }
      setView((prev) => ({
        ...prev,
        pan: { x: prev.pan.x + delta.x, y: prev.pan.y + delta.y },
      }))
    }
    const stop = () => {
      setPanning(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  useEffect(() => {
    tracer.current = new TraceWorkerHost()
    return () => tracer.current?.dispose()
  }, [])

  useEffect(() => {
    recordRef.current = project
  }, [project])

  useEffect(() => {
    const asset = project.document.sourceAsset
    if (!asset) {
      readyRef.current = true
      return
    }
    let cancelled = false
    void getProjectAsset(project.id, asset)
      .then(async (blob) => {
        if (!blob || cancelled) return
        const type = blob.type.startsWith('image/') ? blob.type : 'image/png'
        const file = new File(
          [blob],
          `${project.document.sourceName || 'cel'}.png`,
          { type },
        )
        const decoded = await decodeRasterFile(file)
        if (cancelled) return
        setSource(decoded)
        setOriginalUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(file)
        })
        readyRef.current = true
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setStatus('Could not reload the stored still')
        readyRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [project.document.sourceAsset, project.document.sourceName, project.id])

  useEffect(() => {
    if (!readyRef.current) return
    const handle = window.setTimeout(() => {
      const current = recordRef.current
      void saveProject({
        ...current,
        document: {
          ...current.document,
          name: source?.name || current.document.name,
          width: source?.width ?? current.document.width,
          height: source?.height ?? current.document.height,
          sourceAsset: source ? SOURCE_ASSET : current.document.sourceAsset,
          sourceName: source?.name ?? current.document.sourceName,
          settings,
          chromaRemove,
          chromaRetain,
          chromaTolerance,
        },
      }).then((next) => {
        recordRef.current = next
      })
    }, 400)
    return () => window.clearTimeout(handle)
  }, [
    chromaRemove,
    chromaRetain,
    chromaTolerance,
    settings,
    source,
  ])

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl)
    }
  }, [originalUrl])

  useEffect(() => {
    if (!source) return

    const id = ++runId.current
    setBusy(true)
    setError(null)
    setStatus('Restoring flats…')
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const restored = restorePixels(source, {
            colorCount: settings.colorCount,
            maxEdge: settings.maxEdge,
            denoise: settings.denoise,
            inkThreshold: settings.inkEnabled ? settings.inkThreshold : null,
            ignoreNearWhite: settings.ignoreNearWhite,
            chromaRules,
            chromaTolerance,
          })
          if (id !== runId.current) return
          const nextCleaned = pixelBufferToObjectUrl(
            restored.data,
            restored.width,
            restored.height,
          )
          setCleanedUrl(nextCleaned)
          setPalette(restored.palette)
          setWorkingSize({ width: restored.width, height: restored.height })
          setStatus('Tracing vectors…')
          const nextSvg = await tracer.current?.run(restored, {
            speckle: settings.speckle,
            cornerThreshold: settings.cornerThreshold,
          })
          if (id !== runId.current || !nextSvg) return
          const nextSvgUrl = URL.createObjectURL(
            new Blob([nextSvg], { type: 'image/svg+xml;charset=utf-8' }),
          )
          setSvg(nextSvg)
          setSvgUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return nextSvgUrl
          })
          setStatus(
            `${restored.width}×${restored.height} · ${restored.outputPalette.length} colors`,
          )
        } catch (caught) {
          if (id !== runId.current) return
          setError(caught instanceof Error ? caught.message : String(caught))
          setStatus('Could not convert this image')
        } finally {
          if (id === runId.current) setBusy(false)
        }
      })()
    }, 280)

    return () => window.clearTimeout(timer)
  }, [
    source,
    settings.colorCount,
    settings.cornerThreshold,
    settings.denoise,
    settings.ignoreNearWhite,
    settings.inkEnabled,
    settings.inkThreshold,
    settings.maxEdge,
    settings.speckle,
    chromaRemove,
    chromaRetain,
    chromaTolerance,
  ])

  const openFile = async (file: File | undefined) => {
    if (!file) return
    try {
      setError(null)
      setStatus('Reading image…')
      const decoded = await decodeRasterFile(file)
      await putProjectAsset(project.id, SOURCE_ASSET, file)
      setSource(decoded)
      setView(FIT_VIEW)
      setChromaRemove([])
      setChromaRetain([])
      setChromaPicked([])
      setOriginalUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
      readyRef.current = true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStatus('Could not read that file')
    }
  }

  const downloadSvg = () => {
    if (!svg || !source) return
    downloadBlob(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `${source.name || 'cel'}.svg`,
    )
  }

  const hasColor = (list: Rgb[], color: Rgb) =>
    list.some((item) => colorKey(item) === colorKey(color))

  const togglePicked = (color: Rgb) => {
    setChromaPicked((current) =>
      hasColor(current, color)
        ? current.filter((item) => colorKey(item) !== colorKey(color))
        : [...current, color],
    )
  }

  const addToList = (
    setter: (update: (current: Rgb[]) => Rgb[]) => void,
    colors: Rgb[],
  ) => {
    setter((current) => {
      const next = [...current]
      for (const color of colors) {
        if (!hasColor(next, color)) next.push(color)
      }
      return next
    })
  }

  const dropFromList = (
    setter: (update: (current: Rgb[]) => Rgb[]) => void,
    color: Rgb,
  ) => {
    setter((current) =>
      current.filter((item) => colorKey(item) !== colorKey(color)),
    )
  }

  const applyPicked = (mode: ChromaMode) => {
    if (chromaPicked.length === 0) return
    addToList(mode === 'remove' ? setChromaRemove : setChromaRetain, chromaPicked)
    setChromaPicked([])
  }

  const addCustomChroma = (mode: ChromaMode) => {
    const color: Rgb = [
      Number.parseInt(customChroma.slice(1, 3), 16),
      Number.parseInt(customChroma.slice(3, 5), 16),
      Number.parseInt(customChroma.slice(5, 7), 16),
    ]
    addToList(mode === 'remove' ? setChromaRemove : setChromaRetain, [color])
  }

  const downloadPng = async () => {
    if (!svg || !source || workingSize.width < 1) return
    setExporting(true)
    try {
      const blob = await svgToPngBlob(
        svg,
        workingSize.width,
        workingSize.height,
        settings.exportScale,
      )
      downloadBlob(blob, `${source.name || 'cel'}@${settings.exportScale}x.png`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="studio-shell cel-shell">
      <header className="studio-topbar">
        <button
          type="button"
          className="studio-back"
          onClick={() => navigate({ page: 'cel-home' })}
        >
          <ArrowLeft size={14} />
          Cel
        </button>
        <div className="studio-brand">
          <div className="brand-mark cel-brand-mark">C</div>
          <div>
            <strong>Cel</strong>
            <span>Cartoon restore + vector</span>
          </div>
        </div>
        <div className="cel-top-actions">
          <Button onClick={() => inputRef.current?.click()}>Replace image</Button>
          <Button variant="primary" disabled={!svg || busy} onClick={downloadSvg}>
            <Download size={14} />
            SVG
          </Button>
          <Button disabled={!svg || busy || exporting} onClick={() => void downloadPng()}>
            PNG {settings.exportScale}×
          </Button>
        </div>
      </header>

      <input
        ref={inputRef}
        className="cel-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        onChange={(event) => {
          void openFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      {!source ? (
        <main className="cel-empty">
          <p className="studio-kicker">Anime / cartoon stills</p>
          <h1>Restore flats, then trace</h1>
          <p className="studio-lede">
            Best on cel-shaded anime and cartoons: limited palettes, hard
            outlines, JPEG mush. Gradients and photos turn into bands. Source
            stills stay on this machine.
          </p>
          <button
            type="button"
            className="cel-drop"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void openFile(event.dataTransfer.files[0])
            }}
          >
            <ImagePlus size={22} />
            <strong>Drop a PNG, JPEG, or WebP</strong>
            <span>Or click to choose a file</span>
          </button>
        </main>
      ) : (
        <div className="cel-layout">
          <section className="cel-stage">
            <div className="cel-stage-bar">
              <p className="cel-status" role="status">
                {busy ? 'Working… ' : ''}
                {status}
                {error ? ` — ${error}` : ''}
              </p>
              <div className="cel-zoom">
                <IconButton
                  icon={Minus}
                  label="Zoom out"
                  onClick={() => zoomAround(view.zoom / 1.25, { x: 0, y: 0 })}
                />
                <span>{Math.round(view.zoom * 100)}%</span>
                <IconButton
                  icon={Plus}
                  label="Zoom in"
                  onClick={() => zoomAround(view.zoom * 1.25, { x: 0, y: 0 })}
                />
                <IconButton
                  icon={Maximize}
                  label="Reset view"
                  onClick={() => setView(FIT_VIEW)}
                />
              </div>
            </div>
            <div className="cel-previews" ref={previewsRef}>
              {visible.original && (
                <PreviewFrame
                  label="Original"
                  src={originalUrl}
                  view={view}
                  panning={panning}
                  onPanStart={beginPan}
                  raster
                />
              )}
              {visible.restored && (
                <PreviewFrame
                  label="Restored"
                  src={cleanedUrl}
                  view={view}
                  panning={panning}
                  onPanStart={beginPan}
                  raster
                />
              )}
              {visible.vector && (
                <PreviewFrame
                  label="Vector"
                  src={svgUrl}
                  view={view}
                  panning={panning}
                  onPanStart={beginPan}
                />
              )}
              {!visible.original && !visible.restored && !visible.vector && (
                <div className="cel-no-previews">
                  Enable a preview from the View section.
                </div>
              )}
            </div>
          </section>
          <aside className="inspector cel-inspector">
            <CollapsibleSection title="View">
              {(
                [
                  ['original', 'Original'],
                  ['restored', 'Restored'],
                  ['vector', 'Vector'],
                ] as const
              ).map(([id, label]) => (
                <label className="cel-check" key={id}>
                  <input
                    type="checkbox"
                    checked={visible[id]}
                    onChange={(event) =>
                      setVisible((current) => ({
                        ...current,
                        [id]: event.target.checked,
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="Restore">
              <PropertyRow label="Colors">
                <SliderField
                  label="Color count"
                  value={settings.colorCount}
                  min={2}
                  max={32}
                  step={1}
                  display={String(settings.colorCount)}
                  onValue={(colorCount) =>
                    setSettings((prev) => ({ ...prev, colorCount }))
                  }
                />
              </PropertyRow>
              <PropertyRow label="Size">
                <SliderField
                  label="Max edge"
                  value={settings.maxEdge}
                  min={256}
                  max={1600}
                  step={64}
                  display={`${settings.maxEdge}px`}
                  onValue={(maxEdge) => setSettings((prev) => ({ ...prev, maxEdge }))}
                />
              </PropertyRow>
              <label className="cel-check">
                <input
                  type="checkbox"
                  checked={settings.denoise}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, denoise: event.target.checked }))
                  }
                />
                Median denoise
              </label>
              <label className="cel-check">
                <input
                  type="checkbox"
                  checked={settings.ignoreNearWhite}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      ignoreNearWhite: event.target.checked,
                    }))
                  }
                />
                Ignore near-white
              </label>
              <label className="cel-check">
                <input
                  type="checkbox"
                  checked={settings.inkEnabled}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      inkEnabled: event.target.checked,
                    }))
                  }
                />
                Dedicated ink
              </label>
              {settings.inkEnabled && (
                <PropertyRow label="Ink">
                  <SliderField
                    label="Ink threshold"
                    value={settings.inkThreshold ?? 32}
                    min={8}
                    max={80}
                    step={1}
                    display={String(settings.inkThreshold ?? 32)}
                    onValue={(inkThreshold) =>
                      setSettings((prev) => ({ ...prev, inkThreshold }))
                    }
                  />
                </PropertyRow>
              )}
            </CollapsibleSection>
            <CollapsibleSection title="Chroma">
              <PropertyRow label="Range">
                <SliderField
                  label="Chroma tolerance"
                  value={chromaTolerance}
                  min={0}
                  max={80}
                  step={1}
                  display={String(chromaTolerance)}
                  onValue={setChromaTolerance}
                />
              </PropertyRow>
              <p className="cel-chroma-help">
                Select colors, then add them to Remove and Keep independently.
                Both lists run together: Keep limits what stays, Remove punches
                holes even inside that set.
              </p>
              {palette.length > 0 && (
                <div className="cel-palette" aria-label="Detected colors">
                  {palette.map((color) => {
                    const picked = hasColor(chromaPicked, color)
                    const removing = hasColor(chromaRemove, color)
                    const keeping = hasColor(chromaRetain, color)
                    return (
                      <button
                        type="button"
                        key={colorKey(color)}
                        className={[
                          picked ? 'is-picked' : '',
                          removing ? 'is-remove' : '',
                          keeping ? 'is-retain' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ background: `rgb(${colorKey(color)})` }}
                        title={`rgb(${colorKey(color)})${removing ? ' · remove' : ''}${keeping ? ' · keep' : ''}`}
                        aria-label={`Select rgb(${colorKey(color)})`}
                        aria-pressed={picked}
                        onClick={() => togglePicked(color)}
                      />
                    )
                  })}
                </div>
              )}
              <div className="cel-chroma-add">
                <Button
                  disabled={chromaPicked.length === 0}
                  onClick={() => applyPicked('remove')}
                >
                  Remove
                </Button>
                <Button
                  disabled={chromaPicked.length === 0}
                  onClick={() => applyPicked('retain')}
                >
                  Keep
                </Button>
                <input
                  type="color"
                  aria-label="Custom chroma color"
                  value={customChroma}
                  onChange={(event) => setCustomChroma(event.target.value)}
                />
                <Button onClick={() => addCustomChroma('remove')}>Remove custom</Button>
                <Button onClick={() => addCustomChroma('retain')}>Keep custom</Button>
                <Button
                  disabled={chromaRules.length === 0}
                  onClick={() => {
                    setChromaRemove([])
                    setChromaRetain([])
                    setChromaPicked([])
                  }}
                >
                  Clear
                </Button>
              </div>
              {chromaRemove.length > 0 && (
                <div className="cel-chroma-bucket">
                  <p>Remove</p>
                  <div className="cel-chroma-chips">
                    {chromaRemove.map((color) => (
                      <button
                        type="button"
                        key={`remove-${colorKey(color)}`}
                        className="is-remove"
                        style={{ background: `rgb(${colorKey(color)})` }}
                        aria-label={`Drop remove for rgb(${colorKey(color)})`}
                        title={`Drop remove rgb(${colorKey(color)})`}
                        onClick={() => dropFromList(setChromaRemove, color)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {chromaRetain.length > 0 && (
                <div className="cel-chroma-bucket">
                  <p>Keep</p>
                  <div className="cel-chroma-chips">
                    {chromaRetain.map((color) => (
                      <button
                        type="button"
                        key={`retain-${colorKey(color)}`}
                        className="is-retain"
                        style={{ background: `rgb(${colorKey(color)})` }}
                        aria-label={`Drop keep for rgb(${colorKey(color)})`}
                        title={`Drop keep rgb(${colorKey(color)})`}
                        onClick={() => dropFromList(setChromaRetain, color)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>
            <CollapsibleSection title="Trace">
              <PropertyRow label="Speckle">
                <SliderField
                  label="Speckle"
                  value={settings.speckle}
                  min={0}
                  max={32}
                  step={1}
                  display={String(settings.speckle)}
                  onValue={(speckle) => setSettings((prev) => ({ ...prev, speckle }))}
                />
              </PropertyRow>
              <PropertyRow label="Corners">
                <SliderField
                  label="Corner threshold"
                  value={settings.cornerThreshold}
                  min={20}
                  max={120}
                  step={1}
                  display={`${settings.cornerThreshold}°`}
                  onValue={(cornerThreshold) =>
                    setSettings((prev) => ({ ...prev, cornerThreshold }))
                  }
                />
              </PropertyRow>
            </CollapsibleSection>
            <CollapsibleSection title="Export">
              <PropertyRow label="PNG">
                <Select
                  aria-label="PNG export scale"
                  value={String(settings.exportScale)}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      exportScale: Number(event.target.value),
                    }))
                  }
                >
                  <option value="1">1× from vector</option>
                  <option value="2">2× from vector</option>
                  <option value="4">4× from vector</option>
                  <option value="8">8× from vector</option>
                </Select>
              </PropertyRow>
            </CollapsibleSection>
          </aside>
        </div>
      )}
    </div>
  )
}

function PreviewFrame({
  label,
  src,
  view,
  panning,
  onPanStart,
  raster = false,
}: {
  label: string
  src: string | null
  view: Viewport
  panning: boolean
  onPanStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  raster?: boolean
}) {
  return (
    <figure className={`cel-preview${raster ? ' is-raster' : ''}`}>
      <figcaption>{label}</figcaption>
      <div
        className={`cel-preview-frame${panning ? ' is-panning' : ''}`}
        onPointerDown={onPanStart}
      >
        {src ? (
          <img
            alt=""
            src={src}
            draggable={false}
            style={{
              transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
            }}
          />
        ) : (
          <span>…</span>
        )}
      </div>
    </figure>
  )
}
