import { describe, expect, it } from 'vitest'
import {
  brushOutline,
  createBrushStroke,
  defaultBrushSettings,
  outlinePathData,
} from './brush'

describe('brush stroke', () => {
  it('creates a pressure-sensitive vector outline', () => {
    const node = createBrushStroke(
      { x: 20, y: 30 },
      { x: 0, y: 0, pressure: 0.5 },
      defaultBrushSettings,
      true,
    )
    node.samples.push(
      { x: 20, y: 10, pressure: 0.5 },
      { x: 50, y: 25, pressure: 0.5 },
    )
    node.complete = true

    const outline = brushOutline(node)
    expect(outline.length).toBeGreaterThan(node.samples.length)
    expect(outline.every((point) => Number.isFinite(point.x))).toBe(true)
    expect(outline.every((point) => Number.isFinite(point.y))).toBe(true)
  })

  it('ends every curve on a midpoint so smooth quadratics stay on the outline', () => {
    const data = outlinePathData([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])

    expect(data).toBe('M0.00,0.00 Q10.00,0.00 10.00,5.00 T5.00,10.00 Z')
  })

  it('skips outlines too short to curve', () => {
    expect(outlinePathData([{ x: 0, y: 0 }, { x: 4, y: 4 }])).toBe('')
  })

  it('traces a straight vertical drag without doubling back', () => {
    const node = createBrushStroke(
      { x: 0, y: 0 },
      { x: 0, y: 0, pressure: 0.5 },
      { ...defaultBrushSettings, size: 10, pressure: 0 },
      true,
    )
    for (let y = 10; y <= 120; y += 10) {
      node.samples.push({ x: 0, y, pressure: 0.5 })
    }
    node.complete = true

    const outline = brushOutline(node)
    const width =
      Math.max(...outline.map((point) => point.x)) -
      Math.min(...outline.map((point) => point.x))

    expect(width).toBeLessThanOrEqual(node.settings.size + 0.5)
  })
})
