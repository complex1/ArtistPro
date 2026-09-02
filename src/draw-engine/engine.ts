import type { GpuBackend } from './backend'
import { createCpuBackend } from './backendCpu'
import { createWebgl2Backend } from './backendWebgl'
import { compositePixel, parseColor } from './color'
import { clampSize, createDocument, createLayer } from './document'
import { floodFill } from './fill'
import {
  applyLiquifyStroke,
  createDisplacement,
  sampleWithDisplacement,
  type DisplacementField,
} from './liquify'
import { createBrush } from './presets'
import {
  fromPointer,
  mulberry32,
  sampleStroke,
  stabilizePoint,
  type PointerSample,
} from './sampler'
import { opaqueBounds } from './overlay'
import { rasterizeLasso, selectionBounds } from './selection'
import {
  createWrapGrid,
  homographyFromQuads,
  invertAffine,
  invertHomography,
  applyHomography,
  inverseWrapSample,
} from './transform'
import type {
  AffineTransform,
  BrushConfig,
  DrawDocument,
  DrawLayer,
  LiquifyMode,
  PerspectiveCorners,
  PointerPoint,
  Rect,
  TransformMode,
  WrapGrid,
} from './types'
import { captureTiles, restoreTiles, TileHistory } from './undo'

const SELECTION_ID = '__selection'
const PREVIEW_ID = '__preview'
const SOURCE_ID = '__source'
const LIFT_ID = '__lift'

export type CreateEngineOptions = {
  document?: Partial<DrawDocument>
  canvas?: HTMLCanvasElement | null
  backend?: 'cpu' | 'webgl2'
}

export type TransformState = {
  mode: TransformMode
  affine: AffineTransform
  corners: PerspectiveCorners
  wrap: WrapGrid
  bounds: Rect
}

export type DrawEngine = {
  backendKind: () => 'cpu' | 'webgl2'
  document: () => DrawDocument
  addLayer: (name?: string) => DrawLayer
  removeLayer: (id: string) => void
  reorderLayer: (id: string, index: number) => void
  setActiveLayer: (id: string) => void
  setLayerProps: (
    id: string,
    props: Partial<Pick<DrawLayer, 'name' | 'visible' | 'opacity' | 'blendMode'>>,
  ) => void
  fillRect: (rect: Rect, color: string) => void
  beginStroke: (brush: BrushConfig, pointer: PointerSample) => void
  moveStroke: (pointer: PointerSample) => void
  endStroke: () => void
  setSelectionFromLasso: (points: { x: number; y: number }[]) => void
  clearSelection: () => void
  hasSelection: () => boolean
  selectionBounds: () => Rect | null
  selectionMask: () => Uint8ClampedArray | null
  selectionPath: () => { x: number; y: number }[]
  getTransform: () => TransformState | null
  fill: (x: number, y: number, color: string, tolerance?: number) => void
  beginTransform: (mode: TransformMode) => TransformState | null
  updateTransform: (patch: Partial<TransformState>) => void
  commitTransform: () => void
  cancelTransform: () => void
  beginLiquify: (brush: BrushConfig, pointer: PointerSample, mode?: LiquifyMode) => void
  moveLiquify: (pointer: PointerSample) => void
  endLiquify: () => void
  undo: () => boolean
  redo: () => boolean
  present: () => void
  exportPng: () => string
  readLayerPixels: (layerId?: string) => Uint8ClampedArray
  dispose: () => void
}

function identityAffine(): AffineTransform {
  return { scaleX: 1, scaleY: 1, rotation: 0, tx: 0, ty: 0 }
}

function boundsCorners(bounds: Rect): PerspectiveCorners {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ]
}

