import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { evaluateNodeAtTime, propertyLabel } from '../model/animation'
import {
  ANIMATION_PRESETS,
  buildPresetTracks,
  DEFAULT_PRESET_CONFIG,
  presetById,
  presetConflicts,
  type AnimationPresetConfig,
  type AnimationPresetId,
} from '../model/animationPresets'
import { createShape } from '../model/nodes'
import type { DocumentAnimation, EditorNode, KeyframeEase } from '../model/types'
import { Button, IconButton, Select } from '../ui/controls'
import { ScrubField } from '../ui/fields'

export function AnimationPresetModal({
  node,
  animation,
  startTime,
  onApply,
  onClose,
}: {
  node: EditorNode
  animation: DocumentAnimation
  startTime: number
  onApply: (
    presetId: AnimationPresetId,
    config: AnimationPresetConfig,
  ) => void
  onClose: () => void
}) {
  const [presetId, setPresetId] = useState<AnimationPresetId>('fade-in')
  const [config, setConfig] = useState(DEFAULT_PRESET_CONFIG)
  const [confirming, setConfirming] = useState(false)
  const modalRef = useRef<HTMLElement>(null)
  const conflicts = presetConflicts(animation, node.id, presetId, config)
  const preset = presetById(presetId)

  useEffect(() => {
    modalRef.current?.querySelector<HTMLButtonElement>(
      '[aria-label="Close animation presets"]',
    )?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const patchConfig = (update: Partial<AnimationPresetConfig>) => {
    setConfig((current) => ({ ...current, ...update }))
    setConfirming(false)
  }

  const apply = () => {
    if (conflicts.length > 0 && !confirming) {
      setConfirming(true)
      return
    }
    onApply(presetId, config)
    onClose()
  }

  return createPortal(
    <div
      className="preset-modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={modalRef}
        className="preset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-modal-title"
      >
        <header className="preset-modal-header">
          <div>
            <h2 id="preset-modal-title">Animation presets</h2>
            <p>Apply to {node.name} from {startTime.toFixed(2)}s</p>
          </div>
          <IconButton
            icon={X}
            label="Close animation presets"
            onClick={onClose}
          />
        </header>

        <div className="preset-modal-body">
          <nav className="preset-list" aria-label="Animation presets">
            {ANIMATION_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === presetId ? 'is-selected' : ''}
                aria-pressed={item.id === presetId}
                onClick={() => {
                  setPresetId(item.id)
                  setConfirming(false)
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </nav>

          <div className="preset-preview-column">
            <div className="preset-column-title">Preview</div>
            <PresetPreview
              key={`${presetId}-${JSON.stringify(config)}`}
              presetId={presetId}
              config={config}
            />
            <div className="preset-preview-caption">
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </div>
          </div>

          <aside className="preset-config">
            <div className="preset-column-title">Configure</div>
            <PresetControls
              presetId={presetId}
              config={config}
              onChange={patchConfig}
            />
          </aside>
        </div>

        <footer className="preset-modal-footer">
          <div className="preset-conflict">
            {confirming && (
              <>
                <strong>Replace existing animation?</strong>
                <span>
                  This preset replaces {conflicts.map(propertyLabel).join(', ')}.
                  Other tracks stay unchanged.
                </span>
              </>
            )}
          </div>
          {confirming && (
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
          )}
          <Button variant="primary" onClick={apply}>
            {confirming ? 'Replace and apply' : 'Apply preset'}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

function PresetPreview({
  presetId,
  config,
}: {
  presetId: AnimationPresetId
  config: AnimationPresetConfig
}) {
  const [time, setTime] = useState(0)
  const proxy = useMemo(() => {
    const node = createShape('rect')
    node.transform.position = { x: 0, y: 0 }
    node.transform.pivot = { x: 45, y: 45 }
    if (node.type === 'rect') {
      node.width = 90
      node.height = 90
    }
    return node
  }, [])
  const animation = useMemo<DocumentAnimation>(
    () => ({
      duration: Math.max(0.1, config.duration),
      tracks: buildPresetTracks(proxy, presetId, config, 0),
    }),
    [config, presetId, proxy],
  )

  useEffect(() => {
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const duration = Math.max(0.1, config.duration)
      setTime(((now - started) / 1000) % (duration + 0.35))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [config, presetId])

  const evaluated = evaluateNodeAtTime(
    proxy,
    animation,
    Math.min(time, animation.duration),
  )
  const transform = evaluated.transform
  const progress = Math.min(1, time / animation.duration)

  return (
    <div className="preset-preview-stage">
      <div className="preset-preview-grid" />
      <div
        className="preset-preview-object"
        style={{
          opacity: transform.opacity,
          transform: `translate(${transform.position.x * 0.55}px, ${transform.position.y * 0.55}px) rotate(${transform.rotation}deg) scale(${transform.scale.x}, ${transform.scale.y})`,
        }}
      >
        <span>V</span>
      </div>
      <div className="preset-preview-progress">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}

function PresetControls({
  presetId,
  config,
  onChange,
}: {
  presetId: AnimationPresetId
  config: AnimationPresetConfig
  onChange: (update: Partial<AnimationPresetConfig>) => void
}) {
  return (
    <div className="preset-controls">
      <PresetField label="Duration">
        <ScrubField
          label="SEC"
          value={config.duration}
          min={0.1}
          max={10}
          step={0.1}
          precision={2}
          onValue={(duration) => onChange({ duration })}
        />
      </PresetField>
      <PresetField label="Easing">
        <Select
          aria-label="Preset easing"
          value={config.easing}
          onChange={(event) =>
            onChange({ easing: event.target.value as KeyframeEase })
          }
        >
          <option value="power2.inOut">Ease in/out</option>
          <option value="linear">Linear</option>
        </Select>
      </PresetField>

      {presetId === 'slide-in' && (
        <>
          <PresetField label="Direction">
            <Select
              aria-label="Slide direction"
              value={config.slideDirection}
              onChange={(event) =>
                onChange({
                  slideDirection:
                    event.target.value as AnimationPresetConfig['slideDirection'],
                })
              }
            >
              <option value="left">From left</option>
              <option value="right">From right</option>
              <option value="up">From top</option>
              <option value="down">From bottom</option>
            </Select>
          </PresetField>
          <PresetNumber
            label="Distance"
            fieldLabel="PX"
            value={config.distance}
            min={0}
            max={800}
            onValue={(distance) => onChange({ distance })}
          />
        </>
      )}

      {presetId === 'scale-in' && (
        <PresetNumber
          label="Start scale"
          fieldLabel="SCALE"
          value={config.startScale}
          min={0}
          max={2}
          step={0.05}
          onValue={(startScale) => onChange({ startScale })}
        />
      )}

      {presetId === 'spin' && (
        <>
          <PresetField label="Direction">
            <Select
              aria-label="Spin direction"
              value={config.spinDirection}
              onChange={(event) =>
                onChange({
                  spinDirection:
                    event.target.value as AnimationPresetConfig['spinDirection'],
                })
              }
            >
              <option value="clockwise">Clockwise</option>
              <option value="counterclockwise">Counterclockwise</option>
            </Select>
          </PresetField>
          <PresetNumber
            label="Turns"
            fieldLabel="TURNS"
            value={config.turns}
            min={0.25}
            max={10}
            step={0.25}
            onValue={(turns) => onChange({ turns })}
          />
        </>
      )}

      {presetId === 'bounce' && (
        <>
          <PresetNumber
            label="Height"
            fieldLabel="PX"
            value={config.bounceHeight}
            min={0}
            max={500}
            onValue={(bounceHeight) => onChange({ bounceHeight })}
          />
          <PresetNumber
            label="Bounces"
            fieldLabel="COUNT"
            value={config.bounceCount}
            min={1}
            max={8}
            step={1}
            onValue={(bounceCount) => onChange({ bounceCount })}
          />
        </>
      )}

      {presetId === 'pulse' && (
        <>
          <PresetNumber
            label="Scale"
            fieldLabel="SCALE"
            value={config.pulseScale}
            min={0.1}
            max={3}
            step={0.05}
            onValue={(pulseScale) => onChange({ pulseScale })}
          />
          <PresetNumber
            label="Pulses"
            fieldLabel="COUNT"
            value={config.pulseCount}
            min={1}
            max={8}
            step={1}
            onValue={(pulseCount) => onChange({ pulseCount })}
          />
        </>
      )}
    </div>
  )
}

function PresetField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="preset-field">
      <span>{label}</span>
      {children}
    </div>
  )
}

function PresetNumber({
  label,
  fieldLabel,
  value,
  min,
  max,
  step = 1,
  onValue,
}: {
  label: string
  fieldLabel: string
  value: number
  min: number
  max: number
  step?: number
  onValue: (value: number) => void
}) {
  return (
    <PresetField label={label}>
      <ScrubField
        label={fieldLabel}
        value={value}
        min={min}
        max={max}
        step={step}
        precision={2}
        onValue={onValue}
      />
    </PresetField>
  )
}
