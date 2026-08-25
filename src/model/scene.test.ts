import { describe, expect, it } from 'vitest'
import { createShape } from './nodes'
import {
  dragDelta,
  findNode,
  groupNodes,
  localBounds,
  moveLayer,
  pivotAnchor,
  resizeFactor,
  resizeNode,
  selectionTarget,
  ungroupNode,
  updateNodeById,
} from './scene'
import { retargetPivot, transformPoint } from './transform'
import type {
  EditorNode,
  EllipseNode,
  GroupNode,
  ImageNode,
  RectNode,
} from './types'

const sampleRect = (name: string, x: number, y: number): EditorNode => {
  const node = createShape('rect', { x, y })
  node.name = name
  return node
}

const worldCorner = (node: EditorNode, point: { x: number; y: number }) =>
  transformPoint(node.transform, point)

const sampleImage = (): ImageNode => ({
  id: 'image',
  type: 'image',
  name: 'Image',
  visible: true,
  locked: false,
  pivotPreset: 'center',
  effects: [],
  source: 'data:image/png;base64,AA==',
  naturalWidth: 400,
  naturalHeight: 200,
  width: 200,
  height: 100,
  crop: { x: 0, y: 0, width: 400, height: 200 },
  adjustments: {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    chroma: {
      enabled: false,
      color: '#00ff00',
      tolerance: 0.1,
      feather: 0.1,
    },
  },
  transform: {
    pivot: { x: 100, y: 50 },
    position: { x: 20, y: 30 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    skew: { x: 0, y: 0 },
    opacity: 1,
  },
})

describe('image nodes', () => {
  it('reports displayed bounds independently from source crop pixels', () => {
    expect(localBounds(sampleImage())).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
  })

  it('resizes displayed dimensions without changing the source crop', () => {
    const resized = resizeNode(
      sampleImage(),
      { x: 0.5, y: 2 },
      { x: 0, y: 0 },
    ) as ImageNode
    expect(resized.width).toBe(100)
    expect(resized.height).toBe(200)
    expect(resized.crop).toEqual({ x: 0, y: 0, width: 400, height: 200 })
  })
})

describe('groupNodes', () => {
  it('wraps sibling shapes without moving their artwork', () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 200, 120)
    const result = groupNodes([a, b], [a.id, b.id])

    expect(result).not.toBeNull()
    const group = result!.roots[0] as GroupNode
    expect(group.type).toBe('group')
    expect(group.children.map((node) => node.id)).toEqual([a.id, b.id])

    const groupedA = group.children[0]
    expect(worldCorner(groupedA, { x: 0, y: 0 }).x).toBeCloseTo(
      worldCorner(a, { x: 0, y: 0 }).x,
      6,
    )
    expect(worldCorner(groupedA, { x: 0, y: 0 }).y).toBeCloseTo(
      worldCorner(a, { x: 0, y: 0 }).y,
      6,
    )
  })

  it('puts the group pivot at the selection center', () => {
    const a = sampleRect('A', 0, 0)
    const b = sampleRect('B', 100, 0)
    const group = groupNodes([a, b], [a.id, b.id])!.roots[0] as GroupNode
    const bounds = localBounds(group)

    expect(group.transform.pivot.x).toBeCloseTo(bounds.x + bounds.width / 2, 6)
    expect(group.transform.pivot.y).toBeCloseTo(bounds.y + bounds.height / 2, 6)
  })

  it('refuses to group a single node', () => {
    const a = sampleRect('A', 0, 0)
    expect(groupNodes([a], [a.id])).toBeNull()
  })
})

