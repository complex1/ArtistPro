import type { AnimationRequest, AnimationResult } from './evaluate'
import { runAnimationSync } from './evaluate'

type Pending = {
  resolve: (result: AnimationResult) => void
}

export class AnimationWorkerHost {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()

  constructor() {
    if (typeof Worker === 'undefined') return
    try {
      this.worker = new Worker(new URL('./animate.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (event: MessageEvent<AnimationResult & { id: number }>) => {
        const waiter = this.pending.get(event.data.id)
        if (!waiter) return
        this.pending.delete(event.data.id)
        waiter.resolve(event.data)
      }
    } catch {
      this.worker = null
    }
  }

  run(request: AnimationRequest): Promise<AnimationResult> {
    if (!this.worker) {
      return Promise.resolve(runAnimationSync(request))
    }
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve) => {
      this.pending.set(id, { resolve })
      this.worker?.postMessage({ ...request, id })
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }
}
