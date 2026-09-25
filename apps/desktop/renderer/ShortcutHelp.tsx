import { useEffect, useRef, useState } from 'react'
import { shortcutBlocked, shortcutEntries, subscribeShortcuts } from '@artist-studio/ui-component'
import { useHashRoute } from './app/useHashRoute'
import './ShortcutHelp.css'

const history = [['Mod+Z', 'Undo'], ['Mod+Shift+Z', 'Redo'], ['Mod+S', 'Save']]
const draw = [['B', 'Brush'], ['E', 'Eraser'], ['G', 'Fill'], ['I', 'Eyedropper'], ['R', 'Rectangle'], ['O', 'Ellipse'], ['M', 'Rectangle selection'], ['L', 'Lasso'], ['V', 'Transform'], ['H', 'Hand'], ['[ / ]', 'Decrease / increase brush size'], ['0', 'Fit canvas']]
const existing: Record<string, string[][]> = {
  'svg-editor': [...history, ['Mod+D', 'Duplicate selection'], ['Mod+G', 'Group selection'], ['Mod+Shift+G', 'Ungroup selection'], ['Delete / Backspace', 'Delete selection'], ['Space', 'Play / pause in Animate mode'], ['Home', 'Go to start in Animate mode'], ['K', 'Add position key in Animate mode']],
  'drawing-editor': [...history, ...draw, ['Shift+M', 'Ellipse selection'], ['Mod+D', 'Deselect'], ['Space (hold)', 'Temporary hand tool'], ['Mod+= / Mod+-', 'Zoom in / out'], ['Delete / Backspace', 'Clear selected pixels'], ['Escape', 'Cancel gesture / deselect']],
  'frame-editor': [...history, ...draw, ['Mod+D', 'Deselect'], ['Space', 'Play / pause'], ['ArrowLeft / ArrowRight', 'Previous / next frame'], [', / .', 'Previous / next drawing'], ['N', 'New drawing'], ['Shift+N', 'Duplicate drawing'], ['Escape', 'Cancel gesture / deselect']],
  'live-character-editor': [...history, ['V', 'Select'], ['B', 'Bone tool (Rig)'], ['P', 'Draw tool (Create)'], ['Space', 'Play / pause animation'], ['Delete / Backspace', 'Delete selection'], ['Escape', 'Select tool / deselect']],
}
export function ShortcutHelp() {
  const route = useHashRoute()
  return <WorkspaceHelp key={route.page} page={route.page} />
}
function WorkspaceHelp({ page }: { page: string }) {
  const [open, setOpen] = useState(false), [, update] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => subscribeShortcuts(() => update(value => value + 1)), [])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = dialog.current
    node?.showModal()
    return () => { node?.close(); previous?.focus() }
  }, [open])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (open) {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
        // Keep legacy window handlers out of this dialog; retain native Tab and input behavior.
        event.stopImmediatePropagation()
        return
      }
      if (!shortcutBlocked(event) && !event.repeat && !event.altKey &&
        ((event.key === '?' && !event.metaKey && !event.ctrlKey) ||
          (event.key === '/' && (event.metaKey || event.ctrlKey)))) {
        event.preventDefault(); event.stopImmediatePropagation(); setOpen(true)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open])
  const entries = [...(existing[page] ?? []).map(([keys, label]) => ({ keys, label })), ...shortcutEntries()]
  const unique = entries.filter((entry, index) => entries.findIndex(other => other.keys.toLowerCase() === entry.keys.toLowerCase()) === index)
  return <>
    <button className="shortcut-help-trigger" title="Keyboard shortcuts (? or Ctrl/⌘ + /)" aria-label="Keyboard shortcuts" onClick={() => setOpen(true)}>⌨</button>
    {open && <dialog className="shortcut-help-dialog" ref={dialog} onCancel={event => { event.preventDefault(); setOpen(false) }} aria-labelledby="shortcut-help-title">
      <header><h2 id="shortcut-help-title">Keyboard shortcuts</h2><button autoFocus onClick={() => setOpen(false)} aria-label="Close keyboard shortcuts">✕</button></header>
      <p>For this workspace. Mod means ⌘ on Mac or Ctrl on Windows/Linux. Shortcuts pause while typing or using a dialog.</p>
      <div className="shortcut-help-list"><dl><div><dt>Open this guide</dt><dd><kbd>?</kbd> / <kbd>Mod+/</kbd></dd></div>{unique.map(({ keys, label }) => <div key={keys}><dt>{label}</dt><dd><kbd>{keys.split('+').map(key => key.length === 1 ? key.toUpperCase() : key).join('+')}</kbd></dd></div>)}</dl>
      {!unique.length && <p>Use Tab to move between controls, Enter to activate, and Escape to close dialogs.</p>}</div>
    </dialog>}
  </>
}
