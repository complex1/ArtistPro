import { describe, expect, it } from 'vitest'
import {
  parseHash,
  projectRoute,
  toHash,
  toolHomeRoute,
  type AppRoute,
} from './routes'

describe('app routes', () => {
  it('opens FrameByFrame shots and safely round-trips encoded IDs', () => {
    expect(parseHash('#/frame-by-frame')).toEqual({ page: 'frame-home' })
    const route: AppRoute = { page: 'frame-editor', projectId: 'my shot/1' }
    expect(parseHash(toHash(route))).toEqual(route)
    expect(parseHash('#/frame-by-frame/%E0%A4%A')).toEqual({ page: 'frame-home' })
    expect(toolHomeRoute('/frame-by-frame')).toEqual({ page: 'frame-home' })
    expect(projectRoute('/frame-by-frame', 'shot')).toEqual({ page: 'frame-editor', projectId: 'shot' })
  })
  it('lands on Artist Pro home for empty and unknown hashes', () => {
    expect(parseHash('')).toEqual({ page: 'home' })
    expect(parseHash('#/')).toEqual({ page: 'home' })
    expect(parseHash('#/unknown')).toEqual({ page: 'home' })
    expect(parseHash('#/draw')).toEqual({ page: 'home' })
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

  it('opens the Cel hub and a restoration editor', () => {
    expect(parseHash('#/cel')).toEqual({ page: 'cel-home' })
    expect(parseHash('#/cel/')).toEqual({ page: 'cel-home' })
    expect(parseHash('#/cel/still')).toEqual({
      page: 'cel-editor',
      projectId: 'still',
    })
  })

  it('opens Live Character and decodes project IDs without crashing on malformed links', () => {
    expect(parseHash('#/live-character')).toEqual({ page: 'live-character-home' })
    expect(parseHash('#/live-character/')).toEqual({ page: 'live-character-home' })
    expect(parseHash('#/live-character/a%20character')).toEqual({ page: 'live-character-editor', projectId: 'a character' })
    expect(parseHash('#/live-character/%E0%A4%A')).toEqual({ page: 'live-character-home' })
  })

  it('opens TapPilot', () => {
    expect(parseHash('#/tappilot')).toEqual({ page: 'tappilot' })
  })

  it('opens Drawing Canvas and safely decodes project links', () => {
    expect(parseHash('#/drawing-canvas')).toEqual({ page: 'drawing-home' })
    expect(parseHash('#/drawing-canvas/')).toEqual({ page: 'drawing-home' })
    expect(parseHash('#/drawing-canvas/my%20canvas%2F1')).toEqual({ page: 'drawing-editor', projectId: 'my canvas/1' })
    expect(parseHash('#/drawing-canvas/%E0%A4%A')).toEqual({ page: 'drawing-home' })
    expect(toolHomeRoute('/drawing-canvas')).toEqual({ page: 'drawing-home' })
    expect(projectRoute('/drawing-canvas', 'sketch')).toEqual({ page: 'drawing-editor', projectId: 'sketch' })
  })

  it('round-trips hashes', () => {
    const routes: AppRoute[] = [
      { page: 'home' },
      { page: 'drawing-home' },
      { page: 'drawing-editor', projectId: 'my canvas/1' },
      { page: 'svg-home' },
      { page: 'svg-editor', projectId: 'p1' },
      { page: 'paint-home' },
      { page: 'paint-playground' },
      { page: 'paint-playground', brushId: 'custom brush' },
      { page: 'paint-editor', projectId: 'p2' },
      { page: 'cel-home' },
      { page: 'cel-editor', projectId: 'still' },
      { page: 'tappilot' },
      { page: 'live-character-home' },
      { page: 'live-character-editor', projectId: 'my character/1' },
    ]
    for (const route of routes) {
      expect(parseHash(toHash(route))).toEqual(route)
    }
  })

  it('maps a tool manifest route to its hub and editor', () => {
    expect(toolHomeRoute('/svg')).toEqual({ page: 'svg-home' })
    expect(toolHomeRoute('/paint')).toEqual({ page: 'paint-home' })
    expect(toolHomeRoute('/cel')).toEqual({ page: 'cel-home' })
    expect(toolHomeRoute('/tappilot')).toEqual({ page: 'tappilot' })
    expect(toolHomeRoute('/live-character')).toEqual({ page: 'live-character-home' })
    expect(projectRoute('/live-character', 'rig')).toEqual({ page: 'live-character-editor', projectId: 'rig' })
    expect(projectRoute('/svg', 'p1')).toEqual({
      page: 'svg-editor',
      projectId: 'p1',
    })
    expect(projectRoute('/paint', 'p2')).toEqual({
      page: 'paint-editor',
      projectId: 'p2',
    })
    expect(projectRoute('/cel', 'still')).toEqual({
      page: 'cel-editor',
      projectId: 'still',
    })
  })

  it('has no destination for unknown tool routes', () => {
    expect(toolHomeRoute('/missing')).toBeUndefined()
    expect(projectRoute('/missing', 'p3')).toBeUndefined()
  })
})
