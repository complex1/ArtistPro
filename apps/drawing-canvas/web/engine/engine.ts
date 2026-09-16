import { brushDiameter, createBrushTip, normalizeBrush, stampBrush } from './brush'
import { floodFill } from './fill'
import { boundsCorners, containsPoint, homographyForQuad, normalizeBounds, projectSelection, selectionBounds, traceSelection, transformSelection } from './geometry'
import { SnapshotHistory } from './history'
import { previewProjective, warpRaster } from './projective'
import type { Bounds, BrushSettings, DrawingDocument, DrawingLayer, EngineState, Point, Quad, Selection, Transform } from './types'

type RasterLayer = { meta: DrawingLayer; canvas: HTMLCanvasElement }
type Snapshot = { name: string; background: string | null; activeLayerId: string; layers: RasterLayer[]; selection: Selection | null }
type Stroke = {
  before: Snapshot; layerId: string; original: HTMLCanvasElement; preview: HTMLCanvasElement;
  stage: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tip: HTMLCanvasElement; settings: BrushSettings;
  erase: boolean; point: Point; raw: Point; distance: number;
}
type QuadSource = {
  canvas: HTMLCanvasElement; selection: Selection | null; bounds: Bounds;
  source: HTMLCanvasElement; base: HTMLCanvasElement | null;
  raster: ImageData | null; warped: HTMLCanvasElement | null; preview: HTMLCanvasElement | null;
}

const MAX_LAYERS = 32
const MAX_LAYER_PIXELS = 67_108_864
const BLEND_MODES = new Set(['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'])
const unit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
const validPoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)
const copySelection = (selection: Selection | null): Selection | null => selection ? structuredClone(selection) : null
const newId = () => `layer-${crypto.randomUUID()}`
const context = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This device does not support a 2D drawing canvas.')
  return ctx
}

function imageSize(image: CanvasImageSource): { width: number; height: number } {
  if ('naturalWidth' in image) return { width: image.naturalWidth, height: image.naturalHeight }
  if ('videoWidth' in image) return { width: image.videoWidth, height: image.videoHeight }
  if ('displayWidth' in image) return { width: image.displayWidth, height: image.displayHeight }
  return {
    width: typeof image.width === 'number' ? image.width : image.width.baseVal.value,
    height: typeof image.height === 'number' ? image.height : image.height.baseVal.value,
  }
}

/** Immutable committed layer buffers make history cheap; only the edited layer is copied. */
export class DrawingEngine {
  private readonly width: number
  private readonly height: number
  private name: string
  private background: string | null
  private activeLayerId: string
  private layers: RasterLayer[] = []
  private selection: Selection | null = null
  private revision = 0
  private listeners = new Set<() => void>()
  private state!: EngineState
  private stroke: Stroke | null = null
  private disposed = false
  private readonly contentBounds = new WeakMap<HTMLCanvasElement, Bounds>()
  private quadSource: QuadSource | null = null
  private readonly history = new SnapshotHistory<Snapshot>((snapshots) => {
    const canvases = new Set<HTMLCanvasElement>()
    const current = new Set(this.layers.map(layer => layer.canvas))
    for (const snapshot of snapshots) for (const layer of snapshot.layers) canvases.add(layer.canvas)
    let bytes = 0
    for (const canvas of canvases) if (!current.has(canvas)) bytes += canvas.width * canvas.height * 4
    return bytes
  })

  private constructor(doc: DrawingDocument) {
    this.width = doc.width
    this.height = doc.height
    this.name = doc.name
    this.background = doc.background
    this.activeLayerId = doc.activeLayerId
  }

