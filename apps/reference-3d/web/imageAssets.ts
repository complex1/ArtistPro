import { nanoid } from 'nanoid'
import { createSceneObject, validateEmbeddedPng } from './model'
import type { SceneAsset, SceneObject } from './types'

export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_IMPORT_SIDE = 2048

function imageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i])) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

/** Decode raster pixels and re-encode PNG so portable scenes never retain external URLs or source metadata. */
export async function importImagePlane(file: File): Promise<{ asset: SceneAsset; object: SceneObject }> {
  if (!file.size || file.size > MAX_IMAGE_FILE_BYTES) throw new Error('Choose a PNG, JPEG, or WebP image smaller than 20 MiB.')
  const mime = imageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  if (!mime) throw new Error('Choose a PNG, JPEG, or WebP image. This file is not a supported raster image.')
  // Use the verified content type even when the source filename has no extension.
  const image = new Image()
  const url = URL.createObjectURL(file.slice(0, file.size, mime))
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('This image could not be decoded. Choose a valid PNG, JPEG, or WebP file.'))
      image.src = url
    })
    const sourceWidth = image.naturalWidth, sourceHeight = image.naturalHeight
    if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1 || sourceWidth > 32768 || sourceHeight > 32768 || sourceWidth * sourceHeight > 100_000_000) throw new Error('This image has invalid or excessively large dimensions. Resize it before importing.')
    const ratio = Math.min(1, MAX_IMAGE_IMPORT_SIDE / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * ratio)), height = Math.max(1, Math.round(sourceHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    try {
      const context = canvas.getContext('2d', { alpha: true })
      if (!context) throw new Error('The image could not be prepared. Canvas rendering is unavailable.')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/png')
      const png = validateEmbeddedPng(dataUrl)
      if (png.width !== width || png.height !== height) throw new Error('The prepared image has invalid dimensions.')
      const name = file.name.replace(/\.(png|jpe?g|webp)$/i, '').trim().slice(0, 120) || 'Image plane'
      const asset: SceneAsset = { id: nanoid(), name, dataUrl, bones: [], image: { width, height } }
      const object: SceneObject = { ...createSceneObject('image', name), assetId: asset.id }
      return { asset, object }
    } finally {
      // Release the temporary pixel buffer after PNG serialization.
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    image.onload = null
    image.onerror = null
    image.src = ''
    URL.revokeObjectURL(url)
  }
}
