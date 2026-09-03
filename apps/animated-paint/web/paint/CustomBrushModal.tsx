import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, IconButton, Select } from '../ui/controls'
import { TextField } from '../ui/fields'
import { evaluateMathExpression, validateMathExpression } from './engine/expression'
import type {
  BrushExpressions,
  BrushPreset,
  RendererId,
} from './engine/types'

const EXPRESSION_FIELDS: Array<{
  key: keyof BrushExpressions
  label: string
  placeholder: string
}> = [
  {
    key: 'x',
    label: 'X offset',
    placeholder: 'sin(time * speed + index * 0.2) * amount',
  },
  {
    key: 'y',
    label: 'Y offset',
    placeholder: 'cos(time * speed + index * 0.3) * amount',
  },
  { key: 'size', label: 'Size', placeholder: '1 + sin(time * 4) * 0.2' },
  { key: 'rotation', label: 'Rotation', placeholder: 'time + index * 0.1' },
  { key: 'opacity', label: 'Opacity', placeholder: '0.5 + sin(time * 3) * 0.5' },
  { key: 'hue', label: 'Hue shift', placeholder: 'sin(time * 2) * 180' },
  {
    key: 'saturation',
    label: 'Saturation',
    placeholder: '1 + sin(time * 2) * 0.5',
  },
  {
    key: 'lightness',
    label: 'Brightness',
    placeholder: '1 + sin(time * 3) * 0.2',
  },
  { key: 'blur', label: 'Blur', placeholder: 'abs(sin(time * 2)) * 6' },
  { key: 'glow', label: 'Glow', placeholder: '8 + sin(time * 3) * 6' },
  { key: 'shadowX', label: 'Shadow X', placeholder: 'sin(time * 2) * 8' },
  { key: 'shadowY', label: 'Shadow Y', placeholder: '6' },
  { key: 'shadowBlur', label: 'Shadow blur', placeholder: '12' },
  {
    key: 'shadowOpacity',
    label: 'Shadow opacity',
    placeholder: '0.4 + sin(time * 2) * 0.2',
  },
]

