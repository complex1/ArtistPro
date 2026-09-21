/** No RAF spin while idle. Invalidation wakes immediately, animation waits. */
export function createPaintScheduler(paint: (time: number) => number, fps = 30) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let raf = 0
  let stopped = false
  let paused = false
  const cancel = () => { clearTimeout(timer); timer = undefined; cancelAnimationFrame(raf); raf = 0 }
  const tick = (time: number) => {
    raf = 0
    if (stopped || paused || document.hidden) return
    const delay = paint(time)
    if (Number.isFinite(delay)) timer = setTimeout(() => {
      timer = undefined; raf = requestAnimationFrame(tick)
    }, Math.max(0, Math.max(1000 / fps, delay) - (performance.now() - time) - 1))
  }
  const invalidate = () => {
    if (stopped || paused || document.hidden) return
    clearTimeout(timer); timer = undefined
    if (!raf) raf = requestAnimationFrame(tick)
  }
  const visibility = () => { cancel(); if (!document.hidden) invalidate() }
  document.addEventListener('visibilitychange', visibility)
  invalidate()
  return {
    invalidate,
    setPaused(value: boolean) { paused = value; cancel(); if (!paused) invalidate() },
    dispose() { stopped = true; cancel(); document.removeEventListener('visibilitychange', visibility) },
  }
}
