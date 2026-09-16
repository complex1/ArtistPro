import { boundsCorners } from './engine/geometry'
import type { Bounds, Quad } from './engine/types'

export type TransformMode = 'resize' | 'skew' | 'perspective'
export type TransformHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'
export type Position = { x: number; y: number }
export type HandleDefinition = { id: Exclude<TransformHandle, 'move'>; position: Position; cursor: string; label: string }

const cornerDefinitions = [
  { id: 'nw', cursor: 'nwse-resize', label: 'Top left', index: 0 },
  { id: 'ne', cursor: 'nesw-resize', label: 'Top right', index: 1 },
  { id: 'se', cursor: 'nwse-resize', label: 'Bottom right', index: 2 },
  { id: 'sw', cursor: 'nesw-resize', label: 'Bottom left', index: 3 },
] as const
const edgeDefinitions = [
  { id: 'n', cursor: 'ns-resize', label: 'Top', first: 0, second: 1 },
  { id: 'e', cursor: 'ew-resize', label: 'Right', first: 1, second: 2 },
  { id: 's', cursor: 'ns-resize', label: 'Bottom', first: 2, second: 3 },
  { id: 'w', cursor: 'ew-resize', label: 'Left', first: 3, second: 0 },
] as const

export function transformHandles(quad: Quad, mode: TransformMode): HandleDefinition[] {
  const corners: HandleDefinition[] = cornerDefinitions.map(corner => ({ id: corner.id, position: quad[corner.index], cursor: mode === 'perspective' ? 'crosshair' : corner.cursor, label: corner.label }))
  const edges: HandleDefinition[] = edgeDefinitions.map(edge => ({
    id: edge.id, position: { x: (quad[edge.first].x + quad[edge.second].x) / 2, y: (quad[edge.first].y + quad[edge.second].y) / 2 },
    cursor: mode === 'skew' ? edge.id === 'n' || edge.id === 's' ? 'ew-resize' : 'ns-resize' : edge.cursor, label: edge.label,
  }))
  return mode === 'perspective' ? corners : mode === 'skew' ? edges : [...corners, ...edges]
}

/** Hit targets remain comfortable at every canvas zoom level. */
export function hitTransformHandle(quad: Quad, mode: TransformMode, point: Position, zoom: number): HandleDefinition | null {
  let closest: HandleDefinition | null = null
  let distance = 12 / zoom
  for (const handle of transformHandles(quad, mode)) {
    const next = Math.hypot(handle.position.x - point.x, handle.position.y - point.y)
    if (next <= distance) { closest = handle; distance = next }
  }
  return closest
}

export function insideTransformQuad(quad: Quad, point: Position): boolean {
  let sign = 0
  for (let index = 0; index < 4; index++) {
    const a = quad[index], b = quad[(index + 1) % 4]
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
    if (Math.abs(cross) < 1e-8) continue
    if (sign && Math.sign(cross) !== sign) return false
    sign = Math.sign(cross)
  }
  return true
}

/** Each gesture uses its initial box, keeping the opposite handle anchored. */
export function dragTransform(bounds: Bounds, mode: TransformMode, handle: TransformHandle, start: Position, next: Position, keepAspect = false): Quad {
  const quad = boundsCorners(bounds)
  const dx = next.x - start.x, dy = next.y - start.y
  if (!dx && !dy) return quad
  if (handle === 'move') return quad.map(point => ({ x: point.x + dx, y: point.y + dy })) as unknown as Quad
  if (mode === 'perspective') {
    const index = cornerDefinitions.find(corner => corner.id === handle)?.index
    return quad.map((point, current) => current === index ? { x: point.x + dx, y: point.y + dy } : { ...point }) as unknown as Quad
  }
  if (mode === 'skew') {
    return quad.map((point, index) => ({
      x: point.x + ((handle === 'n' && index < 2) || (handle === 's' && index >= 2) ? dx : 0),
      y: point.y + ((handle === 'e' && (index === 1 || index === 2)) || (handle === 'w' && (index === 0 || index === 3)) ? dy : 0),
    })) as unknown as Quad
  }
  let left = bounds.x, top = bounds.y, right = bounds.x + bounds.width, bottom = bounds.y + bounds.height
  const horizontal = handle.includes('w') || handle.includes('e')
  const vertical = handle.includes('n') || handle.includes('s')
  if (handle.includes('w')) left = Math.min(right - 1, left + dx)
  if (handle.includes('e')) right = Math.max(left + 1, right + dx)
  if (handle.includes('n')) top = Math.min(bottom - 1, top + dy)
  if (handle.includes('s')) bottom = Math.max(top + 1, bottom + dy)
  if (keepAspect && bounds.width > 0 && bounds.height > 0) {
    const scaleX = (right - left) / bounds.width, scaleY = (bottom - top) / bounds.height
    const scale = Math.max(1 / bounds.width, 1 / bounds.height,
      horizontal && vertical ? Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY : horizontal ? scaleX : scaleY)
    const width = bounds.width * scale, height = bounds.height * scale
    if (handle.includes('w')) left = right - width
    else if (handle.includes('e')) right = left + width
    else { left = bounds.x + (bounds.width - width) / 2; right = left + width }
    if (handle.includes('n')) top = bottom - height
    else if (handle.includes('s')) bottom = top + height
    else { top = bounds.y + (bounds.height - height) / 2; bottom = top + height }
  }
  return boundsCorners({ x: left, y: top, width: right - left, height: bottom - top })
}

export function numericTransform(bounds: Bounds, widthPercent: number, heightPercent: number, rotation: number, skewX: number, skewY: number): Quad {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const angle = rotation * Math.PI / 180
  const shearX = Math.tan(skewX * Math.PI / 180), shearY = Math.tan(skewY * Math.PI / 180)
  return boundsCorners(bounds).map(point => {
    const x = (point.x - center.x) * widthPercent / 100, y = (point.y - center.y) * heightPercent / 100
    const u = x + shearX * y, v = y + shearY * x
    return { x: center.x + u * Math.cos(angle) - v * Math.sin(angle), y: center.y + u * Math.sin(angle) + v * Math.cos(angle) }
  }) as unknown as Quad
}

/** Reflect around the visible content/selection center, preserving its position. */
export function flipTransform(bounds: Bounds, axis: 'horizontal' | 'vertical'): Quad {
  const corners = boundsCorners(bounds)
  return axis === 'horizontal'
    ? [corners[1], corners[0], corners[3], corners[2]]
    : [corners[3], corners[2], corners[1], corners[0]]
}
