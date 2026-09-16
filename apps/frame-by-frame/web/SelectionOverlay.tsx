import type { Quad, Selection } from '../../drawing-canvas/web/engine/types'
import { transformHandles } from '../../drawing-canvas/web/transformControls'
import { rotationHandle } from './selectionControls'

export function SelectionOutline({ selection }: { selection: Selection }) {
  if (selection.kind === 'lasso') return <polygon points={selection.points.map(point => `${point.x},${point.y}`).join(' ')} />
  if (selection.kind === 'ellipse') return <ellipse cx={selection.bounds.x + selection.bounds.width / 2} cy={selection.bounds.y + selection.bounds.height / 2} rx={selection.bounds.width / 2} ry={selection.bounds.height / 2} />
  return <rect {...selection.bounds} />
}

export function SelectionOverlay({ quad, zoom }: { quad: Quad; zoom: number }) {
  const rotation = rotationHandle(quad, zoom), size = 8 / zoom
  return <g className="fbf-transform-overlay" data-selection-transform="true">
    <polygon points={quad.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#557df2" strokeWidth={1 / zoom} />
    <line x1={(quad[0].x + quad[1].x) / 2} y1={(quad[0].y + quad[1].y) / 2} x2={rotation.x} y2={rotation.y} stroke="#557df2" strokeWidth={1 / zoom} />
    {transformHandles(quad, 'resize').map(handle => <rect key={handle.id} data-transform-handle={handle.id} aria-label={`Resize ${handle.label.toLowerCase()}`} x={handle.position.x - size / 2} y={handle.position.y - size / 2} width={size} height={size} rx={1 / zoom} fill="white" stroke="#557df2" strokeWidth={1.5 / zoom}><title>{handle.label} · drag to resize</title></rect>)}
    <circle data-transform-handle="rotate" aria-label="Rotate selection" cx={rotation.x} cy={rotation.y} r={5 / zoom} fill="#557df2" stroke="white" strokeWidth={1.5 / zoom}><title>Drag to rotate · Shift snaps to 15°</title></circle>
  </g>
}
