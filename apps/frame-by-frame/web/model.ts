import { nanoid } from 'nanoid'
import { validateDocument as validateRaster } from '../../drawing-canvas/web/document'

export type Cel = { id: string; start: number; duration: number; dataUrl: string | null; thumbnail: string | null }
/** Drawing layers are ordered bottom to top. Cels use zero-based, non-overlapping intervals. */
export type AnimationLayer = { id: string; name: string; visible: boolean; locked: boolean; opacity: number; cels: Cel[] }
export type AnimationDocument = {
  format: 'artist-frame-by-frame'; version: 1; name: string; width: number; height: number;
  fps: number; duration: number; background: string | null; layers: AnimationLayer[];
}
export const MAX_FRAMES = 2400
export const MAX_CELS = 500
export const MAX_BYTES = 128 * 1024 * 1024
export const MAX_DIMENSION = 2048
export const id = () => nanoid()
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid animation project.')
  return value as Record<string, unknown>
}
const integer = (value: unknown, min: number, max: number, label: string) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`)
  return value
}
const text = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error(`${label} must contain 1–120 characters.`)
  return value
}

export function rasterDocument(width: number, height: number, dataUrl: string | null) {
  return { version: 1 as const, name: 'Drawing', width, height, background: null, activeLayerId: 'pixels', layers: [{ id: 'pixels', name: 'Drawing', visible: true, locked: false, opacity: 1, blendMode: 'source-over' as const, dataUrl }] }
}

export function validateDocument(value: unknown): AnimationDocument {
  const doc = record(value)
  if (doc.format !== 'artist-frame-by-frame' || doc.version !== 1) throw new Error('This is not a supported FrameByFrame project.')
  const width = integer(doc.width, 1, MAX_DIMENSION, 'Width'), height = integer(doc.height, 1, MAX_DIMENSION, 'Height')
  const duration = integer(doc.duration, 1, MAX_FRAMES, 'Shot length'), fps = integer(doc.fps, 1, 60, 'Frame rate')
  if (doc.background !== null && (typeof doc.background !== 'string' || !/^#[0-9a-f]{6}$/i.test(doc.background))) throw new Error('Use a six-digit background color or transparency.')
  if (!Array.isArray(doc.layers) || !doc.layers.length || doc.layers.length > 16 || doc.layers.length * width * height > 32 * 1024 * 1024) throw new Error('This shot exceeds the layer memory limit. Use fewer layers or a smaller canvas.')
  const ids = new Set<string>()
  let bytes = 0, count = 0
  const layers = doc.layers.map(value => {
    const layer = record(value), layerId = text(layer.id, 'Layer ID').trim()
    if (ids.has(layerId)) throw new Error('Duplicate layer or drawing ID.')
    ids.add(layerId)
    if (typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean' || typeof layer.opacity !== 'number' || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) throw new Error('Invalid layer settings.')
    if (!Array.isArray(layer.cels)) throw new Error('Invalid drawing list.')
    const cels = layer.cels.map(value => {
      const cel = record(value), celId = text(cel.id, 'Drawing ID').trim()
      if (ids.has(celId)) throw new Error('Duplicate layer or drawing ID.')
      ids.add(celId)
      if (++count > MAX_CELS) throw new Error(`A shot can contain up to ${MAX_CELS} drawings.`)
      const start = integer(cel.start, 0, duration - 1, 'Drawing start'), length = integer(cel.duration, 1, duration - start, 'Exposure')
      const pixels = validateRaster(rasterDocument(width, height, cel.dataUrl as string | null)).layers[0].dataUrl
      let thumbnail: string | null = null
      if (cel.thumbnail != null) thumbnail = validateRaster(rasterDocument(96, 64, cel.thumbnail as string)).layers[0].dataUrl
      bytes += (pixels?.length ?? 0) + (thumbnail?.length ?? 0)
      if (bytes > MAX_BYTES) throw new Error('This shot exceeds the 128 MB project limit.')
      return { id: celId, start, duration: length, dataUrl: pixels, thumbnail }
    }).sort((a, b) => a.start - b.start)
    if (cels.some((cel, index) => index > 0 && cels[index - 1].start + cels[index - 1].duration > cel.start)) throw new Error('Drawings on the same layer must not overlap.')
    return { id: layerId, name: text(layer.name, 'Layer name'), visible: layer.visible, locked: layer.locked, opacity: layer.opacity, cels }
  })
  return { format: 'artist-frame-by-frame', version: 1, name: text(doc.name, 'Shot name'), width, height, fps, duration, background: doc.background, layers }
}

export function createDocument(name = 'Untitled shot', width = 1280, height = 720, fps = 12): AnimationDocument {
  return validateDocument({ format: 'artist-frame-by-frame', version: 1, name: name.trim() || 'Untitled shot', width, height, fps, duration: fps * 2, background: '#ffffff', layers: [{ id: id(), name: 'Animation', visible: true, locked: false, opacity: 1, cels: [{ id: id(), start: 0, duration: 2, dataUrl: null, thumbnail: null }] }] })
}

export const celAt = (layer: AnimationLayer, frame: number): Cel | undefined => layer.cels.find(cel => cel.start <= frame && frame < cel.start + cel.duration)
export const lastContentFrame = (doc: AnimationDocument) => Math.max(1, ...doc.layers.flatMap(layer => layer.cels.map(cel => cel.start + cel.duration)))
/** Keep one empty, editable track after removing the last track. Undo restores all drawings. */
export function deleteTrack(doc: AnimationDocument, layerId: string): AnimationDocument {
  const track = doc.layers.find(layer => layer.id === layerId)
  if (!track) throw new Error('Layer not found.')
  if (track.locked) throw new Error('Unlock this track before deleting it.')
  const layers = doc.layers.filter(layer => layer.id !== layerId)
  if (!layers.length) layers.push({ id: id(), name: 'Animation', visible: true, locked: false, opacity: 1, cels: [] })
  return validateDocument({ ...doc, layers })
}
export function editLayer(doc: AnimationDocument, layerId: string, edit: (layer: AnimationLayer) => AnimationLayer): AnimationDocument {
  const layer = doc.layers.find(layer => layer.id === layerId)
  if (!layer) throw new Error('Layer not found.')
  if (layer.locked) throw new Error('Unlock this layer to edit its drawings or timing.')
  return { ...doc, layers: doc.layers.map(layer => layer.id === layerId ? edit(layer) : layer) }
}

/** Insertion pushes later drawings on this layer only; other layers retain their timing. */
export function insertCel(doc: AnimationDocument, layerId: string, start: number, duration: number, source?: Pick<Cel, 'dataUrl' | 'thumbnail'>): { document: AnimationDocument; cel: Cel } {
  integer(start, 0, MAX_FRAMES - 1, 'Drawing start')
  integer(duration, 1, MAX_FRAMES, 'Exposure')
  const cel: Cel = { id: id(), start, duration, dataUrl: source?.dataUrl ?? null, thumbnail: source?.thumbnail ?? null }
  const next = editLayer(doc, layerId, layer => {
    const covering = celAt(layer, start)
    if (covering && covering.start < start) throw new Error('Insert after the current drawing, or split it first.')
    const upcoming = layer.cels.find(item => item.start >= start)
    const shift = upcoming ? Math.max(0, start + duration - upcoming.start) : 0
    return { ...layer, cels: [...layer.cels.map(item => item.start >= start ? { ...item, start: item.start + shift } : item), cel].sort((a, b) => a.start - b.start) }
  })
  return { document: validateDocument({ ...next, duration: Math.max(doc.duration, lastContentFrame(next)) }), cel }
}

export function setExposure(doc: AnimationDocument, layerId: string, celId: string, duration: number): AnimationDocument {
  integer(duration, 1, MAX_FRAMES, 'Exposure')
  const next = editLayer(doc, layerId, layer => {
    const cel = layer.cels.find(item => item.id === celId)
    if (!cel) throw new Error('Drawing not found.')
    const delta = duration - cel.duration
    return { ...layer, cels: layer.cels.map(item => item.id === celId ? { ...item, duration } : item.start > cel.start ? { ...item, start: item.start + delta } : item) }
  })
  return validateDocument({ ...next, duration: Math.max(doc.duration, lastContentFrame(next)) })
}

export function splitCel(doc: AnimationDocument, layerId: string, frame: number): AnimationDocument {
  return validateDocument(editLayer(doc, layerId, layer => {
    const cel = celAt(layer, frame)
    if (!cel || frame === cel.start) throw new Error('Place the playhead inside a held drawing to split it.')
    return { ...layer, cels: layer.cels.flatMap(item => item.id === cel.id ? [{ ...item, duration: frame - item.start }, { ...item, id: id(), start: frame, duration: item.start + item.duration - frame }] : [item]) }
  }))
}

/** Moving rejects overlap, instead of overwriting a neighboring drawing. */
export function moveCel(doc: AnimationDocument, layerId: string, celId: string, start: number): AnimationDocument {
  integer(start, 0, MAX_FRAMES - 1, 'Drawing start')
  const next = editLayer(doc, layerId, layer => ({ ...layer, cels: layer.cels.map(cel => cel.id === celId ? { ...cel, start } : cel) }))
  return validateDocument({ ...next, duration: Math.max(doc.duration, lastContentFrame(next)) })
}

export function onionCels(layer: AnimationLayer, frame: number, before: number, after: number): { cel: Cel; direction: 'before' | 'after'; distance: number }[] {
  const current = celAt(layer, frame)
  const previous = before > 0 ? layer.cels.filter(cel => cel.start + cel.duration <= (current?.start ?? frame)).slice(-before).reverse() : []
  const upcoming = layer.cels.filter(cel => cel.start >= (current ? current.start + current.duration : frame + 1)).slice(0, after)
  return [...previous.map((cel, i) => ({ cel, direction: 'before' as const, distance: i + 1 })), ...upcoming.map((cel, i) => ({ cel, direction: 'after' as const, distance: i + 1 }))]
}

export function playbackFrame(start: number, elapsedMs: number, fps: number, duration: number, loop: boolean) {
  const advanced = start + Math.floor(Math.max(0, elapsedMs) * fps / 1000)
  return { frame: loop ? advanced % duration : Math.min(duration - 1, advanced), ended: !loop && advanced >= duration }
}
