import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { nanoid } from 'nanoid'
import {
  boneWorldTransforms,
  createLayer,
  deformLayerVertices,
  getLayerWorldTransform,
  meshVertexLocalPosition,
  upsertMeshKeyframe,
  upsertKeyframe,
} from './engine'
import type { CharacterDocument, Transform, Vec2 } from './model'
import { drawCharacter, hitTestLayer, prepareAssets } from './render'
import {
  identityPose,
  type CanvasTool,
  type DocumentChange,
  type Selection,
  type WorkspaceMode,
} from './editorTypes'

type Props = {
  document: CharacterDocument
  posed: CharacterDocument
  mode: WorkspaceMode
  tool: CanvasTool
  selection: Selection
  onSelect: (selection: Selection) => void
  onChange: DocumentChange
  onCheckpoint: () => void
  frame: number
  color: string
  zoom: number
  showRig: boolean
  showMesh: boolean
  onError: (message: string) => void
  selectedVertex: number
  onVertexSelect: (index: number) => void
}
type Gesture = {
  kind:
    | 'layer'
    | 'bone'
    | 'controller'
    | 'vertex'
    | 'rotate'
    | 'draw'
    | 'rectangle'
    | 'ellipse'
    | 'new-bone'
  start: Vec2
  document: CharacterDocument
  posed: CharacterDocument
  id?: string
  vertex?: number
  points: Vec2[]
}
const point = (
  matrix: { a: number; b: number; c: number; d: number; e: number; f: number },
  p: Vec2,
) => ({
  x: matrix.a * p.x + matrix.c * p.y + matrix.e,
  y: matrix.b * p.x + matrix.d * p.y + matrix.f,
})
function localPoint(
  matrix: { a: number; b: number; c: number; d: number; e: number; f: number },
  p: Vec2,
): Vec2 {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (Math.abs(determinant) < 1e-8) return { x: 0, y: 0 }
  return {
    x:
      (matrix.d * (p.x - matrix.e) - matrix.c * (p.y - matrix.f)) / determinant,
    y:
      (-matrix.b * (p.x - matrix.e) + matrix.a * (p.y - matrix.f)) /
      determinant,
  }
}
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

