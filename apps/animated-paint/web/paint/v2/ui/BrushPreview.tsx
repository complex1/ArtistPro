import { cloneElement, useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { createDocumentV2 } from '../core/defaults'
import { animationSourceHash } from '../core/animationTiming'
import type { BrushV2 } from '../core/types'
import { snapshotStroke } from '../input/sampler'
import { onStampAssetReady } from '../render/canvas2d'
import { releaseRenderCache, renderDocumentV2 } from '../render/engine'
import { nextDocumentFrame } from '../render/timing'
import { createPreviewPlayback, PREVIEW_LOOP_MS } from './brushPreviewPlayback'
import { brushPreviewBackground } from './brushPreviewColor'
import { brushPreviewPoints } from './brushPreviewPath'
import './BrushPreview.css'

const WIDTH = 240
const HEIGHT = 128

function hasMotion(brush: BrushV2) {
  const timing = brush.animationTiming
  return brush.animated && !(timing?.mode === 'static' && timing.sourceHash === animationSourceHash(brush.animationJs))
}

export function BrushPreview({ brush, active = false }: { brush: BrushV2; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playbackRef = useRef<ReturnType<typeof createPreviewPlayback> | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const preview = createDocumentV2('Brush preview', WIDTH, HEIGHT)
    context.save()
    context.fillStyle = '#111111'
    context.fillStyle = brush.color
    const resolvedColor = context.fillStyle
    context.restore()
    preview.background = brushPreviewBackground(resolvedColor, brush.glow)
    const points = brushPreviewPoints(brush, WIDTH, HEIGHT)
    const stroke = snapshotStroke(brush, points, preview.layers[0].id, 29)
    stroke.createdAt = 0
    preview.layers[0].strokes = [stroke]
    const rasters = new Map()
    const timing = brush.animationTiming
    // Show enough of a one-shot reveal to recognize its stroke while idle.
    const stillMs = timing?.mode === 'once' && timing.settleSeconds >= 1
      ? Math.min(3000, (0.8 + timing.settleSeconds / Math.max(0.05, brush.speed)) * 650)
      : 750
    const playback = createPreviewPlayback((time) => {
      renderDocumentV2(context, preview, time, rasters, undefined, undefined, time)
      const delay = nextDocumentFrame(preview, time, time)
      return hasMotion(brush) && brush.speed > 0 ? Math.min(delay, PREVIEW_LOOP_MS - time) : delay
    }, stillMs)
    playbackRef.current = playback
    const unsubscribe = onStampAssetReady(playback.invalidate)
    const observer = new IntersectionObserver(([entry]) => {
      playback.setVisible(entry.isIntersecting)
      if (!entry.isIntersecting) releaseRenderCache(context)
    })
    observer.observe(canvas)
    return () => {
      playbackRef.current = null
      playback.dispose()
      observer.disconnect()
      unsubscribe()
      releaseRenderCache(context)
    }
  }, [brush])

  useEffect(() => { playbackRef.current?.setActive(active) }, [active, brush])

  return <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-hidden="true" data-preview-active={active} />
}

// A focused brush and a different hovered brush must not run two popup players.
let dismissCurrentPopup: (() => void) | undefined

export function BrushHoverPreview({ brush, children }: {
  brush: BrushV2
  children: ReactElement<{ 'aria-describedby'?: string }>
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hoveredRef = useRef(false)
  const focusedRef = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const id = useId()

  const ownDismiss = useCallback(() => {
    clearTimeout(timerRef.current)
    setPosition(null)
  }, [])

  const show = () => {
    const rect = anchorRef.current?.firstElementChild?.getBoundingClientRect()
    if (!rect || document.hidden) return
    const width = Math.min(256, window.innerWidth - 24)
    const height = width * HEIGHT / WIDTH + 48
    const desiredLeft = rect.right + width + 12 <= window.innerWidth - 12
      ? rect.right + 12
      : rect.left - width - 12
    dismissCurrentPopup?.()
    dismissCurrentPopup = ownDismiss
    setPosition({
      width,
      left: Math.max(12, Math.min(window.innerWidth - width - 12, desiredLeft)),
      top: Math.max(12, Math.min(window.innerHeight - height - 12, rect.top + rect.height / 2 - height / 2)),
    })
  }

  useEffect(() => () => {
    clearTimeout(timerRef.current)
    if (dismissCurrentPopup === ownDismiss) dismissCurrentPopup = undefined
  }, [ownDismiss])

  useEffect(() => {
    if (!position) return
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') ownDismiss() }
    const hidden = () => { if (document.hidden) ownDismiss() }
    document.addEventListener('keydown', keydown)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('resize', ownDismiss)
    window.addEventListener('scroll', ownDismiss, true)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('resize', ownDismiss)
      window.removeEventListener('scroll', ownDismiss, true)
    }
  }, [position, ownDismiss])

  return (
    <span
      ref={anchorRef}
      className="brush-hover-anchor"
      onMouseEnter={() => {
        hoveredRef.current = true
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(show, 140)
      }}
      onMouseLeave={() => {
        hoveredRef.current = false
        clearTimeout(timerRef.current)
        if (!focusedRef.current) ownDismiss()
      }}
      onFocus={(event) => {
        if (!(event.target instanceof HTMLElement) || !event.target.matches(':focus-visible')) return
        focusedRef.current = true
        clearTimeout(timerRef.current)
        show()
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        focusedRef.current = false
        if (!hoveredRef.current) ownDismiss()
      }}
    >
      {cloneElement(children, {
        'aria-describedby': position ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby'],
      })}
      {position ? createPortal(
        <div className="brush-hover-preview" role="tooltip" id={id} style={position}>
          <BrushPreview brush={brush} active />
          <div><strong>{brush.name}</strong><span>{hasMotion(brush) ? 'Animated preview' : 'Brush preview'}</span></div>
        </div>,
        document.body,
      ) : null}
    </span>
  )
}
