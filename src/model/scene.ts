import { nanoid } from 'nanoid'
import { pencilOutline } from './pencil'
import {
  affineToTransform,
  bakeParentTransform,
  defaultTransform,
  identityAffine,
  invertAffine,
  invertDelta,
  linearMatrix,
  multiplyAffine,
  retargetPivot,
  transformPoint,
  transformToAffine,
  type Affine,
} from './transform'
import type {
  EditorNode,
  GroupNode,
  PivotPreset,
  Transform,
  Vec2,
} from './types'

export type Box = { x: number; y: number; width: number; height: number }
export type LayerDropPosition = 'above' | 'below' | 'inside'

export function walkNodes(
  nodes: EditorNode[],
  visit: (node: EditorNode, parent: GroupNode | null) => void,
  parent: GroupNode | null = null,
) {
  for (const node of nodes) {
    visit(node, parent)
    if (node.type === 'group') walkNodes(node.children, visit, node)
  }
}

export function findNode(
  nodes: EditorNode[],
  id: string,
): EditorNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === 'group') {
      const match = findNode(node.children, id)
      if (match) return match
    }
  }
}

export function findList(
  nodes: EditorNode[],
  id: string,
): EditorNode[] | undefined {
  if (nodes.some((node) => node.id === id)) return nodes
  for (const node of nodes) {
    if (node.type === 'group') {
      const match = findList(node.children, id)
      if (match) return match
    }
  }
}

export function ancestorIds(nodes: EditorNode[], id: string): string[] {
  const path: string[] = []

  const search = (list: EditorNode[], trail: string[]): boolean => {
    for (const node of list) {
      if (node.id === id) {
        path.push(...trail)
        return true
      }
      if (node.type === 'group' && search(node.children, [...trail, node.id])) {
        return true
      }
    }
    return false
  }

  search(nodes, [])
  return path
}

export function selectedNode(
  nodes: EditorNode[],
  selectedIds: string[],
): EditorNode | undefined {
  if (selectedIds.length !== 1) return undefined
  return findNode(nodes, selectedIds[0])
}

/**
 * Which node a canvas click acts on. Clicks land on the shape itself; groups are
 * only entered from the layers panel, and while one is selected its children
 * keep acting on it so the whole group drags as a unit.
 */
export function selectionTarget(
  nodes: EditorNode[],
  id: string,
  selectedIds: string[],
): string {
  if (selectedIds.includes(id)) return id
  const selectedAncestors = ancestorIds(nodes, id).filter((ancestor) =>
    selectedIds.includes(ancestor),
  )
  return selectedAncestors.at(-1) ?? id
}

export function canGroup(nodes: EditorNode[], selectedIds: string[]): boolean {
  if (selectedIds.length < 2) return false
  const list = findList(nodes, selectedIds[0])
  return !!list && selectedIds.every((id) => list.some((node) => node.id === id))
}

export function canUngroup(nodes: EditorNode[], selectedIds: string[]): boolean {
  return selectedIds.length === 1 && findNode(nodes, selectedIds[0])?.type === 'group'
}

/**
 * Anchor point in the node's own local space. Group bounds do not start at the
 * origin, so the box offset has to be included.
 */
const pivotFractions: Record<Exclude<PivotPreset, 'custom'>, Vec2> = {
  'top-left': { x: 0, y: 0 },
  'top-center': { x: 0.5, y: 0 },
  'top-right': { x: 1, y: 0 },
  'middle-left': { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  'middle-right': { x: 1, y: 0.5 },
  'bottom-left': { x: 0, y: 1 },
  'bottom-center': { x: 0.5, y: 1 },
  'bottom-right': { x: 1, y: 1 },
}

export function pivotAnchor(node: EditorNode, preset: PivotPreset): Vec2 {
  if (preset === 'custom') return node.transform.pivot
  const fraction = pivotFractions[preset]
  const bounds = localBounds(node)
  return {
    x: bounds.x + bounds.width * fraction.x,
    y: bounds.y + bounds.height * fraction.y,
  }
}

function syncPivot(node: EditorNode) {
  if (node.pivotPreset === 'custom') return
  node.transform = retargetPivot(
    node.transform,
    pivotAnchor(node, node.pivotPreset),
  )
}

function syncTreePivots(nodes: EditorNode[]) {
  for (const node of nodes) {
    if (node.type !== 'group') continue
    syncTreePivots(node.children)
    syncPivot(node)
  }
}

export function localBounds(node: EditorNode): Box {
  if (node.type === 'rect') {
    return { x: 0, y: 0, width: node.width, height: node.height }
  }
  if (node.type === 'ellipse') {
    return { x: 0, y: 0, width: node.rx * 2, height: node.ry * 2 }
  }
  if (node.type === 'path') {
    const points = node.points.flatMap((point) => [
      point.anchor,
      {
        x: point.anchor.x + point.handleIn.x,
        y: point.anchor.y + point.handleIn.y,
      },
      {
        x: point.anchor.x + point.handleOut.x,
        y: point.anchor.y + point.handleOut.y,
      },
    ])
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    }
  }
  if (node.type === 'pencil') {
    const points = pencilOutline(node)
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    }
  }
  if (node.type === 'text') {
    return { x: 0, y: 0, width: node.width, height: node.fontSize }
  }
  if (node.type === 'image') {
    return { x: 0, y: 0, width: node.width, height: node.height }
  }
  return boundsOf(node.children)
}

