import { CharacterGifEncoder } from './animationEncoder'
import type { CharacterDocument } from './model'
import { evaluateDocument } from './engine'
import { drawCharacter, prepareAssets } from './render'

function filename(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\p{L}\p{N}_. -]/gu, '-')
      .slice(0, 100) || 'live-character'
  )
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function downloadProject(doc: CharacterDocument): void {
  downloadBlob(
    new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
    `${filename(doc.name)}.live-character.json`,
  )
}

function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('A 2D canvas is required to export this character.')
  return { canvas, ctx }
}

export async function exportFrame(
  doc: CharacterDocument,
  frame: number,
): Promise<void> {
  await prepareAssets(doc)
  if (
    doc.width * doc.height > 16_000_000 ||
    doc.width > 8192 ||
    doc.height > 8192
  ) {
    throw new Error(
      'PNG export supports canvases up to 16 megapixels and 8,192 pixels per side.',
    )
  }
  const { canvas, ctx } = createCanvas(doc.width, doc.height)
  const safeFrame = Math.max(0, Math.min(doc.duration, Math.round(frame)))
  drawCharacter(ctx, doc, evaluateDocument(doc, safeFrame))
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error('PNG encoding failed.')),
      'image/png',
    ),
  )
  downloadBlob(
    blob,
    `${filename(doc.name)}-frame-${String(safeFrame).padStart(3, '0')}.png`,
  )
}

/** Preserve full playback duration while limiting GIF memory and encoding time. */
export function getAnimationExportPlan(
  doc: Pick<CharacterDocument, 'width' | 'height' | 'fps' | 'duration'>,
): {
  width: number
  height: number
  frames: number[]
  delays: number[]
  fps: number
} {
  if (
    ![doc.width, doc.height, doc.fps, doc.duration].every(Number.isFinite) ||
    doc.width <= 0 ||
    doc.height <= 0 ||
    doc.fps <= 0 ||
    doc.duration < 0
  ) {
    throw new Error(
      'Animation dimensions, frame rate, and duration must be valid numbers.',
    )
  }
  const originalCount = Math.floor(doc.duration) + 1
  const frameCount = Math.min(
    originalCount,
    240,
    Math.max(
      originalCount > 1 ? 2 : 1,
      Math.floor((originalCount / doc.fps) * 50),
    ),
  )
  // GIF stores centiseconds; distribute the rounding across the sequence instead
  // of rounding every 24fps frame to 40ms and making the whole clip run too fast.
  const totalCentiseconds = Math.max(
    frameCount * 2,
    Math.round((originalCount / doc.fps) * 100),
  )
  const delays = Array.from(
    { length: frameCount },
    (_, index) =>
      10 *
      (Math.round(((index + 1) * totalCentiseconds) / frameCount) -
        Math.round((index * totalCentiseconds) / frameCount)),
  )
  const scale = Math.min(1, 800 / Math.max(doc.width, doc.height))
  return {
    width: Math.max(1, Math.round(doc.width * scale)),
    height: Math.max(1, Math.round(doc.height * scale)),
    frames: Array.from({ length: frameCount }, (_, index) =>
      frameCount === 1
        ? 0
        : (index * Math.floor(doc.duration)) / (frameCount - 1),
    ),
    delays,
    fps: frameCount / (totalCentiseconds / 100),
  }
}

/** Looping GIF, on a white background, maximum 800px / 240 sampled frames. */
export async function exportAnimation(
  doc: CharacterDocument,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const plan = getAnimationExportPlan(doc)
  await prepareAssets(doc)
  const { ctx } = createCanvas(plan.width, plan.height)
  const encoder = new CharacterGifEncoder(plan.width, plan.height)
  onProgress?.(0)
  try {
    for (let index = 0; index < plan.frames.length; index++) {
      ctx.setTransform(
        plan.width / doc.width,
        0,
        0,
        plan.height / doc.height,
        0,
        0,
      )
      drawCharacter(ctx, doc, evaluateDocument(doc, plan.frames[index]), {
        background: '#ffffff',
      })
      await encoder.add(
        ctx.getImageData(0, 0, plan.width, plan.height),
        plan.delays[index],
      )
      onProgress?.((index + 1) / plan.frames.length)
    }
    const blob = await encoder.finish()
    downloadBlob(blob, `${filename(doc.name)}.gif`)
  } catch (error) {
    encoder.cancel()
    throw error
  }
}
