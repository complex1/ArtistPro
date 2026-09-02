import { rasterizeSvg } from '../render/rasterize'

export async function svgToPngBlob(
  svg: string,
  width: number,
  height: number,
  scale: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const outWidth = Math.max(1, Math.round(width * scale))
  const outHeight = Math.max(1, Math.round(height * scale))
  await rasterizeSvg(svg, canvas, outWidth, outHeight, signal, false)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('PNG export failed')
  return blob
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function pixelBufferToObjectUrl(data: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('A 2D canvas context is unavailable')
  context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
  return canvas.toDataURL('image/png')
}

export async function decodeRasterFile(file: File): Promise<{
  data: Uint8ClampedArray
  width: number
  height: number
  name: string
}> {
  const type = file.type.toLowerCase()
  if (!type.startsWith('image/') || type.includes('svg') || type.includes('gif')) {
    throw new Error('Use a PNG, JPEG, or WebP still')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('A 2D canvas context is unavailable')
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    return {
      data: image.data,
      width: image.width,
      height: image.height,
      name: file.name.replace(/\.[^.]+$/, ''),
    }
  } finally {
    bitmap.close()
  }
}
