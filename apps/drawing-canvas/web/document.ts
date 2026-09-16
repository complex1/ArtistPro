import { nanoid } from 'nanoid'
import type { BlendMode, DrawingDocument, DrawingLayer } from './engine/types'

export const MAX_CANVAS_DIMENSION = 4096
export const MAX_CANVAS_PIXELS = 4096 * 4096
export const MAX_LAYERS = 32
export const MAX_LAYER_PIXELS = 64 * 1024 * 1024
export const MAX_PROJECT_BYTES = 128 * 1024 * 1024
const BLEND_MODES = new Set<BlendMode>([
  'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
])

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, limit = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new Error(`${label} must contain 1–${limit} characters.`)
  }
  return value.trim()
}

function dimension(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_CANVAS_DIMENSION) {
    throw new Error(`${label} must be a whole number between 1 and ${MAX_CANVAS_DIMENSION} pixels.`)
  }
  return value
}

/** Decode only the PNG header. Validating dimensions before image decoding prevents oversized imports. */
function validatePng(value: unknown, width: number, height: number, label: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > MAX_PROJECT_BYTES || !value.startsWith('data:image/png;base64,')) {
    throw new Error(`${label} must be an embedded PNG image or an empty layer.`)
  }
  const encoded = value.slice(22)
  if (encoded.length < 44 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error(`${label} contains invalid PNG data.`)
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (let offset = 0; offset < 44; offset += 4) {
    const bits = (alphabet.indexOf(encoded[offset]) << 18)
      | (alphabet.indexOf(encoded[offset + 1]) << 12)
      | (alphabet.indexOf(encoded[offset + 2]) << 6)
      | alphabet.indexOf(encoded[offset + 3])
    bytes.push((bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255)
  }
  const expected = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]
  if (!expected.every((byte, index) => bytes[index] === byte)) {
    throw new Error(`${label} contains invalid PNG data.`)
  }
  const uint32 = (offset: number) => bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]
  if (uint32(16) !== width || uint32(20) !== height) {
    throw new Error(`${label} image dimensions must match the ${width} × ${height} canvas.`)
  }
  return value
}

/** Validate and copy the portable format without allocating canvases or executing imported content. */
export function validateDocument(value: unknown): DrawingDocument {
  const source = object(value, 'Drawing project')
  if (source.version !== 1) throw new Error('This drawing project version is not supported.')
  const width = dimension(source.width, 'Canvas width')
  const height = dimension(source.height, 'Canvas height')
  if (width * height > MAX_CANVAS_PIXELS) throw new Error('The canvas is too large.')
  const name = text(source.name, 'Canvas name')
  const background = source.background
  if (background !== null && (typeof background !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(background))) {
    throw new Error('Canvas background must be a hexadecimal color or transparent.')
  }
  if (!Array.isArray(source.layers) || source.layers.length < 1 || source.layers.length > MAX_LAYERS) {
    throw new Error(`A canvas must have between 1 and ${MAX_LAYERS} layers.`)
  }
  if (width * height * source.layers.length > MAX_LAYER_PIXELS) {
    throw new Error('These layers exceed the canvas memory limit. Use fewer layers or a smaller canvas.')
  }
  const ids = new Set<string>()
  let imageBytes = 0
  const layers: DrawingLayer[] = source.layers.map((value, index) => {
    const layer = object(value, `Layer ${index + 1}`)
    const id = text(layer.id, 'Layer ID', 128)
    if (ids.has(id)) throw new Error('Every layer must have a unique ID.')
    ids.add(id)
    if (typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean') {
      throw new Error('Layer visibility and lock state must be true or false.')
    }
    if (typeof layer.opacity !== 'number' || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
      throw new Error('Layer opacity must be a number between 0 and 1.')
    }
    if (!BLEND_MODES.has(layer.blendMode as BlendMode)) throw new Error('This layer blend mode is not supported.')
    const dataUrl = validatePng(layer.dataUrl, width, height, `Layer ${index + 1}`)
    imageBytes += dataUrl?.length ?? 0
    if (imageBytes > MAX_PROJECT_BYTES) throw new Error('Project image data exceeds the 128 MB limit.')
    return {
      id,
      name: text(layer.name, 'Layer name'),
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      blendMode: layer.blendMode as BlendMode,
      dataUrl,
    }
  })
  const activeLayerId = text(source.activeLayerId, 'Active layer ID', 128)
  if (!ids.has(activeLayerId)) throw new Error('The active layer does not exist in this project.')
  return { version: 1, name, width, height, background, activeLayerId, layers }
}

export function createDrawingDocument(name = 'Untitled canvas', width = 1600, height = 1200): DrawingDocument {
  const id = nanoid()
  return validateDocument({
    version: 1,
    name: name.trim() || 'Untitled canvas',
    width,
    height,
    background: '#ffffff',
    activeLayerId: id,
    layers: [{ id, name: 'Layer 1', visible: true, locked: false, opacity: 1, blendMode: 'source-over', dataUrl: null }],
  })
}
