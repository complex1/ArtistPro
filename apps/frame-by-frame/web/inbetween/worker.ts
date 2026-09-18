import { analyzeLineArt, generateLineArt } from './algorithm'
import type { WorkerReply, WorkerRequest } from './types'

const reply = (message: WorkerReply, transfer: Transferable[] = []) => postMessage(message, { transfer })
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    if (request.kind === 'analyze') {
      reply({ id: request.id, kind: 'analysis', result: analyzeLineArt(request.from, request.to, request.options) })
    } else {
      const refinement = generateLineArt(request.from, request.to, request.options,
        (raster, index) => reply({ id: request.id, kind: 'frame', raster, index }, [raster.data.buffer as ArrayBuffer]),
        value => reply({ id: request.id, kind: 'progress', value }))
      reply({ id: request.id, kind: 'done', refinement })
    }
  } catch (error) {
    reply({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : 'Could not interpolate these drawings.' })
  }
}
