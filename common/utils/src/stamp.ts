export const SHAPE_STAMP_PREFIX = 'shape:'

export type StampUseMode = 'image' | 'shape'

export function isShapeStamp(stamp: string): boolean {
  return stamp.startsWith(SHAPE_STAMP_PREFIX)
}

export function stampPaintSrc(stamp: string): string {
  return isShapeStamp(stamp)
    ? stamp.slice(SHAPE_STAMP_PREFIX.length)
    : stamp
}

export function encodeShapeStamp(dataUrl: string): string {
  return `${SHAPE_STAMP_PREFIX}${dataUrl}`
}

export function isImageStamp(stamp: string): boolean {
  const src = stampPaintSrc(stamp)
  return (
    src.startsWith('data:') ||
    src.startsWith('http') ||
    src.startsWith('blob:') ||
    src.startsWith('/')
  )
}

export function stampPreviewSrc(stamp: string): string | null {
  return isImageStamp(stamp) ? stampPaintSrc(stamp) : null
}

export function applyShapeMask(
  pixels: Uint8ClampedArray,
  invert: boolean,
): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance =
      0.2126 * pixels[index] +
      0.7152 * pixels[index + 1] +
      0.0722 * pixels[index + 2]
    const coverage = invert ? luminance : 255 - luminance
    const alpha = pixels[index + 3]
    pixels[index] = 255
    pixels[index + 1] = 255
    pixels[index + 2] = 255
    pixels[index + 3] = Math.round((coverage / 255) * alpha)
  }
}

export function appendStamp(stamps: string[], stamp: string): string[] {
  return [...stamps, stamp]
}

export function removeStampAt(stamps: string[], index: number): string[] {
  const next = stamps.filter((_, current) => current !== index)
  return next.length > 0 ? next : ['dot']
}
