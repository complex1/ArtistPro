import { defaultAnimation } from './animation'
import type { EditorDocumentV2 } from './types'

export const ARTBOARD_PRESETS = [
  { id: '800x600', width: 800, height: 600, label: '800 × 600' },
  { id: '1280x720', width: 1280, height: 720, label: '1280 × 720' },
  { id: '1080x1080', width: 1080, height: 1080, label: '1080 × 1080' },
  { id: '1920x1080', width: 1920, height: 1080, label: '1920 × 1080' },
] as const

export function createBlankDocument(
  name = 'Untitled',
  width = 800,
  height = 600,
): EditorDocumentV2 {
  return {
    version: 2,
    name,
    artboard: {
      width,
      height,
      background: '#ffffff',
      grid: {
        type: 'grid',
        enabled: false,
        locked: false,
        spacing: 40,
        origin: { x: Math.round(width / 2), y: Math.round(height / 2) },
        color: '#4f8cff',
        opacity: 0.35,
        snap: false,
        snapThreshold: 8,
      },
    },
    children: [],
    animation: defaultAnimation(),
    symbols: [],
  }
}
