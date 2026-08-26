import { describe, expect, it } from 'vitest'
import { parseHash, toHash, type AppRoute } from './routes'

describe('app routes', () => {
  it('lands on Artist Pro home for empty and unknown hashes', () => {
    expect(parseHash('')).toEqual({ page: 'home' })
    expect(parseHash('#/')).toEqual({ page: 'home' })
    expect(parseHash('#/unknown')).toEqual({ page: 'home' })
  })

  it('opens the SVG tool hub and a project editor', () => {
    expect(parseHash('#/svg')).toEqual({ page: 'svg-home' })
    expect(parseHash('#/svg/')).toEqual({ page: 'svg-home' })
    expect(parseHash('#/svg/abc')).toEqual({
      page: 'svg-editor',
      projectId: 'abc',
    })
  })

  it('round-trips hashes', () => {
    const routes: AppRoute[] = [
      { page: 'home' },
      { page: 'svg-home' },
      { page: 'svg-editor', projectId: 'p1' },
    ]
    for (const route of routes) {
      expect(parseHash(toHash(route))).toEqual(route)
    }
  })
})
