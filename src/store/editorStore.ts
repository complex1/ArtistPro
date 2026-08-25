import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  ANIMATABLE_PROPERTIES,
  armProperty as seedArmedProperty,
  defaultAnimation,
  disarmProperty as dropArmedProperty,
  evaluateNodeAtTime,
  isArmed,
  pruneAnimation,
  remapAnimation,
  removeKeys,
  restValue,
  retimeKey as moveKeyframe,
  setAnimationDuration,
  setRestValue,
  upsertKeyframe,
} from '../model/animation'
import {
  animatedEditsFromPatch,
  readChannel,
  writeChannel,
  type KeyframeValue,
} from '../model/channels'
import { createShape } from '../model/nodes'
import { defaultPencilSettings } from '../model/pencil'
import {
  canGroup,
  canUngroup,
  cloneNode,
  dragRoots,
  findNode,
  groupNodes,
  moveLayer as moveLayerInScene,
  removeNodes,
  selectedNode as findSelectedNode,
  ungroupNode,
  updateNodeById,
} from '../model/scene'
import type { LayerDropPosition } from '../model/scene'
import type {
  AnimatableProperty,
  EditorDocument,
  EditorMode,
  EditorNode,
  PencilSettings,
  ShapeType,
  Tool,
  Transform,
  Vec2,
} from '../model/types'

const firstShape = createShape('rect')

type EditorStore = {
  document: EditorDocument
  mode: EditorMode
  tool: Tool
  selectedIds: string[]
  pencilSettings: PencilSettings
  zoom: number
  pan: Vec2
  playhead: number
  playing: boolean
  looping: boolean
  selectedKeyIds: string[]
  setMode: (mode: EditorMode) => void
  setTool: (tool: Tool) => void
  setPencilSettings: (update: Partial<PencilSettings>) => void
  select: (id: string | null, additive?: boolean) => void
  selectMany: (ids: string[]) => void
  addShape: (type: ShapeType) => void
  addNode: (node: EditorNode) => void
  addNodes: (nodes: EditorNode[]) => void
  removeNode: (id: string) => void
  updateNode: (id: string, update: Partial<EditorNode>) => void
  editTransform: (id: string, transform: Transform) => void
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
  selectKeys: (ids: string[], additive?: boolean) => void
  removeSelectedKeys: () => void
  retimeKey: (keyId: string, time: number) => void
}

const recordingModes: EditorMode[] = ['animate']

