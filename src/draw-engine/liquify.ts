import type { LiquifyMode } from './types'

export type DisplacementField = {
  width: number
  height: number
  dx: Float32Array
  dy: Float32Array
}

export function createDisplacement(width: number, height: number): DisplacementField {
  return {
    width,
    height,
    dx: new Float32Array(width * height),
    dy: new Float32Array(width * height),
  }
}

export function applyLiquifyStroke(
  field: DisplacementField,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  strength: number,
  mode: LiquifyMode,
): void {
  const r = Math.max(2, radius)
  const x0 = Math.max(0, Math.floor(x - r))
  const y0 = Math.max(0, Math.floor(y - r))
  const x1 = Math.min(field.width, Math.ceil(x + r))
  const y1 = Math.min(field.height, Math.ceil(y + r))
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const ddx = px + 0.5 - x
      const ddy = py + 0.5 - y
      const dist = Math.hypot(ddx, ddy)
      if (dist >= r) continue
      const falloff = (1 - dist / r) ** 2 * strength
      const i = py * field.width + px
      if (mode === 'push') {
        field.dx[i] += vx * falloff
        field.dy[i] += vy * falloff
      } else if (mode === 'pinch') {
        field.dx[i] -= ddx * falloff * 0.15
        field.dy[i] -= ddy * falloff * 0.15
      } else {
        const angle = falloff * 0.35
        const rx = ddx * Math.cos(angle) - ddy * Math.sin(angle)
        const ry = ddx * Math.sin(angle) + ddy * Math.cos(angle)
        field.dx[i] += rx - ddx
        field.dy[i] += ry - ddy
      }
    }
  }
}

export function sampleWithDisplacement(
  x: number,
  y: number,
  field: DisplacementField,
): { x: number; y: number } {
  const ix = Math.min(field.width - 1, Math.max(0, Math.floor(x)))
  const iy = Math.min(field.height - 1, Math.max(0, Math.floor(y)))
  const i = iy * field.width + ix
  return { x: x - field.dx[i], y: y - field.dy[i] }
}
