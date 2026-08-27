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

  it('opens the Paint tool hub and a project editor', () => {
    expect(parseHash('#/paint')).toEqual({ page: 'paint-home' })
    expect(parseHash('#/paint/playground')).toEqual({
      page: 'paint-playground',
    })
    expect(parseHash('#/paint/playground/custom%20brush')).toEqual({
      page: 'paint-playground',
      brushId: 'custom brush',
    })
    expect(parseHash('#/paint/brush-project')).toEqual({
      page: 'paint-editor',
      projectId: 'brush-project',
    })
  })

  it('round-trips hashes', () => {
    const routes: AppRoute[] = [
      { page: 'home' },
      { page: 'svg-home' },
      { page: 'svg-editor', projectId: 'p1' },
      { page: 'paint-home' },
      { page: 'paint-playground' },
      { page: 'paint-playground', brushId: 'custom brush' },
      { page: 'paint-editor', projectId: 'p2' },
    ]
    for (const route of routes) {
      expect(parseHash(toHash(route))).toEqual(route)
    }
  })
})
