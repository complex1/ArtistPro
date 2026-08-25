import { ChevronDown, ChevronRight, Eye, EyeOff, Pause, Play, RotateCcw } from 'lucide-react'
import {
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  formatTimecode,
  nodeHasTracks,
  propertyLabel,
  tracksForNode,
} from '../model/animation'
import { walkNodes } from '../model/scene'
import type { DocumentAnimation, EditorNode, Keyframe } from '../model/types'
import { useEditorStore } from '../store/editorStore'
import { Button, IconButton } from '../ui/controls'
import { ScrubField } from '../ui/fields'

function layersWithMotion(
  nodes: EditorNode[],
  selectedIds: string[],
  animation: DocumentAnimation,
) {
  const rows: EditorNode[] = []
  walkNodes(nodes, (node) => {
    rows.push(node)
  })
  const selected = new Set(selectedIds)
  const keyed = rows.filter((node) => nodeHasTracks(animation, node.id))
  const extras = rows.filter(
    (node) => selected.has(node.id) && !keyed.some((item) => item.id === node.id),
  )
  return [...keyed, ...extras]
}

export function Timeline() {
  const nodes = useEditorStore((state) => state.document.children)
  const animation = useEditorStore((state) => state.document.animation)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const playhead = useEditorStore((state) => state.playhead)
  const playing = useEditorStore((state) => state.playing)
  const looping = useEditorStore((state) => state.looping)
  const selectedKeyIds = useEditorStore((state) => state.selectedKeyIds)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setLooping = useEditorStore((state) => state.setLooping)
  const setDuration = useEditorStore((state) => state.setDuration)
  const select = useEditorStore((state) => state.select)
  const selectKeys = useEditorStore((state) => state.selectKeys)
  const retimeKey = useEditorStore((state) => state.retimeKey)
  const updateNode = useEditorStore((state) => state.updateNode)
  const [collapsedIds, setCollapsedIds] = useState<string[]>([])
  const rows = layersWithMotion(nodes, selectedIds, animation)
  const duration = Math.max(animation.duration, 0.1)
  const collapsed = new Set(collapsedIds)

  const toggleCollapsed = (id: string) =>
    setCollapsedIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    )

  const timeFromEvent = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left) / Math.max(1, bounds.width)
    return Math.min(duration, Math.max(0, ratio * duration))
  }

  return (
    <section className="timeline-panel" aria-label="Animation timeline">
      <div className="timeline-transport">
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? 'Pause' : 'Play'}
          onClick={() => setPlaying(!playing)}
        />
        <IconButton
          icon={RotateCcw}
          label="Jump to start"
          onClick={() => setPlayhead(0, true)}
        />
        <span className="timeline-time">
          {formatTimecode(playhead)} / {formatTimecode(duration)}
        </span>
        <Button
          aria-pressed={looping}
          onClick={() => setLooping(!looping)}
        >
          {looping ? 'Loop on' : 'Loop off'}
        </Button>
        <ScrubField
          label="SEC"
          value={duration}
          min={0.1}
          max={60}
          step={0.1}
          onValue={setDuration}
        />
      </div>
      <div className="timeline-body">
        <div className="timeline-labels">
          <div className="timeline-ruler-spacer">Layer</div>
          {rows.length === 0 && (
            <p className="timeline-empty">
              Select a layer and click the diamond next to Position, Rotation,
              Scale, or Opacity.
            </p>
          )}
          {rows.map((node) => {
            const tracks = tracksForNode(animation, node.id)
            const folded = collapsed.has(node.id)
            return (
              <div
                key={node.id}
                className={`timeline-layer${folded ? ' is-collapsed' : ''}`}
              >
                <div className="timeline-layer-head">
                  <button
                    type="button"
                    className="timeline-fold"
                    aria-expanded={!folded}
                    aria-label={`${folded ? 'Expand' : 'Collapse'} ${node.name}`}
                    onClick={() => toggleCollapsed(node.id)}
                  >
                    {folded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <button
                    type="button"
                    className="timeline-vis"
                    aria-label={`${node.visible ? 'Hide' : 'Show'} ${node.name}`}
                    aria-pressed={node.visible}
                    onClick={() => updateNode(node.id, { visible: !node.visible })}
                  >
                    {node.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    type="button"
                    className={`timeline-layer-name${selectedIds.includes(node.id) ? ' is-selected' : ''}`}
                    onClick={() => select(node.id)}
                    onDoubleClick={() => toggleCollapsed(node.id)}
                  >
                    {node.name}
                  </button>
                </div>
                {!folded && tracks.map((track) => (
                  <div key={track.property} className="timeline-prop-label">
                    {propertyLabel(track.property)}
                  </div>
                ))}
                {!folded && tracks.length === 0 && (
                  <div className="timeline-prop-label is-muted">No keys</div>
                )}
              </div>
            )
          })}
        </div>
        <div className="timeline-sheet">
          <div
            className="timeline-playhead is-full"
            style={{ left: `${(playhead / duration) * 100}%` }}
          />
          <div
            className="timeline-ruler"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setPlayhead(timeFromEvent(event), true)
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) return
              setPlayhead(timeFromEvent(event), true)
            }}
          >
            {Array.from({ length: Math.floor(duration) + 1 }, (_, second) => (
              <span
                key={second}
                className="timeline-tick"
                style={{ left: `${(second / duration) * 100}%` }}
              >
                {second}s
              </span>
            ))}
            <div
              className="timeline-playhead"
              style={{ left: `${(playhead / duration) * 100}%` }}
            />
          </div>
          {rows.map((node) => {
            const tracks = tracksForNode(animation, node.id)
            const folded = collapsed.has(node.id)
            const summaryKeys = tracks.flatMap((track) => track.keys)
            return (
              <div key={node.id} className="timeline-layer-keys">
                <div
                  className="timeline-key-row"
                  onPointerDown={(event) => {
                    setPlayhead(timeFromEvent(event), true)
                    selectKeys([])
                    select(node.id)
                  }}
                >
                  {folded &&
                    summaryKeys.map((key) => (
                      <KeyframeDiamond
                        key={key.id}
                        keyframe={key}
                        duration={duration}
                        selected={selectedKeyIds.includes(key.id)}
                        onSelect={(additive) => selectKeys([key.id], additive)}
                        onRetime={retimeKey}
                        onSeek={(time) => setPlayhead(time, true)}
                      />
                    ))}
                </div>
                {!folded &&
                  (tracks.length === 0 ? [null] : tracks).map((track) => (
                    <div
                      key={track?.property ?? 'empty'}
                      className="timeline-key-row"
                      onPointerDown={(event) => {
                        if ((event.target as HTMLElement).dataset.key) return
                        setPlayhead(timeFromEvent(event), true)
                        selectKeys([])
                      }}
                    >
                      {track?.keys.map((key) => (
                        <KeyframeDiamond
                          key={key.id}
                          keyframe={key}
                          duration={duration}
                          selected={selectedKeyIds.includes(key.id)}
                          onSelect={(additive) => selectKeys([key.id], additive)}
                          onRetime={retimeKey}
                          onSeek={(time) => setPlayhead(time, true)}
                        />
                      ))}
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function KeyframeDiamond({
  keyframe,
  duration,
  selected,
  onSelect,
  onRetime,
  onSeek,
}: {
  keyframe: Keyframe
  duration: number
  selected: boolean
  onSelect: (additive: boolean) => void
  onRetime: (id: string, time: number) => void
  onSeek: (time: number) => void
}) {
  return (
    <button
      type="button"
      data-key={keyframe.id}
      className={`timeline-diamond${selected ? ' is-selected' : ''}`}
      style={{ left: `${(keyframe.time / duration) * 100}%` }}
      aria-label={`Keyframe at ${formatTimecode(keyframe.time)}`}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        onSelect(event.shiftKey)
        onSeek(keyframe.time)
        const row = event.currentTarget.parentElement
        if (!row) return
        const move = (moveEvent: PointerEvent) => {
          const bounds = row.getBoundingClientRect()
          const ratio = (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width)
          onRetime(keyframe.id, ratio * duration)
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
    />
  )
}