export function CustomBrushModal({
  onSave,
  onClose,
}: {
  onSave: (brush: BrushPreset) => void
  onClose: () => void
}) {
  const modalRef = useRef<HTMLElement>(null)
  const [name, setName] = useState('Wave Expression')
  const [renderer, setRenderer] = useState<RendererId>('line')
  const [expressions, setExpressions] = useState<BrushExpressions>({
    y: 'sin(time * speed + index * 0.3) * amount',
    size: '1 + sin(time * 4 + index) * 0.2',
  })

  useEffect(() => {
    modalRef.current?.querySelector<HTMLInputElement>('[aria-label="Brush name"]')
      ?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const errors = useMemo(
    () =>
      Object.fromEntries(
        EXPRESSION_FIELDS.map(({ key }) => [
          key,
          validateMathExpression(expressions[key] ?? ''),
        ]),
      ) as Record<keyof BrushExpressions, string | null>,
    [expressions],
  )
  const hasExpression = Object.values(expressions).some((value) => value?.trim())
  const canSave =
    name.trim().length > 0 &&
    hasExpression &&
    Object.values(errors).every((error) => !error)

  return createPortal(
    <div
      className="preset-modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={modalRef}
        className="preset-modal custom-brush-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-brush-title"
      >
        <header className="preset-modal-header">
          <div>
            <h2 id="custom-brush-title">New expression brush</h2>
            <p>Animate brush points with safe mathematical expressions.</p>
          </div>
          <IconButton icon={X} label="Close expression brush editor" onClick={onClose} />
        </header>

        <div className="custom-brush-body">
          <div className="custom-brush-form">
            <label className="custom-brush-field">
              <span>Name</span>
              <TextField label="Brush name" value={name} onValue={setName} />
            </label>
            <label className="custom-brush-field">
              <span>Renderer</span>
              <Select
                aria-label="Brush renderer"
                value={renderer}
                onChange={(event) =>
                  setRenderer(event.target.value as RendererId)
                }
              >
                <option value="line">Line</option>
                <option value="stamp">Stamp</option>
                <option value="ribbon">Ribbon</option>
                <option value="particle">Particle</option>
                <option value="nature">Nature</option>
                <option value="aura">Aura</option>
              </Select>
            </label>
            {EXPRESSION_FIELDS.map(({ key, label, placeholder }) => (
              <label className="custom-brush-field" key={key}>
                <span>{label}</span>
                <input
                  className={`scrub-input text-input expression-input${errors[key] ? ' is-invalid' : ''}`}
                  aria-label={`${label} expression`}
                  value={expressions[key] ?? ''}
                  placeholder={placeholder}
                  spellCheck={false}
                  onChange={(event) =>
                    setExpressions((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
                {errors[key] && <small role="alert">{errors[key]}</small>}
              </label>
            ))}
          </div>

          <div className="custom-brush-preview">
            <span>Live preview</span>
            <ExpressionPreview expressions={expressions} />
            <div className="custom-brush-reference">
              <strong>Available context</strong>
              <code>x y index progress time speed amount pressure seed</code>
              <strong>Functions</strong>
              <code>sin cos tan abs sqrt min max pow floor ceil round</code>
              <p>
                X and Y are offsets. Size and opacity are multipliers; rotation
                is in radians. Hue is measured in degrees; saturation and
                brightness are multipliers. Blur, glow, and shadow values use
                pixels. Use PI instead of Math.PI.
              </p>
              <p>
                Stamp, particle, and nature renderers apply effects per sample.
                Continuous line and ribbon renderers apply their average across
                the stroke.
              </p>
            </div>
          </div>
        </div>

        <footer className="preset-modal-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() =>
              onSave({
                id: '',
                name: name.trim(),
                group: 'Custom',
                renderer,
                animation: 'none',
                expressions: Object.fromEntries(
                  Object.entries(expressions).filter(([, value]) => value?.trim()),
                ),
              })
            }
          >
            Add brush
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

function ExpressionPreview({ expressions }: { expressions: BrushExpressions }) {
  const [time, setTime] = useState(0)

  useEffect(() => {
    let frame = 0
    const tick = (now: number) => {
      setTime(now * 0.001)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const value = (
    source: string | undefined,
    context: {
      x: number
      y: number
      index: number
      progress: number
      time: number
      speed: number
      amount: number
      pressure: number
      seed: number
    },
    fallback: number,
  ) => {
    try {
      return source?.trim()
        ? evaluateMathExpression(source, context)
        : fallback
    } catch {
      return fallback
    }
  }
  const points = Array.from({ length: 36 }, (_, index) => {
    const progress = index / 35
    const context = {
      x: 20 + progress * 260,
      y: 80,
      index,
      progress,
      time,
      speed: 5,
      amount: 9,
      pressure: 0.5,
      seed: 1,
    }
    return {
      x: context.x + value(expressions.x, context, 0),
      y: context.y + value(expressions.y, context, 0),
      size: Math.max(0.2, value(expressions.size, context, 1)),
      opacity: Math.max(
        0,
        Math.min(1, value(expressions.opacity, context, 1)),
      ),
    }
  })
  const effectContext = {
    x: 150,
    y: 80,
    index: 18,
    progress: 0.5,
    time,
    speed: 5,
    amount: 9,
    pressure: 0.5,
    seed: 1,
  }
  const clamp = (input: number, min: number, max: number) =>
    Math.max(min, Math.min(max, input))
  const hue = clamp(value(expressions.hue, effectContext, 0), -720, 720)
  const saturation = clamp(
    value(expressions.saturation, effectContext, 1),
    0,
    5,
  )
  const lightness = clamp(
    value(expressions.lightness, effectContext, 1),
    0,
    5,
  )
  const blur = clamp(value(expressions.blur, effectContext, 0), 0, 64)
  const shadowX = clamp(
    value(expressions.shadowX, effectContext, 0),
    -200,
    200,
  )
  const shadowY = clamp(
    value(expressions.shadowY, effectContext, 0),
    -200,
    200,
  )
  const shadowBlur = Math.max(
    clamp(value(expressions.glow, effectContext, 0), 0, 100),
    clamp(value(expressions.shadowBlur, effectContext, 0), 0, 100),
  )
  const shadowOpacity = clamp(
    value(expressions.shadowOpacity, effectContext, 1),
    0,
    1,
  )
  const filter = [
    `hue-rotate(${hue}deg)`,
    `saturate(${saturation})`,
    `brightness(${lightness})`,
    `blur(${blur}px)`,
    `drop-shadow(${shadowX}px ${shadowY}px ${shadowBlur}px rgba(135, 160, 255, ${shadowOpacity}))`,
  ].join(' ')

  return (
    <svg
      viewBox="0 0 300 160"
      role="img"
      aria-label="Expression brush preview"
    >
      <g style={{ filter }}>
        <path
          d={points
            .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
            .join(' ')}
        />
        {points.filter((_, index) => index % 4 === 0).map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={2.5 * point.size}
            opacity={point.opacity}
          />
        ))}
      </g>
    </svg>
  )
}
