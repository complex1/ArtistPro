import { id, validateDocument, type AnimationDocument, type AnimationLayer, type Cel } from '../model'
import { MAX_INBETWEENS, type GeneratedDrawing } from './types'

export type InbetweenPlacement = 'insert' | 'fit'
export type InbetweenPlan = {
  /** Zero-based start of the first generated drawing. */
  firstFrame: number
  /** Exclusive end of the last generated drawing. */
  endFrame: number
  /** Frames added before the second key and later drawings on this track. */
  shift: number
  shotDuration: number
  fromDuration: number
  slots: { start: number; duration: number }[]
}

function integer(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`)
}

function endpoints(doc: AnimationDocument, layerId: string, fromCelId: string, toCelId: string): { layer: AnimationLayer; from: Cel; to: Cel } {
  const layer = doc.layers.find(candidate => candidate.id === layerId)
  if (!layer) throw new Error('The selected track no longer exists.')
  if (layer.locked) throw new Error('Unlock this track before adding inbetweens.')
  const index = layer.cels.findIndex(cel => cel.id === fromCelId)
  const from = layer.cels[index], to = layer.cels[index + 1]
  if (!from || !to || to.id !== toCelId) throw new Error('Choose two consecutive drawings in chronological order on the same track.')
  if (!from.dataUrl || !to.dataUrl) throw new Error('Both endpoint drawings must contain saved artwork.')
  return { layer, from, to }
}

function applyPlan(doc: AnimationDocument, layerId: string, fromCelId: string, toStart: number, plan: InbetweenPlan, drawings?: GeneratedDrawing[]): AnimationDocument {
  const ids = new Set(doc.layers.flatMap(layer => [layer.id, ...layer.cels.map(cel => cel.id)]))
  const generated = plan.slots.map((slot, index): Cel => {
    let celId = id()
    while (ids.has(celId)) celId = id()
    ids.add(celId)
    return { id: celId, ...slot, dataUrl: drawings?.[index].dataUrl ?? null, thumbnail: drawings?.[index].thumbnail ?? null }
  })
  return {
    ...doc,
    duration: plan.shotDuration,
    layers: doc.layers.map(layer => layer.id !== layerId ? layer : {
      ...layer,
      cels: [...layer.cels.map(cel => cel.id === fromCelId ? { ...cel, duration: plan.fromDuration }
        : cel.start >= toStart ? { ...cel, start: cel.start + plan.shift } : cel), ...generated].sort((a, b) => a.start - b.start),
    }),
  }
}

function prepare(doc: AnimationDocument, layerId: string, fromCelId: string, toCelId: string, count: number, exposure: number, placement: InbetweenPlacement) {
  integer(count, 1, MAX_INBETWEENS, 'Inbetween count')
  integer(exposure, 1, 12, 'Inbetween exposure')
  if (placement !== 'insert' && placement !== 'fit') throw new Error('Choose insert or fit placement.')
  const source = validateDocument(doc)
  const { layer, from, to } = endpoints(source, layerId, fromCelId, toCelId)
  const firstFrame = from.start + (placement === 'fit' ? 1 : from.duration)
  const gap = to.start - (from.start + from.duration)
  const available = to.start - firstFrame
  if (placement === 'fit' && available < count) throw new Error(`Only ${available} frames are available between these keys. Choose fewer inbetweens or insert frames.`)
  const shift = placement === 'insert' ? Math.max(0, count * exposure - gap) : 0
  const quotient = placement === 'fit' ? Math.floor(available / count) : exposure
  const remainder = placement === 'fit' ? available % count : 0
  let cursor = firstFrame
  const slots = Array.from({ length: count }, (_, index) => {
    const duration = quotient + (index < remainder ? 1 : 0)
    const slot = { start: cursor, duration }
    cursor += duration
    return slot
  })
  const last = layer.cels[layer.cels.length - 1]
  const plan: InbetweenPlan = {
    firstFrame,
    endFrame: cursor,
    shift,
    shotDuration: placement === 'fit' ? source.duration : Math.max(source.duration, last.start + last.duration + shift),
    fromDuration: placement === 'fit' ? 1 : from.duration,
    slots,
  }
  return { source, plan, toStart: to.start }
}

/** Validate proposed timing before generation; output image byte limits are checked when inserted. */
export function planInbetweens(doc: AnimationDocument, layerId: string, fromCelId: string, toCelId: string, count: number, exposure: number, placement: InbetweenPlacement): InbetweenPlan {
  const { source, plan, toStart } = prepare(doc, layerId, fromCelId, toCelId, count, exposure, placement)
  validateDocument(applyPlan(source, layerId, fromCelId, toStart, plan))
  return plan
}

/** Insert all generated cels as one document change, preserving endpoint pixels and other tracks. */
export function insertInbetweens(doc: AnimationDocument, layerId: string, fromCelId: string, toCelId: string, drawings: GeneratedDrawing[], exposure: number, placement: InbetweenPlacement): AnimationDocument {
  if (!Array.isArray(drawings)) throw new Error('Generated drawings must be a list.')
  const { source, plan, toStart } = prepare(doc, layerId, fromCelId, toCelId, drawings.length, exposure, placement)
  if (drawings.some(drawing => !drawing || typeof drawing.dataUrl !== 'string' || typeof drawing.thumbnail !== 'string')) {
    throw new Error('Each generated drawing must include PNG artwork and a thumbnail.')
  }
  return validateDocument(applyPlan(source, layerId, fromCelId, toStart, plan, drawings))
}
