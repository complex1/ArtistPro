import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { getConfig, setConfig } from '@artist-studio/idb-config'
import { clamp } from '@artist-studio/utils'
import { navigate } from './app/routes'
import { Canvas, type CanvasHandle } from './components/Canvas'
import { Header } from './components/Header'
import { Inspector } from './components/Inspector'
import { LayersPanel } from './components/LayersPanel'
import { PencilToolConfig } from './components/PencilToolConfig'
import { BrushToolConfig } from './components/BrushToolConfig'
import { PlaybackClock } from './components/PlaybackClock'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'
import {
  getProject,
  saveProject,
  type ProjectRecord,
} from './projects/library'
import { activeChildren, findNode, useEditorStore } from './store/editorStore'
import { renderDocumentSvg } from './render/svgFrame'

const HEADER_HEIGHT = 44
const MIN_BOTTOM_HEIGHT = 88
const MIN_CANVAS_HEIGHT = 160
const DEFAULT_BOTTOM_HEIGHT = 170
const ANIMATE_BOTTOM_HEIGHT = 240
const PreviewStudio = lazy(() =>
  import('./components/PreviewStudio').then((module) => ({
    default: module.PreviewStudio,
  })),
)

function clampBottomHeight(height: number, minHeight = MIN_BOTTOM_HEIGHT) {
  const max = Math.max(
    minHeight,
    window.innerHeight - HEADER_HEIGHT - MIN_CANVAS_HEIGHT,
  )
  return Math.round(clamp(height, minHeight, max))
}

async function persistProject(projectId: string): Promise<void> {
  const existing = await getProject(projectId)
  if (!existing) return
  await saveProject({
    ...existing,
    document: useEditorStore.getState().document,
  })
}

export function SvgEditor({ projectId }: { projectId: string }) {
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
  if (!project) return <MissingProject />
  return <LoadedEditor key={project.id} project={project} />
}

function MissingProject() {
  useEffect(() => {
    navigate({ page: 'svg-home' })
  }, [])
  return <div className="studio-loading">Opening project…</div>
}

function LoadedEditor({ project }: { project: ProjectRecord }) {
  const canvasRef = useRef<CanvasHandle>(null)
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT)
  useState(() => {
    useEditorStore.getState().loadDocument(project.document)
    return project.id
  })
  const groupSelected = useEditorStore((state) => state.groupSelected)
  const ungroupSelected = useEditorStore((state) => state.ungroupSelected)
  const removeSelected = useEditorStore((state) => state.removeSelected)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const tool = useEditorStore((state) => state.tool)
  const mode = useEditorStore((state) => state.mode)
  const playing = useEditorStore((state) => state.playing)
  const scene = useEditorStore((state) => state.document)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const armProperty = useEditorStore((state) => state.armProperty)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const exitSymbol = useEditorStore((state) => state.exitSymbol)
  const minPanel = mode === 'animate' ? ANIMATE_BOTTOM_HEIGHT : MIN_BOTTOM_HEIGHT
  const projectId = project.id

  useEffect(() => {
    void getConfig<number>('svg.bottomHeight').then((value) => {
      if (typeof value === 'number') {
        setBottomHeight(clampBottomHeight(value, minPanel))
      }
    })
  }, [minPanel])

  useEffect(() => {
    void setConfig('svg.bottomHeight', bottomHeight)
  }, [bottomHeight])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void persistProject(projectId)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [scene, projectId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return
      }
      if (event.key === 'Escape' && useEditorStore.getState().editingSymbolId) {
        event.preventDefault()
        exitSymbol()
        return
      }
      const combo = event.metaKey || event.ctrlKey
      if (combo && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void persistProject(projectId)
        return
      }
      if (combo && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (combo && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        if (event.shiftKey) ungroupSelected()
        else groupSelected()
      }
      if (combo && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        const state = useEditorStore.getState()
        if (state.mode === 'animate' && state.selectedKeyIds.length > 0) {
          state.removeSelectedKeys()
          return
        }
        removeSelected()
      }
      if (event.key === ' ' && mode === 'animate' && !combo) {
        event.preventDefault()
        setPlaying(!playing)
      }
      if (event.key === 'Home' && mode === 'animate') {
        event.preventDefault()
        setPlayhead(0, true)
      }
      if (event.key.toLowerCase() === 'k' && mode === 'animate' && !combo) {
        const state = useEditorStore.getState()
        const id = state.selectedIds[0]
        if (!id || state.selectedIds.length !== 1) return
        if (!findNode(activeChildren(state), id)) return
        event.preventDefault()
        armProperty(id, 'position.x')
        armProperty(id, 'position.y')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    armProperty,
    duplicateSelected,
    exitSymbol,
    groupSelected,
    mode,
    playing,
    projectId,
    removeSelected,
    redo,
    setPlayhead,
    setPlaying,
    undo,
    ungroupSelected,
  ])

  const exportSvg = () => {
    const state = useEditorStore.getState()
    const source =
      canvasRef.current?.exportSvg() ??
      renderDocumentSvg(state.document, state.playhead)
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${state.document.name || 'untitled'}.svg`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const onResize = () =>
      setBottomHeight((height) => clampBottomHeight(height, minPanel))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [minPanel])

  const beginBottomResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const origin = { y: event.clientY, height: bottomHeight }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic or already-released pointers still resize via window listeners.
    }
    document.body.classList.add('is-resizing-bottom')

    const move = (moveEvent: PointerEvent) => {
      setBottomHeight(
        clampBottomHeight(
          origin.height - (moveEvent.clientY - origin.y),
          minPanel,
        ),
      )
    }
    const stop = () => {
      document.body.classList.remove('is-resizing-bottom')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const preview = mode === 'preview'
  const panelHeight = preview ? 0 : clampBottomHeight(bottomHeight, minPanel)

  return (
    <div
      className={`app-shell${preview ? ' is-preview' : ''}`}
      style={{
        gridTemplateRows: `${HEADER_HEIGHT}px minmax(0, 1fr) ${panelHeight}px`,
        '--bottom-panel-height': `${panelHeight}px`,
      } as CSSProperties}
    >
      <PlaybackClock />
      <Header
        onExport={exportSvg}
        onSave={() => {
          void persistProject(projectId)
        }}
      />
      <div className={`editor-body${preview ? ' is-preview' : ''}`}>
        {!preview && <Toolbar />}
        {preview ? (
          <Suspense
            fallback={<div className="preview-loading">Loading Render Studio…</div>}
          >
            <PreviewStudio />
          </Suspense>
        ) : (
          <Canvas ref={canvasRef} />
        )}
        {!preview && <Inspector />}
      </div>
      {!preview && (
        <div className="bottom-slot">
          <div
            className="bottom-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize bottom panel"
            aria-valuemin={minPanel}
            aria-valuenow={panelHeight}
            tabIndex={0}
            onPointerDown={beginBottomResize}
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setBottomHeight((height) =>
                  clampBottomHeight(height + 16, minPanel),
                )
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setBottomHeight((height) =>
                  clampBottomHeight(height - 16, minPanel),
                )
              }
            }}
          />
          {mode === 'animate' ? (
            <Timeline />
          ) : tool === 'brush' ? (
            <BrushToolConfig />
          ) : tool === 'pencil' ? (
            <PencilToolConfig />
          ) : (
            <LayersPanel />
          )}
        </div>
      )}
    </div>
  )
}