export function createEngine(options: CreateEngineOptions = {}): DrawEngine {
  const base = createDocument(
    options.document?.name,
    options.document?.width,
    options.document?.height,
  )
  const doc: DrawDocument = {
    ...base,
    ...options.document,
    width: clampSize(options.document?.width ?? base.width, base.width),
    height: clampSize(options.document?.height ?? base.height, base.height),
    layers: options.document?.layers?.length ? options.document.layers : base.layers,
    activeLayerId: options.document?.activeLayerId ?? base.activeLayerId,
    version: 1,
  }
  if (!doc.layers.some((layer) => layer.id === doc.activeLayerId)) {
    doc.activeLayerId = doc.layers[0].id
  }

  const canvas = options.canvas ?? null
  let gpu: GpuBackend
  if (options.backend === 'cpu' || !canvas) {
    gpu = createCpuBackend(doc.width, doc.height, canvas)
  } else {
    try {
      gpu = createWebgl2Backend(canvas, doc.width, doc.height)
    } catch {
      gpu = createCpuBackend(doc.width, doc.height, canvas)
    }
  }

  for (const layer of doc.layers) gpu.createSurface(layer.id)
  gpu.createSurface(SELECTION_ID)
  gpu.createSurface(PREVIEW_ID)
  gpu.createSurface(SOURCE_ID)
  gpu.createSurface(LIFT_ID)
  gpu.clear(SELECTION_ID)

  const history = new TileHistory()
  let selectionOn = false
  let selectionPoly: { x: number; y: number }[] = []
  let live: 'stroke' | 'transform' | 'liquify' | null = null
  let stroke: {
    brush: BrushConfig
    points: PointerPoint[]
    painted: number
    seed: number
  } | null = null
  let transform: TransformState | null = null
  let liquify: {
    brush: BrushConfig
    last: PointerPoint
    field: DisplacementField
    mode: LiquifyMode
  } | null = null

  const active = () =>
    doc.layers.find((layer) => layer.id === doc.activeLayerId) ?? doc.layers[0]

  const snapshotLayer = (layerId: string) => {
    history.push({
      layerId,
      tiles: captureTiles(
        (tile) => gpu.read(layerId, tile),
        { x: 0, y: 0, width: gpu.width, height: gpu.height },
        gpu.width,
        gpu.height,
      ),
    })
  }

  const clipId = () => (selectionOn ? SELECTION_ID : null)

  let backdrop: Uint8ClampedArray | null = null

  const overlayComposite = (base: Uint8ClampedArray, overlayId: string) => {
    const overlay = gpu.read(overlayId)
    for (let i = 0; i < overlay.length; i += 4) {
      const a = overlay[i + 3] / 255
      if (a <= 0) continue
      compositePixel(
        base,
        i,
        { r: overlay[i] / 255, g: overlay[i + 1] / 255, b: overlay[i + 2] / 255, a },
        1,
        'source-over',
      )
    }
  }

  const present = () => {
    const activeId = active().id
    if (live === 'stroke' || live === 'liquify') {
      if (!backdrop) {
        backdrop = gpu.composite(
          doc.layers
            .filter((layer) => layer.id !== activeId)
            .map((layer) => ({
              id: layer.id,
              visible: layer.visible,
              opacity: layer.opacity,
              blendMode: layer.blendMode,
            })),
          doc.background,
        )
      }
      const pixels = new Uint8ClampedArray(backdrop)
      const liveLayer = doc.layers.find((layer) => layer.id === activeId)
      if (liveLayer?.visible) {
        const preview = gpu.read(PREVIEW_ID)
        for (let i = 0; i < preview.length; i += 4) {
          const a = preview[i + 3] / 255
          if (a <= 0) continue
          compositePixel(
            pixels,
            i,
            { r: preview[i] / 255, g: preview[i + 1] / 255, b: preview[i + 2] / 255, a },
            liveLayer.opacity,
            liveLayer.blendMode === 'erase' ? 'source-over' : liveLayer.blendMode,
          )
        }
      }
      gpu.present(pixels)
      return
    }
    if (live === 'transform') {
      if (!backdrop) {
        backdrop = gpu.composite(
          doc.layers.map((layer) => ({
            id: layer.id,
            visible: layer.visible,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
          })),
          doc.background,
        )
      }
      const pixels = new Uint8ClampedArray(backdrop)
      overlayComposite(pixels, PREVIEW_ID)
      gpu.present(pixels)
      return
    }
    backdrop = null
    gpu.present(
      gpu.composite(
        doc.layers.map((layer) => ({
          id: layer.id,
          visible: layer.visible,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
        })),
        doc.background,
      ),
    )
  }

  const dabFrom = (
    brush: BrushConfig,
    point: PointerPoint,
    previous: PointerPoint | null,
    index: number,
  ) => {
    const pressure = point.pressure
    const size =
      brush.minSize +
      (brush.size - brush.minSize) *
        (1 - brush.pressure.size + brush.pressure.size * pressure)
    const flow = brush.flow * (1 - brush.pressure.flow + brush.pressure.flow * pressure)
    const heading = previous
      ? Math.atan2(point.y - previous.y, point.x - previous.x)
      : 0
    const rng = mulberry32((brush.seed + index) >>> 0)
    const rotation =
      brush.rotation === 'followPath'
        ? heading + (brush.rotationDegrees * Math.PI) / 180
        : brush.rotation === 'random'
          ? rng() * Math.PI * 2
          : (brush.rotationDegrees * Math.PI) / 180
    return {
      x: point.x,
      y: point.y,
      size,
      rotation,
      hardness: brush.hardness,
      flow,
      opacity: 1,
      color: parseColor(brush.color),
      erase: brush.blendMode === 'erase' || brush.preset === 'eraser',
      tip: brush.tip,
      stamp: brush.stampImages[0],
      seed: brush.seed + index,
    }
  }

  const refreshStrokePreview = () => {
    if (!stroke) return
    const sampled = sampleStroke(stroke.points, stroke.brush, stroke.seed)
    let dirty = { x: 0, y: 0, width: 0, height: 0 }
    for (let i = stroke.painted; i < sampled.length; i += 1) {
      const prev = i > 0 ? sampled[i - 1] : null
      const bounds = gpu.stampStrokeDab(dabFrom(stroke.brush, sampled[i], prev, i), clipId())
      dirty =
        dirty.width === 0
          ? bounds
          : {
              x: Math.min(dirty.x, bounds.x),
              y: Math.min(dirty.y, bounds.y),
              width:
                Math.max(dirty.x + dirty.width, bounds.x + bounds.width) -
                Math.min(dirty.x, bounds.x),
              height:
                Math.max(dirty.y + dirty.height, bounds.y + bounds.height) -
                Math.min(dirty.y, bounds.y),
            }
    }
    stroke.painted = sampled.length
    if (dirty.width > 0) {
      gpu.applyStrokeFromSource(
        SOURCE_ID,
        PREVIEW_ID,
        parseColor(stroke.brush.color),
        stroke.brush.opacity,
        stroke.brush.blendMode === 'erase' || stroke.brush.preset === 'eraser',
        dirty,
      )
    }
    present()
  }

  const inverseForTransform = (x: number, y: number): { x: number; y: number } => {
    if (!transform) return { x, y }
    const cx = transform.bounds.x + transform.bounds.width / 2
    const cy = transform.bounds.y + transform.bounds.height / 2
    if (transform.mode === 'perspective') {
      const h = homographyFromQuads(boundsCorners(transform.bounds), transform.corners)
      if (!h) return { x, y }
      const inv = invertHomography(h)
      if (!inv) return { x, y }
      return applyHomography(inv, x, y)
    }
    if (transform.mode === 'wrap') {
      return inverseWrapSample(x, y, transform.wrap, transform.bounds)
    }
    return invertAffine(x, y, transform.affine, cx, cy)
  }

  const refreshTransform = () => {
    if (!transform) return
    gpu.copySurface(LIFT_ID, PREVIEW_ID)
    gpu.warp(LIFT_ID, PREVIEW_ID, inverseForTransform, null, { clear: true })
    present()
  }

  const punchSelection = (target: string) => {
    if (!selectionOn) return
    const pixels = gpu.read(target)
    const mask = gpu.read(SELECTION_ID)
    for (let i = 0; i < pixels.length; i += 4) {
      const a = mask[i + 3] / 255
      if (a <= 0) continue
      pixels[i + 3] = Math.round(pixels[i + 3] * (1 - a))
    }
    gpu.write(target, pixels)
  }

  const keepSelection = (target: string) => {
    if (!selectionOn) return
    const pixels = gpu.read(target)
    const mask = gpu.read(SELECTION_ID)
    for (let i = 0; i < pixels.length; i += 4) {
      const a = mask[i + 3] / 255
      pixels[i + 3] = Math.round(pixels[i + 3] * a)
    }
    gpu.write(target, pixels)
  }

  const engine: DrawEngine = {
    backendKind: () => gpu.kind,
    document: () => structuredClone(doc),
    addLayer(name) {
      const layer = createLayer(name ?? `Layer ${doc.layers.length + 1}`)
      doc.layers.push(layer)
      gpu.createSurface(layer.id)
      doc.activeLayerId = layer.id
      present()
      return layer
    },
    removeLayer(id) {
      if (doc.layers.length <= 1) return
      const index = doc.layers.findIndex((layer) => layer.id === id)
      if (index < 0) return
      doc.layers.splice(index, 1)
      gpu.destroySurface(id)
      if (doc.activeLayerId === id) doc.activeLayerId = doc.layers[Math.max(0, index - 1)].id
      present()
    },
    reorderLayer(id, index) {
      const current = doc.layers.findIndex((layer) => layer.id === id)
      if (current < 0) return
      const [layer] = doc.layers.splice(current, 1)
      doc.layers.splice(Math.max(0, Math.min(doc.layers.length, index)), 0, layer)
      present()
    },
    setActiveLayer(id) {
      if (doc.layers.some((layer) => layer.id === id)) doc.activeLayerId = id
    },
    setLayerProps(id, props) {
      const layer = doc.layers.find((item) => item.id === id)
      if (!layer) return
      Object.assign(layer, props)
      present()
    },
    fillRect(rect, color) {
      const layer = active()
      snapshotLayer(layer.id)
      gpu.fillRect(layer.id, rect, parseColor(color))
      present()
    },
    beginStroke(brush, pointer) {
      if (live) return
      const layer = active()
      snapshotLayer(layer.id)
      gpu.copySurface(layer.id, SOURCE_ID)
      gpu.copySurface(layer.id, PREVIEW_ID)
      backdrop = null
      gpu.beginStroke()
      const point = stabilizePoint(fromPointer(pointer, null), null, brush.stability)
      live = 'stroke'
      stroke = {
        brush: createBrush(brush),
        points: [point],
        painted: 0,
        seed: brush.seed,
      }
      refreshStrokePreview()
    },
    moveStroke(pointer) {
      if (!stroke) return
      const prev = stroke.points[stroke.points.length - 1]
      const point = stabilizePoint(fromPointer(pointer, prev), prev, stroke.brush.stability)
      stroke.points.push(point)
      refreshStrokePreview()
    },
    endStroke() {
      if (!stroke) return
      gpu.copySurface(PREVIEW_ID, active().id)
      gpu.clearStroke()
      stroke = null
      live = null
      present()
    },
    setSelectionFromLasso(points) {
      const mask = rasterizeLasso(points, gpu.width, gpu.height)
      gpu.write(SELECTION_ID, mask)
      const bounds = selectionBounds(mask, gpu.width, gpu.height)
      selectionOn = bounds !== null
      selectionPoly = selectionOn ? points.map((point) => ({ x: point.x, y: point.y })) : []
      present()
    },
    clearSelection() {
      gpu.clear(SELECTION_ID)
      selectionOn = false
      selectionPoly = []
      present()
    },
    hasSelection: () => selectionOn,
    selectionBounds: () =>
      selectionOn ? selectionBounds(gpu.read(SELECTION_ID), gpu.width, gpu.height) : null,
    selectionMask: () => (selectionOn ? gpu.read(SELECTION_ID) : null),
    selectionPath: () => selectionPoly.map((point) => ({ ...point })),
    getTransform: () => (transform ? { ...transform, affine: { ...transform.affine } } : null),
    fill(x, y, color, tolerance = 32) {
      const layer = active()
      snapshotLayer(layer.id)
      const result = floodFill(
        gpu.read(layer.id),
        gpu.width,
        gpu.height,
        x,
        y,
        color,
        tolerance,
        selectionOn ? gpu.read(SELECTION_ID) : null,
      )
      gpu.write(layer.id, result.pixels)
      present()
    },
    beginTransform(mode) {
      if (live) return null
      const layer = active()
      snapshotLayer(layer.id)
      gpu.copySurface(layer.id, SOURCE_ID)
      gpu.copySurface(layer.id, LIFT_ID)
      const bounds = selectionOn
        ? selectionBounds(gpu.read(SELECTION_ID), gpu.width, gpu.height)
        : opaqueBounds(gpu.read(layer.id), gpu.width, gpu.height)
      if (!bounds) return null
      keepSelection(LIFT_ID)
      punchSelection(layer.id)
      backdrop = null
      transform = {
        mode,
        affine: identityAffine(),
        corners: boundsCorners(bounds),
        wrap: createWrapGrid(4, 4, bounds.x, bounds.y, bounds.width, bounds.height),
        bounds,
      }
      live = 'transform'
      refreshTransform()
      return transform
    },
    updateTransform(patch) {
      if (!transform) return
      transform = { ...transform, ...patch, affine: { ...transform.affine, ...patch.affine } }
      if (patch.corners) transform.corners = patch.corners
      if (patch.wrap) transform.wrap = patch.wrap
      refreshTransform()
    },
    commitTransform() {
      if (!transform) return
      if (selectionOn) overlayOntoLayer()
      else gpu.copySurface(PREVIEW_ID, active().id)
      transform = null
      live = null
      present()
    },
    cancelTransform() {
      if (!transform) return
      gpu.copySurface(SOURCE_ID, active().id)
      transform = null
      live = null
      present()
    },
    beginLiquify(brush, pointer, mode = 'push') {
      if (live) return
      const layer = active()
      snapshotLayer(layer.id)
      gpu.copySurface(layer.id, SOURCE_ID)
      backdrop = null
      const point = fromPointer(pointer, null)
      live = 'liquify'
      liquify = {
        brush: createBrush(brush),
        last: point,
        field: createDisplacement(gpu.width, gpu.height),
        mode,
      }
      gpu.copySurface(SOURCE_ID, PREVIEW_ID)
      present()
    },
    moveLiquify(pointer) {
      if (!liquify) return
      const point = fromPointer(pointer, liquify.last)
      applyLiquifyStroke(
        liquify.field,
        point.x,
        point.y,
        point.x - liquify.last.x,
        point.y - liquify.last.y,
        liquify.brush.size,
        0.85,
        liquify.mode,
      )
      liquify.last = point
      gpu.copySurface(SOURCE_ID, PREVIEW_ID)
      gpu.warp(
        SOURCE_ID,
        PREVIEW_ID,
        (x, y) => sampleWithDisplacement(x, y, liquify!.field),
        clipId(),
        { clear: !selectionOn },
      )
      present()
    },
    endLiquify() {
      if (!liquify) return
      gpu.copySurface(PREVIEW_ID, active().id)
      liquify = null
      live = null
      present()
    },
    undo() {
      const step = history.undo()
      if (!step) return false
      const current = captureTiles(
        (tile) => gpu.read(step.layerId, tile),
        { x: 0, y: 0, width: gpu.width, height: gpu.height },
        gpu.width,
        gpu.height,
      )
      restoreTiles(
        (pixels, rect) => gpu.write(step.layerId, pixels, rect),
        step.tiles,
        gpu.width,
        gpu.height,
      )
      step.tiles = current
      present()
      return true
    },
    redo() {
      const step = history.redo()
      if (!step) return false
      const current = captureTiles(
        (tile) => gpu.read(step.layerId, tile),
        { x: 0, y: 0, width: gpu.width, height: gpu.height },
        gpu.width,
        gpu.height,
      )
      restoreTiles(
        (pixels, rect) => gpu.write(step.layerId, pixels, rect),
        step.tiles,
        gpu.width,
        gpu.height,
      )
      step.tiles = current
      present()
      return true
    },
    present,
    exportPng() {
      present()
      if (canvas && canvas.toDataURL) return canvas.toDataURL('image/png')
      const pixels = gpu.composite(
        doc.layers.map((layer) => ({
          id: layer.id,
          visible: layer.visible,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
        })),
        doc.background,
      )
      if (typeof document === 'undefined') return ''
      const off = document.createElement('canvas')
      off.width = gpu.width
      off.height = gpu.height
      off.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), gpu.width, gpu.height), 0, 0)
      return off.toDataURL('image/png')
    },
    readLayerPixels(layerId) {
      return gpu.read(layerId ?? active().id)
    },
    dispose() {
      gpu.dispose()
    },
  }

  function overlayOntoLayer() {
    const layer = active()
    const dest = gpu.read(layer.id)
    overlayComposite(dest, PREVIEW_ID)
    gpu.write(layer.id, dest)
  }

  present()
  return engine
}