function cornersOf(node: EditorNode): Vec2[] {
  const { x, y, width, height } = localBounds(node)
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((point) => transformPoint(node.transform, point))
}

export function boundsOf(nodes: EditorNode[]): Box {
  const points = nodes.flatMap(cornersOf)
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  }
}

const MIN_EXTENT = 1

const applyLinear = (
  matrix: { a: number; b: number; c: number; d: number },
  vector: Vec2,
): Vec2 => ({
  x: matrix.a * vector.x + matrix.c * vector.y,
  y: matrix.b * vector.x + matrix.d * vector.y,
})

const isAxisAligned = (transform: Transform) =>
  Math.abs(transform.rotation % 360) < 1e-6 &&
  Math.abs(transform.skew.x) < 1e-6 &&
  Math.abs(transform.skew.y) < 1e-6

const clampFactor = (factor: number, extent: number) => {
  if (!Number.isFinite(factor)) return 1
  if (extent <= 0) return 1
  return Math.max(factor, MIN_EXTENT / extent)
}

/** Position that puts a transform's translation at the requested point. */
function positionForTranslation(transform: Transform, translation: Vec2): Vec2 {
  const { a, b, c, d } = linearMatrix(transform)
  const { pivot } = transform
  return {
    x: translation.x - pivot.x + a * pivot.x + c * pivot.y,
    y: translation.y - pivot.y + b * pivot.x + d * pivot.y,
  }
}

/**
 * How much a bounding-box corner drag stretches the box, measured against the
 * corner that stays pinned. Never returns a factor that would collapse the node.
 */
export function resizeFactor(
  bounds: Box,
  anchor: Vec2,
  handle: Vec2,
  point: Vec2,
  lockRatio = false,
): Vec2 {
  const axis = (from: number, to: number, cursor: number) => {
    const span = to - from
    return Math.abs(span) < 1e-6 ? 1 : (cursor - from) / span
  }

  let x = axis(anchor.x, handle.x, point.x)
  let y = axis(anchor.y, handle.y, point.y)

  if (lockRatio) {
    const dominant = Math.abs(x - 1) > Math.abs(y - 1) ? x : y
    x = dominant
    y = dominant
  }

  return {
    x: clampFactor(x, bounds.width),
    y: clampFactor(y, bounds.height),
  }
}

/** Applies the resize to a group child, expressed in the group's coordinates. */
function resizeChild(child: EditorNode, factor: Vec2, shift: Vec2): EditorNode {
  const translation = transformToAffine(child.transform)
  const target = {
    x: shift.x + factor.x * translation.tx,
    y: shift.y + factor.y * translation.ty,
  }

  // A rotated or skewed child cannot absorb a non-uniform stretch into its own
  // width and height, so it keeps the stretch as a baked transform instead.
  if (!isAxisAligned(child.transform)) {
    const scaler: Transform = {
      ...defaultTransform(),
      position: shift,
      scale: factor,
    }
    const baked = structuredClone(child)
    baked.transform = bakeParentTransform(scaler, child.transform)
    syncPivot(baked)
    return baked
  }

  const resized = resizeNode(child, factor, { x: 0, y: 0 })
  resized.transform = {
    ...resized.transform,
    position: positionForTranslation(resized.transform, target),
  }
  return resized
}

