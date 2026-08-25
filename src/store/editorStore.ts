import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
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
  EditorDocument,
  EditorMode,
  EditorNode,
  PencilSettings,
  ShapeType,
  Tool,
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
}

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
    },
    mode: 'draw',
    tool: 'select',
    selectedIds: [firstShape.id],
    pencilSettings: defaultPencilSettings,
    zoom: 0.82,
    pan: { x: 0, y: 0 },
    setMode: (mode) => set({ mode }),
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
      }),
    updateNode: (id, update) =>
      set((state) => {
        updateNodeById(state.document.children, id, update)
      }),
    moveLayer: (sourceId, targetId, position) =>
      set((state) => {
        moveLayerInScene(state.document.children, sourceId, targetId, position)
      }),
    removeSelected: () =>
      set((state) => {
        state.document.children = removeNodes(
          state.document.children,
          state.selectedIds,
        )
        state.selectedIds = []
      }),
    duplicateSelected: () =>
      set((state) => {
        const copies = dragRoots(
          state.document.children,
          state.selectedIds,
        ).map((node) => cloneNode(node, true))
        if (copies.length === 0) return
        state.document.children.push(...copies)
        state.selectedIds = copies.map((node) => node.id)
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
  })),
)

export const selectedNode = findSelectedNode
export { canGroup, canUngroup, dragRoots, findNode }
