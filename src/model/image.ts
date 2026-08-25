import { nanoid } from 'nanoid'
import { defaultTransform } from './transform'
import type { ImageNode } from './types'

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read this image.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode this image.'))
    image.src = source
  })
}

export async function createImageNode(
  file: File,
  artboard: { width: number; height: number },
): Promise<ImageNode> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP image.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be 20 MB or smaller.')
  }
  const source = await readFile(file)
  const image = await loadImage(source)
  const scale = Math.min(
    1,
    (artboard.width * 0.6) / image.naturalWidth,
    (artboard.height * 0.6) / image.naturalHeight,
  )
  const width = Math.max(1, image.naturalWidth * scale)
  const height = Math.max(1, image.naturalHeight * scale)

  return {
    id: nanoid(),
    type: 'image',
    name: file.name.replace(/\.[^.]+$/, '') || 'Image',
    visible: true,
    locked: false,
    pivotPreset: 'center',
    effects: [],
    source,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    width,
    height,
    crop: {
      x: 0,
      y: 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
    },
    adjustments: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      chroma: {
        enabled: false,
        color: '#00ff00',
        tolerance: 0.12,
        feather: 0.08,
      },
    },
    transform: {
      ...defaultTransform(),
      position: {
        x: (artboard.width - width) / 2,
        y: (artboard.height - height) / 2,
      },
      pivot: { x: width / 2, y: height / 2 },
    },
  }
}

const rgb = (hex: string) => ({
  r: Number.parseInt(hex.slice(1, 3), 16),
  g: Number.parseInt(hex.slice(3, 5), 16),
  b: Number.parseInt(hex.slice(5, 7), 16),
})

export function chromaKey(
  color: string,
  tolerance: number,
  feather: number,
): string {
  return `${color}:${tolerance.toFixed(3)}:${feather.toFixed(3)}`
}

export async function processChroma(
  source: string,
  color: string,
  tolerance: number,
  feather: number,
): Promise<string> {
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Image processing is unavailable.')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const key = rgb(color)
  const hard = Math.max(0, tolerance)
  const soft = Math.max(0.001, feather)
  const maxDistance = Math.sqrt(3 * 255 * 255)

  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index] - key.r
    const green = pixels.data[index + 1] - key.g
    const blue = pixels.data[index + 2] - key.b
    const distance = Math.sqrt(red * red + green * green + blue * blue) / maxDistance
    if (distance <= hard) {
      pixels.data[index + 3] = 0
    } else if (distance < hard + soft) {
      const factor = (distance - hard) / soft
      pixels.data[index + 3] = Math.round(pixels.data[index + 3] * factor)
    }
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}
