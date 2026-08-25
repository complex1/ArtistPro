import { useRef } from 'react'
import { Download, FileUp, Save } from 'lucide-react'
import { importSvgText } from '../model/svgImport'
import { useEditorStore } from '../store/editorStore'
import type { EditorMode } from '../model/types'
import { Button, Select } from '../ui/controls'

const modes: { id: EditorMode; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'animate', label: 'Animate' },
  { id: 'preview', label: 'Preview' },
  { id: 'export', label: 'Export' },
]

export function Header({ onExport }: { onExport: () => void }) {
  const svgInput = useRef<HTMLInputElement>(null)
  const document = useEditorStore((state) => state.document)
  const mode = useEditorStore((state) => state.mode)
  const looping = useEditorStore((state) => state.looping)
  const setMode = useEditorStore((state) => state.setMode)
  const setLooping = useEditorStore((state) => state.setLooping)
  const setArtboardSize = useEditorStore((state) => state.setArtboardSize)
  const addNodes = useEditorStore((state) => state.addNodes)

  const sizeValue = `${document.artboard.width}x${document.artboard.height}`

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">V</div>
        <span>{document.name}</span>
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
        {mode === 'preview' && (
          <Button
            aria-pressed={looping}
            onClick={() => setLooping(!looping)}
          >
            {looping ? 'Loop on' : 'Loop off'}
          </Button>
        )}
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
        <Button><Save size={14} /> Save</Button>
        <Button onClick={() => svgInput.current?.click()}>
          <FileUp size={14} /> Import SVG
        </Button>
        <Button onClick={onExport}><Download size={14} /> Export</Button>
      </div>
    </header>
  )
}
