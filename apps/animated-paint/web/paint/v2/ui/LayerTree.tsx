import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react'
import { ChevronDown, ChevronRight, Folder, GripVertical } from 'lucide-react'
import type { LayerV2 } from '../core/types'
import { layerEntries, type LayerDrop } from '../core/layerOrder'

export function LayerTree({ layers, selected, renderLayer, onSelectGroup, onMove }: {
  layers: LayerV2[]
  selected: ReadonlySet<string>
  renderLayer: (layer: LayerV2) => ReactNode
  onSelectGroup: (ids: string[]) => void
  onMove: (source: string, drop: LayerDrop) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [drop, setDrop] = useState<LayerDrop | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ key: string; x: number; y: number; startX: number; startY: number; active: boolean } | null>(null)
  const target = useRef<LayerDrop | null>(null)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  const entries = layerEntries(layers)
  const folderNumbers = new Map(entries.filter(entry => entry.groupId).map((entry, i) => [entry.key, i + 1]))

  const locate = (x: number, y: number) => {
    const row = window.document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layer-drop]')
    if (!row || !root.current?.contains(row)) { target.current = null; setDrop(null); return }
    const bounds = row.getBoundingClientRect()
    const fraction = (y - bounds.top) / bounds.height
    const edge = row.dataset.folder && fraction > 0.25 && fraction < 0.75 ? 'inside' : fraction < 0.5 ? 'before' : 'after'
    const next: LayerDrop = { key: row.dataset.layerDrop!, edge }
    target.current = next
    setDrop(current => current?.key === next.key && current.edge === next.edge ? current : next)
  }
  const scroll = () => {
    const current = gesture.current, list = root.current
    if (!current?.active || !list) return
    const bounds = list.getBoundingClientRect()
    if (current.x >= bounds.left && current.x <= bounds.right) {
      if (current.y < bounds.top + 40) list.scrollTop -= 10
      else if (current.y > bounds.bottom - 40) list.scrollTop += 10
    }
    locate(current.x, current.y)
    raf.current = requestAnimationFrame(scroll)
  }
  const begin = (event: PointerEvent<HTMLButtonElement>, key: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { key, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, active: false }
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current) return
    current.x = event.clientX; current.y = event.clientY
    if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) >= 5) {
      current.active = true; setDragging(current.key); raf.current = requestAnimationFrame(scroll)
    }
    if (current.active) locate(current.x, current.y)
  }
  const finish = (cancelled: boolean) => {
    cancelAnimationFrame(raf.current)
    const current = gesture.current
    if (!cancelled && current?.active && target.current) {
      onMove(current.key, target.current)
      setAnnouncement('Layer order updated')
    }
    gesture.current = null; target.current = null; setDragging(null); setDrop(null)
  }
  const handle = (key: string, name: string) => <button type="button" className="paint-layer-grip" aria-label={`Drag ${name}`} title="Drag to reorder. Arrow keys move up or down."
    onPointerDown={event => begin(event, key)} onPointerMove={move} onPointerUp={() => finish(false)} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
    onKeyDown={event => {
      if (event.key === 'Escape') { finish(true); return }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      event.preventDefault()
      const group = entries.find(entry => entry.key === key || entry.layers.some(layer => layer.id === key))
      const siblings = group?.groupId && group.key !== key ? group.layers.map(layer => layer.id) : entries.map(entry => entry.key)
      const index = siblings.indexOf(key), delta = event.key === 'ArrowUp' ? -1 : 1
      const neighbor = siblings[index + delta]
      if (neighbor) { onMove(key, { key: neighbor, edge: delta < 0 ? 'before' : 'after' }); setAnnouncement(`${name} moved ${delta < 0 ? 'up' : 'down'}`) }
    }}><GripVertical size={18} /></button>
  const dropClass = (key: string) => `${drop?.key === key ? ` is-drop-${drop.edge}` : ''}${dragging === key ? ' is-dragging' : ''}`
  const layerRow = (layer: LayerV2) => <div key={layer.id} data-layer-drop={layer.id} className={`paint-tree-layer${dropClass(layer.id)}`}>
    {handle(layer.id, layer.name)}{renderLayer(layer)}
  </div>
  return <div ref={root} className="layer-list paint-layer-list paint-layer-tree" aria-label="Layers" tabIndex={0}>
    <span className="paint-sr-only" role="status">{announcement}</span>
    {entries.map((entry) => entry.groupId ? <section key={entry.key} className="paint-layer-folder">
      <div data-layer-drop={entry.key} data-folder="true" className={`paint-folder-heading${entry.layers.every(layer => selected.has(layer.id)) ? ' is-selected' : ''}${dropClass(entry.key)}`}>
        {handle(entry.key, `folder ${folderNumbers.get(entry.key)}`)}
        <button type="button" className="paint-folder-toggle" aria-label={`${collapsed.has(entry.key) ? 'Expand' : 'Collapse'} folder ${folderNumbers.get(entry.key)}`} aria-expanded={!collapsed.has(entry.key)} onClick={() => setCollapsed(current => {
          const next = new Set(current); if (next.has(entry.key)) next.delete(entry.key); else next.add(entry.key); return next
        })}>{collapsed.has(entry.key) ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</button>
        <button type="button" className="paint-folder-select" aria-pressed={entry.layers.every(layer => selected.has(layer.id))} onClick={() => onSelectGroup(entry.layers.map(layer => layer.id))}>
          <Folder size={18} /><span>Folder {folderNumbers.get(entry.key)}<small>{entry.layers.length} layers</small></span>
        </button>
      </div>
      {!collapsed.has(entry.key) && <div className="paint-folder-children">{entry.layers.map(layerRow)}</div>}
    </section> : layerRow(entry.layers[0]))}
  </div>
}
