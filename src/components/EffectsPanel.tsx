import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react'
import { createEffect, effectLabels } from '../model/effects'
import type { EffectType, LayerEffect } from '../model/types'
import { Button, IconButton } from '../ui/controls'
import {
  ColorField,
  PropertyRow,
  ScrubField,
  SliderField,
} from '../ui/fields'

export function EffectsPanel({
  effects,
  onChange,
}: {
  effects: LayerEffect[]
  onChange: (effects: LayerEffect[]) => void
}) {
  const update = (id: string, patch: Partial<LayerEffect>) =>
    onChange(
      effects.map((effect) =>
        effect.id === id
          ? ({ ...effect, ...patch } as LayerEffect)
          : effect,
      ),
    )

  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction
    if (destination < 0 || destination >= effects.length) return
    const next = [...effects]
    ;[next[index], next[destination]] = [next[destination], next[index]]
    onChange(next)
  }

  const add = (type: EffectType) => onChange([...effects, createEffect(type)])

  return (
    <div className="effects-panel">
      <div className="effect-add-row">
        <Button onClick={() => add('blur')}>+ Blur</Button>
        <Button onClick={() => add('drop-shadow')}>+ Shadow</Button>
        <Button onClick={() => add('glow')}>+ Glow</Button>
      </div>

      {effects.length === 0 && (
        <p className="section-note">Effects render in stack order.</p>
      )}

      {effects.map((effect, index) => (
        <div
          className={`effect-card${effect.enabled ? '' : ' is-disabled'}`}
          key={effect.id}
        >
          <div className="effect-card-header">
            <IconButton
              icon={effect.enabled ? Eye : EyeOff}
              label={effect.enabled ? 'Disable effect' : 'Enable effect'}
              onClick={() => update(effect.id, { enabled: !effect.enabled })}
            />
            <strong>{effectLabels[effect.type]}</strong>
            <IconButton
              icon={ArrowUp}
              label="Move effect up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            />
            <IconButton
              icon={ArrowDown}
              label="Move effect down"
              disabled={index === effects.length - 1}
              onClick={() => move(index, 1)}
            />
            <IconButton
              icon={Trash2}
              label="Remove effect"
              onClick={() =>
                onChange(effects.filter((item) => item.id !== effect.id))
              }
            />
          </div>

          {effect.type === 'blur' && (
            <RadiusControl
              label="Radius"
              value={effect.radius}
              onValue={(radius) => update(effect.id, { radius })}
            />
          )}

          {effect.type === 'drop-shadow' && (
            <>
              <PropertyRow label="Offset">
                <ScrubField
                  label="X"
                  value={effect.offset.x}
                  onValue={(x) =>
                    update(effect.id, {
                      offset: { ...effect.offset, x },
                    })
                  }
                />
                <ScrubField
                  label="Y"
                  value={effect.offset.y}
                  onValue={(y) =>
                    update(effect.id, {
                      offset: { ...effect.offset, y },
                    })
                  }
                />
              </PropertyRow>
              <RadiusControl
                label="Blur"
                value={effect.radius}
                onValue={(radius) => update(effect.id, { radius })}
              />
              <ColorControl
                effect={effect}
                onUpdate={(patch) => update(effect.id, patch)}
              />
            </>
          )}

          {effect.type === 'glow' && (
            <>
              <RadiusControl
                label="Radius"
                value={effect.radius}
                onValue={(radius) => update(effect.id, { radius })}
              />
              <ColorControl
                effect={effect}
                onUpdate={(patch) => update(effect.id, patch)}
              />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function RadiusControl({
  label,
  value,
  onValue,
}: {
  label: string
  value: number
  onValue: (value: number) => void
}) {
  return (
    <PropertyRow label={label}>
      <SliderField
        label={label}
        value={value}
        min={0}
        max={40}
        step={0.5}
        onValue={onValue}
        display={`${value}px`}
      />
    </PropertyRow>
  )
}

function ColorControl({
  effect,
  onUpdate,
}: {
  effect: Extract<LayerEffect, { type: 'drop-shadow' | 'glow' }>
  onUpdate: (patch: Partial<LayerEffect>) => void
}) {
  return (
    <>
      <PropertyRow label="Color">
        <ColorField
          label={`${effectLabels[effect.type]} color`}
          value={effect.color}
          onValue={(color) => onUpdate({ color })}
        />
      </PropertyRow>
      <PropertyRow label="Opacity">
        <SliderField
          label={`${effectLabels[effect.type]} opacity`}
          value={effect.opacity}
          onValue={(opacity) => onUpdate({ opacity })}
          display={`${Math.round(effect.opacity * 100)}%`}
        />
      </PropertyRow>
    </>
  )
}
