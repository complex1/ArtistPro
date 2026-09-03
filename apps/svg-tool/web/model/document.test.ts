import { describe, expect, it } from 'vitest'
import { createBlankDocument } from './document'

describe('blank documents', () => {
  it('creates an empty v2 scene centered on the artboard', () => {
    const document = createBlankDocument('Poster', 1080, 1080)
    expect(document.version).toBe(2)
    expect(document.name).toBe('Poster')
    expect(document.children).toEqual([])
    expect(document.symbols).toEqual([])
    expect(document.artboard.width).toBe(1080)
    expect(document.artboard.height).toBe(1080)
    expect(document.artboard.grid).toMatchObject({
      origin: { x: 540, y: 540 },
    })
  })
})
