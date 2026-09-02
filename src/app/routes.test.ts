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

  it('opens the Animated Paint tool hub and a project editor', () => {
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

  it('opens the Cel converter', () => {
    expect(parseHash('#/cel')).toEqual({ page: 'cel' })
    expect(parseHash('#/cel/')).toEqual({ page: 'cel' })
  })

  it('opens the raster Draw engine host', () => {
    expect(parseHash('#/draw')).toEqual({ page: 'draw' })
    expect(parseHash('#/draw/')).toEqual({ page: 'draw' })
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
      { page: 'cel' },
      { page: 'draw' },
    ]
    for (const route of routes) {
      expect(parseHash(toHash(route))).toEqual(route)
    }
  })
})
