import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaintPreviewHost } from './previewHost'
import { createDocumentV2 } from '../core/defaults'
import type { RenderRequest, RenderResponse } from './protocol'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
function setup() {
  const messages: RenderRequest[] = []
  const workers: FakeWorker[] = []
  class FakeWorker {
    onmessage?: (event: MessageEvent<RenderResponse>) => void
    onerror?: () => void
    terminate = vi.fn()
    constructor() { workers.push(this) }
    postMessage(message: RenderRequest) { messages.push(message) }
  }
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('OffscreenCanvas', class {})
  vi.stubGlobal('createImageBitmap', vi.fn())
  const canvas = { width: 800, height: 600, getContext: () => context }
  const context = { canvas, clearRect: vi.fn(), drawImage: vi.fn() }
  const callbacks = { painted: vi.fn(), error: vi.fn(), invalidate: vi.fn() }
  const host = new PaintPreviewHost(canvas as unknown as HTMLCanvasElement, callbacks)
  const request = (version: number) => host.request({ version, time: 0, now: 0, gpu: false,
    document: createDocumentV2(), surfaces: { rasters: new Map(), masks: new Map() } })
  const reply = (version: number) => {
    const bitmap = { close: vi.fn() }
    workers[0].onmessage!({ data: { type: 'frame', id: version, version, bitmap,
      stats: { totalMs: 1 }, gpuBatches: 0 } } as unknown as MessageEvent<RenderResponse>)
    return bitmap
  }
  return { host, callbacks, messages, context, request, reply, get worker() { return workers[0] } }
}

describe('preview worker flow control', () => {
  it('keeps only the latest pending frame and closes stale bitmaps', () => {
    const test = setup()
    for (let version = 1; version <= 100; version++) test.request(version)
    expect(test.messages).toHaveLength(1)
    expect(test.reply(1).close).toHaveBeenCalledOnce()
    expect(test.context.drawImage).not.toHaveBeenCalled()
    expect(test.messages.map(message => message.version)).toEqual([1, 100])
    expect(test.reply(100).close).toHaveBeenCalledOnce()
    expect(test.context.drawImage).toHaveBeenCalledOnce()
    expect(test.callbacks.painted).toHaveBeenCalledOnce()
    test.host.dispose()
    expect(test.worker.terminate).toHaveBeenCalledOnce()
  })
  it('terminates a hung worker without retrying its script on the main thread', () => {
    vi.useFakeTimers()
    const test = setup()
    test.request(1); vi.advanceTimersByTime(10_001)
    expect(test.worker.terminate).toHaveBeenCalledOnce()
    expect(test.callbacks.error).toHaveBeenCalledOnce()
    test.request(2)
    expect(test.messages).toHaveLength(1)
    expect(test.context.drawImage).not.toHaveBeenCalled()
    test.host.dispose()
  })
})
