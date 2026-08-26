import { describe, expect, it } from 'vitest'
import type { EditorDocument } from '../model/types'
import { renderDocument } from './renderEngine'
import { DEFAULT_RENDER_SETTINGS, isRenderError } from './types'

const documentFixture: EditorDocument = {
  version: 2,
  name: 'Cancellation',
  artboard: {
    width: 100,
    height: 100,
    background: '#fff',
    grid: {
      type: 'grid',
      enabled: false,
      locked: false,
      color: '#000',
      opacity: 0.2,
      snap: false,
      snapThreshold: 8,
      spacing: 10,
      origin: { x: 0, y: 0 },
    },
  },
  children: [],
  symbols: [],
  animation: { duration: 1, tracks: [] },
}

describe('render engine', () => {
  it('rejects an already-aborted job before allocating browser resources', async () => {
    const controller = new AbortController()
    controller.abort()
    try {
      await renderDocument(documentFixture, DEFAULT_RENDER_SETTINGS, 'video', {
        signal: controller.signal,
      })
      throw new Error('Expected cancellation')
    } catch (error) {
      expect(isRenderError(error)).toBe(true)
      if (isRenderError(error)) expect(error.code).toBe('cancelled')
    }
  })
})
