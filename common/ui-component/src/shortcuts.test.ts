import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchesShortcut, shortcutBlocked } from './shortcuts'
const key = (key: string, extra = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra })
describe('shortcut matching', () => {
  it('uses either platform command modifier with exact shift/alt combinations', () => {
    expect(matchesShortcut(key('z', { metaKey: true }), 'Mod+z')).toBe(true)
    expect(matchesShortcut(key('z', { ctrlKey: true }), 'Mod+z')).toBe(true)
    expect(matchesShortcut(key('Z', { metaKey: true, shiftKey: true }), 'Mod+Shift+z')).toBe(true)
    expect(matchesShortcut(key('Z', { metaKey: true, shiftKey: true }), 'Mod+z')).toBe(false)
    expect(matchesShortcut(key('b', { altKey: true }), 'b')).toBe(false)
    expect(matchesShortcut(key('b', { ctrlKey: true }), 'b')).toBe(false)
    expect(matchesShortcut(key(' '), 'Space')).toBe(true)
  })
})
class Target {
  isContentEditable = false
  private selector: string
  constructor(selector = '') { this.selector = selector }
  closest(selector: string) { return this.selector && selector.includes(this.selector) ? this : null }
}
afterEach(() => vi.unstubAllGlobals())
it('protects text, nested controls, shadow-root inputs, dialogs and IME', () => {
  vi.stubGlobal('HTMLElement', Target)
  vi.stubGlobal('document', { querySelector: () => null })
  const event = (path: Target[], extra = {}) => ({ ...key('b'), composedPath: () => path, ...extra }) as unknown as KeyboardEvent
  expect(shortcutBlocked(event([new Target()]))).toBe(false)
  for (const selector of ['input', 'textarea', 'select', '[role="textbox"]', '[inert]', 'dialog[open]']) {
    expect(shortcutBlocked(event([new Target(), new Target(selector)]))).toBe(true)
  }
  expect(shortcutBlocked(event([], { isComposing: true }))).toBe(true)
  expect(shortcutBlocked(event([], { defaultPrevented: true }))).toBe(true)
  expect(shortcutBlocked(event([new Target('button')], { key: ' ' }))).toBe(true)
  vi.stubGlobal('document', { querySelector: () => new Target() })
  expect(shortcutBlocked(event([]))).toBe(true)
})
