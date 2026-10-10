import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export function NumberField({ label, value, onCommit, min = -180, max = 180, step = 1, suffix = '°', disabled = false }: {
  label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))
  const canceled = useRef(false)
  const dirty = useRef(false)
  useEffect(() => { setDraft(String(Math.round(value * 1000) / 1000)); dirty.current = false }, [value])
  function finish() {
    if (canceled.current) { canceled.current = false; return }
    if (!dirty.current) return
    dirty.current = false
    const parsed = Number(draft)
    if (draft.trim() && parsed === value) return
    if (draft.trim() && Number.isFinite(parsed)) {
      const next = Math.min(max, Math.max(min, parsed))
      setDraft(String(next))
      if (next !== value) onCommit(next)
    } else setDraft(String(value))
  }
  return <label className="an-number" htmlFor={id}><span>{label}</span><span className="an-number-input"><input id={id} type="number" min={min} max={max} step={step} disabled={disabled} value={draft} onChange={event => { dirty.current = true; setDraft(event.target.value) }} onBlur={finish} onKeyDown={event => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') { canceled.current = true; dirty.current = false; setDraft(String(value)); event.currentTarget.blur() }
  }} /><span>{suffix}</span></span></label>
}

export function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (color: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <label className="an-color"><span>{label}</span><input type="color" value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onCommit(draft) }} /></label>
}

export function Toggle({ children, checked, onChange, disabled = false }: { children: ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="an-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{children}</span></label>
}
