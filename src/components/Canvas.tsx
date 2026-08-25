import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { SVG, type Element as SvgElement, type G, type Svg } from '@svgdotjs/svg.js'
import { Maximize, Minus, Plus } from 'lucide-react'
import { filterPrimitives, imageAdjustmentPrimitives } from '../model/effects'
import {
  generateGridPrimitives,
  gridColorGroups,
  guideFamilyColor,
  snapPointToPrimitives,
} from '../model/grid'
import type { GridPrimitive } from '../model/grid'
import {
  canDeletePathPoint,
  createPath,
  createPathPoint,
  moveHandle,
  pathData,
  setHandleMode,
} from '../model/path'
import { brushPathData, createBrushStroke } from '../model/brush'
import { fitFreehandPath } from '../model/freehandPath'
import { createText, naturalTextWidth } from '../model/text'
import { applyMotionPaths, evaluateChannels } from '../model/animation'
import {
  dragDelta,
  findNode,
  localBounds,
  parentAffine,
  resizeFactor,
  resizeNode,
  selectionTarget,
} from '../model/scene'
import type { Box } from '../model/scene'
import {
  composeTransform,
  invertPoint,
  multiplyAffine,
  rotationFromPoints,
  transformPoint,
  transformToAffine,
} from '../model/transform'
import type {
  EditorNode,
  GridSettings,
  HandleMode,
  ImageNode,
  PathNode,
  PathPoint,
  TextNode,
  Tool,
  Transform,
  Vec2,
} from '../model/types'
import { dragRoots, useEditorStore } from '../store/editorStore'
import { IconButton } from '../ui/controls'

type SvgParent = Svg | G

function pathTrimAttributes(node: PathNode) {
  const start = Math.max(0, Math.min(1, node.trimStart ?? 0))
  const end = Math.max(0, Math.min(1, node.trimEnd ?? 1))
  const visible = end >= start ? end - start : 1 - start + end
  return {
    pathLength: 1,
    'stroke-dasharray':
      visible >= 1 - 1e-6 ? 'none' : `${visible} ${1 - visible}`,
    'stroke-dashoffset': -(start + (node.trimOffset ?? 0)),
  }
}

function shapeCursor(tool: Tool, locked: boolean): string {
  if (
    tool === 'pen' ||
    tool === 'brush' ||
    tool === 'pencil' ||
    tool === 'text'
  ) return 'crosshair'
  if (locked) return 'not-allowed'
  return tool === 'node' ? 'pointer' : 'move'
}

type PointMenu = {
  pathId: string
  pointId: string
  x: number
  y: number
}

export type CanvasHandle = {
  exportSvg: () => string
}

