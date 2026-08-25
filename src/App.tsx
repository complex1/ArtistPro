import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import { Canvas, type CanvasHandle } from './components/Canvas'
import { Header } from './components/Header'
import { Inspector } from './components/Inspector'
import { LayersPanel } from './components/LayersPanel'
import { PencilToolConfig } from './components/PencilToolConfig'
import { BrushToolConfig } from './components/BrushToolConfig'
import { PlaybackClock } from './components/PlaybackClock'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'
import { findNode, useEditorStore } from './store/editorStore'

const HEADER_HEIGHT = 44
const MIN_BOTTOM_HEIGHT = 88
const MIN_CANVAS_HEIGHT = 160
const DEFAULT_BOTTOM_HEIGHT = 170
const ANIMATE_BOTTOM_HEIGHT = 240

function clampBottomHeight(height: number, minHeight = MIN_BOTTOM_HEIGHT) {
  const max = Math.max(
    minHeight,
    window.innerHeight - HEADER_HEIGHT - MIN_CANVAS_HEIGHT,
  )
  return Math.round(Math.min(max, Math.max(minHeight, height)))
}

function App() {
  const canvasRef = useRef<CanvasHandle>(null)
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT)
  const groupSelected = useEditorStore((state) => state.groupSelected)
  const ungroupSelected = useEditorStore((state) => state.ungroupSelected)
  const removeSelected = useEditorStore((state) => state.removeSelected)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const tool = useEditorStore((state) => state.tool)
  const mode = useEditorStore((state) => state.mode)
  const playing = useEditorStore((state) => state.playing)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const armProperty = useEditorStore((state) => state.armProperty)
  const minPanel = mode === 'animate' ? ANIMATE_BOTTOM_HEIGHT : MIN_BOTTOM_HEIGHT

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return
      }
      const combo = event.metaKey || event.ctrlKey
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
      if (
        event.key === ' ' &&
        (mode === 'animate' || mode === 'preview') &&
        !combo
      ) {
        event.preventDefault()
        setPlaying(!playing)
      }
      if (event.key === 'Home' && (mode === 'animate' || mode === 'preview')) {
        event.preventDefault()
        setPlayhead(0, true)
      }
      if (event.key.toLowerCase() === 'k' && mode === 'animate' && !combo) {
        const state = useEditorStore.getState()
        const id = state.selectedIds[0]
        if (!id || state.selectedIds.length !== 1) return
        if (!findNode(state.document.children, id)) return
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
    groupSelected,
    mode,
    playing,
    removeSelected,
    setPlayhead,
    setPlaying,
    ungroupSelected,
  ])

  const exportSvg = () => {
    const source = canvasRef.current?.exportSvg()
    if (!source) return
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'untitled.svg'
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
        // Viewport-fixed canvas overlays ride above the panel as it resizes.
        '--bottom-panel-height': `${panelHeight}px`,
      } as CSSProperties}
    >
      <PlaybackClock />
      <Header onExport={exportSvg} />
      <div className={`editor-body${preview ? ' is-preview' : ''}`}>
        {!preview && <Toolbar />}
        <Canvas ref={canvasRef} />
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

export default App