describe('pivotAnchor', () => {
  it('places group anchors inside the group bounds, not at the origin', () => {
    const a = sampleRect('A', 300, 200)
    const b = sampleRect('B', 460, 260)
    const group = groupNodes([a, b], [a.id, b.id])!.roots[0] as GroupNode
    const bounds = localBounds(group)

    expect(group.pivotPreset).toBe('center')
    expect(pivotAnchor(group, 'top-left')).toEqual({ x: bounds.x, y: bounds.y })
    expect(pivotAnchor(group, 'bottom-right')).toEqual({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    })
    expect(pivotAnchor(group, 'center')).toEqual(group.transform.pivot)
  })

  it('keeps shape anchors relative to their own local box', () => {
    const rect = sampleRect('A', 300, 200)

    expect(pivotAnchor(rect, 'top-left')).toEqual({ x: 0, y: 0 })
    expect(pivotAnchor(rect, 'bottom-right')).toEqual({ x: 110, y: 140 })
  })

  it('updates an anchored group pivot when a child changes', () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 200, 120)
    const roots = groupNodes([a, b], [a.id, b.id])!.roots
    const group = roots[0] as GroupNode

    updateNodeById(roots, b.id, {
      transform: {
        ...b.transform,
        position: { x: 300, y: 180 },
      },
    })

    expect(group.transform.pivot).toEqual(pivotAnchor(group, 'center'))
  })

  it('keeps a custom group pivot fixed when a child changes', () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 200, 120)
    const roots = groupNodes([a, b], [a.id, b.id])!.roots
    const group = roots[0] as GroupNode
    const custom = { x: 75, y: 90 }
    group.pivotPreset = 'custom'
    group.transform = retargetPivot(group.transform, custom)

    updateNodeById(roots, b.id, {
      transform: {
        ...b.transform,
        position: { x: 300, y: 180 },
      },
    })

    expect(group.transform.pivot).toEqual(custom)
  })
})

describe('selectionTarget', () => {
  const nested = () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 200, 120)
    const c = sampleRect('C', 400, 160)
    const inner = groupNodes([a, b, c], [a.id, b.id])!.roots
    const outer = groupNodes(inner, inner.map((node) => node.id))!.roots
    return {
      a,
      outerGroup: outer[0] as GroupNode,
      innerGroup: (outer[0] as GroupNode).children[0] as GroupNode,
      roots: outer,
    }
  }

  it('selects the clicked shape when no group is selected', () => {
    const { roots, a } = nested()

    expect(selectionTarget(roots, a.id, [])).toBe(a.id)
  })

  it('selects the clicked shape when an unrelated layer is selected', () => {
    const { roots, a } = nested()
    const other = sampleRect('D', 600, 400)

    expect(selectionTarget([...roots, other], a.id, [other.id])).toBe(a.id)
  })

  it('keeps the group selected when clicking one of its children', () => {
    const { roots, a, outerGroup } = nested()

    expect(selectionTarget(roots, a.id, [outerGroup.id])).toBe(outerGroup.id)
  })

  it('stays on an inner group the user already drilled into', () => {
    const { roots, a, innerGroup } = nested()

    expect(selectionTarget(roots, a.id, [innerGroup.id])).toBe(innerGroup.id)
  })

  it('keeps a directly selected child selectable', () => {
    const { roots, a } = nested()

    expect(selectionTarget(roots, a.id, [a.id])).toBe(a.id)
  })

  it('leaves ungrouped shapes untouched', () => {
    const shape = sampleRect('A', 40, 80)

    expect(selectionTarget([shape], shape.id, [])).toBe(shape.id)
  })
})

describe('dragDelta', () => {
  const groupedChild = (patch: Partial<GroupNode['transform']>) => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 200, 120)
    const roots = groupNodes([a, b], [a.id, b.id])!.roots
    const group = roots[0] as GroupNode
    group.transform = { ...group.transform, ...patch }
    return { roots, childId: a.id }
  }

  it('passes a canvas delta through for a root level shape', () => {
    const shape = sampleRect('A', 40, 80)

    expect(dragDelta([shape], shape.id, { x: 12, y: -7 })).toEqual({ x: 12, y: -7 })
  })

  it('counter-rotates the delta so a child follows the cursor axes', () => {
    const { roots, childId } = groupedChild({ rotation: 90 })
    const delta = dragDelta(roots, childId, { x: 10, y: 0 })

    expect(delta.x).toBeCloseTo(0, 6)
    expect(delta.y).toBeCloseTo(-10, 6)
  })

  it('divides the delta by the parent scale', () => {
    const { roots, childId } = groupedChild({ scale: { x: 2, y: 4 } })
    const delta = dragDelta(roots, childId, { x: 10, y: 8 })

    expect(delta.x).toBeCloseTo(5, 6)
    expect(delta.y).toBeCloseTo(2, 6)
  })

  it('moves the child by the requested canvas distance', () => {
    const { roots, childId } = groupedChild({ rotation: 35, scale: { x: 1.5, y: 0.75 } })
    const group = roots[0] as GroupNode
    const child = group.children.find((node) => node.id === childId)!
    const start = transformPoint(group.transform, transformPoint(child.transform, { x: 0, y: 0 }))
    const delta = dragDelta(roots, childId, { x: 24, y: -16 })

    child.transform = {
      ...child.transform,
      position: {
        x: child.transform.position.x + delta.x,
        y: child.transform.position.y + delta.y,
      },
    }
    const end = transformPoint(group.transform, transformPoint(child.transform, { x: 0, y: 0 }))

    expect(end.x - start.x).toBeCloseTo(24, 6)
    expect(end.y - start.y).toBeCloseTo(-16, 6)
  })
})

