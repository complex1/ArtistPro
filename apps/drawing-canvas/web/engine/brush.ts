import type { BrushPreset, BrushSettings, Point } from './types'

export const DEFAULT_BRUSH: BrushSettings = {
  kind: 'ink', color: '#272b36', size: 18, opacity: 1, flow: 1, hardness: .95,
  spacing: .12, smoothing: .35, pressureSize: true, pressureOpacity: false,
}

const PRESET_DEFAULTS: Omit<BrushSettings, 'color'> = {
  kind: DEFAULT_BRUSH.kind, size: DEFAULT_BRUSH.size, opacity: DEFAULT_BRUSH.opacity,
  flow: DEFAULT_BRUSH.flow, hardness: DEFAULT_BRUSH.hardness, spacing: DEFAULT_BRUSH.spacing,
  smoothing: DEFAULT_BRUSH.smoothing, pressureSize: DEFAULT_BRUSH.pressureSize, pressureOpacity: DEFAULT_BRUSH.pressureOpacity,
}

export const BRUSH_PRESETS: BrushPreset[] = [
  { id: 'ink', name: 'Studio ink', description: 'A smooth round tip for confident lines.', settings: { ...PRESET_DEFAULTS, kind: 'ink' } },
  { id: 'pencil', name: 'Graphite', description: 'A grainy tip with a soft pressure response.', settings: { ...PRESET_DEFAULTS, kind: 'pencil', size: 7, flow: .48, hardness: .8, spacing: .14, pressureOpacity: true } },
  { id: 'marker', name: 'Soft marker', description: 'A broad oval tip with translucent color.', settings: { ...PRESET_DEFAULTS, kind: 'marker', size: 38, opacity: .45, hardness: .85, spacing: .08, pressureSize: false } },
  { id: 'airbrush', name: 'Airbrush', description: 'Feathered color that builds with each pass.', settings: { ...PRESET_DEFAULTS, kind: 'airbrush', size: 100, flow: .12, hardness: 0, spacing: .1, pressureOpacity: true } },
  { id: 'flat', name: 'Flat brush', description: 'A square tip for broad, directional strokes.', settings: { ...PRESET_DEFAULTS, kind: 'flat', size: 40, flow: .8, hardness: 1, spacing: .08 } },
]

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low))

export function normalizeBrush(settings: BrushSettings): BrushSettings {
  return {
    ...settings,
    size: clamp(settings.size, 1, 1000), opacity: clamp(settings.opacity, 0, 1),
    flow: clamp(settings.flow, 0, 1), hardness: clamp(settings.hardness, 0, 1),
    spacing: clamp(settings.spacing, .01, 1), smoothing: clamp(settings.smoothing, 0, 1),
  }
}

/** One cached stamp per stroke; the same textured tip follows the entire gesture. */
export function createBrushTip(settings: BrushSettings): HTMLCanvasElement {
  const tip = document.createElement('canvas')
  tip.width = tip.height = 128
  const ctx = tip.getContext('2d')!
  const center = 64, radius = 63
  ctx.fillStyle = settings.color
  if (settings.kind === 'flat') {
    ctx.fillRect(1, 30, 126, 68)
    if (settings.hardness < 1) {
      const image = ctx.getImageData(0, 0, 128, 128)
      const feather = Math.max(.01, 34 * (1 - settings.hardness))
      for (let y = 30; y < 98; y++) for (let x = 1; x < 127; x++) {
        const distance = Math.min(x - .5, 126.5 - x, y - 29.5, 97.5 - y)
        const alpha = Math.min(1, distance / feather)
        image.data[(y * 128 + x) * 4 + 3] *= alpha * alpha * (3 - 2 * alpha)
      }
      ctx.putImageData(image, 0, 0)
    }
  } else {
    ctx.save()
    if (settings.kind === 'marker') { ctx.translate(center, center); ctx.scale(1, .62); ctx.translate(-center, -center) }
    if (settings.hardness < .999) {
      const gradient = ctx.createRadialGradient(center, center, radius * settings.hardness, center, center, radius)
      gradient.addColorStop(0, settings.color)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
    }
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  if (settings.kind === 'pencil') {
    let seed = 1729
    ctx.globalCompositeOperation = 'destination-out'
    for (let index = 0; index < 3000; index++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const x = seed >>> 25
      seed = (seed * 1664525 + 1013904223) >>> 0
      const y = seed >>> 25
      ctx.globalAlpha = .35 + (seed % 60) / 100
      ctx.fillRect(x, y, 1.5, 1.5)
    }
  }
  return tip
}

export function brushDiameter(settings: BrushSettings, pressure: number): number {
  return settings.size * (settings.pressureSize ? .12 + clamp(pressure, 0, 1) * .88 : 1)
}

export function stampBrush(ctx: CanvasRenderingContext2D, tip: HTMLCanvasElement, point: Point, settings: BrushSettings, angle = 0): void {
  const size = brushDiameter(settings, point.pressure)
  ctx.save()
  ctx.globalAlpha = settings.flow * (settings.pressureOpacity ? clamp(point.pressure, 0, 1) : 1)
  ctx.translate(point.x, point.y)
  if (settings.kind === 'flat') ctx.rotate(angle)
  else if (settings.kind === 'marker') ctx.rotate(-Math.PI / 6)
  ctx.drawImage(tip, -size / 2, -size / 2, size, size)
  ctx.restore()
}
