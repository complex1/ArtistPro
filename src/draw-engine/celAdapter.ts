import type { BrushConfig, PointerPoint } from './types'
import { createEngine, type DrawEngine } from './engine'
import { fromPointer } from './sampler'

export function createCelDrawEngine(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): DrawEngine {
  return createEngine({
    canvas,
    backend: 'webgl2',
    document: { name: 'Cel', width, height, background: '#00000000' },
  })
}

export function stampStroke(
  engine: DrawEngine,
  brush: BrushConfig,
  points: PointerPoint[],
): void {
  if (points.length === 0) return
  const first = fromPointer(points[0], null)
  engine.beginStroke(brush, first)
  for (let index = 1; index < points.length; index += 1) {
    engine.moveStroke(points[index])
  }
  engine.endStroke()
}
