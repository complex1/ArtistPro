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
import { Toolbar } from './components/Toolbar'
import { useEditorStore } from './store/editorStore'

const HEADER_HEIGHT = 44
const MIN_BOTTOM_HEIGHT = 88
const MIN_CANVAS_HEIGHT = 160
const DEFAULT_BOTTOM_HEIGHT = 170

function clampBottomHeight(height: number) {
  const max = Math.max(
    MIN_BOTTOM_HEIGHT,
    window.innerHeight - HEADER_HEIGHT - MIN_CANVAS_HEIGHT,
  )
  return Math.round(Math.min(max, Math.max(MIN_BOTTOM_HEIGHT, height)))
}

function App() {
  const canvasRef = useRef<CanvasHandle>(null)
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT)
  const groupSelected = useEditorStore((state) => state.groupSelected)
  const ungroupSelected = useEditorStore((state) => state.ungroupSelected)
  const removeSelected = useEditorStore((state) => state.removeSelected)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const tool = useEditorStore((state) => state.tool)

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
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duplicateSelected, groupSelected, removeSelected, ungroupSelected])

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
    const onResize = () => setBottomHeight((height) => clampBottomHeight(height))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
        clampBottomHeight(origin.height - (moveEvent.clientY - origin.y)),
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

  return (
    <div
      className="app-shell"
      style={{
        gridTemplateRows: `${HEADER_HEIGHT}px minmax(0, 1fr) ${bottomHeight}px`,
        // Viewport-fixed canvas overlays ride above the panel as it resizes.
        '--bottom-panel-height': `${bottomHeight}px`,
      } as CSSProperties}
    >
      <Header onExport={exportSvg} />
      <div className="editor-body">
        <Toolbar />
        <Canvas ref={canvasRef} />
        <Inspector />
      </div>
      <div className="bottom-slot">
        <div
          className="bottom-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize bottom panel"
          aria-valuemin={MIN_BOTTOM_HEIGHT}
          aria-valuenow={bottomHeight}
          tabIndex={0}
          onPointerDown={beginBottomResize}
          onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setBottomHeight((height) => clampBottomHeight(height + 16))
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setBottomHeight((height) => clampBottomHeight(height - 16))
            }
          }}
        />
        {tool === 'pencil' ? <PencilToolConfig /> : <LayersPanel />}
      </div>
    </div>
  )
}

export default App
