import { Pencil } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { SliderField } from '../ui/fields'

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
          <span>Smoothing</span>
          <SliderField
            label="Pencil smoothing"
            value={settings.smoothing}
            onValue={(smoothing) => setSettings({ smoothing })}
            display={`${Math.round(settings.smoothing * 100)}%`}
          />
        </label>
      </section>
    </footer>
  )
}
