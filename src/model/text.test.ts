import { describe, expect, it } from 'vitest'
import { localBounds, resizeNode } from './scene'
import { createText, naturalTextWidth } from './text'

describe('text nodes', () => {
  it('creates positioned text with centered pivot and measurable width', () => {
    const node = createText({ x: 40, y: 70 }, 'Vector')

    expect(node.transform.position).toEqual({ x: 40, y: 70 })
    expect(node.width).toBeGreaterThan(1)
    expect(node.transform.pivot).toEqual({
      x: node.width / 2,
      y: node.fontSize / 2,
    })
    expect(localBounds(node)).toEqual({
      x: 0,
      y: 0,
      width: node.width,
      height: node.fontSize,
    })
  })

  it('includes letter spacing in natural width', () => {
    const style = {
      fontFamily: 'Inter',
      fontSize: 20,
      fontWeight: 400,
      letterSpacing: 4,
    }

    expect(naturalTextWidth('ABC', style) - naturalTextWidth('ABC', {
      ...style,
      letterSpacing: 0,
    })).toBe(8)
  })

  it('resizes glyph geometry without transform scale', () => {
    const node = createText({ x: 40, y: 70 }, 'Text')
    const resized = resizeNode(node, { x: 2, y: 0.5 }, { x: 0, y: 0 })

    expect(resized.type).toBe('text')
    if (resized.type !== 'text') return
    expect(resized.width).toBeCloseTo(node.width * 2)
    expect(resized.fontSize).toBe(24)
    expect(resized.transform.scale).toEqual({ x: 1, y: 1 })
  })
})
