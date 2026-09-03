import { runAnimationSync, type AnimationRequest, type AnimationResult } from './evaluate'

export type WorkerRequest = AnimationRequest & { id: number }
export type WorkerResponse = AnimationResult & { id: number }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  const result = runAnimationSync(request)
  self.postMessage({ ...result, id: request.id } satisfies WorkerResponse)
}
