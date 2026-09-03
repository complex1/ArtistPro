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
  Paintbrush,
  Package,
  Pencil,
  Plus,
  RectangleHorizontal,
  Trash2,
  Type,
  Ungroup,
} from 'lucide-react'
import type { LayerDropPosition } from '../model/scene'
import type { EditorNode } from '../model/types'
import { canGroup, canUngroup, useEditorStore } from '../store/editorStore'
import { Button } from '../ui/controls'
import { NewSymbolModal } from './NewSymbolModal'

type DropHint = { targetId: string | null; position: LayerDropPosition }

export function LayersPanel() {
  const document = useEditorStore((state) => state.document)
  const editingSymbolId = useEditorStore((state) => state.editingSymbolId)
  const editingSymbol =
    document.version === 2
      ? document.symbols.find((symbol) => symbol.id === editingSymbolId)
      : undefined
  const nodes = (editingSymbol?.children ?? document.children) as EditorNode[]
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const select = useEditorStore((state) => state.select)
  const updateNode = useEditorStore((state) => state.updateNode)
  const removeNode = useEditorStore((state) => state.removeNode)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const groupSelected = useEditorStore((state) => state.groupSelected)
  const ungroupSelected = useEditorStore((state) => state.ungroupSelected)
  const createSymbolFromSelection = useEditorStore(
    (state) => state.createSymbolFromSelection,
  )
  const createBlankSymbol = useEditorStore((state) => state.createBlankSymbol)
  const addSymbolInstance = useEditorStore((state) => state.addSymbolInstance)
  const enterSymbol = useEditorStore((state) => state.enterSymbol)
  const removeUnusedSymbol = useEditorStore((state) => state.removeUnusedSymbol)
  const [newSymbolOpen, setNewSymbolOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const grouping = canGroup(nodes, selectedIds)
  const ungrouping = canUngroup(nodes, selectedIds)
  const symbols = document.version === 2 ? document.symbols : []
  const symbolUsage = new Map<string, number>()
  const countInstances = (items: EditorNode[]) => {
    for (const item of items) {
      if (item.type === 'symbol') {
        symbolUsage.set(item.symbolId, (symbolUsage.get(item.symbolId) ?? 0) + 1)
      } else if (item.type === 'group') {
        countInstances(item.children)
      }
    }
  }
  countInstances(document.children)

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
        <div className="panel-tabs"><span className="is-active">Symbols</span></div>
        <div className="symbols-actions">
          <Button
            disabled={Boolean(editingSymbolId) || selectedIds.length === 0}
            onClick={() => createSymbolFromSelection()}
          >
            <Package size={13} /> From selection
          </Button>
          <Button
            disabled={Boolean(editingSymbolId)}
            onClick={() => setNewSymbolOpen(true)}
          >
            <Plus size={13} /> New
          </Button>
        </div>
        <div className="symbols-list">
          {symbols.length === 0 ? (
            <p>No symbols yet. Create one from selected artwork or start blank.</p>
          ) : (
            symbols.map((symbol) => {
              const uses = symbolUsage.get(symbol.id) ?? 0
              return (
                <div
                  key={symbol.id}
                  className={`symbol-library-row${editingSymbolId === symbol.id ? ' is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="symbol-library-main"
                    disabled={Boolean(editingSymbolId)}
                    onClick={() => addSymbolInstance(symbol.id)}
                    title="Add instance to scene"
                  >
                    <Package size={15} />
                    <span>
                      <strong>{symbol.name}</strong>
                      <small>{symbol.width} × {symbol.height} · {uses} {uses === 1 ? 'instance' : 'instances'}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="layer-row-action"
                    disabled={Boolean(editingSymbolId)}
                    onClick={() => enterSymbol(symbol.id)}
                    title="Edit symbol"
                    aria-label={`Edit ${symbol.name}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="layer-row-action"
                    disabled={uses > 0}
                    onClick={() => removeUnusedSymbol(symbol.id)}
                    title={uses > 0 ? 'Remove all instances first' : 'Delete symbol'}
                    aria-label={`Delete ${symbol.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </section>
      {newSymbolOpen && (
        <NewSymbolModal
          onCreate={({ name, width, height, duration }) => {
            const symbolId = createBlankSymbol(name, width, height, duration)
            if (symbolId) enterSymbol(symbolId)
          }}
          onClose={() => setNewSymbolOpen(false)}
        />
      )}
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
          : node.type === 'brush'
            ? Paintbrush
            : node.type === 'text'
              ? Type
              : node.type === 'image'
                ? ImageIcon
                : node.type === 'symbol'
                  ? Package
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
