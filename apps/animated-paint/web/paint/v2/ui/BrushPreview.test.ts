import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewPlayback } from './brushPreviewPlayback'
import { brushPreviewBackground } from './brushPreviewColor'

let page: { hidden: boolean }
let listeners: Map<string, Set<() => void>>
const visibility = (hidden: boolean) => {
  page.hidden = hidden
  for (const listener of listeners.get('visibilitychange') ?? []) listener()
}

beforeEach(() => {
  vi.useFakeTimers()
  listeners = new Map()
  page = {
    hidden: false,
    ...{
      addEventListener(name: string, listener: () => void) {
        if (!listeners.has(name)) listeners.set(name, new Set())
        listeners.get(name)!.add(listener)
      },
      removeEventListener(name: string, listener: () => void) { listeners.get(name)?.delete(listener) },
    },
  }
  vi.stubGlobal('document', page)
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 1))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('brush preview contrast', () => {
  it('keeps dark glowing ink visible while preserving bright neon on a dark backdrop', () => {
    expect(brushPreviewBackground('#111111', 10)).toBe('#ffffff')
    expect(brushPreviewBackground('#22adcf', 4)).toBe('#151923')
    expect(brushPreviewBackground('#fff', 0)).toBe('#151923')
    expect(brushPreviewBackground('#eeeeee', 0)).toBe('#151923')
  })

  it('handles shorthand alpha hex and canvas-normalized custom CSS colors', () => {
    expect(brushPreviewBackground('#1118', 10)).toBe('#ffffff')
    expect(brushPreviewBackground('#ffffff80', 0)).toBe('#151923')
    expect(brushPreviewBackground('rgb(17, 17, 17)', 10)).toBe('#ffffff')
    expect(brushPreviewBackground('rgba(255, 255, 255, 0.5)', 0)).toBe('#151923')
    expect(brushPreviewBackground('rgb(100% 100% 100% / 50%)', 0)).toBe('#151923')
    expect(brushPreviewBackground('unrecognized', 10)).toBe('#ffffff')
  })
})

describe('brush preview playback', () => {
  it('shows a later reveal still without scheduling idle frames', () => {
    const paint = vi.fn(() => 0)
    const preview = createPreviewPlayback(paint, 1800)
    preview.setVisible(true)
    expect(paint).toHaveBeenLastCalledWith(1800)
    vi.advanceTimersByTime(6000)
    expect(paint).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    preview.dispose()
  })

  it('does no work offscreen and paints a single still for an idle visible card', () => {
    const paint = vi.fn(() => 0)
    const preview = createPreviewPlayback(paint)
    vi.advanceTimersByTime(1000)
    expect(paint).not.toHaveBeenCalled()
    preview.setVisible(true)
    expect(paint.mock.calls).toEqual([[750]])
    vi.advanceTimersByTime(10_000)
    expect(paint).toHaveBeenCalledTimes(1)
    preview.invalidate()
    expect(paint).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    preview.dispose()
  })

  it('animates only on interaction and immediately restores the still on leave', () => {
    const paint = vi.fn(() => 0)
    const preview = createPreviewPlayback(paint)
    preview.setVisible(true)
    preview.setActive(true)
    vi.advanceTimersByTime(500)
    expect(paint.mock.calls.length).toBeGreaterThan(5)
    expect(paint.mock.calls.length).toBeLessThan(16)
    preview.setActive(false)
    expect(paint).toHaveBeenLastCalledWith(750)
    const count = paint.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(paint).toHaveBeenCalledTimes(count)
    expect(vi.getTimerCount()).toBe(0)
    preview.dispose()
  })

  it('suspends hovered cards while offscreen or hidden and restarts deterministically', () => {
    const paint = vi.fn(() => 0)
    const preview = createPreviewPlayback(paint)
    preview.setActive(true)
    preview.setVisible(true)
    vi.advanceTimersByTime(100)
    preview.setVisible(false)
    const count = paint.mock.calls.length
    vi.advanceTimersByTime(2000)
    expect(paint).toHaveBeenCalledTimes(count)
    visibility(true)
    preview.setVisible(true)
    vi.advanceTimersByTime(2000)
    expect(paint).toHaveBeenCalledTimes(count)
    visibility(false)
    vi.advanceTimersByTime(1)
    expect(paint).toHaveBeenLastCalledWith(0)
    preview.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(listeners.get('visibilitychange')?.size).toBe(0)
    visibility(false)
    preview.invalidate()
    const disposedCount = paint.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(paint).toHaveBeenCalledTimes(disposedCount)
  })

  it('honors held frame delays and allows static brushes to sleep even while hovered', () => {
    const paint = vi.fn(() => 250)
    const preview = createPreviewPlayback(paint)
    preview.setVisible(true)
    preview.setActive(true)
    vi.advanceTimersByTime(1000)
    expect(paint).toHaveBeenCalledTimes(5)
    paint.mockReturnValue(Infinity)
    preview.invalidate()
    vi.advanceTimersByTime(1)
    const count = paint.mock.calls.length
    vi.advanceTimersByTime(10_000)
    expect(paint).toHaveBeenCalledTimes(count)
    expect(vi.getTimerCount()).toBe(0)
    preview.dispose()
  })
})
