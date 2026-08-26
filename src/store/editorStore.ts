import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  ANIMATABLE_PROPERTIES,
  armProperty as seedArmedProperty,
  defaultAnimation,
  disarmProperty as dropArmedProperty,
  duplicateKeys,
  evaluateChannels,
  evaluateNodeAtTime,
  isArmed,
  motionPathOffset,
  offsetPositionTracks,
  pruneAnimation,
  remapAnimation,
  removeKeys,
  restValue,
  retimeKey as moveKeyframe,
  setAnimationDuration,
  setRestValue,
  updateKeyframe as patchKeyframe,
  upsertKeyframe,
} from '../model/animation'
import {
  animatedEditsFromPatch,
  readChannel,
  writeChannel,
  type KeyframeValue,
} from '../model/channels'
import {
  applyPreset,
  type AnimationPresetConfig,
  type AnimationPresetId,
} from '../model/animationPresets'
import { createShape } from '../model/nodes'
import { defaultBrushSettings } from '../model/brush'
import {
  convertSelectionToSymbol,
  createSymbolInstance,
} from '../model/symbols'
import { nanoid } from 'nanoid'
import {
  boundsOf,
  canGroup,
  canUngroup,
  clearMissingMotionPaths,
  cloneNode,
  dragRoots,
  findNode,
  groupNodes,
  moveLayer as moveLayerInScene,
  remapMotionPaths,
  removeNodes,
  selectedNode as findSelectedNode,
  ungroupNode,
  updateNodeById,
} from '../model/scene'
import type { LayerDropPosition } from '../model/scene'
import type {
  AnimatableProperty,
  DocumentAnimation,
  EditorDocument,
  EditorMode,
  EditorNode,
  Keyframe,
  BrushSettings,
  PencilSettings,
  ShapeType,
  Tool,
  Transform,
  Vec2,
  SymbolPlayback,
} from '../model/types'

const firstShape = createShape('rect')

const copyKeyframeValue = (value: KeyframeValue): KeyframeValue =>
  Array.isArray(value)
    ? value.map((point) => ({
        ...point,
        anchor: { ...point.anchor },
        handleIn: { ...point.handleIn },
        handleOut: { ...point.handleOut },
      }))
    : value

/**
 * A tracked property's key at t=0 and the Draw rest pose describe the same
 * first frame, so an edit outside Animate has to move both or the clip opens
 * on a pose the artboard never shows.
 */
const syncFirstFrameKey = (
  animation: DocumentAnimation,
  id: string,
  property: AnimatableProperty,
  value: KeyframeValue,
) =>
  isArmed(animation, id, property)
    ? upsertKeyframe(animation, id, property, 0, copyKeyframeValue(value))
    : animation

export type EditorStore = {
  document: EditorDocument
  editingSymbolId: string | null
  canUndo: boolean
  canRedo: boolean
  mode: EditorMode
  tool: Tool
  selectedIds: string[]
  brushSettings: BrushSettings
  pencilSettings: PencilSettings
  zoom: number
  pan: Vec2
  playhead: number
  playing: boolean
  looping: boolean
  selectedKeyIds: string[]
  undo: () => void
  redo: () => void
  clearHistory: () => void
  beginHistoryGroup: () => void
  endHistoryGroup: () => void
  setMode: (mode: EditorMode) => void
  setTool: (tool: Tool) => void
  setBrushSettings: (update: Partial<BrushSettings>) => void
  setPencilSettings: (update: Partial<PencilSettings>) => void
  select: (id: string | null, additive?: boolean) => void
  selectMany: (ids: string[]) => void
  addShape: (type: ShapeType) => void
  addNode: (node: EditorNode) => void
  addNodes: (nodes: EditorNode[]) => void
  removeNode: (id: string) => void
  updateNode: (id: string, update: Partial<EditorNode>) => void
  editTransform: (id: string, transform: Transform) => void
  setMotionPath: (id: string, pathId: string | null) => void
  moveLayer: (
    sourceId: string,
    targetId: string | null,
    position: LayerDropPosition,
  ) => void
  removeSelected: () => void
  duplicateSelected: () => void
  groupSelected: () => void
  ungroupSelected: () => void
  setArtboardSize: (width: number, height: number) => void
  updateArtboard: (update: Partial<EditorDocument['artboard']>) => void
  setDocumentName: (name: string) => void
  setZoom: (zoom: number) => void
  setPan: (pan: Vec2) => void
  setViewport: (zoom: number, pan: Vec2) => void
  setPlayhead: (time: number, pause?: boolean) => void
  setPlaying: (playing: boolean) => void
  setLooping: (looping: boolean) => void
  setDuration: (duration: number) => void
  armProperty: (nodeId: string, property: AnimatableProperty) => void
  disarmProperty: (nodeId: string, property: AnimatableProperty) => void
  togglePropertyArm: (nodeId: string, property: AnimatableProperty) => void
  applyAnimationPreset: (
    nodeId: string,
    presetId: AnimationPresetId,
    config: AnimationPresetConfig,
  ) => void
  selectKeys: (ids: string[], additive?: boolean) => void
  removeSelectedKeys: () => void
  duplicateSelectedKeys: () => void
  updateKey: (
    keyId: string,
    update: Partial<Pick<Keyframe, 'value' | 'easing'>>,
  ) => void
  retimeKey: (keyId: string, time: number) => void
  createSymbolFromSelection: (name?: string) => string | null
  createBlankSymbol: (
    name: string,
    width: number,
    height: number,
    duration: number,
  ) => string | null
  addSymbolInstance: (symbolId: string) => string | null
  enterSymbol: (symbolId: string) => void
  exitSymbol: () => void
  renameSymbol: (symbolId: string, name: string) => void
  removeUnusedSymbol: (symbolId: string) => void
  updateSymbolInstancePlayback: (
    id: string,
    patch: Partial<SymbolPlayback>,
  ) => void
}

