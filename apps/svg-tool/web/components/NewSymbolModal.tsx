import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, IconButton } from '../ui/controls'
import { ScrubField } from '../ui/fields'

export type NewSymbolConfig = {
  name: string
  width: number
  height: number
  duration: number
}

export function NewSymbolModal({
  onCreate,
  onClose,
}: {
  onCreate: (config: NewSymbolConfig) => void
  onClose: () => void
}) {
  const [name, setName] = useState('Symbol')
  const [width, setWidth] = useState(240)
  const [height, setHeight] = useState(180)
  const [duration, setDuration] = useState(3)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate({ name: trimmed, width, height, duration })
    onClose()
  }

  return createPortal(
    <div
      className="symbol-modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="symbol-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-symbol-title"
      >
        <header>
          <div>
            <h2 id="new-symbol-title">New symbol</h2>
            <p>Create an empty reusable animation clip.</p>
          </div>
          <IconButton icon={X} label="Close new symbol" onClick={onClose} />
        </header>
        <div className="symbol-modal-fields">
          <label>
            <span>Name</span>
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
          </label>
          <label>
            <span>Width</span>
            <ScrubField
              label="PX"
              value={width}
              min={1}
              max={4096}
              onValue={setWidth}
            />
          </label>
          <label>
            <span>Height</span>
            <ScrubField
              label="PX"
              value={height}
              min={1}
              max={4096}
              onValue={setHeight}
            />
          </label>
          <label>
            <span>Duration</span>
            <ScrubField
              label="SEC"
              value={duration}
              min={0.1}
              max={60}
              step={0.1}
              precision={2}
              onValue={setDuration}
            />
          </label>
        </div>
        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Create symbol
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
