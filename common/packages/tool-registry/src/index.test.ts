import { describe, expect, it } from 'vitest'
import { isToolManifest, parseToolManifests } from './index'

describe('tool registry', () => {
  it('accepts a valid manifest and drops junk', () => {
    const svg = {
      id: 'svg-tool',
      title: 'SVG',
      blurb: 'Vector',
      route: '/svg',
      status: 'ready',
      apiPrefix: '/v1/apps/svg-tool',
    }
    expect(isToolManifest(svg)).toBe(true)
    expect(parseToolManifests([svg, { id: 1 }, null])).toEqual([svg])
  })
})
