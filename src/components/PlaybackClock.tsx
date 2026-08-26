import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { activeAnimation, useEditorStore } from '../store/editorStore'

gsap.registerPlugin(useGSAP)

/**
 * GSAP owns the clock. The document evaluator still draws each frame from the
 * playhead, so a canvas clear cannot fight tweened SVG attributes.
 */
export function PlaybackClock() {
  const playing = useEditorStore((state) => state.playing)
  const looping = useEditorStore((state) => state.looping)
  const duration = useEditorStore((state) => activeAnimation(state).duration)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const host = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!playing) return
      const timeline = gsap.timeline({
        repeat: looping ? -1 : 0,
        onUpdate: () => setPlayhead(timeline.time()),
        onComplete: () => setPlaying(false),
      })
      timeline.to({}, { duration: Math.max(duration, 0.001), ease: 'none' })
      timeline.time(useEditorStore.getState().playhead)
      return () => timeline.kill()
    },
    {
      scope: host,
      dependencies: [playing, looping, duration],
      revertOnUpdate: true,
    },
  )

  return <div ref={host} className="playback-clock" hidden />
}
