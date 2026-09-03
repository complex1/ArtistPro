function abortError(): DOMException {
  return new DOMException('Render cancelled', 'AbortError')
}

export async function rasterizeSvg(
  svg: string,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  signal?: AbortSignal,
  readPixels = false,
): Promise<ImageData | undefined> {
  if (signal?.aborted) throw abortError()
  if ('fonts' in document) await document.fonts.ready

  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', {
    alpha: true,
    willReadFrequently: true,
  })
  if (!context) throw new Error('A 2D canvas context is unavailable')

  const url = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  )
  try {
    const image = new Image()
    image.decoding = 'sync'
    image.src = url
    await image.decode()
    if (signal?.aborted) throw abortError()
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    if (!readPixels) return undefined
    try {
      return context.getImageData(0, 0, width, height)
    } catch (error) {
      throw new Error(
        `The rendered frame could not be read. Check that image assets allow canvas access: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(
      `SVG frame rasterization failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
