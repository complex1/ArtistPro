import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { PivotPreset } from '../model/types'

const clamp = (value: number, min?: number, max?: number) =>
  Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, value))

const round = (value: number, precision: number) =>
  Number.parseFloat(value.toFixed(precision))

export function PropertyRow({
  label,
  children,
  action,
}: {
  label: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="property-row">
      <span className="property-label">{label}</span>
      <div className="property-controls">{children}</div>
      {action}
    </div>
  )
}

export function TextField({
  label,
  value,
  onValue,
}: {
  label: string
  value: string
  onValue: (value: string) => void
}) {
  return (
    <input
      className="scrub-input text-input"
      type="text"
      aria-label={label}
      value={value}
      onChange={(event) => onValue(event.target.value)}
    />
  )
}

export function ScrubField({
  label,
  value,
  onValue,
  step = 1,
  min,
  max,
  precision = 2,
  disabled = false,
}: {
  label: string
  value: number
  onValue: (value: number) => void
  step?: number
  min?: number
  max?: number
  precision?: number
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const beginScrub = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled) return
    event.preventDefault()
    const origin = { x: event.clientX, value }
    setDragging(true)
    document.body.classList.add('is-scrubbing')

    const move = (moveEvent: PointerEvent) => {
      // Shift accelerates, Alt refines — the usual motion-tool modifiers.
      const factor = moveEvent.shiftKey ? 10 : moveEvent.altKey ? 0.1 : 1
      const next = origin.value + (moveEvent.clientX - origin.x) * step * factor
      onValue(round(clamp(next, min, max), precision))
    }
    const stop = () => {
      setDragging(false)
      document.body.classList.remove('is-scrubbing')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <label className={`scrub-field${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}>
      <span className="scrub-handle" onPointerDown={beginScrub}>
        {label}
      </span>
      <input
        className="scrub-input"
        type="number"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        value={draft ?? round(value, precision)}
        onChange={(event) => {
          setDraft(event.target.value)
          const parsed = Number(event.target.value)
          if (Number.isFinite(parsed)) onValue(clamp(parsed, min, max))
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

export function AngleDial({
  value,
  onValue,
}: {
  value: number
  onValue: (value: number) => void
}) {
  const dialRef = useRef<HTMLDivElement>(null)

  const angleFrom = (event: PointerEvent | ReactPointerEvent<HTMLDivElement>) => {
    const rect = dialRef.current?.getBoundingClientRect()
    if (!rect) return value
    const degrees =
      (Math.atan2(
        event.clientY - (rect.top + rect.height / 2),
        event.clientX - (rect.left + rect.width / 2),
      ) *
        180) /
        Math.PI +
      90
    const normalized = ((Math.round(degrees) % 360) + 360) % 360
    return event.shiftKey ? Math.round(normalized / 15) * 15 : normalized
  }

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    onValue(angleFrom(event))
    const move = (moveEvent: PointerEvent) => onValue(angleFrom(moveEvent))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <div
      ref={dialRef}
      className="angle-dial"
      role="slider"
      tabIndex={0}
      aria-label="Rotation"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(value)}
      onPointerDown={beginDrag}
      onKeyDown={(event) => {
        const nudge = event.shiftKey ? 15 : 1
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onValue(value - nudge)
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onValue(value + nudge)
      }}
    >
      <span className="angle-needle" style={{ transform: `rotate(${value}deg)` }} />
    </div>
  )
}

export function SliderField({
  label,
  value,
  onValue,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  disabled = false,
}: {
  label: string
  value: number
  onValue: (value: number) => void
  min?: number
  max?: number
  step?: number
  display: string
  disabled?: boolean
}) {
  return (
    <div className={`slider-field${disabled ? ' is-disabled' : ''}`}>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onValue(Number(event.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
      <output>{display}</output>
    </div>
  )
}

const anchors: { preset: Exclude<PivotPreset, 'custom'>; label: string }[] = [
  { preset: 'top-left', label: 'Top left' },
  { preset: 'top-center', label: 'Top center' },
  { preset: 'top-right', label: 'Top right' },
  { preset: 'middle-left', label: 'Middle left' },
  { preset: 'center', label: 'Center' },
  { preset: 'middle-right', label: 'Middle right' },
  { preset: 'bottom-left', label: 'Bottom left' },
  { preset: 'bottom-center', label: 'Bottom center' },
  { preset: 'bottom-right', label: 'Bottom right' },
]

export function PivotPicker({
  value,
  onPick,
}: {
  value: PivotPreset
  onPick: (preset: Exclude<PivotPreset, 'custom'>) => void
}) {
  return (
    <div className="pivot-picker" role="group" aria-label="Pivot presets">
      {anchors.map((anchor) => {
        const active = value === anchor.preset
        return (
          <button
            type="button"
            key={anchor.label}
            className={`pivot-cell${active ? ' is-active' : ''}`}
            aria-label={anchor.label}
            aria-pressed={active}
            onClick={() => onPick(anchor.preset)}
          />
        )
      })}
    </div>
  )
}

export function ColorField({
  label,
  value,
  onValue,
  disabled = false,
}: {
  label: string
  value: string
  onValue: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className={`color-field${disabled ? ' is-disabled' : ''}`}>
      <label className="color-swatch" style={{ background: value }}>
        <input
          type="color"
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onValue(event.target.value)}
        />
      </label>
      <input
        className="scrub-input hex-input"
        aria-label={`${label} hex`}
        value={value.toUpperCase()}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value
          if (/^#[0-9a-f]{0,6}$/i.test(next)) onValue(next)
        }}
      />
    </div>
  )
}
