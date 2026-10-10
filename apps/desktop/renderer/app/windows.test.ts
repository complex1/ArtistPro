import { afterEach, describe, expect, it, vi } from 'vitest'
import { openInWindow } from './windows'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openInWindow', () => {
  it('opens an Anime 3D shot in its desktop window', () => {
    const openToolWindow = vi.fn(async () => true)
    vi.stubGlobal('window', { location: { hash: '' }, artistStudio: { openToolWindow } })

    openInWindow({ page: 'anime-editor', projectId: 'Wave shot/1' })

    expect(openToolWindow).toHaveBeenCalledWith('#/anime-3d/Wave%20shot%2F1')
    expect(window.location.hash).toBe('')
  })

  it('opens Anime 3D in the current browser when no desktop shell is present', () => {
    vi.stubGlobal('window', { location: { hash: '' } })

    openInWindow({ page: 'anime-home' })

    expect(window.location.hash).toBe('#/anime-3d')
  })

  it('opens a 3D Reference scene in its desktop window', () => {
    const openToolWindow = vi.fn(async () => true)
    vi.stubGlobal('window', { location: { hash: '' }, artistStudio: { openToolWindow } })

    openInWindow({ page: 'reference-editor', projectId: 'Scene study/1' })

    expect(openToolWindow).toHaveBeenCalledWith('#/reference-3d/Scene%20study%2F1')
    expect(window.location.hash).toBe('')
  })

  it('asks the desktop shell for a window and leaves the launcher alone', () => {
    const openToolWindow = vi.fn(async () => true)
    vi.stubGlobal('window', {
      location: { hash: '' },
      artistStudio: { openToolWindow },
    })

    openInWindow({ page: 'svg-home' })

    expect(openToolWindow).toHaveBeenCalledWith('#/svg')
    expect(window.location.hash).toBe('')
  })

  it('navigates in place when there is no desktop shell', () => {
    vi.stubGlobal('window', { location: { hash: '' } })

    openInWindow({ page: 'cel-editor', projectId: 'still' })

    expect(window.location.hash).toBe('#/cel/still')
  })
})