export const useEditorStore = create<EditorStore>()(
  immer((set) => ({
    document: {
      version: 1,
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
    },
    mode: 'draw',
    tool: 'select',
    selectedIds: [firstShape.id],
    pencilSettings: defaultPencilSettings,
    zoom: 0.82,
    pan: { x: 0, y: 0 },
    playhead: 0,
    playing: false,
    looping: false,
    selectedKeyIds: [],
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
        const offset = state.document.children.length * 18
        const node = createShape(type, { x: 300 + offset, y: 210 + offset })
        node.name = `${node.name} ${state.document.children.length + 1}`
        state.document.children.push(node)
        state.selectedIds = [node.id]
        state.tool = 'select'
      }),
    addNode: (node) =>
      set((state) => {
        state.document.children.push(node)
        state.selectedIds = [node.id]
      }),
    addNodes: (nodes) =>
      set((state) => {
        if (nodes.length === 0) return
        state.document.children.push(...nodes)
        state.selectedIds = nodes.map((node) => node.id)
        state.tool = 'select'
      }),
    removeNode: (id) =>
      set((state) => {
        state.document.children = removeNodes(state.document.children, [id])
        state.selectedIds = state.selectedIds.filter((selectedId) =>
          Boolean(findNode(state.document.children, selectedId)),
        )
        state.document.animation = pruneAnimation(
          state.document.animation,
          state.document.children,
        )
      }),
    updateNode: (id, update) =>
      set((state) => {
        const node = findNode(state.document.children, id)
        if (!node) return
        if (state.mode !== 'animate') {
          updateNodeById(state.document.children, id, update)
          return
        }

        // Inspector fields render the evaluated pose, so a patch echoes that
        // pose back for every channel it carries, not just the edited one. Read
        // both poses before the patch lands: the draft is the same object.
        let animation = state.document.animation
        const shown = evaluateNodeAtTime(node, animation, state.playhead)
        const restores: { property: AnimatableProperty; value: KeyframeValue }[] = []

        for (const edit of animatedEditsFromPatch(update as Record<string, unknown>)) {
          const rest = readChannel(node, edit.property)
          const changed = readChannel(shown, edit.property) !== edit.value
          if (changed && !isArmed(animation, id, edit.property)) continue
          if (changed) {
            animation = upsertKeyframe(
              animation,
              id,
              edit.property,
              state.playhead,
              edit.value,
            )
            if (state.playhead < 1e-4) continue
          }
          if (rest !== undefined && rest !== edit.value) {
            restores.push({ property: edit.property, value: rest })
          }
        }

        updateNodeById(state.document.children, id, update)
        state.document.animation = animation
        if (restores.length === 0) return
        let live = findNode(state.document.children, id)
        if (!live) return
        for (const restore of restores) {
          live = writeChannel(live, restore.property, restore.value)
        }
        updateNodeById(state.document.children, id, live)
      }),
    editTransform: (id, transform) =>
      set((state) => {
        const node = findNode(state.document.children, id)
        if (!node) return
        const recording = recordingModes.includes(state.mode)
        if (!recording) {
          updateNodeById(state.document.children, id, { transform })
          return
        }

        let rest = node.transform
        let animation = state.document.animation
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
        state.document.animation = animation
        updateNodeById(state.document.children, id, { transform: rest })
      }),
    moveLayer: (sourceId, targetId, position) =>
      set((state) => {
        moveLayerInScene(state.document.children, sourceId, targetId, position)
      }),
    removeSelected: () =>
      set((state) => {
        if (state.mode === 'animate' && state.selectedKeyIds.length > 0) {
          state.document.animation = removeKeys(
            state.document.animation,
            state.selectedKeyIds,
          )
          state.selectedKeyIds = []
          return
        }
        state.document.children = removeNodes(
          state.document.children,
          state.selectedIds,
        )
        state.selectedIds = []
        state.document.animation = pruneAnimation(
          state.document.animation,
          state.document.children,
        )
      }),
    duplicateSelected: () =>
      set((state) => {
        const idMap = new Map<string, string>()
        const copies = dragRoots(
          state.document.children,
          state.selectedIds,
        ).map((node) => cloneNode(node, true, idMap))
        if (copies.length === 0) return
        state.document.children.push(...copies)
        state.selectedIds = copies.map((node) => node.id)
        state.document.animation.tracks.push(
          ...remapAnimation(state.document.animation, idMap),
        )
      }),
    groupSelected: () =>
      set((state) => {
        const result = groupNodes(
          state.document.children,
          state.selectedIds,
        )
        if (result) state.selectedIds = [result.groupId]
      }),
    ungroupSelected: () =>
      set((state) => {
        if (!canUngroup(state.document.children, state.selectedIds)) return
        const group = findNode(state.document.children, state.selectedIds[0])
        if (group?.type !== 'group') return
        const childIds = group.children.map((child) => child.id)
        ungroupNode(state.document.children, group.id)
        state.selectedIds = childIds
        state.document.animation = pruneAnimation(
          state.document.animation,
          state.document.children,
        )
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
        state.playhead = Math.min(
          Math.max(time, 0),
          state.document.animation.duration,
        )
        if (pause) state.playing = false
      }),
    setPlaying: (playing) =>
      set((state) => {
        state.playing = playing
        if (
          playing &&
          state.playhead >= state.document.animation.duration - 1e-4
        ) {
          state.playhead = 0
        }
      }),
    setLooping: (looping) => set({ looping }),
    setDuration: (duration) =>
      set((state) => {
        state.document.animation = setAnimationDuration(
          state.document.animation,
          duration,
        )
        state.playhead = Math.min(state.playhead, state.document.animation.duration)
      }),
    armProperty: (nodeId, property) =>
      set((state) => {
        const node = findNode(state.document.children, nodeId)
        if (!node) return
        const current = evaluateNodeAtTime(
          node,
          state.document.animation,
          state.playhead,
        )
        const value = readChannel(current, property)
        if (value === undefined) return
        state.document.animation = seedArmedProperty(
          state.document.animation,
          nodeId,
          property,
          value,
          state.playhead,
        )
      }),
    disarmProperty: (nodeId, property) =>
      set((state) => {
        state.document.animation = dropArmedProperty(
          state.document.animation,
          nodeId,
          property,
        )
      }),
    togglePropertyArm: (nodeId, property) =>
      set((state) => {
        if (isArmed(state.document.animation, nodeId, property)) {
          state.document.animation = dropArmedProperty(
            state.document.animation,
            nodeId,
            property,
          )
          return
        }
        const node = findNode(state.document.children, nodeId)
        if (!node) return
        const current = evaluateNodeAtTime(
          node,
          state.document.animation,
          state.playhead,
        )
        const value = readChannel(current, property)
        if (value === undefined) return
        state.document.animation = seedArmedProperty(
          state.document.animation,
          nodeId,
          property,
          value,
          state.playhead,
        )
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
        state.document.animation = removeKeys(
          state.document.animation,
          state.selectedKeyIds,
        )
        state.selectedKeyIds = []
      }),
    retimeKey: (keyId, time) =>
      set((state) => {
        state.document.animation = moveKeyframe(
          state.document.animation,
          keyId,
          time,
        )
      }),
  })),
)

export const selectedNode = findSelectedNode
export { canGroup, canUngroup, dragRoots, findNode }
export { evaluateScene } from '../model/animation'
