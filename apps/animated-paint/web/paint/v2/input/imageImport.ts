/** Decode once; transforms reuse this native-size surface in the render worker. */
export async function loadImageRaster(dataUrl: string): Promise<HTMLCanvasElement> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image has no usable dimensions.')
  if (image.naturalWidth * image.naturalHeight > 32_000_000 || Math.max(image.naturalWidth, image.naturalHeight) > 16_384) {
    throw new Error('This image is too large. Use an image below 32 megapixels and 16,384 pixels per side.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable.')
  context.drawImage(image, 0, 0)
  return canvas
}

export async function importImageFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG, WebP, GIF, or SVG image.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.')
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The image file could not be read.'))
    reader.readAsDataURL(file)
  })
  const raster = await loadImageRaster(original)
  // Freeze GIFs and rasterize SVGs so saved images replay the same pixels.
  const dataUrl = /image\/(?:gif|svg\+xml)/.test(file.type) ? raster.toDataURL('image/png') : original
  return { dataUrl, raster, naturalWidth: raster.width, naturalHeight: raster.height }
}
