import { describe, expect, it } from 'vitest'
import { createBrushV2 } from './core/defaults'
import { brushFileName, exportBrushJson, importBrushJson } from './brushTransfer'

describe('brush config transfer', () => {
  it('exports and imports a validated brush with a new identity', () => {
    const original = createBrushV2({
      id: 'original',
      name: 'Moving Stars',
      speed: 2,
      animationJs: 'function animate() { return []; }',
    })
    const imported = importBrushJson(exportBrushJson(original))
    expect(imported).toMatchObject({
      name: 'Moving Stars',
      category: 'Custom',
      speed: 2,
    })
    expect(imported?.id).not.toBe(original.id)
  })

  it('rejects invalid JSON', () => {
    expect(importBrushJson('{nope')).toBeNull()
  })

  it('creates a safe export filename', () => {
    expect(brushFileName(createBrushV2({ name: '  Cloud / Glow  ' }))).toBe(
      'cloud-glow.artist-brush.json',
    )
  })
})
