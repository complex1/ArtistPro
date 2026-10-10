import { nanoid } from 'nanoid'
import { importProject } from '@artist-studio/drawing-canvas/library'
import type { DrawingDocument } from '../../drawing-canvas/web/engine/types'

/** Save the camera render beneath a fresh drawing layer, preserving its pixel dimensions. */
export async function sendToDrawingCanvas(dataUrl: string, name: string, width: number, height: number): Promise<string> {
  const drawingLayerId = nanoid()
  const document: DrawingDocument = {
    version: 1,
    name: `${name.trim().slice(0, 110) || 'Untitled scene'} reference`,
    width,
    height,
    background: '#ffffff',
    activeLayerId: drawingLayerId,
    // Drawing Canvas stores layers bottom to top.
    layers: [
      { id: nanoid(), name: '3D reference', visible: true, locked: true, opacity: 0.5, blendMode: 'source-over', dataUrl },
      { id: drawingLayerId, name: 'Drawing', visible: true, locked: false, opacity: 1, blendMode: 'source-over', dataUrl: null },
    ],
  }
  const saved = await importProject(document)
  return saved.id
}