export function CharacterStage({
  document: doc,
  posed,
  mode,
  tool,
  selection,
  onSelect,
  onChange,
  onCheckpoint,
  frame,
  color,
  zoom,
  showRig,
  showMesh,
  onError,
  selectedVertex,
  onVertexSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [draft, setDraft] = useState<Vec2[]>([])
  const [fit, setFit] = useState(0.7)
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setFit(
        Math.max(
          0.1,
          Math.min(
            (entry.contentRect.width - 100) / doc.width,
            (entry.contentRect.height - 80) / doc.height,
          ),
        ),
      ),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [doc.width, doc.height])
  useEffect(() => {
    let active = true
    const render = () => {
      const canvas = canvasRef.current
      if (!active || !canvas) return
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2,
        2048 / Math.max(doc.width, doc.height),
      )
      const width = Math.round(doc.width * ratio),
        height = Math.round(doc.height * ratio)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, doc.width, doc.height)
      drawCharacter(ctx, doc, posed)
    }
    void prepareAssets(doc)
      .then(render)
      .catch((error: unknown) => {
        if (active)
          onError(
            error instanceof Error ? error.message : 'Could not decode artwork',
          )
      })
    return () => {
      active = false
    }
  }, [doc, posed, onError])
  const scale = fit * zoom
  const size = (value: number) => value / scale
  const worlds = boneWorldTransforms(posed)
  const visible = (layerId: string): boolean => {
    let layer = posed.layers.find((layer) => layer.id === layerId)
    const seen = new Set<string>()
    while (layer) {
      if (!layer.visible || seen.has(layer.id)) return false
      seen.add(layer.id)
      layer = layer.parentId
        ? posed.layers.find((item) => item.id === layer!.parentId)
        : undefined
    }
    return true
  }
  const selectedLayer =
    selection?.type === 'layer' && visible(selection.id)
      ? posed.layers.find((layer) => layer.id === selection.id)
      : undefined
  const matrix = selectedLayer
    ? getLayerWorldTransform(posed, selectedLayer.id)
    : undefined
  const corners =
    selectedLayer && matrix
      ? [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([x, y]) =>
          point(matrix, {
            x: (x * selectedLayer.width) / 2,
            y: (y * selectedLayer.height) / 2,
          }),
        )
      : []
  const selectedVertices = selectedLayer?.mesh
    ? deformLayerVertices(doc, posed, selectedLayer.id)
    : []
  const bounds = selectedVertices.length ? selectedVertices : corners
  const minX = Math.min(...bounds.map((p) => p.x)),
    minY = Math.min(...bounds.map((p) => p.y)),
    maxX = Math.max(...bounds.map((p) => p.x)),
    maxY = Math.max(...bounds.map((p) => p.y))
  const rigVisible = showRig || mode === 'rig'
  const meshVisible = showMesh || mode === 'mesh'
  const meshEditing = mode === 'mesh' || (mode === 'animate' && showMesh)
  function position(event: ReactPointerEvent<SVGSVGElement>): Vec2 {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * doc.width,
      y: ((event.clientY - rect.top) / rect.height) * doc.height,
    }
  }
  function applyPose(
    base: CharacterDocument,
    targetType: 'layer' | 'bone' | 'controller',
    id: string,
    value: Transform,
  ): CharacterDocument {
    if (mode === 'animate')
      return upsertKeyframe(base, {
        id: nanoid(),
        targetType,
        targetId: id,
        frame: Math.round(frame),
        value,
        easing:
          base.keyframes.find(
            (key) =>
              key.targetId === id &&
              key.targetType === targetType &&
              key.frame === Math.round(frame),
          )?.easing ?? 'ease-in-out',
      })
    if (targetType === 'layer')
      return {
        ...base,
        layers: base.layers.map((layer) =>
          layer.id === id ? { ...layer, transform: value } : layer,
        ),
      }
    if (targetType === 'bone')
      return {
        ...base,
        bones: base.bones.map((bone) =>
          bone.id === id
            ? { ...bone, x: value.x, y: value.y, rotation: value.rotation }
            : bone,
        ),
      }
    return {
      ...base,
      controllers: base.controllers.map((control) =>
        control.id === id ? { ...control, x: value.x, y: value.y } : control,
      ),
    }
  }
  function start(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const p = position(event)
    const data = (event.target as Element).closest(
      '[data-handle]',
    ) as SVGElement | null
    const kind = data?.dataset.handle
    const id = data?.dataset.id
    let next: Gesture | null = null
    if (kind === 'vertex' && id && meshEditing) {
      onSelect({ type: 'layer', id })
      onVertexSelect(Number(data?.dataset.vertex))
      if (
        mode === 'mesh' &&
        doc.keyframes.some(
          (key) => key.targetType === 'mesh' && key.targetId === id,
        )
      ) {
        onError(
          'This layer has mesh animation. Switch to Animate to pose its points, or delete its mesh keys before editing the base mesh.',
        )
        return
      }
      if (!doc.layers.find((layer) => layer.id === id)?.locked)
        next = {
          kind: 'vertex',
          id,
          vertex: Number(data?.dataset.vertex),
          start: p,
          document: doc,
          posed,
          points: [],
        }
    } else if (kind === 'rotate' && selection?.type === 'layer')
      next = {
        kind: 'rotate',
        id: selection.id,
        start: p,
        document: doc,
        posed,
        points: [],
      }
    else if (tool === 'draw' || tool === 'rectangle' || tool === 'ellipse')
      next = { kind: tool, start: p, document: doc, posed, points: [p] }
    else if (tool === 'bone')
      next = { kind: 'new-bone', start: p, document: doc, posed, points: [p] }
    else if ((kind === 'bone' || kind === 'controller') && id) {
      onSelect({ type: kind, id })
      next = { kind, id, start: p, document: doc, posed, points: [] }
    } else {
      const hit = hitTestLayer(doc, posed, p)
      onSelect(hit ? { type: 'layer', id: hit } : null)
      if (
        !meshEditing &&
        hit &&
        !doc.layers.find((layer) => layer.id === hit)?.locked
      )
        next = {
          kind: 'layer',
          id: hit,
          start: p,
          document: doc,
          posed,
          points: [],
        }
    }
    if (next) {
      onCheckpoint()
      gesture.current = next
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current
    if (!g) return
    const p = position(event)
    if (
      g.kind === 'draw' ||
      g.kind === 'ellipse' ||
      g.kind === 'rectangle' ||
      g.kind === 'new-bone'
    ) {
      g.points = g.kind === 'draw' ? [...g.points, p] : [g.start, p]
      setDraft(g.points)
      return
    }
    if (g.kind === 'layer' || g.kind === 'rotate') {
      const layer = g.posed.layers.find((layer) => layer.id === g.id)
      if (!layer) return
      const transform = { ...layer.transform }
      if (g.kind === 'rotate') {
        const center = point(getLayerWorldTransform(g.posed, layer.id), {
          x: 0,
          y: 0,
        })
        transform.rotation +=
          ((Math.atan2(p.y - center.y, p.x - center.x) -
            Math.atan2(g.start.y - center.y, g.start.x - center.x)) *
            180) /
          Math.PI
      } else {
        const parent = layer.parentId
          ? getLayerWorldTransform(g.posed, layer.parentId)
          : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
        const a = localPoint(parent, g.start),
          b = localPoint(parent, p)
        transform.x += b.x - a.x
        transform.y += b.y - a.y
      }
      onChange(applyPose(g.document, 'layer', layer.id, transform), false)
    } else if (g.kind === 'vertex') {
      const layer = g.document.layers.find((layer) => layer.id === g.id)
      if (!layer?.mesh) return
      const index = g.vertex!
      const original = deformLayerVertices(g.document, g.posed, layer.id)[index]
      if (!original) return
      const position = meshVertexLocalPosition(
        g.document,
        g.posed,
        layer.id,
        index,
        {
          x: original.x + p.x - g.start.x,
          y: original.y + p.y - g.start.y,
        },
      )
      if (!position) {
        onError(
          'This point is collapsed by its current transforms. Adjust its layer or bone pose before moving it.',
        )
        return
      }
      if (mode === 'animate') {
        const vertices = (
          g.posed.layers.find((item) => item.id === layer.id)?.mesh?.vertices ??
          layer.mesh.vertices
        ).map((point) => ({ ...point }))
        vertices[index] = position
        const next = upsertMeshKeyframe(g.document, {
          targetId: layer.id,
          frame: Math.round(frame),
          vertices,
          easing:
            g.document.keyframes.find(
              (key) =>
                key.targetType === 'mesh' &&
                key.targetId === layer.id &&
                key.frame === Math.round(frame),
            )?.easing ?? 'ease-in-out',
        })
        onChange(next, false)
      } else {
        onChange(
          {
            ...g.document,
            layers: g.document.layers.map((item) =>
              item.id === layer.id
                ? {
                    ...item,
                    mesh: {
                      ...item.mesh!,
                      vertices: item.mesh!.vertices.map((point, i) =>
                        i === index ? position : point,
                      ),
                    },
                  }
                : item,
            ),
          },
          false,
        )
      }
    } else {
      const controller =
        g.kind === 'controller'
          ? g.posed.controllers.find((control) => control.id === g.id)
          : undefined
      if (controller?.kind === 'ik') {
        onChange(
          applyPose(g.document, 'controller', controller.id, {
            ...identityPose(),
            x: controller.x + p.x - g.start.x,
            y: controller.y + p.y - g.start.y,
          }),
          false,
        )
        return
      }
      const bone = g.posed.bones.find(
        (bone) => bone.id === (controller?.boneId ?? g.id),
      )
      if (!bone) return
      const world = boneWorldTransforms(g.posed),
        origin = world[bone.id].start
      const angle =
        (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI -
        (bone.parentId ? world[bone.parentId].rotation : 0)
      onChange(
        applyPose(g.document, 'bone', bone.id, {
          ...identityPose(),
          x: bone.x,
          y: bone.y,
          rotation: angle,
        }),
        false,
      )
    }
  }
  function end(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current
    if (!g) return
    const p = position(event)
    if (g.kind === 'new-bone' && distance(g.start, p) > 5) {
      const parentId = selection?.type === 'bone' ? selection.id : null
      const parent = parentId ? boneWorldTransforms(g.document)[parentId] : null
      const rotation = parent?.rotation ?? 0
      const radians = (-rotation * Math.PI) / 180
      const offset = {
        x: g.start.x - (parent?.end.x ?? 0),
        y: g.start.y - (parent?.end.y ?? 0),
      }
      const id = nanoid()
      const bone = {
        id,
        name: `Bone ${g.document.bones.length + 1}`,
        parentId,
        x: offset.x * Math.cos(radians) - offset.y * Math.sin(radians),
        y: offset.x * Math.sin(radians) + offset.y * Math.cos(radians),
        length: distance(g.start, p),
        rotation:
          (Math.atan2(p.y - g.start.y, p.x - g.start.x) * 180) / Math.PI -
          rotation,
      }
      onChange({ ...g.document, bones: [...g.document.bones, bone] }, false)
      onSelect({ type: 'bone', id })
    } else if (
      (g.kind === 'ellipse' || g.kind === 'rectangle' || g.kind === 'draw') &&
      (g.kind === 'draw'
        ? g.points.length > 2 &&
          g.points.some((point) => distance(g.start, point) > 3)
        : distance(g.start, p) > 3)
    ) {
      const points = g.kind === 'draw' ? g.points : [g.start, p]
      const left = Math.min(...points.map((p) => p.x)),
        top = Math.min(...points.map((p) => p.y)),
        right = Math.max(...points.map((p) => p.x)),
        bottom = Math.max(...points.map((p) => p.y))
      const layer = createLayer(
        g.kind === 'draw' ? 'path' : g.kind,
        `${g.kind === 'draw' ? 'Drawing' : g.kind === 'ellipse' ? 'Ellipse' : 'Rectangle'} ${g.document.layers.length + 1}`,
      )
      layer.width = Math.max(2, right - left)
      layer.height = Math.max(2, bottom - top)
      layer.fill = color
      layer.transform = {
        ...identityPose(),
        x: (left + right) / 2,
        y: (top + bottom) / 2,
      }
      if (g.kind === 'draw')
        layer.path = points.map((p) => ({
          x: p.x - layer.transform.x,
          y: p.y - layer.transform.y,
        }))
      onChange({ ...g.document, layers: [...g.document.layers, layer] }, false)
      onSelect({ type: 'layer', id: layer.id })
    }
    gesture.current = null
    setDraft([])
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return (
    <div className={`lc-viewport tool-${tool}`} ref={viewportRef}>
      <div
        className="lc-artboard"
        style={{ width: doc.width * scale, height: doc.height * scale }}
      >
        <canvas ref={canvasRef} aria-label="Character artwork" />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${doc.width} ${doc.height}`}
          aria-label="Interactive character canvas"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => {
            if (gesture.current) onChange(gesture.current.document, false)
            gesture.current = null
            setDraft([])
          }}
        >
          {meshVisible &&
            doc.layers
              .filter(
                (layer) =>
                  visible(layer.id) &&
                  layer.mesh &&
                  (!meshEditing || layer.id === selection?.id),
              )
              .map((layer) => {
                const vertices = deformLayerVertices(doc, posed, layer.id)
                return (
                  <g key={layer.id} className="lc-mesh-overlay">
                    {layer.mesh!.triangles.map((triangle, i) => (
                      <polygon
                        key={i}
                        points={triangle
                          .map(
                            (index) =>
                              `${vertices[index].x},${vertices[index].y}`,
                          )
                          .join(' ')}
                        fill="none"
                        stroke="#57bdc7"
                        strokeWidth={size(0.65)}
                        opacity=".7"
                        pointerEvents="none"
                      />
                    ))}
                    {meshEditing &&
                      vertices.map((vertex, i) => (
                        <circle
                          key={i}
                          cx={vertex.x}
                          cy={vertex.y}
                          r={size(i === selectedVertex ? 4.5 : 3)}
                          fill={i === selectedVertex ? '#d4bbff' : '#15242b'}
                          stroke={i === selectedVertex ? '#f6eaff' : '#7cead7'}
                          strokeWidth={size(1)}
                          data-handle="vertex"
                          data-id={layer.id}
                          data-vertex={i}
                        />
                      ))}
                  </g>
                )
              })}
          {selectedLayer && bounds.length > 0 && !meshEditing && (
            <g pointerEvents="none" stroke="#a795ff" strokeWidth={size(1)}>
              <rect
                x={minX - size(5)}
                y={minY - size(5)}
                width={maxX - minX + size(10)}
                height={maxY - minY + size(10)}
                fill="none"
                strokeDasharray={`${size(4)} ${size(3)}`}
              />
              {!selectedLayer.locked && (
                <>
                  <line
                    x1={(minX + maxX) / 2}
                    x2={(minX + maxX) / 2}
                    y1={minY - size(5)}
                    y2={minY - size(22)}
                  />
                  <circle
                    cx={(minX + maxX) / 2}
                    cy={minY - size(24)}
                    r={size(5)}
                    fill="#a795ff"
                    pointerEvents="all"
                    data-handle="rotate"
                  />
                </>
              )}
            </g>
          )}
          {rigVisible &&
            posed.bones.map((bone) => {
              const world = worlds[bone.id]
              const dx = world.end.x - world.start.x,
                dy = world.end.y - world.start.y,
                len = Math.max(1, Math.hypot(dx, dy)),
                w = size(5)
              const selected = selection?.id === bone.id
              return (
                <g
                  key={bone.id}
                  data-handle="bone"
                  data-id={bone.id}
                  className="lc-bone-handle"
                  pointerEvents={meshEditing ? 'none' : undefined}
                >
                  <line
                    x1={world.start.x}
                    y1={world.start.y}
                    x2={world.end.x}
                    y2={world.end.y}
                    stroke="transparent"
                    strokeWidth={size(18)}
                  />
                  <polygon
                    points={`${world.start.x},${world.start.y} ${world.start.x + dx * 0.2 - (dy / len) * w},${world.start.y + dy * 0.2 + (dx / len) * w} ${world.end.x},${world.end.y} ${world.start.x + dx * 0.2 + (dy / len) * w},${world.start.y + dy * 0.2 - (dx / len) * w}`}
                    fill={selected ? '#a998ff99' : '#62d6c933'}
                    stroke={selected ? '#d1c5ff' : '#6be2d1'}
                    strokeWidth={size(1.3)}
                  />
                  <circle
                    cx={world.start.x}
                    cy={world.start.y}
                    r={size(3.5)}
                    fill="#182929"
                    stroke="#6be2d1"
                    strokeWidth={size(1.2)}
                  />
                  <circle
                    cx={world.end.x}
                    cy={world.end.y}
                    r={size(3)}
                    fill="#6be2d1"
                  />
                </g>
              )
            })}
          {(rigVisible || mode === 'animate') &&
            posed.controllers.map((control) => {
              const p =
                control.kind === 'bone' &&
                control.boneId &&
                worlds[control.boneId]
                  ? worlds[control.boneId].end
                  : control
              return (
                <g
                  key={control.id}
                  data-handle="controller"
                  data-id={control.id}
                  className="lc-controller-handle"
                  pointerEvents={meshEditing ? 'none' : undefined}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={size(13)}
                    fill={
                      selection?.id === control.id ? '#beabff55' : '#231d3644'
                    }
                    stroke={control.kind === 'ik' ? '#f7b872' : '#c1a3ff'}
                    strokeWidth={size(1.5)}
                    strokeDasharray={
                      control.kind === 'ik'
                        ? `${size(3)} ${size(2)}`
                        : undefined
                    }
                  />
                  <circle cx={p.x} cy={p.y} r={size(2)} fill="#eadfff" />
                  {selection?.id === control.id && (
                    <text
                      x={p.x + size(19)}
                      y={p.y + size(4)}
                      fill="#e0d6ff"
                      stroke="#24242e"
                      strokeWidth={size(3)}
                      paintOrder="stroke"
                      fontSize={size(10)}
                    >
                      {control.name}
                    </text>
                  )}
                </g>
              )
            })}
          {draft.length > 1 &&
            (tool === 'draw' ? (
              <polyline
                points={draft.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={color}
                fillOpacity=".65"
                stroke={color}
                strokeWidth={size(2)}
              />
            ) : tool === 'bone' ? (
              <line
                x1={draft[0].x}
                y1={draft[0].y}
                x2={draft[1].x}
                y2={draft[1].y}
                stroke="#6be2d1"
                strokeWidth={size(3)}
              />
            ) : tool === 'ellipse' ? (
              <ellipse
                cx={(draft[0].x + draft[1].x) / 2}
                cy={(draft[0].y + draft[1].y) / 2}
                rx={Math.abs(draft[1].x - draft[0].x) / 2}
                ry={Math.abs(draft[1].y - draft[0].y) / 2}
                fill={color}
                opacity=".7"
              />
            ) : (
              <rect
                x={Math.min(draft[0].x, draft[1].x)}
                y={Math.min(draft[0].y, draft[1].y)}
                width={Math.abs(draft[0].x - draft[1].x)}
                height={Math.abs(draft[0].y - draft[1].y)}
                fill={color}
                opacity=".7"
              />
            ))}
        </svg>
      </div>
      {!doc.layers.length && (
        <div className="lc-canvas-empty">
          <strong>A character starts with a shape.</strong>
          <span>Draw a part or upload your artwork to begin.</span>
        </div>
      )}
    </div>
  )
}