const recordingModes: EditorMode[] = ['animate']

type EditableTarget = {
  children: EditorNode[]
  animation: DocumentAnimation
}

const activeTarget = (state: Pick<EditorStore, 'document' | 'editingSymbolId'>): EditableTarget => {
  if (state.editingSymbolId && state.document.version === 2) {
    const definition = state.document.symbols.find(
      (symbol) => symbol.id === state.editingSymbolId,
    )
    if (definition) return definition as EditableTarget
  }
  return state.document
}

export const activeChildren = (
  state: Pick<EditorStore, 'document' | 'editingSymbolId'>,
): EditorNode[] => activeTarget(state).children

export const activeAnimation = (
  state: Pick<EditorStore, 'document' | 'editingSymbolId'>,
): DocumentAnimation => activeTarget(state).animation

export const activeWidth = (
  state: Pick<EditorStore, 'document' | 'editingSymbolId'>,
): number => {
  if (state.editingSymbolId && state.document.version === 2) {
    return state.document.symbols.find(
      (symbol) => symbol.id === state.editingSymbolId,
    )?.width ?? state.document.artboard.width
  }
  return state.document.artboard.width
}

export const activeHeight = (
  state: Pick<EditorStore, 'document' | 'editingSymbolId'>,
): number => {
  if (state.editingSymbolId && state.document.version === 2) {
    return state.document.symbols.find(
      (symbol) => symbol.id === state.editingSymbolId,
    )?.height ?? state.document.artboard.height
  }
  return state.document.artboard.height
}

/**
 * New artwork starts centered on whichever canvas is open and cascades toward
 * the far corner, wrapping back to the middle so a symbol canvas smaller than
 * the scene never receives shapes outside its own bounds.
 */
const cascadeStart = (extent: number, size: number, step: number): number => {
  const room = Math.max(0, extent - size)
  const start = room / 2
  return Math.round(start + (step % Math.max(1, room - start)))
}

const hasSymbolReference = (nodes: readonly EditorNode[], symbolId: string): boolean =>
  nodes.some(
    (node) =>
      (node.type === 'symbol' && node.symbolId === symbolId) ||
      (node.type === 'group' && hasSymbolReference(node.children, symbolId)),
  )

const editingSymbolExists = (
  document: EditorDocument,
  symbolId: string | null,
): boolean =>
  !symbolId ||
  (document.version === 2 &&
    document.symbols.some((symbol) => symbol.id === symbolId))

const animationDurationFor = (
  document: EditorDocument,
  symbolId: string | null,
): number => {
  if (symbolId && document.version === 2) {
    return (
      document.symbols.find((symbol) => symbol.id === symbolId)?.animation
        .duration ?? document.animation.duration
    )
  }
  return document.animation.duration
}

