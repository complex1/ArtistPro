import type { CharacterDocument, Transform } from './model'

export type WorkspaceMode = 'create' | 'assemble' | 'mesh' | 'rig' | 'animate'
export type CanvasTool = 'select' | 'rectangle' | 'ellipse' | 'draw' | 'bone'
export type Selection = {
  type: 'layer' | 'bone' | 'controller'
  id: string
} | null
export type PoseTarget = NonNullable<Selection>['type']
export type DocumentChange = (
  document: CharacterDocument,
  history?: boolean,
) => void
export type PoseChange = (
  type: PoseTarget,
  id: string,
  value: Transform,
) => void

export const identityPose = (): Transform => ({
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})

export function canParent(
  items: { id: string; parentId: string | null }[],
  id: string,
  parentId: string,
): boolean {
  const seen = new Set([id])
  let cursor: string | null = parentId
  while (cursor) {
    if (seen.has(cursor)) return false
    seen.add(cursor)
    cursor = items.find((item) => item.id === cursor)?.parentId ?? null
  }
  return true
}
