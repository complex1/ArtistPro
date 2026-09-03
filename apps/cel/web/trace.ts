import ImageTracer from 'imagetracerjs'
import { uniqueOpaqueColors, type PixelBuffer } from './restore'

export type TraceOptions = {
  speckle: number
  cornerThreshold: number
}

export const CEL_TRACE_DEFAULTS: TraceOptions = {
  speckle: 4,
  cornerThreshold: 60,
}

export function svgDocument(
  width: number,
  height: number,
  inner: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner}</svg>`
}

export async function traceToSvg(
  buffer: PixelBuffer,
  options: TraceOptions,
): Promise<string> {
  const colors = uniqueOpaqueColors(buffer.data)
  if (colors.length === 0) return svgDocument(buffer.width, buffer.height, '')
  if (colors.length === 1) {
    const [r, g, b] = colors[0] ?? [0, 0, 0]
    return svgDocument(
      buffer.width,
      buffer.height,
      `<rect width="100%" height="100%" fill="rgb(${r},${g},${b})"/>`,
    )
  }

  try {
    return await traceWithVTrace(buffer, options)
  } catch {
    return imageTracerSvg(buffer, options)
  }
}

async function traceWithVTrace(
  buffer: PixelBuffer,
  options: TraceOptions,
): Promise<string> {
  const { VTrace } = await import('@buzz-dee/vtrace')
  const pixels = new Uint8ClampedArray(buffer.width * buffer.height * 4)
  pixels.set(buffer.data)
  const imageData = new ImageData(pixels, buffer.width, buffer.height)
  const tracer = new VTrace(imageData, {
    colorMode: 'color',
    hierarchical: 'stacked',
    mode: 'spline',
    filterSpeckle: options.speckle,
    cornerThreshold: options.cornerThreshold,
    colorPrecision: 8,
    layerDifference: 8,
    background: VTrace.COLOR_TRANSPARENT,
  })
  const svg = tracer.getSVG()
  if (!svg.includes('<svg')) throw new Error('VTrace returned empty markup')
  return svg
}

export function imageTracerSvg(
  buffer: PixelBuffer,
  options: TraceOptions,
): string {
  return ImageTracer.imagedataToSVG(
    {
      width: buffer.width,
      height: buffer.height,
      data: buffer.data,
    },
    {
      ltres: 1,
      qtres: 1,
      pathomit: options.speckle,
      rightangleenhance: true,
      blurradius: 0,
      numberofcolors: Math.max(2, uniqueOpaqueColors(buffer.data).length),
      mincolorratio: 0,
      colorquantcycles: 1,
      scale: 1,
      strokewidth: 0,
      linefilter: true,
      viewbox: true,
    },
  )
}
