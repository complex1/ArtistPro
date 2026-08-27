import { describe, expect, it } from 'vitest'
import { createDocumentV2 } from '../core/defaults'
import { isRenderError } from '../../../render/types'
import { renderPaintDocument } from './exportEngine'

describe('paint export engine', () => {
  it('rejects an already-cancelled export before allocating a canvas', async () => {
    const controller = new AbortController()
    controller.abort()

    try {
      await renderPaintDocument(
        createDocumentV2('Cancelled', 100, 100),
        new Map(),
        { fps: 30, duration: 2, format: 'video' },
        { signal: controller.signal },
      )
      throw new Error('Expected cancellation')
    } catch (error) {
      expect(isRenderError(error)).toBe(true)
      if (isRenderError(error)) expect(error.code).toBe('cancelled')
    }
  })
})