  static async create(doc: DrawingDocument): Promise<DrawingEngine> {
    if (doc.version !== 1 || !Number.isInteger(doc.width) || !Number.isInteger(doc.height) || doc.width < 1 || doc.height < 1 || doc.width > 4096 || doc.height > 4096) {
      throw new Error('Choose a canvas between 1 and 4096 pixels on each side.')
    }
    if (!Array.isArray(doc.layers) || !doc.layers.length || doc.layers.length > MAX_LAYERS) throw new Error('A drawing must have between 1 and 32 layers.')
    if (doc.width * doc.height * doc.layers.length > MAX_LAYER_PIXELS) throw new Error('This drawing exceeds the layer memory limit. Use fewer layers or a smaller canvas.')
    if (new Set(doc.layers.map(layer => layer.id)).size !== doc.layers.length) throw new Error('The drawing contains duplicate layer IDs.')
    const engine = new DrawingEngine(doc)
    for (const layer of doc.layers) {
      const canvas = engine.blankCanvas()
      if (layer.dataUrl) {
        if (!layer.dataUrl.startsWith('data:image/png;base64,')) throw new Error('Layer pixels must use PNG data.')
        const image = new Image()
        image.src = layer.dataUrl
        await image.decode()
        if (image.naturalWidth !== doc.width || image.naturalHeight !== doc.height) throw new Error('Layer PNG dimensions must match the drawing canvas.')
        context(canvas).drawImage(image, 0, 0)
      }
      engine.layers.push({ meta: { ...layer, opacity: unit(layer.opacity), blendMode: BLEND_MODES.has(layer.blendMode) ? layer.blendMode : 'source-over', dataUrl: null }, canvas })
    }
    if (!engine.layers.some(layer => layer.meta.id === engine.activeLayerId)) engine.activeLayerId = engine.layers[engine.layers.length - 1].meta.id
    engine.publish()
    return engine
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getState = (): EngineState => this.state

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, this.width, this.height)
    if (this.background) { ctx.fillStyle = this.background; ctx.fillRect(0, 0, this.width, this.height) }
    for (const layer of this.layers) {
      if (!layer.meta.visible) continue
      ctx.globalAlpha = layer.meta.opacity
      ctx.globalCompositeOperation = layer.meta.blendMode
      ctx.drawImage(layer.canvas, 0, 0)
    }
    ctx.restore()
  }

  renderLayer(id: string, ctx: CanvasRenderingContext2D): void {
    const layer = this.layers.find(candidate => candidate.meta.id === id)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    const width = ctx.canvas.width, height = ctx.canvas.height
    ctx.clearRect(0, 0, width, height)
    if (layer) {
      const scale = Math.min(width / this.width, height / this.height)
      ctx.drawImage(layer.canvas, (width - this.width * scale) / 2, (height - this.height * scale) / 2, this.width * scale, this.height * scale)
    }
    ctx.restore()
  }

  beginStroke(point: Point, settings: BrushSettings, erase = false): void {
    this.endStroke()
    const layer = this.editableLayer()
    const brush = normalizeBrush(settings)
    if (!layer || !validPoint(point) || !brush.opacity || !brush.flow) return
    const before = this.snapshot(), stage = this.blankCanvas(), preview = this.copyCanvas(layer.canvas)
    const ctx = context(stage)
    if (this.selection) { traceSelection(ctx, this.selection); ctx.clip('evenodd') }
    const start = { ...point, pressure: unit(point.pressure) }
    this.stroke = { before, layerId: layer.meta.id, original: layer.canvas, preview, stage, ctx,
      tip: createBrushTip({ ...brush, color: erase ? '#000000' : brush.color }), settings: brush, erase, point: start, raw: start, distance: 0 }
    this.replaceCanvas(layer.meta.id, preview)
    stampBrush(ctx, this.stroke.tip, start, brush)
    this.previewStroke()
  }

  moveStroke(point: Point): void {
    const stroke = this.stroke
    if (!stroke || !validPoint(point)) return
    stroke.raw = { ...point, pressure: unit(point.pressure) }
    const alpha = 1 - stroke.settings.smoothing * .85
    this.extendStroke({ x: stroke.point.x + (point.x - stroke.point.x) * alpha,
      y: stroke.point.y + (point.y - stroke.point.y) * alpha,
      pressure: stroke.point.pressure + (stroke.raw.pressure - stroke.point.pressure) * alpha })
    this.previewStroke()
  }

  endStroke(): void {
    const stroke = this.stroke
    if (!stroke) return
    this.extendStroke(stroke.raw)
    this.previewStroke(false)
    this.stroke = null
    this.commit(stroke.before)
  }

  cancelStroke(): void {
    if (!this.stroke) return
    const before = this.stroke.before
    this.stroke = null
    this.restore(before)
    this.publish()
  }

  select(selection: Selection | null): void {
    this.endStroke()
    if (selection) {
      const bounds = selectionBounds(selection)
      if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || !bounds.width || !bounds.height || (selection.kind === 'lasso' && selection.points.length < 3)) selection = null
    }
    this.selection = copySelection(selection)
    this.publish()
  }

  fill(point: Point, color: string, tolerance: number): void {
    this.endStroke()
    const layer = this.editableLayer()
    if (!layer || !validPoint(point)) return
    const probe = document.createElement('canvas')
    probe.width = probe.height = 1
    const probeCtx = context(probe)
    probeCtx.fillStyle = color
    probeCtx.fillRect(0, 0, 1, 1)
    const rgba = probeCtx.getImageData(0, 0, 1, 1).data
    const image = context(layer.canvas).getImageData(0, 0, this.width, this.height)
    if (!floodFill(image.data, this.width, this.height, point.x, point.y, [rgba[0], rgba[1], rgba[2], rgba[3]], tolerance,
      (x, y) => containsPoint(this.selection, x, y))) return
    const before = this.snapshot(), canvas = this.blankCanvas()
    context(canvas).putImageData(image, 0, 0)
    this.replaceCanvas(layer.meta.id, canvas)
    this.commit(before)
  }

  drawShape(kind: 'rectangle' | 'ellipse', from: Point, to: Point, settings: BrushSettings, filled: boolean): void {
    this.endStroke()
    const layer = this.editableLayer()
    if (!layer || !validPoint(from) || !validPoint(to)) return
    const brush = normalizeBrush(settings)
    const bounds = normalizeBounds({ x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y })
    if (!bounds.width || !bounds.height || !brush.opacity) return
    const before = this.snapshot(), canvas = this.copyCanvas(layer.canvas), ctx = context(canvas)
    ctx.save()
    if (this.selection) { traceSelection(ctx, this.selection); ctx.clip('evenodd') }
    ctx.globalAlpha = brush.opacity
    ctx.fillStyle = ctx.strokeStyle = brush.color
    ctx.lineWidth = brush.size
    ctx.lineJoin = 'round'
    traceSelection(ctx, { kind, bounds })
    if (filled) ctx.fill()
    else ctx.stroke()
    ctx.restore()
    this.replaceCanvas(layer.meta.id, canvas)
    this.commit(before)
  }

  transform(value: Transform): void {
    this.endStroke()
    const layer = this.editableLayer()
    if (!layer || !Object.values(value).every(Number.isFinite) || !value.scaleX || !value.scaleY || Math.abs(value.scaleX) > 100 || Math.abs(value.scaleY) > 100) return
    if (!value.x && !value.y && value.scaleX === 1 && value.scaleY === 1 && !value.rotation) return
    const before = this.snapshot(), source = this.blankCanvas(), canvas = this.copyCanvas(layer.canvas)
    const sourceCtx = context(source), ctx = context(canvas)
    const bounds: Bounds = this.selection ? selectionBounds(this.selection) : { x: 0, y: 0, width: this.width, height: this.height }
    if (this.selection) {
      sourceCtx.save()
      traceSelection(sourceCtx, this.selection)
      sourceCtx.clip('evenodd')
      sourceCtx.drawImage(layer.canvas, 0, 0)
      sourceCtx.restore()
      ctx.save()
      traceSelection(ctx, this.selection)
      ctx.clip('evenodd')
      ctx.clearRect(0, 0, this.width, this.height)
      ctx.restore()
    } else {
      sourceCtx.drawImage(layer.canvas, 0, 0)
      ctx.clearRect(0, 0, this.width, this.height)
    }
    const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2
    ctx.save()
    ctx.translate(cx + value.x, cy + value.y)
    ctx.rotate(value.rotation * Math.PI / 180)
    ctx.scale(value.scaleX, value.scaleY)
    ctx.translate(-cx, -cy)
    ctx.drawImage(source, 0, 0)
    ctx.restore()
    this.replaceCanvas(layer.meta.id, canvas)
    if (this.selection) this.selection = transformSelection(this.selection, value)
    this.commit(before)
  }

  /** Whole-layer handles hug painted pixels; selections keep their geometric bounds. */
  getTransformBounds(): Bounds {
    if (this.selection) return selectionBounds(this.selection)
    const layer = this.layers[this.activeIndex()]
    const fallback = { x: 0, y: 0, width: this.width, height: this.height }
    if (!layer) return fallback
    const cached = !this.stroke && this.contentBounds.get(layer.canvas)
    if (cached) return { ...cached }
    const pixels = context(layer.canvas).getImageData(0, 0, this.width, this.height).data
    let left = this.width, top = this.height, right = -1, bottom = -1
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (!pixels[(y * this.width + x) * 4 + 3]) continue
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    const bounds = right < 0 ? fallback : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
    if (!this.stroke) this.contentBounds.set(layer.canvas, bounds)
    return { ...bounds }
  }

  /** Resize, shear, or project selected pixels into four destination corners as one history edit. */
  transformQuad(corners: Quad): void {
    this.endStroke()
    const layer = this.editableLayer()
    if (!layer) return
    const bounds = this.getTransformBounds(), matrix = homographyForQuad(bounds, corners)
    if (!matrix || boundsCorners(bounds).every((point, index) => Math.abs(point.x - corners[index].x) < 1e-8 && Math.abs(point.y - corners[index].y) < 1e-8)) return
    const before = this.snapshot(), prepared = this.prepareQuadSource(layer, bounds)
    prepared.raster ??= context(prepared.source).getImageData(0, 0, this.width, this.height)
    const patch = warpRaster(prepared.raster, bounds, corners, matrix, this.width, this.height)
    const canvas = prepared.base ? this.copyCanvas(prepared.base) : this.blankCanvas()
    if (patch) {
      const pixels = new ImageData(patch.data, patch.width, patch.height)
      if (!prepared.base) context(canvas).putImageData(pixels, patch.x, patch.y)
      else {
        const warped = document.createElement('canvas')
        warped.width = patch.width; warped.height = patch.height
        context(warped).putImageData(pixels, 0, 0)
        context(canvas).drawImage(warped, patch.x, patch.y)
      }
    }
    this.replaceCanvas(layer.meta.id, canvas)
    if (this.selection) this.selection = projectSelection(this.selection, matrix)
    this.commit(before)
  }

  /** Render pending corners without changing pixels, selection, history, revision, or serialization. */
  renderQuadPreview(ctx: CanvasRenderingContext2D, corners: Quad): void {
    const layer = this.editableLayer()
    if (!layer || this.stroke) { this.render(ctx); return }
    const bounds = this.getTransformBounds(), matrix = homographyForQuad(bounds, corners)
    if (!matrix || boundsCorners(bounds).every((point, index) => Math.abs(point.x - corners[index].x) < 1e-8 && Math.abs(point.y - corners[index].y) < 1e-8)) { this.render(ctx); return }
    const prepared = this.prepareQuadSource(layer, bounds)
    prepared.warped ??= this.blankCanvas()
    prepared.preview ??= this.blankCanvas()
    const warpedCtx = context(prepared.warped), previewCtx = context(prepared.preview)
    warpedCtx.clearRect(0, 0, this.width, this.height)
    previewProjective(warpedCtx, prepared.source, bounds, corners, matrix)
    previewCtx.clearRect(0, 0, this.width, this.height)
    if (prepared.base) previewCtx.drawImage(prepared.base, 0, 0)
    previewCtx.drawImage(prepared.warped, 0, 0)
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, this.width, this.height)
    if (this.background) { ctx.fillStyle = this.background; ctx.fillRect(0, 0, this.width, this.height) }
    for (const candidate of this.layers) {
      if (!candidate.meta.visible) continue
      ctx.globalAlpha = candidate.meta.opacity
      ctx.globalCompositeOperation = candidate.meta.blendMode
      ctx.drawImage(candidate.meta.id === layer.meta.id ? prepared.preview : candidate.canvas, 0, 0)
    }
    ctx.restore()
  }

  clearPixels(): void {
    this.endStroke()
    const layer = this.editableLayer()
    if (!layer) return
    const before = this.snapshot(), canvas = this.copyCanvas(layer.canvas), ctx = context(canvas)
    if (this.selection) { traceSelection(ctx, this.selection); ctx.clip('evenodd') }
    ctx.clearRect(0, 0, this.width, this.height)
    this.replaceCanvas(layer.meta.id, canvas)
    this.commit(before)
  }

  addLayer(): void {
    this.endStroke()
    if (this.disposed || !this.canAddLayer()) return
    const before = this.snapshot(), layer = this.makeLayer(`Layer ${this.layers.length + 1}`)
    this.layers.splice(this.activeIndex() + 1, 0, layer)
    this.activeLayerId = layer.meta.id
    this.commit(before)
  }

  duplicateLayer(): void {
    this.endStroke()
    if (this.disposed || !this.canAddLayer()) return
    const index = this.activeIndex(), layer = this.layers[index]
    if (!layer) return
    const before = this.snapshot(), duplicate: RasterLayer = { meta: { ...layer.meta, id: newId(), name: `${layer.meta.name.slice(0, 115)} copy`, locked: false }, canvas: layer.canvas }
    this.layers.splice(index + 1, 0, duplicate)
    this.activeLayerId = duplicate.meta.id
    this.commit(before)
  }

  removeLayer(): void {
    this.endStroke()
    const index = this.activeIndex()
    if (this.disposed || this.layers.length === 1 || index < 0 || this.layers[index].meta.locked) return
    const before = this.snapshot()
    this.layers.splice(index, 1)
    this.activeLayerId = this.layers[Math.min(index, this.layers.length - 1)].meta.id
    this.commit(before)
  }

  moveLayer(direction: 1 | -1): void {
    this.endStroke()
    const index = this.activeIndex(), next = index + direction
    if (this.disposed || index < 0 || next < 0 || next >= this.layers.length) return
    const before = this.snapshot()
    ;[this.layers[index], this.layers[next]] = [this.layers[next], this.layers[index]]
    this.commit(before)
  }

  mergeDown(): void {
    this.endStroke()
    const index = this.activeIndex(), upper = this.editableLayer(), lower = this.layers[index - 1]
    if (!upper || !lower || lower.meta.locked || !lower.meta.visible) return
    // Blended layers depend on every layer below them; flattening only a pair can change their appearance.
    if (upper.meta.blendMode !== 'source-over' || lower.meta.blendMode !== 'source-over') return
    const before = this.snapshot(), canvas = this.blankCanvas(), ctx = context(canvas)
    ctx.globalAlpha = lower.meta.opacity
    ctx.drawImage(lower.canvas, 0, 0)
    ctx.globalAlpha = upper.meta.opacity
    ctx.globalCompositeOperation = upper.meta.blendMode
    ctx.drawImage(upper.canvas, 0, 0)
    const merged: RasterLayer = { meta: { ...lower.meta, opacity: 1, blendMode: 'source-over', dataUrl: null }, canvas }
    this.layers.splice(index - 1, 2, merged)
    this.activeLayerId = merged.meta.id
    this.commit(before)
  }

  setActiveLayer(id: string): void {
    this.endStroke()
    if (this.disposed || id === this.activeLayerId || !this.layers.some(layer => layer.meta.id === id)) return
    this.activeLayerId = id
    this.publish(true)
  }

  updateLayer(id: string, patch: Partial<Pick<DrawingLayer, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>): void {
    this.endStroke()
    const index = this.layers.findIndex(layer => layer.meta.id === id)
    if (this.disposed || index < 0) return
    const before = this.snapshot(), layer = this.layers[index]
    const next = { ...layer.meta, ...patch }
    next.opacity = unit(next.opacity)
    if (!BLEND_MODES.has(next.blendMode)) next.blendMode = 'source-over'
    if (JSON.stringify(next) === JSON.stringify(layer.meta)) return
    this.layers[index] = { meta: next, canvas: layer.canvas }
    this.commit(before)
  }

  setName(name: string): void {
    this.endStroke()
    if (this.disposed || name === this.name) return
    const before = this.snapshot()
    this.name = name
    this.commit(before)
  }

  setBackground(background: string | null): void {
    this.endStroke()
    if (this.disposed || background === this.background) return
    const before = this.snapshot()
    this.background = background
    this.commit(before)
  }

  undo(): void {
    this.cancelStroke()
    if (this.disposed) return
    const previous = this.history.undo(this.snapshot())
    if (!previous) return
    this.restore(previous)
    this.publish(true)
  }

  redo(): void {
    this.cancelStroke()
    if (this.disposed) return
    const next = this.history.redo(this.snapshot())
    if (!next) return
    this.restore(next)
    this.publish(true)
  }

  serialize(): DrawingDocument {
    // Autosave can run during a gesture. Persist the last committed pixels only.
    const snapshot = this.stroke?.before ?? this.snapshot()
    return { version: 1, name: snapshot.name, width: this.width, height: this.height, background: snapshot.background,
      activeLayerId: snapshot.activeLayerId, layers: snapshot.layers.map(layer => ({ ...layer.meta, dataUrl: layer.canvas.toDataURL('image/png') })) }
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = this.blankCanvas()
    this.render(context(canvas))
    return canvas
  }

  sampleColor(point: Point): string | null {
    if (!validPoint(point) || point.x < 0 || point.y < 0 || point.x >= this.width || point.y >= this.height) return null
    const color = context(this.toCanvas()).getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data
    if (!color[3]) return null
    return `#${[color[0], color[1], color[2]].map(channel => channel.toString(16).padStart(2, '0')).join('')}`
  }

  async importImage(image: CanvasImageSource): Promise<void> {
    this.endStroke()
    if (this.disposed) return
    if (!this.canAddLayer()) throw new Error('This drawing has reached its layer or memory limit.')
    const size = imageSize(image)
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) throw new Error('The image has no drawable pixels.')
    const before = this.snapshot(), layer = this.makeLayer('Imported image')
    const scale = Math.min(1, this.width / size.width, this.height / size.height)
    const width = size.width * scale, height = size.height * scale
    context(layer.canvas).drawImage(image, (this.width - width) / 2, (this.height - height) / 2, width, height)
    this.layers.splice(this.activeIndex() + 1, 0, layer)
    this.activeLayerId = layer.meta.id
    this.commit(before)
  }

  dispose(): void {
    this.disposed = true
    this.stroke = null
    this.history.clear()
    this.layers = []
    this.quadSource = null
    this.listeners.clear()
  }

  private blankCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = this.width
    canvas.height = this.height
    return canvas
  }

  private copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = this.blankCanvas()
    context(canvas).drawImage(source, 0, 0)
    return canvas
  }

  private prepareQuadSource(layer: RasterLayer, bounds: Bounds): QuadSource {
    if (this.quadSource?.canvas === layer.canvas && this.quadSource.selection === this.selection) return this.quadSource
    let source = layer.canvas, base: HTMLCanvasElement | null = null
    if (this.selection) {
      source = this.blankCanvas()
      base = this.copyCanvas(layer.canvas)
      const sourceCtx = context(source), baseCtx = context(base)
      sourceCtx.save()
      traceSelection(sourceCtx, this.selection)
      sourceCtx.clip('evenodd')
      sourceCtx.drawImage(layer.canvas, 0, 0)
      sourceCtx.restore()
      baseCtx.save()
      traceSelection(baseCtx, this.selection)
      baseCtx.clip('evenodd')
      baseCtx.clearRect(0, 0, this.width, this.height)
      baseCtx.restore()
    }
    this.quadSource = { canvas: layer.canvas, selection: this.selection, bounds, source, base, raster: null, warped: null, preview: null }
    return this.quadSource
  }

  private makeLayer(name: string): RasterLayer {
    return { meta: { id: newId(), name, visible: true, locked: false, opacity: 1, blendMode: 'source-over', dataUrl: null }, canvas: this.blankCanvas() }
  }

  private activeIndex(): number { return this.layers.findIndex(layer => layer.meta.id === this.activeLayerId) }

  private canAddLayer(): boolean {
    return this.layers.length < MAX_LAYERS && this.width * this.height * (this.layers.length + 1) <= MAX_LAYER_PIXELS
  }

  private editableLayer(): RasterLayer | null {
    const layer = this.layers[this.activeIndex()]
    return !this.disposed && layer?.meta.visible && !layer.meta.locked ? layer : null
  }

  private replaceCanvas(id: string, canvas: HTMLCanvasElement): void {
    this.quadSource = null
    this.layers = this.layers.map(layer => layer.meta.id === id ? { meta: { ...layer.meta, dataUrl: null }, canvas } : layer)
  }

  private snapshot(): Snapshot {
    return { name: this.name, background: this.background, activeLayerId: this.activeLayerId,
      layers: [...this.layers], selection: copySelection(this.selection) }
  }

  private restore(snapshot: Snapshot): void {
    this.quadSource = null
    this.name = snapshot.name
    this.background = snapshot.background
    this.activeLayerId = snapshot.activeLayerId
    this.layers = [...snapshot.layers]
    this.selection = copySelection(snapshot.selection)
    this.history.enforceBudget()
  }

  private commit(before: Snapshot): void {
    this.history.record(before)
    this.publish(true)
  }

  private publish(changed = false): void {
    if (changed) this.revision++
    this.state = { name: this.name, width: this.width, height: this.height, background: this.background,
      activeLayerId: this.activeLayerId, layers: this.layers.map(layer => ({ ...layer.meta })), selection: copySelection(this.selection),
      canUndo: this.history.canUndo, canRedo: this.history.canRedo, revision: this.revision }
    for (const listener of this.listeners) listener()
  }

  private extendStroke(point: Point): void {
    const stroke = this.stroke!
    const dx = point.x - stroke.point.x, dy = point.y - stroke.point.y, distance = Math.hypot(dx, dy)
    if (!distance) { stroke.point = point; return }
    const step = Math.max(.5, brushDiameter(stroke.settings, (point.pressure + stroke.point.pressure) / 2) * stroke.settings.spacing)
    let cursor = Math.max(0, step - stroke.distance)
    for (; cursor <= distance; cursor += step) {
      const ratio = Math.max(0, cursor / distance)
      stampBrush(stroke.ctx, stroke.tip, { x: stroke.point.x + dx * ratio, y: stroke.point.y + dy * ratio,
        pressure: stroke.point.pressure + (point.pressure - stroke.point.pressure) * ratio }, stroke.settings, Math.atan2(dy, dx))
    }
    stroke.distance = Math.max(0, distance - (cursor - step))
    stroke.point = point
  }

  private previewStroke(notify = true): void {
    const stroke = this.stroke!
    const ctx = context(stroke.preview)
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.drawImage(stroke.original, 0, 0)
    ctx.save()
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
    ctx.globalAlpha = stroke.settings.opacity
    ctx.drawImage(stroke.stage, 0, 0)
    ctx.restore()
    if (notify) this.publish()
  }
}