export const Canvas = forwardRef<CanvasHandle>(function Canvas(_, ref) {
  const workspaceRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const drawRef = useRef<Svg | null>(null)
  const [draftPathId, setDraftPathId] = useState<string | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [pointMenu, setPointMenu] = useState<PointMenu | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [snapHint, setSnapHint] = useState<Vec2 | null>(null)
  const document = useEditorStore((state) => state.document)
  const mode = useEditorStore((state) => state.mode)
  const playhead = useEditorStore((state) => state.playhead)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const select = useEditorStore((state) => state.select)
  const selectMany = useEditorStore((state) => state.selectMany)
  const updateNode = useEditorStore((state) => state.updateNode)
  const editTransform = useEditorStore((state) => state.editTransform)
  const addNode = useEditorStore((state) => state.addNode)
  const removeNode = useEditorStore((state) => state.removeNode)
  const tool = useEditorStore((state) => state.tool)
  const setTool = useEditorStore((state) => state.setTool)
  const brushSettings = useEditorStore((state) => state.brushSettings)
  const pencilSettings = useEditorStore((state) => state.pencilSettings)
  const zoom = useEditorStore((state) => state.zoom)
  const setZoom = useEditorStore((state) => state.setZoom)
  const updateArtboard = useEditorStore((state) => state.updateArtboard)
  const pan = useEditorStore((state) => state.pan)
  const setPan = useEditorStore((state) => state.setPan)
  const setViewport = useEditorStore((state) => state.setViewport)

  // Points are only editable through the path tool or the in-progress pen
  // stroke, so switching tools or selecting elsewhere puts them away.
  const focused =
    selectedIds.length === 1
      ? findNode(document.children, selectedIds[0])
      : undefined
  const editingPathId =
    draftPathId ??
    (tool === 'node' && focused?.type === 'path' ? focused.id : null)

  const beginViewportPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (tool !== 'pan' || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const origin = { x: event.clientX, y: event.clientY, pan }
    setIsPanning(true)

    const move = (moveEvent: PointerEvent) => {
      setPan({
        x: origin.pan.x + moveEvent.clientX - origin.x,
        y: origin.pan.y + moveEvent.clientY - origin.y,
      })
    }
    const stop = () => {
      setIsPanning(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  // React registers wheel handlers passively on the root, so the zoom gesture
  // needs its own listener to stop the browser from scrolling the page.
  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = workspace.getBoundingClientRect()
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? bounds.height
            : 1
      const { zoom, pan, setViewport } = useEditorStore.getState()
      const nextZoom = Math.min(
        4,
        Math.max(0.1, zoom * Math.exp(-event.deltaY * unit * 0.0015)),
      )
      if (nextZoom === zoom) return
      // Keeps the artboard point under the cursor pinned while the scale changes.
      const relative = {
        x: event.clientX - bounds.left - bounds.width / 2,
        y: event.clientY - bounds.top - bounds.height / 2,
      }
      const ratio = nextZoom / zoom
      setViewport(nextZoom, {
        x: relative.x - ratio * (relative.x - pan.x),
        y: relative.y - ratio * (relative.y - pan.y),
      })
    }

    workspace.addEventListener('wheel', onWheel, { passive: false })
    return () => workspace.removeEventListener('wheel', onWheel)
  }, [])

  const fitCanvas = () => {
    const bounds = workspaceRef.current?.getBoundingClientRect()
    if (!bounds) return
    const nextZoom = Math.min(
      4,
      Math.max(
        0.1,
        Math.min(
          (bounds.width - 96) / document.artboard.width,
          (bounds.height - 96) / document.artboard.height,
        ),
      ),
    )
    setViewport(nextZoom, { x: 0, y: 0 })
  }

  useImperativeHandle(ref, () => ({
    exportSvg: () => {
      const source = drawRef.current?.svg() ?? ''
      if (!source) return ''
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml')
      parsed.querySelectorAll('[data-editor-overlay]').forEach((node) => node.remove())
      return new XMLSerializer().serializeToString(parsed.documentElement)
    },
  }))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pointMenu) {
        setPointMenu(null)
        return
      }
      if (
        draftPathId &&
        (event.key === 'Enter' || event.key === 'Escape')
      ) {
        const node = findNode(
          useEditorStore.getState().document.children,
          draftPathId,
        )
        setDraftPathId(null)
        if (node?.type === 'path' && node.points.length < 2) {
          removeNode(node.id)
          setTool('select')
          return
        }
        if (node?.type === 'path') {
          select(node.id)
          setSelectedPointId(node.points.at(-1)?.id ?? null)
          setTool('node')
        }
        return
      }
      if (event.key === 'Escape' && tool === 'node') {
        setSelectedPointId(null)
        setTool('select')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draftPathId, pointMenu, removeNode, select, setTool, tool])

  useEffect(() => {
    if (!draftPathId || tool === 'pen') return
    const node = findNode(document.children, draftPathId)
    if (node?.type === 'path' && node.points.length < 2) removeNode(node.id)
    const timeout = window.setTimeout(() => setDraftPathId(null), 0)
    return () => window.clearTimeout(timeout)
  }, [document.children, draftPathId, removeNode, tool])

  useLayoutEffect(() => {
    if (!hostRef.current) return
    const draw = drawRef.current ?? SVG().addTo(hostRef.current).size('100%', '100%')
    drawRef.current = draw
    draw.clear()
    draw.viewbox(0, 0, document.artboard.width, document.artboard.height)
    draw.attr({ 'aria-label': `${document.name} artboard` })

    const motion = mode === 'animate' || mode === 'preview'
    // Two poses: `scene` is what the viewer sees, `channelScene` is the pose
    // underneath the motion-path layer. Painting and hit-testing follow the
    // former; anything that writes a transform back has to follow the latter,
    // or the path offset gets baked into the value it edits. Draw resolves
    // paths too, at their rest progress, so a follower sits in the same place
    // in both modes.
    const channelScene = motion
      ? evaluateChannels(document.children, document.animation, playhead)
      : document.children
    const scene = applyMotionPaths(channelScene)

    const channelTransform = (id: string, rendered: Transform): Transform =>
      findNode(channelScene, id)?.transform ?? rendered

    // Rewrites a transform derived from the rendered pose into the channel it
    // belongs to by peeling off the motion-path contribution.
    const toChannelTransform = (
      id: string,
      rendered: Transform,
      next: Transform,
    ): Transform => {
      const channel = channelTransform(id, rendered)
      return {
        ...next,
        position: {
          x: next.position.x - (rendered.position.x - channel.position.x),
          y: next.position.y - (rendered.position.y - channel.position.y),
        },
        rotation: next.rotation - (rendered.rotation - channel.rotation),
      }
    }

    const grid = document.artboard.grid
    const gridPrimitives = grid.enabled
      ? generateGridPrimitives(
          grid,
          document.artboard.width,
          document.artboard.height,
        )
      : []
    // The threshold is a screen distance, so it shrinks in artboard units as the
    // viewport zooms in. The hint lives in React state because every snapped
    // move repaints the canvas from scratch.
    const snapPoint = (point: Vec2): Vec2 => {
      if (!grid.enabled || !grid.snap) return point
      const snapped = snapPointToPrimitives(
        point,
        gridPrimitives,
        grid.snapThreshold / zoom,
      )
      setSnapHint(snapped?.point ?? null)
      return snapped?.point ?? point
    }

    const updatePathPoint = (
      path: PathNode,
      pointId: string,
      update: (point: PathPoint) => PathPoint,
    ) => {
      updateNode(path.id, {
        points: path.points.map((point) =>
          point.id === pointId ? update(point) : point,
        ),
      })
    }

    const beginPenPoint = (event: PointerEvent) => {
      if (tool !== 'pen') return false
      event.preventDefault()
      event.stopPropagation()
      setPointMenu(null)
      const canvasPoint = snapPoint(draw.point(event.clientX, event.clientY))
      setSnapHint(null)
      const liveNodes = useEditorStore.getState().document.children
      const draft = draftPathId ? findNode(liveNodes, draftPathId) : undefined

      if (draft?.type !== 'path') {
        const path = createPath(canvasPoint)
        addNode(path)
        setDraftPathId(path.id)
        setSelectedPointId(path.points[0].id)
        const first = path.points[0]
        const move = (moveEvent: PointerEvent) => {
          const current = draw.point(moveEvent.clientX, moveEvent.clientY)
          const handle = {
            x: current.x - canvasPoint.x,
            y: current.y - canvasPoint.y,
          }
          const live = findNode(
            useEditorStore.getState().document.children,
            path.id,
          )
          if (live?.type !== 'path') return
          updatePathPoint(live, first.id, (point) => ({
            ...point,
            handleMode: Math.hypot(handle.x, handle.y) > 2 / zoom
              ? 'symmetric'
              : 'none',
            handleOut:
              Math.hypot(handle.x, handle.y) > 2 / zoom
                ? handle
                : { x: 0, y: 0 },
            handleIn:
              Math.hypot(handle.x, handle.y) > 2 / zoom
                ? { x: -handle.x, y: -handle.y }
                : { x: 0, y: 0 },
          }))
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return true
      }

      const matrix = multiplyAffine(
        parentAffine(liveNodes, draft.id),
        transformToAffine(draft.transform),
      )
      const point = invertPoint(matrix, canvasPoint)
      const first = draft.points[0]
      if (
        draft.points.length >= 3 &&
        Math.hypot(point.x - first.anchor.x, point.y - first.anchor.y) <=
          10 / zoom
      ) {
        updateNode(draft.id, { closed: true })
        setDraftPathId(null)
        select(draft.id)
        setSelectedPointId(first.id)
        setTool('node')
        return true
      }

      const added = createPathPoint(point)
      updateNode(draft.id, { points: [...draft.points, added] })
      setSelectedPointId(added.id)
      const origin = point
      const move = (moveEvent: PointerEvent) => {
        const current = invertPoint(
          matrix,
          draw.point(moveEvent.clientX, moveEvent.clientY),
        )
        const handle = {
          x: current.x - origin.x,
          y: current.y - origin.y,
        }
        const live = findNode(
          useEditorStore.getState().document.children,
          draft.id,
        )
        if (live?.type !== 'path') return
        updatePathPoint(live, added.id, (pathPoint) => ({
          ...pathPoint,
          handleMode: Math.hypot(handle.x, handle.y) > 2 / zoom
            ? 'symmetric'
            : 'none',
          handleOut:
            Math.hypot(handle.x, handle.y) > 2 / zoom
              ? handle
              : { x: 0, y: 0 },
          handleIn:
            Math.hypot(handle.x, handle.y) > 2 / zoom
              ? { x: -handle.x, y: -handle.y }
              : { x: 0, y: 0 },
        }))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return true
    }

    const beginBrushStroke = (event: PointerEvent) => {
      if (tool !== 'brush') return false
      event.preventDefault()
      event.stopPropagation()
      const origin = draw.point(event.clientX, event.clientY)
      const stroke = createBrushStroke(
        origin,
        { x: 0, y: 0, pressure: event.pressure || 0.5 },
        brushSettings,
        event.pointerType !== 'pen',
      )
      addNode(stroke)
      const matrix = transformToAffine(stroke.transform)

      const move = (moveEvent: PointerEvent) => {
        const live = findNode(
          useEditorStore.getState().document.children,
          stroke.id,
        )
        if (live?.type !== 'brush') return
        const point = invertPoint(
          matrix,
          draw.point(moveEvent.clientX, moveEvent.clientY),
        )
        const previous = live.samples.at(-1)
        if (
          previous &&
          Math.hypot(point.x - previous.x, point.y - previous.y) < 0.5 / zoom
        ) {
          return
        }
        updateNode(live.id, {
          samples: [
            ...live.samples,
            {
              ...point,
              pressure: moveEvent.pressure || 0.5,
            },
          ],
        })
      }
      const up = () => {
        const live = findNode(
          useEditorStore.getState().document.children,
          stroke.id,
        )
        if (live?.type === 'brush') updateNode(live.id, { complete: true })
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      return true
    }

    const beginPencilStroke = (event: PointerEvent) => {
      if (tool !== 'pencil') return false
      event.preventDefault()
      event.stopPropagation()
      const origin = draw.point(event.clientX, event.clientY)
      const points: Vec2[] = [{ x: 0, y: 0 }]
      const preview = draw
        .path(`M ${origin.x} ${origin.y}`)
        .fill('none')
        .stroke({ color: '#4f8cff', width: 2, linecap: 'round', linejoin: 'round' })
        .attr({
          class: 'pencil-path-preview',
          'pointer-events': 'none',
          'data-editor-overlay': 'pencil-preview',
        })

      const updatePreview = () => {
        preview.plot(
          `M ${points.map((point) => `${point.x + origin.x} ${point.y + origin.y}`).join(' L ')}`,
        )
      }
      const move = (moveEvent: PointerEvent) => {
        const world = draw.point(moveEvent.clientX, moveEvent.clientY)
        const point = { x: world.x - origin.x, y: world.y - origin.y }
        const previous = points.at(-1)!
        if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.5 / zoom) {
          return
        }
        points.push(point)
        updatePreview()
      }
      const cleanup = () => {
        preview.remove()
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
      }
      const up = () => {
        cleanup()
        const fitted = fitFreehandPath(points, pencilSettings.smoothing)
        if (fitted.length < 2) return
        const path = createPath(origin, fitted[0])
        path.name = 'Pencil path'
        path.points = fitted
        addNode(path)
      }
      const cancel = () => cleanup()
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
      return true
    }

    const beginText = (event: PointerEvent) => {
      if (tool !== 'text') return false
      event.preventDefault()
      event.stopPropagation()
      const node = createText(snapPoint(draw.point(event.clientX, event.clientY)))
      setSnapHint(null)
      addNode(node)
      setEditingTextId(node.id)
      setTool('select')
      return true
    }

    const beginDrag = (node: EditorNode, event: PointerEvent, nextIds: string[]) => {
      if (node.locked || tool !== 'select') return
      const origins = dragRoots(channelScene, nextIds).map((item) => ({
        id: item.id,
        transform: structuredClone(item.transform),
      }))
      const grabbed = draw.point(event.clientX, event.clientY)
      const move = (moveEvent: PointerEvent) => {
        const pointer = snapPoint(draw.point(moveEvent.clientX, moveEvent.clientY))
        const canvasDelta = {
          x: pointer.x - grabbed.x,
          y: pointer.y - grabbed.y,
        }
        const state = useEditorStore.getState()
        const liveMotion = state.mode === 'animate' || state.mode === 'preview'
        const liveChannels = liveMotion
          ? evaluateChannels(
              state.document.children,
              state.document.animation,
              state.playhead,
            )
          : state.document.children
        const liveScene = applyMotionPaths(liveChannels)
        const liveRoots = dragRoots(liveChannels, nextIds)
        for (const origin of origins) {
          const live = liveRoots.find((item) => item.id === origin.id)
          if (!live) continue
          const delta = dragDelta(liveScene, origin.id, canvasDelta)
          editTransform(origin.id, {
            ...live.transform,
            position: {
              x: origin.transform.position.x + delta.x,
              y: origin.transform.position.y + delta.y,
            },
          })
        }
      }
      const up = () => {
        setSnapHint(null)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

    const beginResize = (node: EditorNode, handle: Vec2, event: PointerEvent) => {
      if (node.locked || tool !== 'select') return
      event.preventDefault()
      event.stopPropagation()
      const start = structuredClone(node)
      const bounds = localBounds(start)
      const anchor = {
        x:
          handle.x > bounds.x + bounds.width / 2
            ? bounds.x
            : bounds.x + bounds.width,
        y:
          handle.y > bounds.y + bounds.height / 2
            ? bounds.y
            : bounds.y + bounds.height,
      }
      const localMatrix = multiplyAffine(
        parentAffine(scene, node.id),
        transformToAffine(start.transform),
      )
      const move = (moveEvent: PointerEvent) => {
        const canvasPoint = snapPoint(
          draw.point(moveEvent.clientX, moveEvent.clientY),
        )
        const point = invertPoint(localMatrix, canvasPoint)
        const factor = resizeFactor(
          bounds,
          anchor,
          handle,
          point,
          moveEvent.shiftKey,
        )
        const resized = resizeNode(start, factor, anchor)
        const { transform, ...patch } = resized
        updateNode(node.id, patch)
        editTransform(
          node.id,
          toChannelTransform(node.id, start.transform, transform),
        )
      }
      const up = () => {
        setSnapHint(null)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

    const beginRotate = (node: EditorNode, event: PointerEvent) => {
      if (node.locked || tool !== 'select') return
      event.preventDefault()
      event.stopPropagation()
      const startTransform = structuredClone(node.transform)
      const parentMatrix = parentAffine(scene, node.id)
      const start = invertPoint(
        parentMatrix,
        draw.point(event.clientX, event.clientY),
      )
      const move = (moveEvent: PointerEvent) => {
        const current = invertPoint(
          parentMatrix,
          draw.point(moveEvent.clientX, moveEvent.clientY),
        )
        editTransform(
          node.id,
          toChannelTransform(node.id, startTransform, {
            ...startTransform,
            rotation: rotationFromPoints(
              startTransform,
              start,
              current,
              moveEvent.shiftKey,
            ),
          }),
        )
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

    // A stroke selects itself as it is drawn; the box would flash and grow
    // under the cursor, so the brush keeps the canvas clear until you leave it.
    const showOutline = tool !== 'brush' && mode !== 'preview'

    const drawTextEditor = (parent: SvgParent, node: TextNode) => {
      const editor = parent
        .foreignObject(Math.max(80, node.width), node.fontSize * 1.35)
        .move(0, 0)
        .attr({
          transform: composeTransform(node.transform),
          opacity: node.transform.opacity,
          'data-editor-overlay': 'text-editor',
        })
      const input = globalThis.document.createElementNS(
        'http://www.w3.org/1999/xhtml',
        'input',
      ) as HTMLInputElement
      input.className = 'canvas-text-editor'
      input.setAttribute('aria-label', 'Edit text')
      input.value = node.text
      input.style.fontFamily = node.fontFamily
      input.style.fontSize = `${node.fontSize}px`
      input.style.fontWeight = String(node.fontWeight)
      input.style.letterSpacing = `${node.letterSpacing}px`
      input.style.textAlign = node.textAlign

      let cancelled = false
      input.addEventListener('pointerdown', (event) => event.stopPropagation())
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          input.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelled = true
          input.blur()
        }
      })
      input.addEventListener('blur', () => {
        setEditingTextId(null)
        if (cancelled) return
        const text = input.value || 'Text'
        updateNode(node.id, {
          text,
          width: naturalTextWidth(text, node),
        })
      })
      editor.node.appendChild(input)
      window.requestAnimationFrame(() => {
        input.focus()
        input.select()
      })
    }

    const paint = (parent: SvgParent, node: EditorNode) => {
      if (!node.visible) return

      const onDown = (event: Event) => {
        const pointer = event as PointerEvent
        if (beginText(pointer)) return
        if (beginBrushStroke(pointer)) return
        if (beginPencilStroke(pointer)) return
        if (beginPenPoint(pointer)) return
        pointer.stopPropagation()
        if (tool === 'node') {
          // The path tool reaches straight for the shape, never its group.
          select(node.id)
          setSelectedPointId(null)
          return
        }
        const targetId = selectionTarget(scene, node.id, selectedIds)
        const target = findNode(document.children, targetId) ?? node
        const additive = pointer.shiftKey || pointer.metaKey || pointer.ctrlKey
        const already = selectedIds.includes(target.id)
        const nextIds = additive
          ? already
            ? selectedIds.filter((id) => id !== target.id)
            : [...selectedIds, target.id]
          : already && selectedIds.length > 1
            ? selectedIds
            : [target.id]
        if (additive) select(target.id, true)
        else if (!(already && selectedIds.length > 1)) select(target.id)
        beginDrag(target, pointer, nextIds)
      }

      const onDoubleClick = (event: Event) => {
        event.stopPropagation()
        select(node.id)
        if (node.type === 'path') {
          setSelectedPointId(node.points[0]?.id ?? null)
          setTool('node')
        } else if (node.type === 'text') {
          setEditingTextId(node.id)
        }
      }

      if (node.type === 'group') {
        const group = parent.group()
        group.attr({
          id: node.id,
          transform: composeTransform(node.transform),
          opacity: node.transform.opacity,
          cursor: shapeCursor(tool, node.locked),
        })
        group.on('pointerdown', onDown)
        const content = group.group()
        applyEffects(draw, content, node)
        node.children.forEach((child) => paint(content, child))
        if (selectedIds.includes(node.id) && showOutline) {
          drawOutline(group, node, zoom, true, {
            interactive:
              selectedIds.length === 1 && tool === 'select' && !node.locked,
            onResize: (handle, event) => beginResize(node, handle, event),
            onRotate: (event) => beginRotate(node, event),
          })
        }
        return
      }

      if (node.type === 'image') {
        const group = parent.group().attr({
          id: node.id,
          transform: composeTransform(node.transform),
          opacity: node.transform.opacity,
          cursor: shapeCursor(tool, node.locked),
        })
        group.on('pointerdown', onDown).on('dblclick', onDoubleClick)
        const content = group.group()
        applyEffects(draw, content, node)
        const scaleX = node.width / Math.max(1, node.crop.width)
        const scaleY = node.height / Math.max(1, node.crop.height)
        const clip = draw.clip().add(draw.rect(node.width, node.height).move(0, 0))
        const image = content
          .image(node.processedSource ?? node.source)
          .size(node.naturalWidth * scaleX, node.naturalHeight * scaleY)
          .move(-node.crop.x * scaleX, -node.crop.y * scaleY)
          .attr({ preserveAspectRatio: 'none' })
          .clipWith(clip)
        applyImageAdjustments(draw, image, node)
        if (selectedIds.includes(node.id) && showOutline) {
          drawOutline(parent, node, zoom, false, {
            interactive:
              selectedIds.length === 1 && tool === 'select' && !node.locked,
            onResize: (handle, event) => beginResize(node, handle, event),
            onRotate: (event) => beginRotate(node, event),
          })
        }
        return
      }

      const element =
        node.type === 'rect'
          ? parent.rect(node.width, node.height).radius(node.rx, node.ry)
          : node.type === 'ellipse'
            ? parent.ellipse(node.rx * 2, node.ry * 2).move(0, 0)
            : node.type === 'path'
              ? parent.path(pathData(node))
              : node.type === 'brush'
                ? parent.path(brushPathData(node))
                : parent.text(node.text)

      element
        .attr({
          id: node.id,
          fill: node.type === 'brush' ? node.settings.color : node.fill,
          stroke: node.type === 'brush' ? 'none' : node.stroke,
          'stroke-width': node.type === 'brush' ? 0 : node.strokeWidth,
          ...(node.type === 'path' ? pathTrimAttributes(node) : {}),
          opacity: node.transform.opacity,
          transform: composeTransform(node.transform),
          cursor: shapeCursor(tool, node.locked),
          ...(node.type === 'text'
            ? {
                x:
                  node.textAlign === 'left'
                    ? 0
                    : node.textAlign === 'center'
                      ? node.width / 2
                      : node.width,
                y: 0,
                'font-family': node.fontFamily,
                'font-size': node.fontSize,
                'font-weight': node.fontWeight,
                'letter-spacing': node.letterSpacing,
                'text-anchor':
                  node.textAlign === 'left'
                    ? 'start'
                    : node.textAlign === 'center'
                      ? 'middle'
                      : 'end',
                'dominant-baseline': 'text-before-edge',
                textLength: node.width,
                lengthAdjust: 'spacingAndGlyphs',
              }
            : {}),
        })
        .on('pointerdown', onDown)
        .on('dblclick', onDoubleClick)
      applyEffects(draw, element, node)
      if (node.type === 'text' && editingTextId === node.id) {
        drawTextEditor(parent, node)
      }

      if (
        selectedIds.includes(node.id) &&
        editingPathId !== node.id &&
        editingTextId !== node.id &&
        showOutline
      ) {
        drawOutline(parent, node, zoom, false, {
          interactive:
            selectedIds.length === 1 && tool === 'select' && !node.locked,
          onResize: (handle, event) => beginResize(node, handle, event),
          onRotate: (event) => beginRotate(node, event),
        })
      }
    }

    draw
      .rect(document.artboard.width, document.artboard.height)
      .fill(document.artboard.background)
      .attr({
        cursor:
          tool === 'pen' || tool === 'brush' || tool === 'pencil' || tool === 'text'
            ? 'crosshair'
            : 'default',
      })
      .on('pointerdown', (event) => {
        const pointer = event as PointerEvent
        if (beginText(pointer)) return
        if (beginBrushStroke(pointer)) return
        if (beginPencilStroke(pointer)) return
        if (beginPenPoint(pointer)) return
        if (tool !== 'select') {
          select(null)
          return
        }
        const origin = draw.point(pointer.clientX, pointer.clientY)
        const marquee = draw
          .rect(0, 0)
          .fill('#4f8cff18')
          .stroke({ color: '#4f8cff', width: 1 / zoom })
          .attr({ 'data-editor-overlay': 'marquee', 'pointer-events': 'none' })

        const move = (moveEvent: PointerEvent) => {
          const current = draw.point(moveEvent.clientX, moveEvent.clientY)
          const x = Math.min(origin.x, current.x)
          const y = Math.min(origin.y, current.y)
          marquee
            .size(Math.abs(current.x - origin.x), Math.abs(current.y - origin.y))
            .move(x, y)
        }
        const up = (upEvent: PointerEvent) => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          const end = draw.point(upEvent.clientX, upEvent.clientY)
          const box = {
            x: Math.min(origin.x, end.x),
            y: Math.min(origin.y, end.y),
            width: Math.abs(end.x - origin.x),
            height: Math.abs(end.y - origin.y),
          }
          marquee.remove()
          if (box.width < 3 && box.height < 3) {
            select(null)
            return
          }
          selectMany(hitIds(scene, box))
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      })

    if (grid.enabled) {
      for (const group of gridColorGroups(gridPrimitives, grid)) {
        if (!group.data) continue
        draw
          .path(group.data)
          .fill('none')
          .stroke({ color: group.color, width: 1 / zoom })
          .attr({
            opacity: grid.opacity,
            'pointer-events': 'none',
            'data-editor-overlay': 'grid',
          })
      }
    }

    if (snapHint) {
      draw
        .circle(8 / zoom)
        .center(snapHint.x, snapHint.y)
        .fill('none')
        .stroke({ color: grid.color, width: 1.5 / zoom })
        .attr({
          'pointer-events': 'none',
          'data-editor-overlay': 'snap-marker',
        })
    }

    // The SVG viewport is allowed to overflow so guide handles stay reachable
    // outside the artboard, so artwork gets its own clip to the page bounds.
    const artwork = draw.group().clipWith(
      draw.clip().add(
        draw.rect(document.artboard.width, document.artboard.height).move(0, 0),
      ),
    )
    scene.forEach((node) => paint(artwork, node))

    // Handles paint last so they stay on top of the artwork they guide.
    // A locked grid still draws and snaps; only the controls freeze.
    if (grid.enabled && !grid.locked && mode !== 'preview') {
      const workspaceBox = workspaceRef.current?.getBoundingClientRect()
      let view: Box | null = null
      if (workspaceBox && workspaceBox.width > 0 && workspaceBox.height > 0) {
        const topLeft = draw.point(workspaceBox.left, workspaceBox.top)
        const bottomRight = draw.point(workspaceBox.right, workspaceBox.bottom)
        view = {
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        }
      }
      drawGridHandles(
        draw,
        grid,
        gridPrimitives,
        document.artboard,
        zoom,
        view,
        (update) => updateArtboard({ grid: { ...grid, ...update } as typeof grid }),
      )
    }
    const editingNode = editingPathId
      ? findNode(scene, editingPathId)
      : undefined
    draw.off('pointermove.pen-preview')
    if (editingNode?.type === 'path') {
      drawPathEditor(draw, editingNode, scene, zoom, {
        drawing: draftPathId === editingNode.id,
        selectedPointId: editingNode.points.some(
          (point) => point.id === selectedPointId,
        )
          ? selectedPointId
          : null,
        onSelectPoint: setSelectedPointId,
        onUpdatePoint: (pointId, update) =>
          updatePathPoint(editingNode, pointId, update),
        onContextMenu: (pointId, event) => {
          event.preventDefault()
          event.stopPropagation()
          setSelectedPointId(pointId)
          setPointMenu({
            pathId: editingNode.id,
            pointId,
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 180)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - 245)),
          })
        },
        onDrawPoint: beginPenPoint,
      })
      if (draftPathId === editingNode.id) {
        const matrix = multiplyAffine(
          parentAffine(document.children, editingNode.id),
          transformToAffine(editingNode.transform),
        )
        const last = editingNode.points.at(-1)
        const preview = draw
          .path('')
          .fill('none')
          .stroke({
            color: editingNode.stroke,
            width: editingNode.strokeWidth,
            dasharray: '5 4',
          })
          .attr({
            transform: `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.tx} ${matrix.ty})`,
            'pointer-events': 'none',
            'data-editor-overlay': 'path-preview',
          })
        draw.on('pointermove.pen-preview', (event) => {
          if (!last) return
          const pointer = event as PointerEvent
          const point = invertPoint(
            matrix,
            draw.point(pointer.clientX, pointer.clientY),
          )
          preview.plot(
            pathData({
              points: [
                last,
                {
                  ...last,
                  id: 'preview',
                  anchor: point,
                  handleIn: { x: 0, y: 0 },
                  handleOut: { x: 0, y: 0 },
                  handleMode: 'none',
                },
              ],
              closed: false,
            }),
          )
        })
      }
    }
  }, [
    addNode,
    document,
    draftPathId,
    editingPathId,
    editingTextId,
    editTransform,
    mode,
    brushSettings,
    pencilSettings,
    playhead,
    select,
    selectMany,
    selectedIds,
    selectedPointId,
    setTool,
    snapHint,
    tool,
    updateArtboard,
    updateNode,
    zoom,
  ])

  const menuScene =
    mode === 'animate' || mode === 'preview'
      ? evaluateChannels(document.children, document.animation, playhead)
      : document.children
  const menuPath =
    pointMenu && pointMenu.pathId === editingPathId
      ? findNode(menuScene, pointMenu.pathId)
      : undefined
  const menuPoint =
    menuPath?.type === 'path'
      ? menuPath.points.find((point) => point.id === pointMenu?.pointId)
      : undefined

  const choosePointMode = (mode: HandleMode) => {
    if (menuPath?.type !== 'path' || !menuPoint) return
    updateNode(menuPath.id, {
      points: menuPath.points.map((point) =>
        point.id === menuPoint.id ? setHandleMode(point, mode) : point,
      ),
    })
    setPointMenu(null)
  }

  const deleteMenuPoint = () => {
    if (
      menuPath?.type !== 'path' ||
      !menuPoint ||
      !canDeletePathPoint(menuPath)
    ) {
      return
    }
    updateNode(menuPath.id, {
      points: menuPath.points.filter((point) => point.id !== menuPoint.id),
    })
    setSelectedPointId(null)
    setPointMenu(null)
  }

  return (
    <main
      ref={workspaceRef}
      className={`workspace${tool === 'pan' ? ' is-pan-tool' : ''}${isPanning ? ' is-panning' : ''}`}
      onPointerDownCapture={beginViewportPan}
      onPointerDown={() => setPointMenu(null)}
    >
      <div
        className="artboard"
        ref={hostRef}
        style={{
          width: document.artboard.width,
          height: document.artboard.height,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
        }}
      />
      <div className="zoom-controls">
        <IconButton icon={Minus} label="Zoom out" onClick={() => setZoom(zoom - 0.1)} />
        <span>{Math.round(zoom * 100)}%</span>
        <IconButton icon={Plus} label="Zoom in" onClick={() => setZoom(zoom + 0.1)} />
        <IconButton icon={Maximize} label="Fit canvas" onClick={fitCanvas} />
      </div>
      {pointMenu && menuPoint && menuPath?.type === 'path' && (
        <div
          className="point-context-menu"
          role="menu"
          aria-label="Point options"
          style={{ left: pointMenu.x, top: pointMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="point-context-label">Curve style</span>
          {(
            [
              ['symmetric', 'Symmetric'],
              ['asymmetric', 'Asymmetric'],
              ['disconnected', 'Disconnected'],
              ['none', 'No curve'],
            ] as const
          ).map(([mode, label]) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={menuPoint.handleMode === mode}
              className={menuPoint.handleMode === mode ? 'is-active' : ''}
              key={mode}
              onClick={() => choosePointMode(mode)}
            >
              {label}
            </button>
          ))}
          <span className="point-context-label">Point</span>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={!canDeletePathPoint(menuPath)}
            onClick={deleteMenuPoint}
          >
            Delete
          </button>
        </div>
      )}
    </main>
  )
})

const svgNamespace = 'http://www.w3.org/2000/svg'

function applyEffects(draw: Svg, element: SvgElement, node: EditorNode) {
  const primitives = filterPrimitives(node.effects)
  if (primitives.length === 0) return

  let defs = draw.node.querySelector(':scope > defs')
  if (!defs) {
    defs = globalThis.document.createElementNS(svgNamespace, 'defs')
    draw.node.insertBefore(defs, draw.node.firstChild)
  }

  const id = `effects-${node.id}`
  const filter = globalThis.document.createElementNS(svgNamespace, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('x', '-50%')
  filter.setAttribute('y', '-50%')
  filter.setAttribute('width', '200%')
  filter.setAttribute('height', '200%')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  for (const primitive of primitives) {
    const element = globalThis.document.createElementNS(
      svgNamespace,
      primitive.tag,
    )
    for (const [name, value] of Object.entries(primitive.attributes)) {
      element.setAttribute(name, String(value))
    }
    filter.appendChild(element)
  }

  defs.appendChild(filter)
  element.attr('filter', `url(#${id})`)
}

/**
 * Draggable control points for the active grid. Everything here is editor
 * chrome, so each handle carries the overlay marker that export strips.
 */
function drawGridHandles(
  draw: Svg,
  grid: GridSettings,
  primitives: GridPrimitive[],
  artboard: { width: number; height: number },
  zoom: number,
  view: Box | null,
  onChange: (update: Partial<GridSettings>) => void,
) {
  const addHandle = (
    position: Vec2,
    label: string,
    onMove: (point: Vec2) => void,
    cursor = 'move',
    color = grid.color,
  ) => {
    // Vanishing points routinely sit far outside the artboard, so off-screen
    // handles are parked at the edge of the visible workspace instead of
    // becoming unreachable.
    const margin = 16 / zoom
    const anchor = view
      ? {
          x: Math.min(
            Math.max(position.x, view.x + margin),
            view.x + view.width - margin,
          ),
          y: Math.min(
            Math.max(position.y, view.y + margin),
            view.y + view.height - margin,
          ),
        }
      : position
    const parked = anchor.x !== position.x || anchor.y !== position.y

    if (parked) {
      const direction = Math.atan2(position.y - anchor.y, position.x - anchor.x)
      draw
        .line(
          anchor.x + Math.cos(direction) * (7 / zoom),
          anchor.y + Math.sin(direction) * (7 / zoom),
          anchor.x + Math.cos(direction) * (18 / zoom),
          anchor.y + Math.sin(direction) * (18 / zoom),
        )
        .stroke({ color, width: 1.5 / zoom, dasharray: `${3 / zoom}` })
        .attr({ 'pointer-events': 'none', 'data-editor-overlay': 'grid-handle' })
    }

    draw
      .circle(11 / zoom)
      .center(anchor.x, anchor.y)
      .fill('#0b0d12')
      .stroke({
        color,
        width: 1.75 / zoom,
        ...(parked ? { dasharray: `${2.5 / zoom}` } : {}),
      })
      .attr({
        cursor,
        'aria-label': label,
        'data-editor-overlay': 'grid-handle',
      })
      .on('pointerdown', (event) => {
        const pointer = event as PointerEvent
        pointer.preventDefault()
        pointer.stopPropagation()
        // Relative dragging keeps parked handles from teleporting their point
        // to the workspace edge on the first pointer move.
        const start = draw.point(pointer.clientX, pointer.clientY)
        const move = (moveEvent: PointerEvent) => {
          const current = draw.point(moveEvent.clientX, moveEvent.clientY)
          onMove({
            x: position.x + (current.x - start.x),
            y: position.y + (current.y - start.y),
          })
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      })
  }

  if (grid.type === 'grid' || grid.type === 'orthographic') {
    addHandle(grid.origin, 'Grid origin', (origin) => onChange({ origin }))
    return
  }

  if (grid.type === 'fisheye') {
    addHandle(grid.center, 'Fisheye center', (center) => onChange({ center }))
    addHandle(
      { x: grid.center.x + grid.radius, y: grid.center.y },
      'Fisheye radius',
      (point) =>
        onChange({
          radius: Math.max(8, Math.hypot(point.x - grid.center.x, point.y - grid.center.y)),
        }),
    )
    return
  }

  if (grid.type === 'perspective-1') {
    const vanishingPoint = grid.vanishingPoints[0] ?? {
      x: artboard.width / 2,
      y: artboard.height * 0.45,
    }

    // The single point anchors both the rays and horizon. Dragging the line
    // rotates it around that point without introducing a second control point.
    for (const primitive of primitives) {
      if (primitive.kind !== 'line' || primitive.role !== 'horizon') continue
      draw
        .line(primitive.a.x, primitive.a.y, primitive.b.x, primitive.b.y)
        .stroke({ color: 'transparent', width: 11 / zoom })
        .attr({
          cursor: 'crosshair',
          'aria-label': 'Rotate horizon',
          'data-editor-overlay': 'grid-handle',
        })
        .on('pointerdown', (event) => {
          const pointer = event as PointerEvent
          pointer.preventDefault()
          pointer.stopPropagation()
          const move = (moveEvent: PointerEvent) => {
            const point = draw.point(moveEvent.clientX, moveEvent.clientY)
            const horizonAngle =
              (Math.atan2(
                point.y - vanishingPoint.y,
                point.x - vanishingPoint.x,
              ) *
                180) /
              Math.PI
            onChange({ horizonAngle })
          }
          const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        })
    }

    addHandle(
      vanishingPoint,
      'Vanishing point and horizon',
      (point) => onChange({ vanishingPoints: [point] }),
      'move',
      guideFamilyColor(grid, 0),
    )
    return
  }

  grid.vanishingPoints.forEach((vanishingPoint, index) => {
    addHandle(
      vanishingPoint,
      `Vanishing point ${index + 1}`,
      (point) => {
        const vanishingPoints = grid.vanishingPoints.map((current, position) =>
          position === index ? point : current,
        )
        onChange({ vanishingPoints })
      },
      'move',
      guideFamilyColor(grid, index),
    )
  })
}

function applyImageAdjustments(draw: Svg, element: SvgElement, node: ImageNode) {
  const primitives = imageAdjustmentPrimitives(node.adjustments)
  if (primitives.length === 0) return
  let defs = draw.node.querySelector(':scope > defs')
  if (!defs) {
    defs = globalThis.document.createElementNS(svgNamespace, 'defs')
    draw.node.insertBefore(defs, draw.node.firstChild)
  }
  const id = `image-adjustments-${node.id}`
  const filter = globalThis.document.createElementNS(svgNamespace, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('color-interpolation-filters', 'sRGB')
  for (const primitive of primitives) {
    const item = globalThis.document.createElementNS(svgNamespace, primitive.tag)
    for (const [name, value] of Object.entries(primitive.attributes)) {
      item.setAttribute(name, String(value))
    }
    filter.appendChild(item)
  }
  defs.appendChild(filter)
  element.attr('filter', `url(#${id})`)
}

type PathEditorActions = {
  drawing: boolean
  selectedPointId: string | null
  onSelectPoint: (pointId: string) => void
  onUpdatePoint: (
    pointId: string,
    update: (point: PathPoint) => PathPoint,
  ) => void
  onContextMenu: (pointId: string, event: PointerEvent) => void
  onDrawPoint: (event: PointerEvent) => boolean
}

function drawPathEditor(
  draw: Svg,
  path: PathNode,
  nodes: EditorNode[],
  zoom: number,
  actions: PathEditorActions,
) {
  const matrix = multiplyAffine(
    parentAffine(nodes, path.id),
    transformToAffine(path.transform),
  )
  const display = (point: Vec2): Vec2 => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
    y: matrix.b * point.x + matrix.d * point.y + matrix.ty,
  })
  const localPoint = (event: PointerEvent) =>
    invertPoint(matrix, draw.point(event.clientX, event.clientY))

  const beginAnchorDrag = (point: PathPoint, event: PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    actions.onSelectPoint(point.id)
    const move = (moveEvent: PointerEvent) => {
      const anchor = localPoint(moveEvent)
      actions.onUpdatePoint(point.id, (current) => ({ ...current, anchor }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const beginHandleDrag = (
    point: PathPoint,
    side: 'in' | 'out',
    event: PointerEvent,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const move = (moveEvent: PointerEvent) => {
      const cursor = localPoint(moveEvent)
      const handle = {
        x: cursor.x - point.anchor.x,
        y: cursor.y - point.anchor.y,
      }
      actions.onUpdatePoint(point.id, (current) =>
        moveHandle(current, side, handle),
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  for (const point of path.points) {
    const anchor = display(point.anchor)
    const selected = actions.selectedPointId === point.id

    if (selected) {
      for (const side of ['in', 'out'] as const) {
        const handle = side === 'in' ? point.handleIn : point.handleOut
        if (Math.hypot(handle.x, handle.y) < 1e-6) continue
        const endpoint = display({
          x: point.anchor.x + handle.x,
          y: point.anchor.y + handle.y,
        })
        draw
          .line(anchor.x, anchor.y, endpoint.x, endpoint.y)
          .stroke({ color: '#8bb2ff', width: 1 / zoom })
          .attr({
            'pointer-events': 'none',
            'data-editor-overlay': 'path-handle-line',
          })
        draw
          .circle(8 / zoom)
          .center(endpoint.x, endpoint.y)
          .fill('#ffffff')
          .stroke({ color: '#4f8cff', width: 1.25 / zoom })
          .attr({
            cursor: 'crosshair',
            'data-editor-overlay': 'path-handle',
            'data-point-id': point.id,
            'data-handle-side': side,
          })
          .on('pointerdown', (event) =>
            beginHandleDrag(point, side, event as PointerEvent),
          )
      }
    }

    draw
      .rect(9 / zoom, 9 / zoom)
      .center(anchor.x, anchor.y)
      .fill(selected ? '#4f8cff' : '#ffffff')
      .stroke({ color: '#4f8cff', width: 1.25 / zoom })
      .attr({
        cursor: actions.drawing ? 'crosshair' : 'move',
        'data-editor-overlay': 'path-point',
        'data-point-id': point.id,
      })
      .on('pointerdown', (event) => {
        const pointer = event as PointerEvent
        if (actions.drawing) actions.onDrawPoint(pointer)
        else beginAnchorDrag(point, pointer)
      })
      .on('contextmenu', (event) =>
        actions.drawing
          ? event.preventDefault()
          : actions.onContextMenu(point.id, event as PointerEvent),
      )
  }
}

type OutlineActions = {
  interactive: boolean
  onResize: (handle: Vec2, event: PointerEvent) => void
  onRotate: (event: PointerEvent) => void
}

function drawOutline(
  parent: SvgParent,
  node: EditorNode,
  zoom: number,
  insideGroup: boolean,
  actions: OutlineActions,
) {
  const bounds = localBounds(node)
  const displayPoint = (point: Vec2) =>
    insideGroup ? point : transformPoint(node.transform, point)
  parent
    .rect(bounds.width, bounds.height)
    .move(bounds.x, bounds.y)
    .fill('none')
    .stroke({ color: '#4f8cff', width: 1 / zoom })
    .attr({
      transform: insideGroup ? undefined : composeTransform(node.transform),
      'pointer-events': 'none',
      'data-editor-overlay': 'selection',
    })

  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ]
  const topCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y,
  }
  const rotationPoint = {
    x: topCenter.x,
    y: topCenter.y - 28 / zoom,
  }
  const displayedTopCenter = displayPoint(topCenter)
  const displayedRotationPoint = displayPoint(rotationPoint)

  parent
    .line(
      displayedTopCenter.x,
      displayedTopCenter.y,
      displayedRotationPoint.x,
      displayedRotationPoint.y,
    )
    .stroke({ color: '#4f8cff', width: 1 / zoom })
    .attr({
      'pointer-events': 'none',
      'data-editor-overlay': 'rotation-stem',
    })

  parent
    .circle(10 / zoom)
    .center(displayedRotationPoint.x, displayedRotationPoint.y)
    .fill('#ffffff')
    .stroke({ color: '#4f8cff', width: 1.5 / zoom })
    .attr({
      cursor: actions.interactive ? 'grab' : 'default',
      'pointer-events': actions.interactive ? 'all' : 'none',
      'data-editor-overlay': 'rotation-handle',
    })
    .on('pointerdown', (event) =>
      actions.onRotate(event as PointerEvent),
    )

  corners.forEach((handle, index) => {
    const point = displayPoint(handle)
    parent
      .rect(10 / zoom, 10 / zoom)
      .center(point.x, point.y)
      .fill('#ffffff')
      .stroke({ color: '#4f8cff', width: 1.5 / zoom })
      .attr({
        cursor:
          index === 0 || index === 2 ? 'nwse-resize' : 'nesw-resize',
        'pointer-events': actions.interactive ? 'all' : 'none',
        'data-editor-overlay': 'resize-handle',
      })
      .on('pointerdown', (event) =>
        actions.onResize(handle, event as PointerEvent),
      )
  })

  const pivot = insideGroup
    ? node.transform.pivot
    : {
        x: node.transform.position.x + node.transform.pivot.x,
        y: node.transform.position.y + node.transform.pivot.y,
      }

  parent
    .circle(8 / zoom)
    .center(pivot.x, pivot.y)
    .fill('#ffffff')
    .stroke({ color: '#4f8cff', width: 1.5 / zoom })
    .attr({
      'pointer-events': 'none',
      'data-editor-overlay': 'pivot',
    })
}

function hitIds(
  nodes: EditorNode[],
  box: { x: number; y: number; width: number; height: number },
): string[] {
  const hits: string[] = []
  const visit = (node: EditorNode) => {
    if (node.type === 'group') {
      node.children.forEach(visit)
      return
    }
    const bounds = localBounds(node)
    const xs = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ].map((point) => transformPoint(node.transform, point))
    const minX = Math.min(...xs.map((point) => point.x))
    const maxX = Math.max(...xs.map((point) => point.x))
    const minY = Math.min(...xs.map((point) => point.y))
    const maxY = Math.max(...xs.map((point) => point.y))
    if (
      minX < box.x + box.width &&
      maxX > box.x &&
      minY < box.y + box.height &&
      maxY > box.y
    ) {
      hits.push(node.id)
    }
  }
  nodes.forEach(visit)
  return hits
}
