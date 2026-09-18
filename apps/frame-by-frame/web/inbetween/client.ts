import { MAX_BYTES } from '../model'
import { thumbnail } from '../raster'
import type { AnalysisOptions, AnalysisResult, GeneratedDrawing, GenerationOptions, GenerationResult, Raster, WorkerReply, WorkerRequest } from './types'

const cancelled = () => new DOMException('Generation cancelled', 'AbortError')

async function decode(dataUrl: string, width: number, height: number, signal: AbortSignal): Promise<Raster> {
  if (signal.aborted) throw cancelled()
  const image = new Image(); image.src = dataUrl
  await image.decode()
  if (signal.aborted) throw cancelled()
  if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error('Key drawings must match the shot dimensions.')
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

/** Each request owns a worker. Termination makes cancellation immediate even during a TPS solve. */
function runWorker<T>(request: WorkerRequest, signal: AbortSignal, receive: (message: WorkerReply) => T | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return }
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const cleanup = () => { settled = true; clearTimeout(timer); worker.terminate(); signal.removeEventListener('abort', abort) }
    const fail = (error: unknown) => { if (!settled) { cleanup(); reject(error) } }
    const abort = () => fail(cancelled())
    const timer = setTimeout(() => fail(new Error('Generation took too long. Try fewer in-betweens or a smaller canvas.')), 180_000)
    worker.onerror = event => fail(new Error(event.message || 'The local interpolation worker could not start.'))
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (settled || event.data.id !== request.id) return
      try {
        if (event.data.kind === 'error') throw new Error(event.data.message)
        const result = receive(event.data)
        if (result !== undefined) { cleanup(); resolve(result) }
      } catch (error) { fail(error) }
    }
    signal.addEventListener('abort', abort, { once: true })
    try { worker.postMessage(request, [request.from.data.buffer, request.to.data.buffer]) } catch (error) { fail(error) }
  })
}

export async function analyzeInbetweens(from: string, to: string, width: number, height: number, options: AnalysisOptions, signal: AbortSignal): Promise<AnalysisResult> {
  const [a, b] = await Promise.all([decode(from, width, height, signal), decode(to, width, height, signal)])
  return runWorker({ id: 1, kind: 'analyze', from: a, to: b, options }, signal, message => message.kind === 'analysis' ? message.result : undefined)
}

export async function generateInbetweens(from: string, to: string, width: number, height: number, options: GenerationOptions, signal: AbortSignal, progress: (value: number) => void): Promise<GenerationResult> {
  const [a, b] = await Promise.all([decode(from, width, height, signal), decode(to, width, height, signal)])
  const frames: GeneratedDrawing[] = []
  let bytes = 0
  return runWorker({ id: 1, kind: 'generate', from: a, to: b, options }, signal, message => {
    if (message.kind === 'progress') progress(Math.max(0, Math.min(1, message.value)))
    if (message.kind === 'frame') {
      if (message.raster.width !== width || message.raster.height !== height || message.index < 0 || message.index >= options.count || frames[message.index]) throw new Error('The generator returned an invalid drawing.')
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(message.raster.data), width, height), 0, 0)
      const drawing = { dataUrl: canvas.toDataURL('image/png'), thumbnail: thumbnail(canvas) }
      bytes += drawing.dataUrl.length + drawing.thumbnail.length
      if (bytes > MAX_BYTES) throw new Error('Generated images exceed the project size limit. Try fewer drawings.')
      frames[message.index] = drawing
      progress((message.index + 1) / options.count)
    }
    if (message.kind === 'done') {
      if (frames.filter(Boolean).length !== options.count) throw new Error('Generation stopped before all drawings were ready.')
      return { drawings: frames, refinement: message.refinement }
    }
  })
}
