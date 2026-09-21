import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { ImageLayerV2Data } from '../core/types'
import { moveImageRect, resizeImageRect, type ImageResizeCorner } from '../input/imageTransform'
import './ImageLayerTransform.css'

type TransformDrag = {
  pointerId: number
  target: HTMLElement
  startX: number
  startY: number
  zoom: number
  corner: ImageResizeCorner | null
  original: ImageLayerV2Data
  latest: ImageLayerV2Data
}

function sameBounds(a: ImageLayerV2Data, b: ImageLayerV2Data) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

const CORNERS: { id: ImageResizeCorner; label: string }[] = [
  { id: 'nw', label: 'top left' },
  { id: 'ne', label: 'top right' },
  { id: 'sw', label: 'bottom left' },
  { id: 'se', label: 'bottom right' },
]

export function ImageLayerTransform({
  image,
  zoom,
  onChange,
  onCommit,
}: {
  image: ImageLayerV2Data
  zoom: number
  onChange: (image: ImageLayerV2Data) => void
  /** The image before the gesture, for one undo entry per completed gesture. */
  onCommit: (original: ImageLayerV2Data) => void
}) {
  const helpId = useId()
  const dragRef = useRef<TransformDrag | null>(null)
  const callbacksRef = useRef({ onChange, onCommit })
  useLayoutEffect(() => {
    callbacksRef.current = { onChange, onCommit }
  }, [onChange, onCommit])

  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      const drag = dragRef.current
      if (event.key !== 'Escape' || !drag) return
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = null
      if (drag.target.hasPointerCapture(drag.pointerId)) {
        drag.target.releasePointerCapture(drag.pointerId)
      }
      callbacksRef.current.onChange(drag.original)
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [])

  const start = (event: PointerEvent<HTMLElement>, corner: ImageResizeCorner | null) => {
    if (event.button !== 0 || dragRef.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      zoom,
      corner,
      original: image,
      latest: image,
    }
  }

  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    const bounds = dx === 0 && dy === 0
      ? drag.original
      : drag.corner
        ? resizeImageRect(drag.original, drag.corner, dx, dy, drag.zoom)
        : moveImageRect(drag.original, dx, dy, drag.zoom)
    const next = { ...drag.original, ...bounds }
    if (!sameBounds(next, drag.latest)) {
      drag.latest = next
      onChange(next)
    }
  }

  const finish = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    move(event)
    dragRef.current = null
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!sameBounds(drag.original, drag.latest)) onCommit(drag.original)
  }

  const cancel = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    dragRef.current = null
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onChange(drag.original)
  }

  const keyMove = (event: KeyboardEvent<HTMLElement>, corner: ImageResizeCorner | null) => {
    if (dragRef.current || event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    if (!dx && !dy) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = corner
      ? resizeImageRect(image, corner, dx, dy, 1)
      : moveImageRect(image, dx, dy, 1)
    const next = { ...image, ...bounds }
    if (!sameBounds(image, next)) {
      onChange(next)
      onCommit(image)
    }
  }

  const dragEvents = {
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  }

  return (
    <div
      className="paint-image-transform"
      role="group"
      aria-label="Image layer transform"
      style={{ left: image.x * zoom, top: image.y * zoom, width: image.width * zoom, height: image.height * zoom }}
    >
      <span className="paint-image-transform-help" id={helpId}>
        Drag to move. Drag a corner to resize with the same proportions. Arrow keys move; hold Shift for larger steps. Escape cancels a drag.
      </span>
      <div
        className="paint-image-transform-body"
        role="button"
        tabIndex={0}
        aria-label="Move image"
        aria-describedby={helpId}
        onPointerDown={(event) => start(event, null)}
        onKeyDown={(event) => keyMove(event, null)}
        {...dragEvents}
      />
      {CORNERS.map((corner) => (
        <button
          key={corner.id}
          type="button"
          className={`paint-image-transform-handle is-${corner.id}`}
          aria-label={`Resize image from ${corner.label}`}
          title={`Resize from ${corner.label}`}
          onPointerDown={(event) => start(event, corner.id)}
          onKeyDown={(event) => keyMove(event, corner.id)}
          {...dragEvents}
        />
      ))}
    </div>
  )
}
