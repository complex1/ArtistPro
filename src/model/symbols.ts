import { nanoid } from 'nanoid'
import { evaluateSymbolDefinitionAtTime } from './animation'
import { boundsOf, findList, walkNodes } from './scene'
import { defaultTransform } from './transform'
import type {
  DocumentAnimation,
  EditorDocument,
  EditorDocumentV2,
  EditorNode,
  SymbolDefinition,
  SymbolDefinitionNode,
  SymbolInstanceNode,
  SymbolPlayback,
  Vec2,
} from './types'

export type EvaluatedSymbolInstance = {
  instance: SymbolInstanceNode
  definition: SymbolDefinition
  localTime: number
  children: EditorNode[]
}

export type SymbolConversionResult = {
  document: EditorDocumentV2
  symbolId: string
  instanceId: string
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function findSymbolDefinition(
  symbols: readonly SymbolDefinition[],
  id: string,
): SymbolDefinition | undefined {
  return symbols.find((definition) => definition.id === id)
}

export function symbolLocalTime(
  instance: SymbolInstanceNode,
  definition: SymbolDefinition,
  time: number,
): number {
  const duration = Math.max(0, definition.animation.duration)
  if (duration === 0 || Number.isNaN(time)) return 0
  const elapsed = time - instance.playback.startTime
  if (elapsed <= 0) return 0
  if (instance.playback.mode === 'once') return Math.min(elapsed, duration)
  if (!Number.isFinite(elapsed)) return 0
  return elapsed % duration
}

/**
 * New instances loop because a definition is usually shorter than the scene it
 * sits in, and a clip that stops on its final frame reads as a broken symbol.
 */
export function createSymbolInstance(
  definition: SymbolDefinition,
  position: Vec2 = { x: 0, y: 0 },
  playback: SymbolPlayback = { startTime: 0, mode: 'loop' },
): SymbolInstanceNode {
  return {
    id: nanoid(),
    name: definition.name,
    type: 'symbol',
    symbolId: definition.id,
    width: definition.width,
    height: definition.height,
    visible: true,
    locked: false,
    pivotPreset: 'center',
    effects: [],
    playback: { ...playback },
    transform: {
      ...defaultTransform(),
      pivot: { x: definition.width / 2, y: definition.height / 2 },
      position: { ...position },
    },
  }
}

export function containsSymbolInstance(nodes: readonly EditorNode[]): boolean {
  for (const node of nodes) {
    if (node.type === 'symbol') return true
    if (node.type === 'group' && containsSymbolInstance(node.children)) return true
  }
  return false
}

export function evaluateSymbolDefinition(
  definition: SymbolDefinition,
  time: number,
): EditorNode[] {
  if (containsSymbolInstance(definition.children)) return []
  return evaluateSymbolDefinitionAtTime(definition, time)
}

/**
 * Evaluates definition-owned nodes without inserting them into the document
 * scene. Callers render `children` under `instance`; selection still sees only
 * the leaf instance stored in the document tree.
 */
export function evaluateSymbolInstance(
  instance: SymbolInstanceNode,
  symbols: readonly SymbolDefinition[],
  time: number,
): EvaluatedSymbolInstance | null {
  const definition = findSymbolDefinition(symbols, instance.symbolId)
  if (!definition || containsSymbolInstance(definition.children)) return null
  const localTime = symbolLocalTime(instance, definition, time)
  return {
    instance,
    definition,
    localTime,
    children: evaluateSymbolDefinition(definition, localTime),
  }
}

const nodeIds = (nodes: EditorNode[]) => {
  const ids = new Set<string>()
  walkNodes(nodes, (node) => ids.add(node.id))
  return ids
}

const rebaseRootNodes = (nodes: EditorNode[], offset: Vec2): EditorNode[] =>
  nodes.map((node) => ({
    ...node,
    transform: {
      ...node.transform,
      position: {
        x: node.transform.position.x + offset.x,
        y: node.transform.position.y + offset.y,
      },
    },
  }))

/**
 * Moves root position channels by the same amount as their rest transforms.
 * Key and track ids are intentionally retained because ownership is transferred
 * to the definition rather than duplicated.
 */
export function rebaseSymbolAnimation(
  animation: DocumentAnimation,
  rootIds: ReadonlySet<string>,
  offset: Vec2,
): DocumentAnimation {
  return {
    ...animation,
    tracks: animation.tracks.map((track) => {
      if (!rootIds.has(track.nodeId)) return track
      const amount =
        track.property === 'position.x'
          ? offset.x
          : track.property === 'position.y'
            ? offset.y
            : 0
      if (amount === 0) return track
      return {
        ...track,
        keys: track.keys.map((key) => ({
          ...key,
          value: typeof key.value === 'number' ? key.value + amount : key.value,
        })),
      }
    }),
  }
}

function hasCrossBoundaryMotionPath(
  scene: EditorNode[],
  internalIds: ReadonlySet<string>,
): boolean {
  let crossed = false
  walkNodes(scene, (node) => {
    if (!node.motionPath) return
    const sourceIsInternal = internalIds.has(node.id)
    const targetIsInternal = internalIds.has(node.motionPath.pathId)
    if (sourceIsInternal !== targetIsInternal) crossed = true
  })
  return crossed
}

/**
 * Converts sibling selection into one document-scoped definition and replaces
 * it with a leaf instance. It is pure, upgrades v1 input, and returns null when
 * the selection would create nesting or a cross-boundary motion-path reference.
 */
export function convertSelectionToSymbol(
  document: EditorDocument,
  selectedIds: readonly string[],
  name = 'Symbol',
): SymbolConversionResult | null {
  const uniqueIds = [...new Set(selectedIds)]
  if (uniqueIds.length === 0) return null

  const next = copy(document)
  const list = findList(next.children, uniqueIds[0])
  if (!list || !uniqueIds.every((id) => list.some((node) => node.id === id))) {
    return null
  }
  const selected = list.filter((node) => uniqueIds.includes(node.id))
  if (selected.length !== uniqueIds.length || containsSymbolInstance(selected)) {
    return null
  }

  const internalIds = nodeIds(selected)
  if (hasCrossBoundaryMotionPath(next.children, internalIds)) return null

  const selectedSet = new Set(uniqueIds)
  const insertAt = Math.min(...selected.map((node) => list.indexOf(node)))
  const bounds = boundsOf(selected)
  const offset = { x: -bounds.x, y: -bounds.y }
  const rootIds = new Set(selected.map((node) => node.id))
  const definitionTracks = next.animation.tracks.filter((track) =>
    internalIds.has(track.nodeId),
  )
  const definition: SymbolDefinition = {
    id: nanoid(),
    name,
    width: bounds.width,
    height: bounds.height,
    children: rebaseRootNodes(selected, offset) as SymbolDefinitionNode[],
    animation: rebaseSymbolAnimation(
      { duration: next.animation.duration, tracks: definitionTracks },
      rootIds,
      offset,
    ),
  }
  const instance = createSymbolInstance(definition, {
    x: bounds.x,
    y: bounds.y,
  })

  const remaining = list.filter((node) => !selectedSet.has(node.id))
  remaining.splice(insertAt, 0, instance)
  list.splice(0, list.length, ...remaining)

  return {
    document: {
      ...next,
      version: 2,
      symbols: [
        ...(next.version === 2 ? next.symbols : []),
        definition,
      ],
      animation: {
        ...next.animation,
        tracks: next.animation.tracks.filter(
          (track) => !internalIds.has(track.nodeId),
        ),
      },
    },
    symbolId: definition.id,
    instanceId: instance.id,
  }
}
