import { describe, expect, it } from 'vitest'
import { createPaperHost } from './paperHost'

describe('paper host seam', () => {
  it('returns the path unchanged until Paper.js is wired', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 8, y: 4 },
    ]
    expect(createPaperHost().editPath(points)).toEqual(points)
  })
})
