import { SnapshotHistory } from '../../drawing-canvas/web/engine/history'
import { validateDocument, type AnimationDocument } from './model'
import { saveProject, type ProjectRecord } from './library'

export class AnimationSession {
  document: AnimationDocument
  revision = 0
  savedRevision = 0
  saving = false
  error: string | null = null
  private pending: Promise<void> | null = null
  private listeners = new Set<() => void>()
  private history = new SnapshotHistory<AnimationDocument>(snapshots => {
    const images = new Set(snapshots.flatMap(doc => doc.layers.flatMap(layer => layer.cels.flatMap(cel => [cel.dataUrl, cel.thumbnail]))))
    return [...images].reduce((sum, image) => sum + (image?.length ?? 0) * 2, 0)
  }, 96 * 1024 * 1024, 40)
  private record: ProjectRecord
  constructor(record: ProjectRecord) { this.record = record; this.document = record.document }
  get dirty() { return this.revision !== this.savedRevision }
  get canUndo() { return this.history.canUndo }
  get canRedo() { return this.history.canRedo }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit() { for (const listener of this.listeners) listener() }
  commit(document: AnimationDocument) {
    if (document === this.document) return
    const valid = validateDocument(document)
    this.history.record(this.document)
    this.document = valid
    this.revision++
    this.error = null
    this.emit()
  }
  undo() { const doc = this.history.undo(this.document); if (doc) { this.document = doc; this.revision++; this.emit() } }
  redo() { const doc = this.history.redo(this.document); if (doc) { this.document = doc; this.revision++; this.emit() } }
  /** Serialize writes and keep flushing if a drawing changes during a pending transaction. */
  save(): Promise<void> {
    if (this.pending) return this.pending
    if (!this.dirty) return Promise.resolve()
    this.saving = true
    this.error = null
    this.pending = (async () => {
      while (this.dirty) {
        const revision = this.revision
        this.record = await saveProject({ ...this.record, document: this.document })
        this.savedRevision = revision
      }
    })().catch(reason => {
      this.error = reason instanceof Error ? reason.message : 'Could not save your animation.'
      throw reason
    }).finally(() => { this.pending = null; this.saving = false; this.emit() })
    this.emit()
    return this.pending
  }
}
