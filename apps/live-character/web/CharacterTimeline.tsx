import { useRef } from 'react'
import {
  Bone,
  CircleDot,
  Diamond,
  Grid2X2,
  Layers,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react'
import type { CharacterDocument, Easing } from './model'
import { type DocumentChange, type Selection } from './editorTypes'

export function CharacterTimeline({
  document: doc,
  frame,
  playing,
  onFrame,
  onPlaying,
  selection,
  onSelect,
  meshEditing,
  onSelectMesh,
  onChange,
  onCheckpoint,
  onAddKey,
  selectedKey,
  onSelectKey,
}: {
  document: CharacterDocument
  frame: number
  playing: boolean
  onFrame: (frame: number) => void
  onPlaying: (playing: boolean) => void
  selection: Selection
  onSelect: (selection: Selection) => void
  meshEditing: boolean
  onSelectMesh: (layerId: string) => void
  onChange: DocumentChange
  onCheckpoint: () => void
  onAddKey: () => void
  selectedKey: string | null
  onSelectKey: (id: string | null) => void
}) {
  const drag = useRef<{
    id: string
    document: CharacterDocument
    left: number
    width: number
  } | null>(null)
  const tracks = [
    ...doc.controllers
      .filter((item) => item.kind === 'ik')
      .map((item) => ({ type: 'controller' as const, ...item })),
    ...doc.bones.map((item) => ({ type: 'bone' as const, ...item })),
    ...doc.layers.flatMap((item) => [
      { type: 'layer' as const, id: item.id, name: `${item.name} transform` },
      ...(item.mesh
        ? [{ type: 'mesh' as const, id: item.id, name: `${item.name} mesh` }]
        : []),
    ]),
  ]
  const key = doc.keyframes.find((item) => item.id === selectedKey)
  const tickStep = Math.max(1, Math.ceil(doc.duration / 12))
  const ticks = Array.from(
    { length: Math.floor(doc.duration / tickStep) + 1 },
    (_, index) => index * tickStep,
  )
  const width = Math.max(620, doc.duration * 7)
  const seek = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onPlaying(false)
    onFrame(
      Math.round(
        Math.max(
          0,
          Math.min(
            doc.duration,
            ((event.clientX - rect.left) / rect.width) * doc.duration,
          ),
        ),
      ),
    )
  }
  return (
    <section className="lc-timeline" aria-label="Animation timeline">
      <div className="lc-timeline-toolbar">
        <div className="lc-timeline-title">
          <span>Timeline</span>
          <span className="lc-tag">Main animation</span>
        </div>
        <div className="lc-playback">
          <button
            title="First frame"
            aria-label="First frame"
            onClick={() => {
              onPlaying(false)
              onFrame(0)
            }}
          >
            <SkipBack size={14} />
          </button>
          <button
            className="lc-play-button"
            title={playing ? 'Pause' : 'Play animation'}
            aria-label={playing ? 'Pause' : 'Play animation'}
            onClick={() => onPlaying(!playing)}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            title="Last frame"
            aria-label="Last frame"
            onClick={() => {
              onPlaying(false)
              onFrame(doc.duration)
            }}
          >
            <SkipForward size={14} />
          </button>
          <span className="lc-timecode">
            {(frame / doc.fps).toFixed(2)}s{' '}
            <small>/ {(doc.duration / doc.fps).toFixed(2)}s</small>
          </span>
        </div>
        <div className="lc-timeline-actions">
          <span className="lc-auto-key">
            <i />
            Auto key
          </span>
          <button
            className="lc-button"
            disabled={!selection}
            onClick={onAddKey}
          >
            <Plus size={12} />
            <Diamond size={12} />
            Key
          </button>
          <select
            aria-label="Keyframe easing"
            value={key?.easing ?? 'ease-in-out'}
            disabled={!key}
            onChange={(event) =>
              onChange({
                ...doc,
                keyframes: doc.keyframes.map((item) =>
                  item.id === key?.id
                    ? { ...item, easing: event.target.value as Easing }
                    : item,
                ),
              })
            }
          >
            <option value="linear">Linear</option>
            <option value="ease-in">Ease in</option>
            <option value="ease-out">Ease out</option>
            <option value="ease-in-out">Ease in & out</option>
            <option value="step">Hold</option>
          </select>
          <button
            title="Delete keyframe"
            aria-label="Delete keyframe"
            disabled={!key}
            onClick={() => {
              onChange({
                ...doc,
                keyframes: doc.keyframes.filter(
                  (item) => item.id !== selectedKey,
                ),
              })
              onSelectKey(null)
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="lc-timeline-scroll">
        <div style={{ minWidth: width + 222 }}>
          <div className="lc-track-row lc-ruler-row">
            <div className="lc-track-label">
              <span>Tracks</span>
              <span>{doc.keyframes.length} keys</span>
            </div>
            <div
              className="lc-ruler"
              style={{ width }}
              onPointerDown={(event) => {
                seek(event)
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) seek(event)
              }}
            >
              {ticks.map((tick) => (
                <span
                  key={tick}
                  style={{ left: `${(tick / doc.duration) * 100}%` }}
                >
                  {tick}
                </span>
              ))}
              <div
                className="lc-playhead-head"
                style={{ left: `${(frame / doc.duration) * 100}%` }}
              >
                {Math.round(frame)}
              </div>
            </div>
          </div>
          {tracks.map((track) => {
            const Icon =
              track.type === 'bone'
                ? Bone
                : track.type === 'controller'
                  ? CircleDot
                  : track.type === 'mesh'
                    ? Grid2X2
                    : Layers
            const keys = doc.keyframes.filter(
              (key) =>
                key.targetType === track.type && key.targetId === track.id,
            )
            const selectTrack = () => {
              if (track.type === 'mesh') onSelectMesh(track.id)
              else onSelect({ type: track.type, id: track.id })
            }
            const selected =
              selection?.id === track.id &&
              (track.type === 'mesh'
                ? selection.type === 'layer' && meshEditing
                : selection.type === track.type &&
                  (track.type !== 'layer' || !meshEditing))
            return (
              <div
                className={`lc-track-row ${selected ? 'is-selected' : ''}`}
                key={`${track.type}-${track.id}`}
              >
                <button className="lc-track-label" onClick={selectTrack}>
                  <Icon size={12} />
                  <span>{track.name}</span>
                  <span>{keys.length || '—'}</span>
                </button>
                <div
                  className="lc-track"
                  style={{
                    width,
                    backgroundSize: `${(tickStep / doc.duration) * 100}% 100%`,
                  }}
                  onPointerDown={(event) => {
                    seek(event)
                    selectTrack()
                    onSelectKey(null)
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons === 1 && !drag.current) seek(event)
                  }}
                >
                  <div
                    className="lc-playhead-line"
                    style={{ left: `${(frame / doc.duration) * 100}%` }}
                  />
                  {keys.map((key) => (
                    <button
                      key={key.id}
                      className={`lc-key ${key.id === selectedKey ? 'is-selected' : ''}`}
                      style={{ left: `${(key.frame / doc.duration) * 100}%` }}
                      aria-label={`${track.name} keyframe ${key.frame}`}
                      title={`Frame ${key.frame} · ${key.easing}. Drag to move.`}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        event.preventDefault()
                        onPlaying(false)
                        selectTrack()
                        onSelectKey(key.id)
                        onFrame(key.frame)
                        onCheckpoint()
                        const rect =
                          event.currentTarget.parentElement!.getBoundingClientRect()
                        drag.current = {
                          id: key.id,
                          document: doc,
                          left: rect.left,
                          width: rect.width,
                        }
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }}
                      onPointerMove={(event) => {
                        const current = drag.current
                        if (!current) return
                        event.stopPropagation()
                        const frame = Math.max(
                          0,
                          Math.min(
                            doc.duration,
                            Math.round(
                              ((event.clientX - current.left) / current.width) *
                                doc.duration,
                            ),
                          ),
                        )
                        onFrame(frame)
                        onChange(
                          {
                            ...current.document,
                            keyframes: current.document.keyframes
                              .filter(
                                (item) =>
                                  item.id === key.id ||
                                  item.targetType !== key.targetType ||
                                  item.targetId !== key.targetId ||
                                  item.frame !== frame,
                              )
                              .map((item) =>
                                item.id === key.id ? { ...item, frame } : item,
                              ),
                          },
                          false,
                        )
                      }}
                      onPointerUp={(event) => {
                        event.stopPropagation()
                        drag.current = null
                        if (
                          event.currentTarget.hasPointerCapture(event.pointerId)
                        )
                          event.currentTarget.releasePointerCapture(
                            event.pointerId,
                          )
                      }}
                      onPointerCancel={() => {
                        if (drag.current) onChange(drag.current.document, false)
                        drag.current = null
                      }}
                    >
                      <Diamond size={10} fill="currentColor" />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {!tracks.length && (
            <p className="lc-timeline-empty">
              Add artwork or a bone to create your first animation track.
            </p>
          )}
        </div>
      </div>
      <footer className="lc-timeline-footer">
        <span>
          Drag controls to pose · Drag diamonds to retime · Space to play
        </span>
        <label>
          FPS{' '}
          <input
            aria-label="Frames per second"
            type="number"
            min={1}
            max={60}
            value={doc.fps}
            onChange={(event) => {
              const fps = Math.round(event.currentTarget.valueAsNumber)
              if (fps >= 1 && fps <= 60) onChange({ ...doc, fps })
            }}
          />
        </label>
        <label>
          End frame{' '}
          <input
            aria-label="End frame"
            type="number"
            min={Math.max(1, ...doc.keyframes.map((key) => key.frame))}
            max={3600}
            value={doc.duration}
            onChange={(event) => {
              const duration = Math.round(event.currentTarget.valueAsNumber)
              if (
                duration >=
                  Math.max(1, ...doc.keyframes.map((key) => key.frame)) &&
                duration <= 3600
              ) {
                onChange({ ...doc, duration })
                onFrame(Math.min(frame, duration))
              }
            }}
          />
        </label>
      </footer>
    </section>
  )
}