type EditorSnapshot = Pick<
  EditorStore,
  'document' | 'selectedIds' | 'selectedKeyIds'
>

const HISTORY_LIMIT = 100
const undoStack: EditorSnapshot[] = []
const redoStack: EditorSnapshot[] = []
let restoringHistory = false
let historyGroupDepth = 0
let groupedSnapshot: EditorSnapshot | null = null
let groupedDocumentChanged = false

const snapshot = (state: EditorStore): EditorSnapshot => ({
  document: state.document,
  selectedIds: state.selectedIds,
  selectedKeyIds: state.selectedKeyIds,
})

export const useEditorStore = create<EditorStore>()(
  immer((set) => ({
    document: {
      version: 2,
      name: 'Untitled',
      artboard: {
        width: 800,
        height: 600,
        background: '#ffffff',
        grid: {
          type: 'grid',
          enabled: false,
          locked: false,
          spacing: 40,
          origin: { x: 400, y: 300 },
          color: '#4f8cff',
          opacity: 0.35,
          snap: false,
          snapThreshold: 8,
        },
      },
      children: [firstShape],
      animation: defaultAnimation(),
      symbols: [],
    },
    editingSymbolId: null,
    canUndo: false,
    canRedo: false,
    mode: 'draw',
    tool: 'select',
    selectedIds: [firstShape.id],
    brushSettings: defaultBrushSettings,
    pencilSettings: { smoothing: 0.5 },
    zoom: 0.82,
    pan: { x: 0, y: 0 },
    playhead: 0,
    playing: false,
    looping: false,
    selectedKeyIds: [],
    undo: () => {
      const previous = undoStack.pop()
      if (!previous) return
      const state = useEditorStore.getState()
      const current = snapshot(state)
      const editingSymbolId = editingSymbolExists(
        previous.document,
        state.editingSymbolId,
      )
        ? state.editingSymbolId
        : null
      const playhead = Math.min(
        state.playhead,
        animationDurationFor(previous.document, editingSymbolId),
      )
      redoStack.push(current)
      restoringHistory = true
      useEditorStore.setState({
        ...previous,
        editingSymbolId,
        playhead,
        canUndo: undoStack.length > 0,
        canRedo: true,
        playing: false,
      })
      restoringHistory = false
    },
    redo: () => {
      const next = redoStack.pop()
      if (!next) return
      const state = useEditorStore.getState()
      const current = snapshot(state)
      const editingSymbolId = editingSymbolExists(
        next.document,
        state.editingSymbolId,
      )
        ? state.editingSymbolId
        : null
      const playhead = Math.min(
        state.playhead,
        animationDurationFor(next.document, editingSymbolId),
      )
      undoStack.push(current)
      restoringHistory = true
      useEditorStore.setState({
        ...next,
        editingSymbolId,
        playhead,
        canUndo: true,
        canRedo: redoStack.length > 0,
        playing: false,
      })
      restoringHistory = false
    },
    clearHistory: () => {
      undoStack.length = 0
      redoStack.length = 0
      historyGroupDepth = 0
      groupedSnapshot = null
      groupedDocumentChanged = false
      set({ canUndo: false, canRedo: false })
    },
    beginHistoryGroup: () => {
      if (historyGroupDepth === 0) {
        groupedSnapshot = snapshot(useEditorStore.getState())
        groupedDocumentChanged = false
      }
      historyGroupDepth += 1
    },
    endHistoryGroup: () => {
      if (historyGroupDepth === 0) return
      historyGroupDepth -= 1
      if (historyGroupDepth > 0) return
      if (groupedDocumentChanged && groupedSnapshot) {
        undoStack.push(groupedSnapshot)
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
        redoStack.length = 0
        set({ canUndo: true, canRedo: false })
      }
      groupedSnapshot = null
      groupedDocumentChanged = false
    },
    setMode: (mode) =>
      set((state) => {
        state.mode = mode
        state.playing = mode === 'preview'
        if (mode === 'preview') {
          state.playhead = 0
        }
        if (mode !== 'draw' && state.tool !== 'select' && state.tool !== 'pan') {
          state.tool = 'select'
        }
      }),
    setTool: (tool) => set({ tool }),
    setBrushSettings: (update) =>
      set((state) => {
        Object.assign(state.brushSettings, update)
      }),
    setPencilSettings: (update) =>
      set((state) => {
        Object.assign(state.pencilSettings, update)
      }),
    select: (id, additive = false) =>
      set((state) => {
        if (!id) {
          state.selectedIds = []
          return
        }
        if (!additive) {
          state.selectedIds = [id]
          return
        }
        state.selectedIds = state.selectedIds.includes(id)
          ? state.selectedIds.filter((item) => item !== id)
          : [...state.selectedIds, id]
      }),
    selectMany: (ids) => set({ selectedIds: ids }),
    addShape: (type) =>
      set((state) => {
        const target = activeTarget(state)
        const probe = createShape(type, { x: 0, y: 0 })
        const size = boundsOf([probe])
        const step = target.children.length * 18
        const node = createShape(type, {
          x: cascadeStart(activeWidth(state), size.width, step),
          y: cascadeStart(activeHeight(state), size.height, step),
        })
        node.name = `${node.name} ${target.children.length + 1}`
        target.children.push(node)
        state.selectedIds = [node.id]
        state.tool = 'select'
      }),
    addNode: (node) =>
      set((state) => {
        activeTarget(state).children.push(node)
        state.selectedIds = [node.id]
      }),
    addNodes: (nodes) =>
      set((state) => {
        if (nodes.length === 0) return
        activeTarget(state).children.push(...nodes)
        state.selectedIds = nodes.map((node) => node.id)
        state.tool = 'select'
      }),
    removeNode: (id) =>
      set((state) => {
        const target = activeTarget(state)
        target.children = removeNodes(target.children, [id])
        target.children = clearMissingMotionPaths(target.children)
        state.selectedIds = state.selectedIds.filter((selectedId) =>
          Boolean(findNode(target.children, selectedId)),
        )
        target.animation = pruneAnimation(target.animation, target.children)
      }),
    updateNode: (id, update) =>
      set((state) => {
        const target = activeTarget(state)
        const node = findNode(target.children, id)
        if (!node) return
        if (state.mode !== 'animate') {
          let animation = target.animation
          for (const edit of animatedEditsFromPatch(update as Record<string, unknown>)) {
            if (readChannel(node, edit.property) === edit.value) continue
            animation = syncFirstFrameKey(animation, id, edit.property, edit.value)
          }
          updateNodeById(target.children, id, update)
          target.animation = animation
          return
        }

        // Inspector fields render the evaluated pose, so a patch echoes that
        // pose back for every channel it carries, not just the edited one. Read
        // both poses before the patch lands: the draft is the same object.
        let animation = target.animation
        const shown = evaluateNodeAtTime(node, animation, state.playhead)
        const restores: { property: AnimatableProperty; value: KeyframeValue }[] = []

        for (const edit of animatedEditsFromPatch(update as Record<string, unknown>)) {
          const rest = readChannel(node, edit.property)
          const changed = readChannel(shown, edit.property) !== edit.value
          if (
            changed &&
            edit.property === 'path.points' &&
            rest !== undefined &&
            !isArmed(animation, id, edit.property)
          ) {
            animation = seedArmedProperty(
              animation,
              id,
              edit.property,
              copyKeyframeValue(rest),
              state.playhead,
            )
          }
          if (changed && !isArmed(animation, id, edit.property)) continue
          if (changed) {
            animation = upsertKeyframe(
              animation,
              id,
              edit.property,
              state.playhead,
              copyKeyframeValue(edit.value),
            )
            if (state.playhead < 1e-4) continue
          }
          if (rest !== undefined && rest !== edit.value) {
            restores.push({
              property: edit.property,
              value: copyKeyframeValue(rest),
            })
          }
        }

        updateNodeById(target.children, id, update)
        target.animation = animation
        if (restores.length === 0) return
        let live = findNode(target.children, id)
        if (!live) return
        for (const restore of restores) {
          live = writeChannel(live, restore.property, restore.value)
        }
        updateNodeById(target.children, id, live)
      }),
    editTransform: (id, transform) =>
      set((state) => {
        const target = activeTarget(state)
        const node = findNode(target.children, id)
        if (!node) return
        const recording = recordingModes.includes(state.mode)
        if (!recording) {
          let animation = target.animation
          for (const property of ANIMATABLE_PROPERTIES) {
            const nextValue = restValue(transform, property)
            if (restValue(node.transform, property) === nextValue) continue
            animation = syncFirstFrameKey(animation, id, property, nextValue)
          }
          updateNodeById(target.children, id, { transform })
          target.animation = animation
          return
        }

        let rest = node.transform
        let animation = target.animation
        for (const property of ANIMATABLE_PROPERTIES) {
          const nextValue = restValue(transform, property)
          if (isArmed(animation, id, property)) {
            animation = upsertKeyframe(
              animation,
              id,
              property,
              state.playhead,
              nextValue,
            )
            if (state.playhead < 1e-4) {
              rest = setRestValue(rest, property, nextValue)
            }
          } else {
            rest = setRestValue(rest, property, nextValue)
          }
        }
        target.animation = animation
        updateNodeById(target.children, id, { transform: rest })
      }),
    setMotionPath: (id, pathId) =>
      set((state) => {
        const target = activeTarget(state)
        const node = findNode(target.children, id)
        if (!node) return
        const current = node.motionPath
        const position = {
          x: node.transform.position.x,
          y: node.transform.position.y,
        }

        if (pathId) {
          if (current) {
            // Swapping targets keeps an offset that already reads as a delta
            // from a path, so only the reference changes.
            updateNodeById(target.children, id, {
              motionPath: { ...current, pathId },
            })
            return
          }
          // Until a path takes over, position is an absolute placement. Folding
          // it into the path sample would land the box at "path point plus
          // wherever it happened to sit", so rebase it to a zero offset and let
          // the path place it. Keys move by the same amount to keep any
          // position animation intact, now relative to the path.
          target.animation = offsetPositionTracks(
            target.animation,
            id,
            { x: -position.x, y: -position.y },
          )
          updateNodeById(target.children, id, {
            motionPath: { pathId, progress: 0, autoRotate: false },
            transform: { ...node.transform, position: { x: 0, y: 0 } },
          })
          return
        }

        if (!current) return
        // Detaching removes the layer that was doing the placing, so bake the
        // sample at the playhead into position and the box stays put.
        const channels = evaluateChannels(
          target.children,
          target.animation,
          state.playhead,
        )
        const live = findNode(channels, id)
        const motion = live ? motionPathOffset(channels, live) : null
        const delta = motion?.offset ?? { x: 0, y: 0 }
        let animation = dropArmedProperty(
          target.animation,
          id,
          'motionPath.progress',
        )
        animation = offsetPositionTracks(animation, id, delta)
        target.animation = animation
        updateNodeById(target.children, id, {
          motionPath: undefined,
          transform: {
            ...node.transform,
            position: {
              x: position.x + delta.x,
              y: position.y + delta.y,
            },
          },
        })
      }),
    moveLayer: (sourceId, targetId, position) =>
      set((state) => {
        moveLayerInScene(activeTarget(state).children, sourceId, targetId, position)
      }),
    removeSelected: () =>
      set((state) => {
        const target = activeTarget(state)
        if (state.mode === 'animate' && state.selectedKeyIds.length > 0) {
          target.animation = removeKeys(
            target.animation,
            state.selectedKeyIds,
          )
          state.selectedKeyIds = []
          return
        }
        target.children = removeNodes(
          target.children,
          state.selectedIds,
        )
        target.children = clearMissingMotionPaths(target.children)
        state.selectedIds = []
        target.animation = pruneAnimation(target.animation, target.children)
      }),
    duplicateSelected: () =>
      set((state) => {
        const target = activeTarget(state)
        const idMap = new Map<string, string>()
        const copies = remapMotionPaths(
          dragRoots(target.children, state.selectedIds).map((node) =>
            cloneNode(node, true, idMap),
          ),
          idMap,
        )
        if (copies.length === 0) return
        target.children.push(...copies)
        state.selectedIds = copies.map((node) => node.id)
        target.animation.tracks.push(
          ...remapAnimation(target.animation, idMap),
        )
      }),
    groupSelected: () =>
      set((state) => {
        const target = activeTarget(state)
        const result = groupNodes(
          target.children,
          state.selectedIds,
        )
        if (result) state.selectedIds = [result.groupId]
      }),
    ungroupSelected: () =>
      set((state) => {
        const target = activeTarget(state)
        if (!canUngroup(target.children, state.selectedIds)) return
        const group = findNode(target.children, state.selectedIds[0])
        if (group?.type !== 'group') return
        const childIds = group.children.map((child) => child.id)
        ungroupNode(target.children, group.id)
        state.selectedIds = childIds
        target.animation = pruneAnimation(target.animation, target.children)
      }),
    setArtboardSize: (width, height) =>
      set((state) => {
        state.document.artboard.width = width
        state.document.artboard.height = height
      }),
    updateArtboard: (update) =>
      set((state) => {
        Object.assign(state.document.artboard, update)
      }),
    setDocumentName: (name) =>
      set((state) => {
        state.document.name = name
      }),
    setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
    setPan: (pan) => set({ pan }),
    setViewport: (zoom, pan) =>
      set({
        zoom: Math.min(4, Math.max(0.1, zoom)),
        pan,
      }),
    setPlayhead: (time, pause = false) =>
      set((state) => {
        const animation = activeTarget(state).animation
        state.playhead = Math.min(
          Math.max(time, 0),
          animation.duration,
        )
        if (pause) state.playing = false
      }),
    setPlaying: (playing) =>
      set((state) => {
        const animation = activeTarget(state).animation
        state.playing = playing
        if (
          playing &&
          state.playhead >= animation.duration - 1e-4
        ) {
          state.playhead = 0
        }
      }),
    setLooping: (looping) => set({ looping }),
    setDuration: (duration) =>
      set((state) => {
        const target = activeTarget(state)
        target.animation = setAnimationDuration(target.animation, duration)
        state.playhead = Math.min(state.playhead, target.animation.duration)
      }),
    armProperty: (nodeId, property) =>
      set((state) => {
        const target = activeTarget(state)
        const node = findNode(target.children, nodeId)
        if (!node) return
        const current = evaluateNodeAtTime(
          node,
          target.animation,
          state.playhead,
        )
        const value = readChannel(current, property)
        if (value === undefined) return
        target.animation = seedArmedProperty(
          target.animation,
          nodeId,
          property,
          value,
          state.playhead,
        )
      }),
    disarmProperty: (nodeId, property) =>
      set((state) => {
        const target = activeTarget(state)
        target.animation = dropArmedProperty(
          target.animation,
          nodeId,
          property,
        )
      }),
    togglePropertyArm: (nodeId, property) =>
      set((state) => {
        const target = activeTarget(state)
        if (isArmed(target.animation, nodeId, property)) {
          target.animation = dropArmedProperty(
            target.animation,
            nodeId,
            property,
          )
          return
        }
        const node = findNode(target.children, nodeId)
        if (!node) return
        const current = evaluateNodeAtTime(
          node,
          target.animation,
          state.playhead,
        )
        const value = readChannel(current, property)
        if (value === undefined) return
        target.animation = seedArmedProperty(
          target.animation,
          nodeId,
          property,
          value,
          state.playhead,
        )
      }),
    applyAnimationPreset: (nodeId, presetId, config) =>
      set((state) => {
        const target = activeTarget(state)
        const node = findNode(target.children, nodeId)
        if (!node) return
        target.animation = applyPreset(
          target.animation,
          node,
          presetId,
          config,
          state.playhead,
        )
        state.playing = false
        state.selectedKeyIds = []
      }),
    selectKeys: (ids, additive = false) =>
      set((state) => {
        state.selectedKeyIds = additive
          ? [
              ...state.selectedKeyIds,
              ...ids.filter((id) => !state.selectedKeyIds.includes(id)),
            ]
          : ids
      }),
    removeSelectedKeys: () =>
      set((state) => {
        const target = activeTarget(state)
        target.animation = removeKeys(
          target.animation,
          state.selectedKeyIds,
        )
        state.selectedKeyIds = []
      }),
    duplicateSelectedKeys: () =>
      set((state) => {
        const target = activeTarget(state)
        const duplicated = duplicateKeys(
          target.animation,
          state.selectedKeyIds,
        )
        target.animation = duplicated.animation
        state.selectedKeyIds = duplicated.keyIds
        const selected = duplicated.keyIds[0]
        if (!selected) return
        for (const track of target.animation.tracks) {
          const key = track.keys.find((item) => item.id === selected)
          if (key) {
            state.playhead = key.time
            break
          }
        }
      }),
    updateKey: (keyId, update) =>
      set((state) => {
        const target = activeTarget(state)
        const track = target.animation.tracks.find((item) =>
          item.keys.some((key) => key.id === keyId),
        )
        const key = track?.keys.find((item) => item.id === keyId)
        target.animation = patchKeyframe(
          target.animation,
          keyId,
          update,
        )
        if (
          !track ||
          !key ||
          key.time >= 1e-4 ||
          update.value === undefined
        ) {
          return
        }
        const node = findNode(target.children, track.nodeId)
        if (!node) return
        updateNodeById(
          target.children,
          node.id,
          writeChannel(node, track.property, update.value),
        )
      }),
    retimeKey: (keyId, time) =>
      set((state) => {
        const target = activeTarget(state)
        target.animation = moveKeyframe(
          target.animation,
          keyId,
          time,
        )
      }),
    createSymbolFromSelection: (name = 'Symbol') => {
      if (useEditorStore.getState().editingSymbolId) return null
      let symbolId: string | null = null
      set((state) => {
        const result = convertSelectionToSymbol(
          state.document,
          state.selectedIds,
          name,
        )
        if (!result) return
        state.document = result.document
        state.selectedIds = [result.instanceId]
        state.selectedKeyIds = []
        symbolId = result.symbolId
      })
      return symbolId
    },
    createBlankSymbol: (name, width, height, duration) => {
      if (useEditorStore.getState().editingSymbolId) return null
      const symbolId = nanoid()
      set((state) => {
        if (state.document.version !== 2) return
        state.document.symbols.push({
          id: symbolId,
          name,
          width,
          height,
          children: [],
          animation: {
            duration: Math.max(0, duration),
            tracks: [],
          },
        })
      })
      return symbolId
    },
    addSymbolInstance: (symbolId) => {
      if (useEditorStore.getState().editingSymbolId) return null
      let instanceId: string | null = null
      set((state) => {
        if (state.document.version !== 2) return
        const definition = state.document.symbols.find(
          (symbol) => symbol.id === symbolId,
        )
        if (!definition) return
        const instance = createSymbolInstance(definition)
        state.document.children.push(instance)
        state.selectedIds = [instance.id]
        state.selectedKeyIds = []
        instanceId = instance.id
      })
      return instanceId
    },
    enterSymbol: (symbolId) =>
      set((state) => {
        if (
          state.editingSymbolId ||
          state.document.version !== 2 ||
          !state.document.symbols.some((symbol) => symbol.id === symbolId)
        ) {
          return
        }
        state.editingSymbolId = symbolId
        state.selectedIds = []
        state.selectedKeyIds = []
        state.playhead = Math.min(
          state.playhead,
          activeTarget(state).animation.duration,
        )
        state.playing = false
      }),
    exitSymbol: () =>
      set((state) => {
        if (!state.editingSymbolId) return
        state.editingSymbolId = null
        state.selectedIds = []
        state.selectedKeyIds = []
        state.playhead = Math.min(
          state.playhead,
          state.document.animation.duration,
        )
        state.playing = false
      }),
    renameSymbol: (symbolId, name) =>
      set((state) => {
        if (state.document.version !== 2) return
        const definition = state.document.symbols.find(
          (symbol) => symbol.id === symbolId,
        )
        if (definition) definition.name = name
      }),
    removeUnusedSymbol: (symbolId) =>
      set((state) => {
        if (
          state.document.version !== 2 ||
          hasSymbolReference(state.document.children, symbolId)
        ) {
          return
        }
        const index = state.document.symbols.findIndex(
          (symbol) => symbol.id === symbolId,
        )
        if (index < 0) return
        state.document.symbols.splice(index, 1)
        if (state.editingSymbolId === symbolId) {
          state.editingSymbolId = null
          state.selectedIds = []
          state.selectedKeyIds = []
        }
      }),
    updateSymbolInstancePlayback: (id, patch) =>
      set((state) => {
        const node = findNode(state.document.children, id)
        if (!node || node.type !== 'symbol') return
        updateNodeById(state.document.children, id, {
          playback: { ...node.playback, ...patch },
        })
      }),
  })),
)

useEditorStore.subscribe((state, previous) => {
  if (restoringHistory || state.document === previous.document) return
  if (historyGroupDepth > 0) {
    groupedDocumentChanged = true
    return
  }
  undoStack.push(snapshot(previous))
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
  useEditorStore.setState({ canUndo: true, canRedo: false })
})

export const selectedNode = findSelectedNode
export { canGroup, canUngroup, dragRoots, findNode }
export { evaluateScene } from '../model/animation'
