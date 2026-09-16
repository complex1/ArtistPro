export type RGBA = readonly [number, number, number, number]

/** Four-connected flood fill. Premultiplied comparisons ignore RGB hidden by transparency. */
export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  color: RGBA,
  tolerance = 0,
  allowed: (x: number, y: number) => boolean = () => true,
): boolean {
  if (!Number.isFinite(startX) || !Number.isFinite(startY)) return false
  const x = Math.floor(startX), y = Math.floor(startY)
  if (x < 0 || y < 0 || x >= width || y >= height || pixels.length !== width * height * 4 || !allowed(x + .5, y + .5)) return false
  const initial = (y * width + x) * 4
  const target = [pixels[initial], pixels[initial + 1], pixels[initial + 2], pixels[initial + 3]]
  const threshold = Math.max(0, Math.min(255, Number.isFinite(tolerance) ? tolerance : 0))
  const visited = new Uint8Array(width * height)
  const stack: number[] = [y * width + x]
  let changed = false
  const matches = (px: number, py: number): boolean => {
    const index = py * width + px
    if (visited[index] || !allowed(px + .5, py + .5)) return false
    const offset = index * 4, alpha = pixels[offset + 3]
    if (Math.abs(alpha - target[3]) > threshold) return false
    for (let channel = 0; channel < 3; channel++) {
      if (Math.abs(pixels[offset + channel] * alpha / 255 - target[channel] * target[3] / 255) > threshold) return false
    }
    return true
  }
  while (stack.length) {
    const index = stack.pop()!
    const row = Math.floor(index / width), column = index % width
    if (!matches(column, row)) continue
    let left = column, right = column
    while (left > 0 && matches(left - 1, row)) left--
    while (right + 1 < width && matches(right + 1, row)) right++
    let aboveRun = false, belowRun = false
    for (let px = left; px <= right; px++) {
      const pixel = row * width + px, offset = pixel * 4
      visited[pixel] = 1
      for (let channel = 0; channel < 4; channel++) {
        if (pixels[offset + channel] !== color[channel]) changed = true
        pixels[offset + channel] = color[channel]
      }
      const above = row > 0 && matches(px, row - 1)
      const below = row + 1 < height && matches(px, row + 1)
      if (above && !aboveRun) stack.push((row - 1) * width + px)
      if (below && !belowRun) stack.push((row + 1) * width + px)
      aboveRun = above
      belowRun = below
    }
  }
  return changed
}
