import {
  applyShapeMask,
  encodeShapeStamp,
  type StampUseMode,
} from '../core/stamp'

// Every stroke keeps its own copy of the brush snapshot, so a full-resolution
// photo would be duplicated across the document and overrun local storage.
// Stamps are capped to a size that still looks sharp at any usable brush size.
const MAX_STAMP_PX = 256

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Unsupported stamp file'))
    reader.onerror = () => reject(reader.error ?? new Error('Stamp read failed'))
    reader.readAsDataURL(file)
  })
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Stamp image could not be decoded'))
    image.src = src
  })
}

async function resizeDataUrl(dataUrl: string): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return dataUrl
  }

  const image = await decode(dataUrl)
  const longest = Math.max(image.naturalWidth, image.naturalHeight)
  if (longest <= MAX_STAMP_PX) return dataUrl

  const scale = MAX_STAMP_PX / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) return dataUrl
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export async function readStampFile(file: File): Promise<string> {
  return resizeDataUrl(await readAsDataUrl(file))
}

export async function finalizeStamp(
  sourceUrl: string,
  options: { mode: StampUseMode; invert?: boolean },
): Promise<string> {
  const sized = await resizeDataUrl(sourceUrl)
  if (options.mode === 'image') return sized
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return encodeShapeStamp(sized)
  }

  const image = await decode(sized)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, image.naturalWidth)
  canvas.height = Math.max(1, image.naturalHeight)
  const context = canvas.getContext('2d')
  if (!context) return encodeShapeStamp(sized)
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  applyShapeMask(pixels.data, options.invert === true)
  context.putImageData(pixels, 0, 0)
  return encodeShapeStamp(canvas.toDataURL('image/png'))
}
