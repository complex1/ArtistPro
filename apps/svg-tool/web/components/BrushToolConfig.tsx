import { Paintbrush } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { ColorField, ScrubField, SliderField } from '../ui/fields'

export function BrushToolConfig() {
  const settings = useEditorStore((state) => state.brushSettings)
  const setSettings = useEditorStore((state) => state.setBrushSettings)

  return (
    <footer className="bottom-panel brush-tool-panel">
      <section className="brush-tool-title">
        <div className="panel-tabs">
          <span className="is-active">Tool settings</span>
        </div>
        <div>
          <Paintbrush size={15} />
          <span>Brush</span>
        </div>
      </section>
      <section className="brush-tool-controls">
        <label>
          <span>Size</span>
          <ScrubField
            label="PX"
            value={settings.size}
            min={1}
            max={96}
            onValue={(size) => setSettings({ size })}
          />
        </label>
        <label>
          <span>Color</span>
          <ColorField
            label="Brush color"
            value={settings.color}
            onValue={(color) => setSettings({ color })}
          />
        </label>
        <label>
          <span>Smoothing</span>
          <SliderField
            label="Brush smoothing"
            value={settings.smoothing}
            onValue={(smoothing) => setSettings({ smoothing })}
            display={`${Math.round(settings.smoothing * 100)}%`}
          />
        </label>
        <label>
          <span>Stability</span>
          <SliderField
            label="Brush stability"
            value={settings.stability}
            onValue={(stability) => setSettings({ stability })}
            display={`${Math.round(settings.stability * 100)}%`}
          />
        </label>
        <label>
          <span>Pressure</span>
          <SliderField
            label="Brush pressure"
            value={settings.pressure}
            onValue={(pressure) => setSettings({ pressure })}
            display={`${Math.round(settings.pressure * 100)}%`}
          />
        </label>
      </section>
    </footer>
  )
}