describe('resizeNode', () => {
  const boxCorner = (node: EditorNode, fx: number, fy: number) => {
    const bounds = localBounds(node)
    return transformPoint(node.transform, {
      x: bounds.x + bounds.width * fx,
      y: bounds.y + bounds.height * fy,
    })
  }

  it('changes rect geometry instead of scale', () => {
    const rect = sampleRect('A', 40, 80) as RectNode
    const resized = resizeNode(rect, { x: 2, y: 0.5 }, { x: 0, y: 0 }) as RectNode

    expect(resized.width).toBeCloseTo(220, 6)
    expect(resized.height).toBeCloseTo(70, 6)
    expect(resized.transform.scale).toEqual({ x: 1, y: 1 })
    expect(resized.strokeWidth).toBe(rect.strokeWidth)
  })

  it('pins the anchor corner while resizing from the opposite corner', () => {
    const rect = sampleRect('A', 40, 80)
    const bounds = localBounds(rect)
    const anchor = { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
    const before = boxCorner(rect, 1, 1)
    const resized = resizeNode(rect, { x: 0.5, y: 0.25 }, anchor)
    const after = boxCorner(resized, 1, 1)

    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('pins the anchor corner even when the node is rotated', () => {
    const rect = sampleRect('A', 40, 80)
    rect.transform = { ...rect.transform, rotation: 37 }
    const before = boxCorner(rect, 0, 0)
    const resized = resizeNode(rect, { x: 1.7, y: 0.6 }, { x: 0, y: 0 })
    const after = boxCorner(resized, 0, 0)

    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('resizes ellipse radii', () => {
    const ellipse = createShape('ellipse', { x: 10, y: 10 }) as EllipseNode
    const resized = resizeNode(ellipse, { x: 2, y: 3 }, { x: 0, y: 0 }) as EllipseNode

    expect(resized.rx).toBeCloseTo(110, 6)
    expect(resized.ry).toBeCloseTo(165, 6)
    expect(resized.transform.scale).toEqual({ x: 1, y: 1 })
  })

  it('pushes a group resize down into child geometry', () => {
    const a = sampleRect('A', 0, 0)
    const b = sampleRect('B', 200, 100)
    const group = groupNodes([a, b], [a.id, b.id])!.roots[0] as GroupNode
    const bounds = localBounds(group)
    const resized = resizeNode(group, { x: 2, y: 2 }, {
      x: bounds.x,
      y: bounds.y,
    }) as GroupNode

    expect(resized.transform.scale).toEqual({ x: 1, y: 1 })
    const [first, second] = resized.children as RectNode[]
    expect(first.width).toBeCloseTo(220, 6)
    expect(second.transform.position.x).toBeCloseTo(400, 6)
    expect(second.transform.position.y).toBeCloseTo(200, 6)
    expect(localBounds(resized).width).toBeCloseTo(bounds.width * 2, 6)
  })

  it('falls back to scale for a rotated child that cannot resize on axis', () => {
    const a = sampleRect('A', 0, 0)
    const b = sampleRect('B', 200, 100)
    const group = groupNodes([a, b], [a.id, b.id])!.roots[0] as GroupNode
    group.children[0].transform = { ...group.children[0].transform, rotation: 30 }
    const resized = resizeNode(group, { x: 2, y: 2 }, { x: 0, y: 0 }) as GroupNode
    const rotatedChild = resized.children[0] as RectNode

    expect(rotatedChild.width).toBeCloseTo(110, 6)
    expect(rotatedChild.transform.scale.x).toBeCloseTo(2, 6)
    expect(rotatedChild.transform.scale.y).toBeCloseTo(2, 6)
  })
})

describe('resizeFactor', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 50 }

  it('measures the drag against the anchored corner', () => {
    const factor = resizeFactor(
      bounds,
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 150, y: 25 },
    )

    expect(factor.x).toBeCloseTo(1.5, 6)
    expect(factor.y).toBeCloseTo(0.5, 6)
  })

  it('locks the ratio to the dominant axis', () => {
    const factor = resizeFactor(
      bounds,
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 150, y: 45 },
      true,
    )

    expect(factor.x).toBeCloseTo(1.5, 6)
    expect(factor.y).toBeCloseTo(1.5, 6)
  })

  it('never collapses a node past a minimum size', () => {
    const factor = resizeFactor(
      bounds,
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: -40, y: -10 },
    )

    expect(factor.x).toBeGreaterThan(0)
    expect(factor.y).toBeGreaterThan(0)
    expect(factor.x * bounds.width).toBeGreaterThanOrEqual(1)
    expect(factor.y * bounds.height).toBeGreaterThanOrEqual(1)
  })
})

