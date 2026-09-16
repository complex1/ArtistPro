import { homographyForQuad, projectPoint, quadBounds } from './engine/geometry'
import type { Bounds, Quad } from './engine/types'
import { transformHandles, type TransformMode } from './transformControls'

export function TransformOverlay({ bounds, quad, mode, zoom, invalid }: {
  bounds: Bounds; quad: Quad; mode: TransformMode; zoom: number; invalid: boolean
}) {
  const matrix = homographyForQuad(bounds, quad)
  const handleSize = 8 / zoom
  const outline = quad.map(point => `${point.x},${point.y}`).join(' ')
  const extent = quadBounds(quad)
  const grid = matrix ? [1 / 3, 2 / 3].flatMap(part => [
    [projectPoint(matrix, { x: bounds.x + bounds.width * part, y: bounds.y }), projectPoint(matrix, { x: bounds.x + bounds.width * part, y: bounds.y + bounds.height })],
    [projectPoint(matrix, { x: bounds.x, y: bounds.y + bounds.height * part }), projectPoint(matrix, { x: bounds.x + bounds.width, y: bounds.y + bounds.height * part })],
  ]) : []
  return <g className={`dc-transform-overlay ${invalid ? 'is-invalid' : ''}`}>
    <polygon className="dc-transform-boundary-under" points={outline} />
    <polygon className="dc-transform-boundary" points={outline} />
    <g className="dc-transform-grid">{grid.map(([start, end], index) => <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />)}</g>
    {transformHandles(quad, mode).map(handle => <rect key={handle.id} data-transform-handle={handle.id} aria-label={`${mode} ${handle.label.toLowerCase()} handle`} className="dc-transform-handle" x={handle.position.x - handleSize / 2} y={handle.position.y - handleSize / 2} width={handleSize} height={handleSize} rx={mode === 'perspective' ? handleSize / 2 : 1 / zoom}><title>{handle.label}</title></rect>)}
    <g transform={`translate(${quad[0].x} ${quad[0].y - 26 / zoom}) scale(${1 / zoom})`} className="dc-transform-measure">
      <rect x={-1} y={0} width={112} height={19} rx={4} />
      <text x={55} y={13} textAnchor="middle">{Math.round(extent.width)} × {Math.round(extent.height)} px</text>
    </g>
  </g>
}
