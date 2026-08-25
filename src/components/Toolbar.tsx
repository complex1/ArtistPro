import { useRef } from 'react'
import {
  Circle,
  Hand,
  Image as ImageIcon,
  MousePointer2,
  Pencil,
  PenTool,
  RectangleHorizontal,
  Spline,
  Type,
} from 'lucide-react'
import { createImageNode } from '../model/image'
import { useEditorStore } from '../store/editorStore'
import type { Tool } from '../model/types'
import { IconButton } from '../ui/controls'

const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'node', label: 'Edit path points', icon: Spline },
  { id: 'pan', label: 'Pan', icon: Hand },
  { id: 'rect', label: 'Rectangle', icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'pen', label: 'Pen', icon: PenTool },
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'image', label: 'Image', icon: ImageIcon },
]

export function Toolbar() {
  const imageInput = useRef<HTMLInputElement>(null)
  const mode = useEditorStore((state) => state.mode)
  const artboard = useEditorStore((state) => state.document.artboard)
  const tool = useEditorStore((state) => state.tool)
  const setTool = useEditorStore((state) => state.setTool)
  const addShape = useEditorStore((state) => state.addShape)
  const addNode = useEditorStore((state) => state.addNode)

  if (mode !== 'draw') {
    return (
      <aside className="toolbar" aria-label={`${mode} tools`}>
        <div className="toolbar-empty">{mode.slice(0, 1).toUpperCase()}</div>
      </aside>
    )
  }

  return (
    <aside className="toolbar" aria-label="Drawing tools">
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            addNode(await createImageNode(file, artboard))
            setTool('select')
          } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Could not add image.')
            setTool('select')
          }
        }}
      />
      {tools.map(({ id, label, icon }) => (
        <IconButton
          key={id}
          icon={icon}
          label={label}
          active={tool === id}
          onClick={() => {
            if (id === 'image') {
              imageInput.current?.click()
              return
            }
            setTool(id)
            if (id === 'rect' || id === 'ellipse') addShape(id)
          }}
        />
      ))}
    </aside>
  )
}