describe('ungroupNode', () => {
  it('keeps world points stable when ungrouping an unmoved group', () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 220, 140)
    const before = worldCorner(a, { x: 110, y: 140 })
    const grouped = groupNodes([a, b], [a.id, b.id])!
    const group = grouped.roots[0] as GroupNode
    const roots = ungroupNode(grouped.roots, group.id)
    const restored = roots.find((node) => node.id === a.id)!
    const after = worldCorner(restored, { x: 110, y: 140 })

    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('bakes a group translation into children', () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 220, 140)
    const before = worldCorner(a, { x: 0, y: 0 })
    const grouped = groupNodes([a, b], [a.id, b.id])!
    const group = grouped.roots[0] as GroupNode
    group.transform.position.x += 30
    group.transform.position.y += 10

    const roots = ungroupNode(grouped.roots, group.id)
    const restored = roots.find((node) => node.id === a.id)!
    const after = worldCorner(restored, { x: 0, y: 0 })

    expect(after.x).toBeCloseTo(before.x + 30, 6)
    expect(after.y).toBeCloseTo(before.y + 10, 6)
  })
})

describe('moveLayer', () => {
  it('reorders root layers in visual stacking order', () => {
    const a = sampleRect('A', 0, 0)
    const b = sampleRect('B', 100, 0)
    const c = sampleRect('C', 200, 0)
    const roots = [a, b, c]

    expect(moveLayer(roots, a.id, c.id, 'above')).toBe(true)
    expect(roots.map((node) => node.name)).toEqual(['B', 'C', 'A'])

    expect(moveLayer(roots, a.id, b.id, 'below')).toBe(true)
    expect(roots.map((node) => node.name)).toEqual(['A', 'B', 'C'])
  })

  it('inserts a root layer into a transformed group without moving it', () => {
    const loose = sampleRect('Loose', 440, 180)
    const b = sampleRect('B', 60, 50)
    const c = sampleRect('C', 220, 100)
    const group = groupNodes([b, c], [b.id, c.id])!.roots[0] as GroupNode
    group.transform = {
      ...group.transform,
      position: { x: 30, y: -20 },
      rotation: 28,
      scale: { x: 1.2, y: 0.8 },
    }
    const roots: EditorNode[] = [loose, group]
    const before = transformPoint(loose.transform, { x: 0, y: 0 })

    expect(moveLayer(roots, loose.id, group.id, 'inside')).toBe(true)
    const moved = findNode(roots, loose.id)!
    const after = transformPoint(
      group.transform,
      transformPoint(moved.transform, { x: 0, y: 0 }),
    )

    expect(after.x).toBeCloseTo(before.x, 5)
    expect(after.y).toBeCloseTo(before.y, 5)
    expect(group.children.at(-1)?.id).toBe(loose.id)
  })

  it('extracts a child to the root without moving it', () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 220, 140)
    const roots = groupNodes([a, b], [a.id, b.id])!.roots
    const group = roots[0] as GroupNode
    group.transform = {
      ...group.transform,
      position: { x: 70, y: 30 },
      rotation: -18,
    }
    const child = findNode(roots, a.id)!
    const before = transformPoint(
      group.transform,
      transformPoint(child.transform, { x: 110, y: 140 }),
    )

    expect(moveLayer(roots, a.id, null, 'inside')).toBe(true)
    const extracted = findNode(roots, a.id)!
    const after = transformPoint(extracted.transform, { x: 110, y: 140 })

    expect(after.x).toBeCloseTo(before.x, 5)
    expect(after.y).toBeCloseTo(before.y, 5)
    expect(roots.at(-1)?.id).toBe(a.id)
  })

  it('does not allow a group to be moved into its descendant', () => {
    const a = sampleRect('A', 40, 80)
    const b = sampleRect('B', 220, 140)
    const roots = groupNodes([a, b], [a.id, b.id])!.roots
    const group = roots[0] as GroupNode

    expect(moveLayer(roots, group.id, a.id, 'above')).toBe(false)
    expect(roots[0].id).toBe(group.id)
  })
})
