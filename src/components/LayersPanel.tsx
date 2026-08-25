import { useRef, useState, type DragEvent } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Folder,
  GripVertical,
  Group,
  Image as ImageIcon,
  PenLine,
  Pencil,
  RectangleHorizontal,
  Trash2,
  Type,
  Ungroup,
} from 'lucide-react'
import type { LayerDropPosition } from '../model/scene'
import type { EditorNode } from '../model/types'
import { canGroup, canUngroup, useEditorStore } from '../store/editorStore'
import { Button } from '../ui/controls'

type DropHint = { targetId: string | null; position: LayerDropPosition }

export function LayersPanel() {
  const nodes = useEditorStore((state) => state.document.children)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const select = useEditorStore((state) => state.select)
  const updateNode = useEditorStore((state) => state.updateNode)
  const removeNode = useEditorStore((state) => state.removeNode)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const groupSelected = useEditorStore((state) => state.groupSelected)
  const ungroupSelected = useEditorStore((state) => state.ungroupSelected)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const grouping = canGroup(nodes, selectedIds)
  const ungrouping = canUngroup(nodes, selectedIds)

  const drop = (targetId: string | null, position: LayerDropPosition) => {
    if (draggingId) moveLayer(draggingId, targetId, position)
    setDraggingId(null)
    setDropHint(null)
  }

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <footer className="bottom-panel">
      <section className="layers-panel">
        <div className="panel-tabs"><span className="is-active">Layers</span></div>
        <div className="panel-actions">
          <Button disabled={!grouping} onClick={groupSelected}>
            <Group size={13} /> Group
          </Button>
          <Button disabled={!ungrouping} onClick={ungroupSelected}>
            <Ungroup size={13} /> Ungroup
          </Button>
          <Button onClick={duplicateSelected}><Copy size={13} /> Duplicate</Button>
        </div>
        <div
          className={`layer-list${dropHint?.targetId === null ? ' is-root-drop' : ''}`}
          onDragOver={(event) => {
            if (!draggingId || event.target !== event.currentTarget) return
            event.preventDefault()
            setDropHint({ targetId: null, position: 'inside' })
          }}
          onDrop={(event) => {
            if (event.target !== event.currentTarget) return
            event.preventDefault()
            drop(null, 'inside')
          }}
        >
          {[...nodes].reverse().map((node) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              selectedIds={selectedIds}
              onSelect={select}
              onUpdate={updateNode}
              onRemove={removeNode}
              draggingId={draggingId}
              dropHint={dropHint}
              collapsedIds={collapsedIds}
              onToggleCollapsed={toggleCollapsed}
              onDragStart={setDraggingId}
              onDragEnd={() => {
                setDraggingId(null)
                setDropHint(null)
              }}
              onDragOver={setDropHint}
              onDrop={drop}
            />
          ))}
        </div>
      </section>
      <section className="symbols-panel">
        <div className="panel-tabs"><span>Symbols</span></div>
        <button type="button" disabled className="create-symbol">＋ Create from selection</button>
        <p>Select two or more layers, then Group. Symbols come next.</p>
      </section>
    </footer>
  )
}

function LayerRow({
  node,
  depth,
  selectedIds,
  onSelect,
  onUpdate,
  onRemove,
  draggingId,
  dropHint,
  collapsedIds,
  onToggleCollapsed,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  node: EditorNode
  depth: number
  selectedIds: string[]
  onSelect: (id: string | null, additive?: boolean) => void
  onUpdate: (id: string, update: Partial<EditorNode>) => void
  onRemove: (id: string) => void
  draggingId: string | null
  dropHint: DropHint | null
  collapsedIds: Set<string>
  onToggleCollapsed: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (hint: DropHint) => void
  onDrop: (targetId: string, position: LayerDropPosition) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(node.name)
  const cancelRename = useRef(false)
  const Icon =
    node.type === 'group'
      ? Folder
      : node.type === 'rect'
        ? RectangleHorizontal
        : node.type === 'path'
          ? PenLine
          : node.type === 'pencil'
            ? Pencil
            : node.type === 'text'
              ? Type
              : node.type === 'image'
                ? ImageIcon
              : Circle

  const commitRename = () => {
    if (!cancelRename.current) {
      const name = draftName.trim()
      if (name) onUpdate(node.id, { name })
    }
    cancelRename.current = false
    setEditing(false)
  }

  const dragPosition = (event: DragEvent<HTMLDivElement>): LayerDropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientY - bounds.top) / bounds.height
    if (node.type === 'group' && fraction >= 0.25 && fraction <= 0.75) {
      return 'inside'
    }
    return fraction < 0.5 ? 'above' : 'below'
  }

  const hint =
    dropHint?.targetId === node.id ? ` is-drop-${dropHint.position}` : ''
  const collapsed = node.type === 'group' && collapsedIds.has(node.id)

  return (
    <>
      <div
        className={`layer-row${selectedIds.includes(node.id) ? ' is-selected' : ''}${draggingId === node.id ? ' is-dragging' : ''}${hint}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={(event) =>
          onSelect(node.id, event.shiftKey || event.metaKey || event.ctrlKey)
        }
        onDragOver={(event) => {
          if (!draggingId || draggingId === node.id) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          onDragOver({ targetId: node.id, position: dragPosition(event) })
        }}
        onDrop={(event) => {
          if (!draggingId || draggingId === node.id) return
          event.preventDefault()
          event.stopPropagation()
          onDrop(node.id, dragPosition(event))
        }}
      >
        <button
          type="button"
          className="layer-row-action layer-drag-handle"
          draggable
          aria-label={`Rearrange ${node.name}`}
          title="Drag to rearrange"
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation()
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', node.id)
            onDragStart(node.id)
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={12} />
        </button>
        {node.type === 'group' ? (
          <button
            type="button"
            className="layer-row-action"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.name}`}
            aria-expanded={!collapsed}
            onClick={(event) => {
              event.stopPropagation()
              onToggleCollapsed(node.id)
            }}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span className="layer-collapse-spacer" />
        )}
        <button
          type="button"
          className="layer-row-action"
          aria-label={`${node.visible ? 'Hide' : 'Show'} ${node.name}`}
          aria-pressed={node.visible}
          onClick={(event) => {
            event.stopPropagation()
            onUpdate(node.id, { visible: !node.visible })
          }}
        >
          {node.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <Icon size={13} />
        {editing ? (
          <input
            className="layer-name-input"
            aria-label="Layer name"
            value={draftName}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                cancelRename.current = true
                setDraftName(node.name)
                event.currentTarget.blur()
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="layer-name"
            title="Double-click to rename"
            onDoubleClick={(event) => {
              event.stopPropagation()
              setDraftName(node.name)
              setEditing(true)
            }}
          >
            {node.name}
          </button>
        )}
        <button
          type="button"
          className="layer-row-action layer-delete"
          aria-label={`Delete ${node.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove(node.id)
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {node.type === 'group' &&
        !collapsed &&
        [...node.children].reverse().map((child) => (
          <LayerRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onRemove={onRemove}
            draggingId={draggingId}
            dropHint={dropHint}
            collapsedIds={collapsedIds}
            onToggleCollapsed={onToggleCollapsed}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        ))}
    </>
  )
}
