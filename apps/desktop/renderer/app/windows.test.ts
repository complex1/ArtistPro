import { afterEach, describe, expect, it, vi } from 'vitest'
import { openInWindow } from './windows'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openInWindow', () => {
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
