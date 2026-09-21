export type PaintSurface = HTMLCanvasElement | OffscreenCanvas
export type PaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function createSurface(width: number, height: number): PaintSurface | null {
  const surface = typeof document !== 'undefined'
    ? document.createElement('canvas')
    : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null
  if (surface) { surface.width = width; surface.height = height }
  return surface
}

export function context2d(surface: PaintSurface): PaintContext | null {
  return surface.getContext('2d') as PaintContext | null
}
