export type ImageRect = { x: number; y: number; width: number; height: number }
export type ImageResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

const MAX_IMAGE_DIMENSION = 32768
const MAX_IMAGE_POSITION = 100000

function clampPosition(value: number) {
  return Math.min(MAX_IMAGE_POSITION, Math.max(-MAX_IMAGE_POSITION, value))
}

function displayScale(zoom: number) {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
}

/** Fit a newly imported image with a little space around it, without enlarging it. */
export function fitImageToCanvas(
  naturalWidth: number,
  naturalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): ImageRect {
  const width = Math.max(1, naturalWidth)
  const height = Math.max(1, naturalHeight)
  const scale = Math.min(1, (canvasWidth * 0.8) / width, (canvasHeight * 0.8) / height)
  const fittedWidth = width * scale
  const fittedHeight = height * scale
  return {
    x: (canvasWidth - fittedWidth) / 2,
    y: (canvasHeight - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  }
}

export function moveImageRect(
  rect: ImageRect,
  screenDx: number,
  screenDy: number,
  zoom: number,
): ImageRect {
  const scale = displayScale(zoom)
  return {
    ...rect,
    x: clampPosition(rect.x + screenDx / scale),
    y: clampPosition(rect.y + screenDy / scale),
  }
}

/** Project the dragged corner onto its aspect-ratio diagonal; never cross the anchor. */
export function resizeImageRect(
  rect: ImageRect,
  corner: ImageResizeCorner,
  screenDx: number,
  screenDy: number,
  zoom: number,
): ImageRect {
  const scale = displayScale(zoom)
  const directionX = corner.endsWith('e') ? 1 : -1
  const directionY = corner.startsWith('s') ? 1 : -1
  const anchorX = rect.x + (directionX < 0 ? rect.width : 0)
  const anchorY = rect.y + (directionY < 0 ? rect.height : 0)
  const width = Math.max(0.001, rect.width)
  const height = Math.max(0.001, rect.height)
  const diagonalSquared = width * width + height * height
  const change = (directionX * width * screenDx + directionY * height * screenDy) / scale
  // Apply limits to one scale so the aspect ratio and opposite corner stay fixed.
  // West/north drags also move the top-left coordinate; their permitted scale
  // interval keeps that coordinate inside the document schema's position limits.
  const maximumScale = Math.min(
    MAX_IMAGE_DIMENSION / width,
    MAX_IMAGE_DIMENSION / height,
    directionX < 0 ? (anchorX + MAX_IMAGE_POSITION) / width : Infinity,
    directionY < 0 ? (anchorY + MAX_IMAGE_POSITION) / height : Infinity,
  )
  const minimumScale = Math.min(maximumScale, Math.max(
    8 / width,
    8 / height,
    directionX < 0 ? (anchorX - MAX_IMAGE_POSITION) / width : 0,
    directionY < 0 ? (anchorY - MAX_IMAGE_POSITION) / height : 0,
  ))
  const sizeScale = Math.min(maximumScale, Math.max(minimumScale, 1 + change / diagonalSquared))
  const nextWidth = Math.min(MAX_IMAGE_DIMENSION, width * sizeScale)
  const nextHeight = Math.min(MAX_IMAGE_DIMENSION, height * sizeScale)
  return {
    x: clampPosition(directionX < 0 ? anchorX - nextWidth : anchorX),
    y: clampPosition(directionY < 0 ? anchorY - nextHeight : anchorY),
    width: nextWidth,
    height: nextHeight,
  }
}