/**
 * Resizes a node by stretching its geometry around `anchor` — a point in the
 * node's own coordinates — rather than by scaling its transform. Stroke widths,
 * corner radii and the inspector's width/height stay true to what is drawn.
 */
export function resizeNode(
  node: EditorNode,
  factor: Vec2,
  anchor: Vec2,
): EditorNode {
  const next = structuredClone(node)
  const shift = {
    x: anchor.x * (1 - factor.x),
    y: anchor.y * (1 - factor.y),
  }

  if (next.type === 'group') {
    next.children = next.children.map((child) =>
      resizeChild(child, factor, shift),
    )
  } else {
    const offset = applyLinear(linearMatrix(next.transform), shift)
    next.transform = {
      ...next.transform,
      position: {
        x: next.transform.position.x + offset.x,
        y: next.transform.position.y + offset.y,
      },
    }

    if (next.type === 'rect') {
      next.width = Math.max(MIN_EXTENT, next.width * factor.x)
      next.height = Math.max(MIN_EXTENT, next.height * factor.y)
      next.rx = Math.min(next.rx * factor.x, next.width / 2)
      next.ry = Math.min(next.ry * factor.y, next.height / 2)
    } else if (next.type === 'ellipse') {
      next.rx = Math.max(MIN_EXTENT / 2, next.rx * factor.x)
      next.ry = Math.max(MIN_EXTENT / 2, next.ry * factor.y)
    } else if (next.type === 'path') {
      next.points = next.points.map((point) => ({
        ...point,
        anchor: {
          x: point.anchor.x * factor.x,
          y: point.anchor.y * factor.y,
        },
        handleIn: {
          x: point.handleIn.x * factor.x,
          y: point.handleIn.y * factor.y,
        },
        handleOut: {
          x: point.handleOut.x * factor.x,
          y: point.handleOut.y * factor.y,
        },
      }))
    } else if (next.type === 'pencil') {
      next.samples = next.samples.map((sample) => ({
        ...sample,
        x: sample.x * factor.x,
        y: sample.y * factor.y,
      }))
    } else if (next.type === 'text') {
      next.width = Math.max(MIN_EXTENT, next.width * factor.x)
      next.fontSize = Math.max(MIN_EXTENT, next.fontSize * factor.y)
      next.letterSpacing *= factor.x
    } else {
      next.width = Math.max(MIN_EXTENT, next.width * factor.x)
      next.height = Math.max(MIN_EXTENT, next.height * factor.y)
    }
  }

  syncPivot(next)
  return next
}

export function groupNodes(
  roots: EditorNode[],
  ids: string[],
): { roots: EditorNode[]; groupId: string } | null {
  if (!canGroup(roots, ids)) return null
  const list = findList(roots, ids[0])
  if (!list) return null

  const selected = list.filter((node) => ids.includes(node.id))
  const insertAt = Math.min(
    ...selected.map((node) => list.indexOf(node)),
  )
  const bounds = boundsOf(selected)
  const group: GroupNode = {
    id: nanoid(),
    name: 'Group',
    visible: true,
    locked: false,
    type: 'group',
    pivotPreset: 'center',
    effects: [],
    transform: retargetPivot(defaultTransform(), {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    }),
    children: selected,
  }

  const next = list.filter((node) => !ids.includes(node.id))
  next.splice(insertAt, 0, group)
  list.splice(0, list.length, ...next)
  return { roots, groupId: group.id }
}

export function ungroupNode(roots: EditorNode[], groupId: string): EditorNode[] {
  const list = findList(roots, groupId)
  const group = findNode(roots, groupId)
  if (!list || group?.type !== 'group') return roots

  const index = list.findIndex((node) => node.id === groupId)
  const released = group.children.map((child) => ({
    ...child,
    transform: bakeParentTransform(group.transform, child.transform),
  }))
  list.splice(index, 1, ...released)
  return roots
}

export function removeNodes(nodes: EditorNode[], ids: string[]): EditorNode[] {
  return nodes
    .filter((node) => !ids.includes(node.id))
    .map((node) =>
      node.type === 'group'
        ? { ...node, children: removeNodes(node.children, ids) }
        : node,
    )
}

function parentOpacity(nodes: EditorNode[], id: string): number {
  return ancestorIds(nodes, id).reduce((opacity, ancestorId) => {
    return opacity * (findNode(nodes, ancestorId)?.transform.opacity ?? 1)
  }, 1)
}

