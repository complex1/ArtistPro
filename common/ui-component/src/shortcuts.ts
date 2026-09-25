import { useEffect, useLayoutEffect, useRef } from 'react'

export type Shortcut = { keys: string; label: string; run: () => void; enabled?: boolean; repeat?: boolean }
const registrations = new Map<symbol, Shortcut[]>()
const listeners = new Set<() => void>()
export const subscribeShortcuts = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const shortcutEntries = () => [...registrations.values()].flat().map(({ keys, label }) => ({ keys, label }))
const notify = () => listeners.forEach(listener => listener())

export function matchesShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, keys: string): boolean {
  const parts = keys.toLowerCase().split('+'), key = parts.pop()!
  return (event.ctrlKey || event.metaKey) === parts.includes('mod') && event.altKey === parts.includes('alt') &&
    event.shiftKey === parts.includes('shift') && event.key.toLowerCase() === (key === 'space' ? ' ' : key)
}

/** Respect native text editing, IME, modal controls, and shadow-root inputs. */
export function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return true
  const path = event.composedPath?.() ?? [event.target]
  if (path.some(target => target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[inert]')))) return true
  if (path.some(target => target instanceof HTMLElement && target.closest('dialog[open],[role="dialog"],[role="alertdialog"]'))) return true
  if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"]')) return true
  // Space/Enter should activate the focused control, not a canvas action.
  return [' ', 'Enter'].includes(event.key) && path.some(target => target instanceof HTMLElement && !!target.closest('button,a,[role="button"],[role="tab"]'))
}

export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  const current = useRef(shortcuts)
  useLayoutEffect(() => { current.current = shortcuts })
  const signature = shortcuts.map(({ keys, label }) => keys + label).join('|')
  useEffect(() => {
    if (!enabled) return
    const id = Symbol('shortcuts')
    registrations.set(id, current.current); notify()
    const keydown = (event: KeyboardEvent) => {
      if (shortcutBlocked(event)) return
      const item = current.current.find(item => matchesShortcut(event, item.keys))
      if (!item) return
      event.preventDefault()
      if (item.enabled === false || (event.repeat && !item.repeat)) return
      item.run()
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); registrations.delete(id); notify() }
  }, [enabled, signature])
}
