import { Select } from '../../../ui/controls'
import { ColorField, PropertyRow, SliderField, TextField } from '../../../ui/fields'
import type {
  BlendModeV2,
  BrushV2,
  RendererIdV2,
  RotationMode,
} from '../core/types'
import { isImageStamp } from '../render/canvas2d'
import { readStampFile } from './stampFile'

export function BrushInspector({
  brush,
  onChange,
  showAnimationEditor = true,
  mode = 'authoring',
}: {
  brush: BrushV2
  onChange: (patch: Partial<BrushV2>) => void
  showAnimationEditor?: boolean
  mode?: 'authoring' | 'runtime'
}) {
  const imageStamp = brush.stamps.find(isImageStamp) ?? null
  const authoring = mode === 'authoring'

  return (
    <div className="paint-brush-inspector">
      {authoring ? (
        <>
          <PropertyRow label="Name">
            <TextField
              label="Name"
              value={brush.name}
              onValue={(name) => onChange({ name })}
            />
          </PropertyRow>
          <PropertyRow label="Category">
            <TextField
              label="Category"
              value={brush.category}
              onValue={(category) => onChange({ category })}
            />
          </PropertyRow>
          <PropertyRow label="Renderer">
            <Select
              aria-label="Renderer"
              value={brush.renderer}
              onChange={(event) =>
                onChange({ renderer: event.target.value as RendererIdV2 })
              }
            >
              <option value="stamp">Stamp</option>
              <option value="line">Line</option>
              <option value="ribbon">Ribbon</option>
              <option value="particle">Particle</option>
            </Select>
          </PropertyRow>
          <PropertyRow label="Animated">
            <Select
              aria-label="Animated"
              value={brush.animated ? 'yes' : 'no'}
              onChange={(event) =>
                onChange({ animated: event.target.value === 'yes' })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </PropertyRow>
        </>
      ) : null}
      <PropertyRow label="Color">
        <ColorField
          label="Color"
          value={brush.color}
          onValue={(color) => onChange({ color })}
        />
      </PropertyRow>
      <PropertyRow label="Size">
        <SliderField
          label="Size"
          value={brush.size}
          min={1}
          max={80}
          step={1}
          display={`${Math.round(brush.size)}px`}
          onValue={(size) => onChange({ size })}
        />
      </PropertyRow>
      <PropertyRow label="Opacity">
        <SliderField
          label="Opacity"
          value={Math.round(brush.opacity * 100)}
          min={5}
          max={100}
          step={1}
          display={`${Math.round(brush.opacity * 100)}%`}
          onValue={(value) => onChange({ opacity: value / 100 })}
        />
      </PropertyRow>
      <PropertyRow label="Spacing">
        <SliderField
          label="Spacing"
          value={brush.spacing}
          min={1}
          max={48}
          step={1}
          display={`${Math.round(brush.spacing)}`}
          onValue={(spacing) => onChange({ spacing })}
        />
      </PropertyRow>
      <PropertyRow label="Scatter">
        <SliderField
          label="Scatter across"
          value={brush.scatter.across}
          min={0}
          max={40}
          step={1}
          display={`${Math.round(brush.scatter.across)}`}
          onValue={(across) =>
            onChange({ scatter: { ...brush.scatter, across } })
          }
        />
      </PropertyRow>
      <PropertyRow label="Spread">
        <SliderField
          label="Scatter along"
          value={brush.scatter.along}
          min={0}
          max={40}
          step={1}
          display={`${Math.round(brush.scatter.along)}`}
          onValue={(along) => onChange({ scatter: { ...brush.scatter, along } })}
        />
      </PropertyRow>
      {authoring ? (
        <PropertyRow label="Scatter seed">
          <SliderField
            label="Scatter seed"
            value={brush.scatter.seed}
            min={1}
            max={100}
            step={1}
            display={`${Math.round(brush.scatter.seed)}`}
            onValue={(seed) =>
              onChange({ scatter: { ...brush.scatter, seed } })
            }
          />
        </PropertyRow>
      ) : null}
      <PropertyRow label="Stability">
        <SliderField
          label="Stability"
          value={brush.stability}
          min={0}
          max={100}
          step={1}
          display={`${Math.round(brush.stability)}%`}
          onValue={(stability) => onChange({ stability })}
        />
      </PropertyRow>
      <PropertyRow label="Glow">
        <SliderField
          label="Glow"
          value={brush.glow}
          min={0}
          max={32}
          step={1}
          display={`${Math.round(brush.glow)}`}
          onValue={(glow) => onChange({ glow })}
        />
      </PropertyRow>
      <PropertyRow label="Blur">
        <SliderField
          label="Blur"
          value={brush.blurRadius}
          min={0}
          max={24}
          step={1}
          display={`${Math.round(brush.blurRadius)}`}
          onValue={(blurRadius) => onChange({ blurRadius })}
        />
      </PropertyRow>
      <PropertyRow label="Shadow">
        <SliderField
          label="Shadow opacity"
          value={Math.round(brush.shadow.opacity * 100)}
          min={0}
          max={100}
          step={1}
          display={`${Math.round(brush.shadow.opacity * 100)}%`}
          onValue={(value) =>
            onChange({ shadow: { ...brush.shadow, opacity: value / 100 } })
          }
        />
      </PropertyRow>
      <PropertyRow label="Shadow blur">
        <SliderField
          label="Shadow blur"
          value={brush.shadow.blur}
          min={0}
          max={40}
          step={1}
          display={`${Math.round(brush.shadow.blur)}`}
          onValue={(blur) => onChange({ shadow: { ...brush.shadow, blur } })}
        />
      </PropertyRow>
      {authoring ? (
        <>
          <PropertyRow label="Shadow color">
            <ColorField
              label="Shadow color"
              value={brush.shadow.color}
              onValue={(color) =>
                onChange({ shadow: { ...brush.shadow, color } })
              }
            />
          </PropertyRow>
          <PropertyRow label="Shadow X">
            <SliderField
              label="Shadow X offset"
              value={brush.shadow.offsetX}
              min={-50}
              max={50}
              step={1}
              display={`${Math.round(brush.shadow.offsetX)}px`}
              onValue={(offsetX) =>
                onChange({ shadow: { ...brush.shadow, offsetX } })
              }
            />
          </PropertyRow>
          <PropertyRow label="Shadow Y">
            <SliderField
              label="Shadow Y offset"
              value={brush.shadow.offsetY}
              min={-50}
              max={50}
              step={1}
              display={`${Math.round(brush.shadow.offsetY)}px`}
              onValue={(offsetY) =>
                onChange({ shadow: { ...brush.shadow, offsetY } })
              }
            />
          </PropertyRow>
        </>
      ) : null}
      <PropertyRow label="Rotation">
        <Select
          aria-label="Rotation"
          value={brush.rotation}
          onChange={(event) =>
            onChange({ rotation: event.target.value as RotationMode })
          }
        >
          <option value="fixed">Fixed</option>
          <option value="followPath">Follow path</option>
          <option value="random">Random</option>
        </Select>
      </PropertyRow>
      <PropertyRow label="Angle">
        <SliderField
          label="Rotation angle"
          value={brush.rotationDegrees}
          min={-180}
          max={180}
          step={1}
          display={`${Math.round(brush.rotationDegrees)}°`}
          onValue={(rotationDegrees) => onChange({ rotationDegrees })}
        />
      </PropertyRow>
      <PropertyRow label="Stamps">
        <SliderField
          label="Stamps per point"
          value={brush.stampsPerPoint}
          min={1}
          max={16}
          step={1}
          display={`${Math.round(brush.stampsPerPoint)}`}
          onValue={(stampsPerPoint) => onChange({ stampsPerPoint })}
        />
      </PropertyRow>
      <PropertyRow label="Drift">
        <SliderField
          label="Drift"
          value={brush.drift}
          min={0}
          max={100}
          step={1}
          display={`${Math.round(brush.drift)}px`}
          onValue={(drift) => onChange({ drift })}
        />
      </PropertyRow>
      <PropertyRow label="Distortion">
        <SliderField
          label="Distortion"
          value={Math.round(brush.distortion * 100)}
          min={0}
          max={95}
          step={1}
          display={`${Math.round(brush.distortion * 100)}%`}
          onValue={(distortion) => onChange({ distortion: distortion / 100 })}
        />
      </PropertyRow>
      <PropertyRow label="Speed">
        <SliderField
          label="Animation speed"
          value={brush.speed}
          min={0}
          max={5}
          step={0.05}
          display={`${brush.speed.toFixed(2)}×`}
          onValue={(speed) => onChange({ speed })}
        />
      </PropertyRow>
      {authoring ? (
        <>
          <PropertyRow label="Hardness">
            <SliderField
              label="Hardness"
              value={Math.round(brush.hardness * 100)}
              min={0}
              max={100}
              step={1}
              display={`${Math.round(brush.hardness * 100)}%`}
              onValue={(hardness) => onChange({ hardness: hardness / 100 })}
            />
          </PropertyRow>
          <PropertyRow label="Blend">
            <Select
              aria-label="Brush blend mode"
              value={brush.blendMode}
              onChange={(event) =>
                onChange({ blendMode: event.target.value as BlendModeV2 })
              }
            >
              <option value="source-over">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
            </Select>
          </PropertyRow>
          {brush.renderer === 'particle' ? (
            <>
              <PropertyRow label="Particles">
                <SliderField
                  label="Particle count"
                  value={brush.particle.count}
                  min={1}
                  max={32}
                  step={1}
                  display={`${Math.round(brush.particle.count)}`}
                  onValue={(count) =>
                    onChange({ particle: { ...brush.particle, count } })
                  }
                />
              </PropertyRow>
              <PropertyRow label="Lifetime">
                <SliderField
                  label="Particle lifetime"
                  value={brush.particle.lifetime}
                  min={0.1}
                  max={10}
                  step={0.1}
                  display={`${brush.particle.lifetime.toFixed(1)}s`}
                  onValue={(lifetime) =>
                    onChange({ particle: { ...brush.particle, lifetime } })
                  }
                />
              </PropertyRow>
              <PropertyRow label="Velocity">
                <SliderField
                  label="Particle velocity"
                  value={brush.particle.velocity}
                  min={0}
                  max={200}
                  step={1}
                  display={`${Math.round(brush.particle.velocity)}`}
                  onValue={(velocity) =>
                    onChange({ particle: { ...brush.particle, velocity } })
                  }
                />
              </PropertyRow>
              <PropertyRow label="Gravity">
                <SliderField
                  label="Particle gravity"
                  value={brush.particle.gravity}
                  min={-200}
                  max={200}
                  step={1}
                  display={`${Math.round(brush.particle.gravity)}`}
                  onValue={(gravity) =>
                    onChange({ particle: { ...brush.particle, gravity } })
                  }
                />
              </PropertyRow>
              <PropertyRow label="Spawn">
                <SliderField
                  label="Particle spawn"
                  value={brush.particle.spawn}
                  min={0}
                  max={8}
                  step={0.1}
                  display={brush.particle.spawn.toFixed(1)}
                  onValue={(spawn) =>
                    onChange({ particle: { ...brush.particle, spawn } })
                  }
                />
              </PropertyRow>
            </>
          ) : null}
        </>
      ) : null}
      <PropertyRow label="Seed">
        <SliderField
          label="Seed"
          value={brush.seed}
          min={1}
          max={100}
          step={1}
          display={`${Math.round(brush.seed)}`}
          onValue={(seed) => onChange({ seed })}
        />
      </PropertyRow>
      {authoring && showAnimationEditor ? (
        <label className="paint-js-editor">
          <span>animation(points, config, time)</span>
          <textarea
            aria-label="Animation JavaScript"
            value={brush.animationJs}
            onChange={(event) =>
              onChange({ animationJs: event.target.value, animated: true })
            }
            spellCheck={false}
          />
        </label>
      ) : null}
      {authoring ? <label className="paint-stamp-upload">
        Upload stamp
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void readStampFile(file).then((stamp) => {
              onChange({
                stamps: [stamp],
                renderer: 'stamp',
                // Line spacing smears overlapping copies of the art into a blob,
                // so open it up enough that individual stamps read.
                spacing: Math.max(brush.spacing, brush.size * 0.75),
              })
            })
          }}
        />
        {imageStamp ? (
          <span className="paint-stamp-preview">
            <img src={imageStamp} alt="Current stamp" />
            <button
              type="button"
              onClick={() => onChange({ stamps: ['dot'] })}
            >
              Remove
            </button>
          </span>
        ) : null}
      </label> : null}
    </div>
  )
}
