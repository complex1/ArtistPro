import { serializeProject } from './model'
import type { AnimeDocument } from './types'

export function safeName(value: string): string {
  return value.replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 80) || 'anime-shot'
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function downloadProject(document: AnimeDocument): void {
  downloadBlob(new Blob([serializeProject(document)], { type: 'application/json' }), `${safeName(document.name)}.anime-3d.json`)
}
