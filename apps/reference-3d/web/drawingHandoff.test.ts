import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProject, listProjects } from '@artist-studio/drawing-canvas/library'
import { sendToDrawingCanvas } from './drawingHandoff'

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH3cAAAAASUVORK5CYII='
const landscapePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwH4YZkDkAm34L9XKwuTwAAAAASUVORK5CYII='

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('3D camera to Drawing Canvas', () => {
  it('persists the image beneath an active blank drawing layer with matching dimensions', async () => {
    const id = await sendToDrawingCanvas(landscapePng, 'Evening scene', 3, 2)
    const saved = await getProject(id)
    expect(saved?.document).toMatchObject({ name: 'Evening scene reference', width: 3, height: 2, background: '#ffffff' })
    expect(saved?.document.layers).toHaveLength(2)
    expect(saved?.document.layers[0]).toMatchObject({ name: '3D reference', visible: true, locked: true, opacity: 0.5, blendMode: 'source-over', dataUrl: landscapePng })
    expect(saved?.document.layers[1]).toMatchObject({ id: saved?.document.activeLayerId, name: 'Drawing', visible: true, locked: false, opacity: 1, dataUrl: null })
    expect((await listProjects())[0]).toMatchObject({ id, name: 'Evening scene reference', width: 3, height: 2, layerCount: 2 })
  })

  it('creates independent drawings when the same scene is sent again', async () => {
    const first = await sendToDrawingCanvas(onePixelPng, 'Scene', 1, 1)
    const second = await sendToDrawingCanvas(onePixelPng, 'Scene', 1, 1)
    expect(first).not.toBe(second)
    const firstDocument = (await getProject(first))?.document
    const secondDocument = (await getProject(second))?.document
    expect(firstDocument?.activeLayerId).not.toBe(secondDocument?.activeLayerId)
    expect(await listProjects()).toHaveLength(2)
  })

  it('rejects a mismatched image without creating an unusable drawing', async () => {
    await expect(sendToDrawingCanvas(onePixelPng, 'Wrong size', 1600, 1200)).rejects.toThrow('image dimensions must match')
    await expect(sendToDrawingCanvas('data:image/jpeg;base64,invalid', 'Wrong format', 1, 1)).rejects.toThrow('embedded PNG')
    expect(await listProjects()).toEqual([])
  })

  it('reports persistence errors rather than returning an unsaved drawing ID', async () => {
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage quota exceeded.', 'QuotaExceededError') })
    await expect(sendToDrawingCanvas(onePixelPng, 'Scene', 1, 1)).rejects.toThrow('Storage quota exceeded')
    expect(await listProjects()).toEqual([])
  })

  it('keeps long or blank scene names within Drawing Canvas name limits', async () => {
    const long = await sendToDrawingCanvas(onePixelPng, 'A'.repeat(120), 1, 1)
    expect((await getProject(long))?.document.name).toHaveLength(120)
    const blank = await sendToDrawingCanvas(onePixelPng, '  ', 1, 1)
    expect((await getProject(blank))?.document.name).toBe('Untitled scene reference')
  })
})
