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

export async function readStampFile(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file)
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
