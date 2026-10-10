import { useEffect } from 'react'
import { activeAnimation, useEditorStore } from '../store/editorStore'

/**
 * The document evaluator draws each frame from the playhead. A monotonic browser
 * clock advances it without mutating SVG attributes or requiring a tween engine.
 */
export function PlaybackClock() {
  const playing = useEditorStore((state) => state.playing)
  const looping = useEditorStore((state) => state.looping)
  const duration = useEditorStore((state) => activeAnimation(state).duration)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  useEffect(() => {
    if (!playing) return
    const length = Math.max(duration, 0.001)
    const initial = Math.min(useEditorStore.getState().playhead, length)
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const elapsed = initial + (now - started) / 1000
      if (!looping && elapsed >= length) {
        setPlayhead(duration)
        setPlaying(false)
        return
      }
      setPlayhead(looping ? elapsed % length : elapsed)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, looping, duration, setPlayhead, setPlaying])

  return null
}
