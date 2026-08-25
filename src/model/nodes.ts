import { nanoid } from 'nanoid'
import { defaultTransform } from './transform'
import type { EditorNode, ShapeType } from './types'

export function createShape(
  type: ShapeType,
  position = { x: 310, y: 220 },
): EditorNode {
  const base = {
    id: nanoid(),
    name: type === 'rect' ? 'Rectangle' : 'Ellipse',
    visible: true,
    locked: false,
    pivotPreset: 'center' as const,
    effects: [],
    fill: '#cbd0d8',
    stroke: '#4f8cff',
    strokeWidth: 1,
    transform: {
      ...defaultTransform(),
      position,
    },
  }

  if (type === 'ellipse') {
    return {
      ...base,
      type,
      rx: 55,
      ry: 55,
      transform: { ...base.transform, pivot: { x: 55, y: 55 } },
    }
  }

  return {
    ...base,
    type,
    width: 110,
    height: 140,
    rx: 0,
    ry: 0,
    transform: { ...base.transform, pivot: { x: 55, y: 70 } },
  }
}
