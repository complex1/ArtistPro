/** Snapshots may share immutable raster buffers. Measure retained buffers, not step count alone. */
export class SnapshotHistory<T> {
  private past: T[] = []
  private future: T[] = []
  private readonly maxSteps: number
  private readonly maxBytes: number
  private readonly measure: (snapshots: readonly T[]) => number

  constructor(measure: (snapshots: readonly T[]) => number, maxBytes = 128 * 1024 * 1024, maxSteps = 30) {
    this.measure = measure
    this.maxBytes = maxBytes
    this.maxSteps = maxSteps
  }

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }

  record(before: T): void {
    this.future = []
    this.past.push(before)
    this.trim()
  }

  undo(current: T): T | undefined {
    const previous = this.past.pop()
    if (previous === undefined) return undefined
    this.future.push(current)
    this.trim()
    return previous
  }

  redo(current: T): T | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.past.push(current)
    this.trim()
    return next
  }

  clear(): void { this.past = []; this.future = [] }

  /** Recheck when the caller changes which shared resources are held by its current state. */
  enforceBudget(): void { this.trim() }

  private trim(): void {
    while (this.past.length + this.future.length > this.maxSteps || this.measure([...this.past, ...this.future]) > this.maxBytes) {
      // Keep the nearest steps available in both directions.
      if (this.past.length >= this.future.length && this.past.length) this.past.shift()
      else if (this.future.length) this.future.shift()
      else break
    }
  }
}