/**
 * Moves a layer in visual stacking order or reparents it into a group.
 * The node's world transform is converted into the destination parent's space,
 * so inserting/extracting a layer does not move its artwork on the canvas.
 */
export function moveLayer(
  roots: EditorNode[],
  sourceId: string,
  targetId: string | null,
  position: LayerDropPosition,
): boolean {
  const source = findNode(roots, sourceId)
  const sourceList = findList(roots, sourceId)
  const target = targetId ? findNode(roots, targetId) : undefined
  if (!source || !sourceList || sourceId === targetId) return false
  if (targetId && ancestorIds(roots, targetId).includes(sourceId)) return false
  if (position === 'inside' && target?.type !== 'group' && targetId !== null) {
    return false
  }

  const destinationList =
    position === 'inside' && target?.type === 'group'
      ? target.children
      : targetId
        ? findList(roots, targetId)
        : roots
  if (!destinationList) return false

  const sameParent = sourceList === destinationList
  if (!sameParent) {
    const sourceWorld = multiplyAffine(
      parentAffine(roots, sourceId),
      transformToAffine(source.transform),
    )
    const destinationParent =
      position === 'inside' && target?.type === 'group'
        ? multiplyAffine(
            parentAffine(roots, target.id),
            transformToAffine(target.transform),
          )
        : targetId
          ? parentAffine(roots, targetId)
          : identityAffine()
    const worldOpacity = parentOpacity(roots, sourceId) * source.transform.opacity
    const destinationOpacity =
      position === 'inside' && target?.type === 'group'
        ? parentOpacity(roots, target.id) * target.transform.opacity
        : targetId
          ? parentOpacity(roots, targetId)
          : 1
    source.transform = affineToTransform(
      multiplyAffine(invertAffine(destinationParent), sourceWorld),
      source.transform.pivot,
      destinationOpacity === 0 ? source.transform.opacity : worldOpacity / destinationOpacity,
    )
  }

  sourceList.splice(sourceList.indexOf(source), 1)
  if (position === 'inside' || targetId === null) {
    destinationList.push(source)
  } else {
    const targetIndex = destinationList.findIndex((node) => node.id === targetId)
    if (targetIndex < 0) return false
    // The document paints from first to last while the layers UI is reversed.
    destinationList.splice(position === 'above' ? targetIndex + 1 : targetIndex, 0, source)
  }
  syncTreePivots(roots)
  return true
}

export function cloneNode(node: EditorNode, offset = false): EditorNode {
  const copy = structuredClone(node)
  copy.id = nanoid()
  if (offset) {
    copy.transform.position = {
      x: copy.transform.position.x + 18,
      y: copy.transform.position.y + 18,
    }
    copy.name = `${copy.name} copy`
  }
  if (copy.type === 'group') {
    copy.children = copy.children.map((child) => cloneNode(child))
  } else if (copy.type === 'path') {
    copy.points = copy.points.map((point) => ({ ...point, id: nanoid() }))
  }
  return copy
}

export function updateNodeById(
  nodes: EditorNode[],
  id: string,
  update: Partial<EditorNode>,
): boolean {
  for (const node of nodes) {
    if (node.id === id) {
      Object.assign(node, update)
      syncPivot(node)
      return true
    }
    if (node.type === 'group' && updateNodeById(node.children, id, update)) {
      syncPivot(node)
      return true
    }
  }
  return false
}

export function parentAffine(nodes: EditorNode[], id: string): Affine {
  return ancestorIds(nodes, id).reduce<Affine>((accumulated, ancestorId) => {
    const ancestor = findNode(nodes, ancestorId)
    if (!ancestor) return accumulated
    return multiplyAffine(accumulated, transformToAffine(ancestor.transform))
  }, identityAffine())
}

/**
 * Converts a canvas drag distance into the node's own coordinates, so artwork
 * tracks the cursor instead of sliding along a rotated or scaled parent's axes.
 */
export function dragDelta(
  nodes: EditorNode[],
  id: string,
  delta: Vec2,
): Vec2 {
  return invertDelta(parentAffine(nodes, id), delta)
}

export function dragRoots(
  nodes: EditorNode[],
  selectedIds: string[],
): EditorNode[] {
  const selected = new Set(selectedIds)
  const roots: EditorNode[] = []
  walkNodes(nodes, (node) => {
    if (!selected.has(node.id)) return
    if (ancestorIds(nodes, node.id).some((id) => selected.has(id))) return
    roots.push(node)
  })
  return roots
}
