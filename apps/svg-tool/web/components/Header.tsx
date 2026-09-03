import { useRef } from 'react'
import { ArrowLeft, Download, FileUp, Redo2, Save, Undo2 } from 'lucide-react'
import { navigate } from '../app/routes'
import { importSvgText } from '../model/svgImport'
import { useEditorStore } from '../store/editorStore'
import type { EditorMode } from '../model/types'
import { Button, Select } from '../ui/controls'

const modes: { id: EditorMode; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'animate', label: 'Animate' },
  { id: 'preview', label: 'Preview' },
]

export function Header({
  onExport,
  onSave,
}: {
  onExport: () => void
  onSave: () => void
}) {
  const svgInput = useRef<HTMLInputElement>(null)
  const document = useEditorStore((state) => state.document)
  const mode = useEditorStore((state) => state.mode)
  const setMode = useEditorStore((state) => state.setMode)
  const setArtboardSize = useEditorStore((state) => state.setArtboardSize)
  const addNodes = useEditorStore((state) => state.addNodes)
  const canUndo = useEditorStore((state) => state.canUndo)
  const canRedo = useEditorStore((state) => state.canRedo)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const editingSymbolId = useEditorStore((state) => state.editingSymbolId)
  const exitSymbol = useEditorStore((state) => state.exitSymbol)
  const editingSymbol =
    document.version === 2
      ? document.symbols.find((symbol) => symbol.id === editingSymbolId)
      : undefined

  const sizeValue = `${document.artboard.width}x${document.artboard.height}`

  return (
    <header className="app-header">
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
          onClick={() => navigate({ page: 'svg-home' })}
        >
          SVG
        </button>
        <b>/</b>
        {editingSymbol ? (
          <button
            type="button"
            className="symbol-breadcrumb"
            onClick={exitSymbol}
            title="Back to scene"
          >
            <ArrowLeft size={13} />
            <span>{document.name}</span>
            <b>/</b>
            <strong>{editingSymbol.name}</strong>
          </button>
        ) : (
          <strong>{document.name}</strong>
        )}
      </div>

      <nav className="mode-switcher" aria-label="Workspace mode">
        {modes.map((item) => (
          <button
            type="button"
            key={item.id}
            className={mode === item.id ? 'is-active' : ''}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="canvas-size">
        <span>Canvas</span>
        <Select
          aria-label="Canvas size"
          value={sizeValue}
          disabled={Boolean(editingSymbol) || mode === 'preview'}
          onChange={(event) => {
            const [width, height] = event.target.value.split('x').map(Number)
            setArtboardSize(width, height)
          }}
        >
          <option value="800x600">800 × 600</option>
          <option value="1280x720">1280 × 720</option>
          <option value="1080x1080">1080 × 1080</option>
          <option value="1920x1080">1920 × 1080</option>
        </Select>
      </div>

      <div className="header-actions">
        <Button
          aria-label="Undo"
          title="Undo (⌘Z)"
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 size={14} /> Undo
        </Button>
        <Button
          aria-label="Redo"
          title="Redo (⇧⌘Z)"
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 size={14} /> Redo
        </Button>
        <input
          ref={svgInput}
          type="file"
          accept="image/svg+xml,.svg"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            try {
              addNodes(importSvgText(await file.text()))
            } catch (error) {
              window.alert(
                error instanceof Error ? error.message : 'Could not import SVG.',
              )
            }
          }}
        />
        <Button onClick={onSave}><Save size={14} /> Save</Button>
        <Button onClick={() => svgInput.current?.click()}>
          <FileUp size={14} /> Import SVG
        </Button>
        <Button onClick={onExport}><Download size={14} /> Export</Button>
      </div>
    </header>
  )
}
