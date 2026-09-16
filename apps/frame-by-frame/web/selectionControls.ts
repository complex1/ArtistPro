import { boundsCorners } from '../../drawing-canvas/web/engine/geometry'
import type { Bounds, Quad } from '../../drawing-canvas/web/engine/types'
import { dragTransform, hitTransformHandle, numericTransform, type Position, type TransformHandle } from '../../drawing-canvas/web/transformControls'

export type SelectionHandle = TransformHandle | 'rotate'
export type SelectionDrag = { bounds: Bounds; handle: SelectionHandle; quad: Quad; changed: boolean }

/** Rotation stays a fixed screen distance from the top edge at every zoom. */
export function rotationHandle(quad: Quad, zoom: number): Position {
  const top = { x: (quad[0].x + quad[1].x) / 2, y: (quad[0].y + quad[1].y) / 2 }
  const center = { x: (quad[0].x + quad[2].x) / 2, y: (quad[0].y + quad[2].y) / 2 }
  const length = Math.hypot(top.x - center.x, top.y - center.y) || 1
  return { x: top.x + (top.x - center.x) / length * 30 / zoom, y: top.y + (top.y - center.y) / length * 30 / zoom }
}

export function hitSelectionHandle(bounds: Bounds, point: Position, zoom: number): { id: SelectionHandle; cursor: string } | null {
  const quad = boundsCorners(bounds), rotate = rotationHandle(quad, zoom)
  if (Math.hypot(point.x - rotate.x, point.y - rotate.y) <= 11 / zoom) return { id: 'rotate', cursor: 'grab' }
  return hitTransformHandle(quad, 'resize', point, zoom)
}

export function dragSelection(bounds: Bounds, handle: SelectionHandle, start: Position, point: Position, lockAspect: boolean, shift: boolean): Quad {
  if (handle !== 'rotate') return dragTransform(bounds, 'resize', handle, start, point, lockAspect || shift)
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  if (Math.hypot(point.x - center.x, point.y - center.y) < 1e-6) return boundsCorners(bounds)
  const angle = (Math.atan2(point.y - center.y, point.x - center.x) - Math.atan2(start.y - center.y, start.x - center.x)) * 180 / Math.PI
  return numericTransform(bounds, 100, 100, shift ? Math.round(angle / 15) * 15 : angle, 0, 0)
}
