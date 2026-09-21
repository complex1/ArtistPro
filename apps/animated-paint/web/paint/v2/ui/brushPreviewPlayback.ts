import { createPaintScheduler } from '../render/scheduler'

export const PREVIEW_LOOP_MS = 6000
// A representative still also shows reveal brushes, whose first frame is tiny.
const STILL_MS = 750

/** Visibility and interaction are separate: idle cards never keep a timer alive. */
export function createPreviewPlayback(paint: (time: number) => number, stillMs = STILL_MS) {
  let active = false
  let visible = false
  let disposed = false
  let startedAt: number | undefined
  const scheduler = createPaintScheduler((now) => {
    if (!active) { paint(stillMs); return Infinity }
    startedAt ??= now
    return paint((now - startedAt) % PREVIEW_LOOP_MS)
  }, 24)
  scheduler.setPaused(true)

  const synchronize = () => {
    if (disposed) return
    scheduler.setPaused(true)
    startedAt = undefined
    if (!visible || document.hidden) return
    if (active) scheduler.setPaused(false)
    else paint(stillMs)
  }
  document.addEventListener('visibilitychange', synchronize)

  return {
    setActive(value: boolean) {
      if (active === value) return
      active = value
      synchronize()
    },
    setVisible(value: boolean) {
      if (visible === value) return
      visible = value
      synchronize()
    },
    invalidate() {
      if (disposed || !visible || document.hidden) return
      if (active) scheduler.invalidate()
      else paint(stillMs)
    },
    dispose() {
      disposed = true
      scheduler.dispose()
      document.removeEventListener('visibilitychange', synchronize)
    },
  }
}
