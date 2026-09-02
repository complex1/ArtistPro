import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { stampPaintSrc, type StampUseMode } from '../core/stamp'
import { Button, IconButton } from '../../../ui/controls'
import { finalizeStamp } from './stampFile'

const DRAW_SIZE = 256

export type StampDraft =
  | { source: 'upload'; imageUrl: string }
  | { source: 'draw' }

export function StampConfigModal({
  draft,
  onSave,
  onClose,
}: {
  draft: StampDraft
  onSave: (stamp: string) => void
  onClose: () => void
}) {
  const drawRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [mode, setMode] = useState<StampUseMode>('image')
  const [invert, setInvert] = useState(false)
  const [preview, setPreview] = useState(
    draft.source === 'upload' ? draft.imageUrl : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (draft.source !== 'upload') return
    let cancelled = false
    if (mode === 'image') {
      setPreview(draft.imageUrl)
      return
    }
    void finalizeStamp(draft.imageUrl, { mode, invert }).then((stamp) => {
      if (!cancelled) setPreview(stampPaintSrc(stamp))
    })
    return () => {
      cancelled = true
    }
  }, [draft, mode, invert])

  const canvasPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    }
  }

  const strokeTo = (
    canvas: HTMLCanvasElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const context = canvas.getContext('2d')
    if (!context) return
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#111111'
    context.lineWidth = 14
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.stroke()
  }

  const snapshotDraw = () => {
    const canvas = drawRef.current
    if (!canvas) return
    setPreview(canvas.toDataURL('image/png'))
  }

  const clearDraw = () => {
    const canvas = drawRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    setPreview('')
  }

  const save = async () => {
    const sourceUrl =
      draft.source === 'upload'
        ? draft.imageUrl
        : (drawRef.current?.toDataURL('image/png') ?? '')
    if (!sourceUrl) {
      setError('Draw a stamp before saving.')
      return
    }
    setBusy(true)
    setError('')
    try {
      onSave(await finalizeStamp(sourceUrl, { mode, invert }))
      onClose()
    } catch {
      setError('Could not save that stamp.')
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="stamp-modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="stamp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stamp-config-title"
      >
        <header>
          <div>
            <h2 id="stamp-config-title">
              {draft.source === 'draw' ? 'Draw stamp' : 'Stamp settings'}
            </h2>
            <p>
              {draft.source === 'draw'
                ? 'Sketch a mark, then save it as a color image or a tinted shape.'
                : 'Choose how this image is stamped along the stroke.'}
            </p>
          </div>
          <IconButton icon={X} label="Close stamp settings" onClick={onClose} />
        </header>

        <div className="stamp-modal-body">
          <div className="stamp-modal-preview">
            {draft.source === 'draw' ? (
              <canvas
                ref={drawRef}
                width={DRAW_SIZE}
                height={DRAW_SIZE}
                aria-label="Draw stamp"
                onPointerDown={(event) => {
                  drawing.current = true
                  last.current = canvasPoint(event)
                  strokeTo(event.currentTarget, last.current, last.current)
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  if (!drawing.current || !last.current) return
                  const point = canvasPoint(event)
                  strokeTo(event.currentTarget, last.current, point)
                  last.current = point
                }}
                onPointerUp={(event) => {
                  drawing.current = false
                  last.current = null
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                  snapshotDraw()
                }}
              />
            ) : (
              <img src={preview} alt="Stamp preview" />
            )}
          </div>

          <fieldset className="stamp-modal-options">
            <legend>Use as</legend>
            <label>
              <input
                type="radio"
                name="stamp-use"
                checked={mode === 'image'}
                onChange={() => setMode('image')}
              />
              Image
              <small>Keeps original color.</small>
            </label>
            <label>
              <input
                type="radio"
                name="stamp-use"
                checked={mode === 'shape'}
                onChange={() => setMode('shape')}
              />
              Shape
              <small>Grayscale mask, tinted with the brush color.</small>
            </label>
            <label className={mode === 'shape' ? '' : 'is-disabled'}>
              <input
                type="checkbox"
                checked={invert}
                disabled={mode !== 'shape'}
                onChange={(event) => setInvert(event.target.checked)}
              />
              Invert
              <small>Swap solid and empty areas.</small>
            </label>
          </fieldset>
        </div>

        {error ? <p className="paint-save-error">{error}</p> : null}

        <footer>
          {draft.source === 'draw' ? (
            <Button onClick={clearDraw}>Clear</Button>
          ) : (
            <span />
          )}
          <div>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => void save()} disabled={busy}>
              Save stamp
            </Button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
