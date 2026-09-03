import { useEffect, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { lassoLength } from './overlay'
import type { DrawEngine } from './engine'
import {
  affineFromPose,
  flattenPoints,
  pairsToPoints,
  poseFromBounds,
  snapPose,
  type KonvaNodePose,
} from './konvaMap'
import type { BrushConfig, TransformMode } from './types'

export type StageTool =
  | 'brush'
  | 'lasso'
  | 'fill'
  | 'transform'
  | 'liquify'
  | 'select'

export type VectorItem = {
  id: string
  kind: 'rect' | 'text'
  x: number
  y: number
  width: number
  height: number
  fill: string
  text?: string
}

export function addVectorShape(
  kind: VectorItem['kind'],
  color: string,
  width: number,
  height: number,
): VectorItem {
  return {
    id: crypto.randomUUID(),
    kind,
    x: width / 2 - 40,
    y: height / 2 - 24,
    width: kind === 'text' ? 120 : 80,
    height: kind === 'text' ? 28 : 48,
    fill: color,
    text: 'Text',
  }
}

function isUiHandle(target: Konva.Node): boolean {
  let node: Konva.Node | null = target
  while (node) {
    if (node.getClassName() === 'Transformer') return true
    if (node.name() === 'raster-box') return true
    node = node.getParent()
  }
  return false
}

export function PaintStage({
  width,
  height,
  engine,
  rasterCanvas,
  tool,
  transformMode,
  color,
  brush,
  vectors,
  rasterTick,
  transformTick,
  onSelectionChange,
  onTransformingChange,
  onVectorsChange,
}: {
  width: number
  height: number
  engine: DrawEngine
  rasterCanvas: HTMLCanvasElement
  tool: StageTool
  transformMode: TransformMode
  color: string
  brush: BrushConfig
  vectors: VectorItem[]
  rasterTick: number
  transformTick: number
  onSelectionChange: (selected: boolean) => void
  onTransformingChange: (active: boolean) => void
  onVectorsChange: (vectors: VectorItem[]) => void
}) {
  const stageRef = useRef<Konva.Stage>(null)
  const rasterRef = useRef<Konva.Image>(null)
  const rasterBoxRef = useRef<Konva.Rect>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const vectorTransformerRef = useRef<Konva.Transformer>(null)
  const selectedVectorRef = useRef<Konva.Node | null>(null)
  const painting = useRef(false)
  const lassoRef = useRef<number[]>([])
  const [lasso, setLasso] = useState<number[]>([])
  const [selectionLine, setSelectionLine] = useState<number[]>([])
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [selectedVectorId, setSelectedVectorId] = useState<string | null>(null)
  const [rasterBox, setRasterBox] = useState<(KonvaNodePose & { width: number; height: number }) | null>(
    null,
  )
  const toolRef = useRef(tool)
  const brushRef = useRef(brush)
  const colorRef = useRef(color)
  const modeRef = useRef(transformMode)

  const refreshRaster = () => {
    rasterRef.current?.getLayer()?.batchDraw()
  }

  const pointer = () => {
    const point = stageRef.current?.getPointerPosition()
    if (!point) return null
    return { x: point.x, y: point.y, t: performance.now() }
  }

  useEffect(() => {
    toolRef.current = tool
    brushRef.current = brush
    colorRef.current = color
    modeRef.current = transformMode
  }, [tool, brush, color, transformMode])

  useEffect(() => {
    refreshRaster()
    setSelectionLine(flattenPoints(engine.selectionPath()))
    onSelectionChange(engine.hasSelection())
  }, [engine, rasterTick, onSelectionChange])

  useEffect(() => {
    if (tool !== 'transform') {
      if (engine.getTransform()) engine.commitTransform()
      setRasterBox(null)
      onTransformingChange(false)
      setGuides({})
      refreshRaster()
      return
    }
    const existing = engine.getTransform()
    if (existing) {
      if (existing.mode !== transformMode) engine.updateTransform({ mode: transformMode })
      refreshRaster()
      return
    }
    const started = engine.beginTransform(transformMode)
    if (!started) {
      setRasterBox(null)
      onTransformingChange(false)
      return
    }
    const pose = poseFromBounds(started.bounds)
    setRasterBox({ ...pose, width: started.bounds.width, height: started.bounds.height })
    onTransformingChange(true)
    refreshRaster()
  }, [engine, tool, transformMode, transformTick, onTransformingChange])

  useEffect(() => {
    const transformer = transformerRef.current
    const box = rasterBoxRef.current
    if (transformer && box && rasterBox) transformer.nodes([box])
    else transformer?.nodes([])
    transformer?.getLayer()?.batchDraw()
  }, [rasterBox])

  useEffect(() => {
    const transformer = vectorTransformerRef.current
    const node = selectedVectorRef.current
    if (tool === 'select' && transformer && node) transformer.nodes([node])
    else transformer?.nodes([])
    transformer?.getLayer()?.batchDraw()
  }, [selectedVectorId, tool, vectors])

  useEffect(() => {
    if (tool !== 'select') setSelectedVectorId(null)
  }, [tool])

  const syncRasterPose = (node: Konva.Node) => {
    const transform = engine.getTransform()
    if (!transform) return
    const pose = snapPose(
      {
        x: node.x(),
        y: node.y(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        rotation: node.rotation(),
      },
      transform.bounds,
      { width, height },
    )
    node.x(pose.pose.x)
    node.y(pose.pose.y)
    setGuides(pose.guides)
    engine.updateTransform({
      mode: modeRef.current,
      affine: affineFromPose(pose.pose, transform.bounds),
    })
    refreshRaster()
  }

  const persistVector = (id: string, node: Konva.Node) => {
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    const nextWidth = Math.max(8, node.width() * scaleX)
    const nextHeight = Math.max(8, node.height() * scaleY)
    node.scaleX(1)
    node.scaleY(1)
    node.width(nextWidth)
    node.height(nextHeight)
    onVectorsChange(
      vectors.map((item) =>
        item.id === id
          ? { ...item, x: node.x(), y: node.y(), width: nextWidth, height: nextHeight }
          : item,
      ),
    )
  }

  const finishPointer = () => {
    if (!painting.current) return
    const current = toolRef.current
    if (current === 'brush') engine.endStroke()
    else if (current === 'liquify') engine.endLiquify()
    else if (current === 'lasso') {
      const points = pairsToPoints(lassoRef.current)
      if (points.length < 3 || lassoLength(points) < 12) {
        engine.clearSelection()
        setSelectionLine([])
        onSelectionChange(false)
      } else {
        engine.setSelectionFromLasso(points)
        setSelectionLine(flattenPoints(engine.selectionPath()))
        onSelectionChange(engine.hasSelection())
      }
      lassoRef.current = []
      setLasso([])
    }
    painting.current = false
    refreshRaster()
  }

  useEffect(() => {
    const onUp = () => {
      if (!painting.current) return
      finishPointer()
    }
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  const onDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.evt.preventDefault()
    if (isUiHandle(event.target)) return
    const current = toolRef.current
    if (current === 'select') {
      if (event.target === event.target.getStage()) setSelectedVectorId(null)
      return
    }
    const point = pointer()
    if (!point) return
    if (current === 'brush') {
      painting.current = true
      engine.beginStroke(brushRef.current, point)
      refreshRaster()
    } else if (current === 'lasso') {
      painting.current = true
      lassoRef.current = [point.x, point.y]
      setLasso(lassoRef.current)
    } else if (current === 'fill') {
      engine.fill(point.x, point.y, colorRef.current)
      refreshRaster()
    } else if (current === 'liquify') {
      painting.current = true
      engine.beginLiquify(brushRef.current, point, 'push')
      refreshRaster()
    }
  }

  const onMove = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!painting.current) return
    event.evt.preventDefault()
    const point = pointer()
    if (!point) return
    const current = toolRef.current
    if (current === 'brush') {
      engine.moveStroke(point)
      refreshRaster()
    } else if (current === 'lasso') {
      lassoRef.current = [...lassoRef.current, point.x, point.y]
      setLasso(lassoRef.current)
    } else if (current === 'liquify') {
      engine.moveLiquify(point)
      refreshRaster()
    }
  }

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      className="draw-konva-stage"
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={finishPointer}
      onTouchStart={onDown}
      onTouchMove={onMove}
      onTouchEnd={finishPointer}
    >
      <Layer name="raster" listening={false}>
        <KonvaImage ref={rasterRef} image={rasterCanvas} x={0} y={0} />
      </Layer>
      <Layer name="vectors" listening={tool === 'select'}>
        {vectors.map((item) =>
          item.kind === 'text' ? (
            <Text
              key={item.id}
              id={item.id}
              x={item.x}
              y={item.y}
              width={item.width}
              text={item.text ?? 'Text'}
              fontSize={22}
              fill={item.fill}
              draggable
              onClick={() => setSelectedVectorId(item.id)}
              onTap={() => setSelectedVectorId(item.id)}
              onDragEnd={(event) => persistVector(item.id, event.target)}
              onTransformEnd={(event) => persistVector(item.id, event.target)}
              ref={(node) => {
                if (item.id === selectedVectorId) selectedVectorRef.current = node
              }}
            />
          ) : (
            <Rect
              key={item.id}
              id={item.id}
              x={item.x}
              y={item.y}
              width={item.width}
              height={item.height}
              fill={item.fill}
              opacity={0.85}
              draggable
              onClick={() => setSelectedVectorId(item.id)}
              onTap={() => setSelectedVectorId(item.id)}
              onDragEnd={(event) => persistVector(item.id, event.target)}
              onTransformEnd={(event) => persistVector(item.id, event.target)}
              ref={(node) => {
                if (item.id === selectedVectorId) selectedVectorRef.current = node
              }}
            />
          ),
        )}
        <Transformer ref={vectorTransformerRef} rotateEnabled />
      </Layer>
      <Layer name="ui">
        {selectionLine.length > 4 && tool !== 'transform' ? (
          <Line
            points={selectionLine}
            closed
            fill="rgba(74,114,255,0.16)"
            stroke="#4a72ff"
            strokeWidth={1.5}
            dash={[6, 4]}
            listening={false}
          />
        ) : null}
        {lasso.length > 2 ? (
          <Line
            points={lasso}
            closed
            fill="rgba(74,114,255,0.12)"
            stroke="#4a72ff"
            strokeWidth={1.25}
            listening={false}
          />
        ) : null}
        {rasterBox ? (
          <Rect
            ref={rasterBoxRef}
            name="raster-box"
            x={rasterBox.x}
            y={rasterBox.y}
            width={rasterBox.width}
            height={rasterBox.height}
            offsetX={rasterBox.width / 2}
            offsetY={rasterBox.height / 2}
            scaleX={rasterBox.scaleX}
            scaleY={rasterBox.scaleY}
            rotation={rasterBox.rotation}
            stroke="#4a72ff"
            dash={[6, 4]}
            listening
            draggable
            onDragMove={(event) => syncRasterPose(event.target)}
            onDragEnd={() => setGuides({})}
            onTransform={(event) => syncRasterPose(event.target)}
          />
        ) : null}
        {rasterBox ? (
          <Transformer
            ref={transformerRef}
            rotateEnabled={transformMode === 'free' || transformMode === 'resize'}
            enabledAnchors={
              transformMode === 'move'
                ? []
                : transformMode === 'resize'
                  ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                  : undefined
            }
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
            }
          />
        ) : null}
        {guides.x != null ? (
          <Line
            points={[guides.x, 0, guides.x, height]}
            stroke="#7fd1a0"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        ) : null}
        {guides.y != null ? (
          <Line
            points={[0, guides.y, width, guides.y]}
            stroke="#7fd1a0"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        ) : null}
      </Layer>
    </Stage>
  )
}
