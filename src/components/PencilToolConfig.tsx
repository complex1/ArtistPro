import { Pencil } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { ColorField, ScrubField, SliderField } from '../ui/fields'

export function PencilToolConfig() {
  const settings = useEditorStore((state) => state.pencilSettings)
  const setSettings = useEditorStore((state) => state.setPencilSettings)

  return (
    <footer className="bottom-panel pencil-tool-panel">
      <section className="pencil-tool-title">
        <div className="panel-tabs">
          <span className="is-active">Tool settings</span>
        </div>
        <div>
          <Pencil size={15} />
          <span>Pencil</span>
        </div>
      </section>
      <section className="pencil-tool-controls">
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
            label="Pencil color"
            value={settings.color}
            onValue={(color) => setSettings({ color })}
          />
        </label>
        <label>
          <span>Smoothing</span>
          <SliderField
            label="Pencil smoothing"
            value={settings.smoothing}
            onValue={(smoothing) => setSettings({ smoothing })}
            display={`${Math.round(settings.smoothing * 100)}%`}
          />
        </label>
        <label>
          <span>Stability</span>
          <SliderField
            label="Pencil stability"
            value={settings.stability}
            onValue={(stability) => setSettings({ stability })}
            display={`${Math.round(settings.stability * 100)}%`}
          />
        </label>
        <label>
          <span>Pressure</span>
          <SliderField
            label="Pencil pressure"
            value={settings.pressure}
            onValue={(pressure) => setSettings({ pressure })}
            display={`${Math.round(settings.pressure * 100)}%`}
          />
        </label>
      </section>
    </footer>
  )
}
