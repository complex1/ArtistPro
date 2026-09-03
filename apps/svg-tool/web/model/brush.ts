import { nanoid } from 'nanoid'
import { getStroke } from 'perfect-freehand'
import { defaultTransform } from './transform'
import type { BrushNode, BrushSample, BrushSettings, Vec2 } from './types'

export const defaultBrushSettings: BrushSettings = {
  size: 8,
  color: '#1f2937',
  smoothing: 0.6,
  stability: 0.55,
  pressure: 0.5,
}

export function createBrushStroke(
  position: Vec2,
  sample: BrushSample,
  settings: BrushSettings,
  simulatePressure: boolean,
): BrushNode {
  return {
    id: nanoid(),
    name: 'Brush stroke',
    type: 'brush',
    visible: true,
    locked: false,
    pivotPreset: 'center',
    effects: [],
    samples: [sample],
    settings: structuredClone(settings),
    simulatePressure,
    complete: false,
    transform: {
      ...defaultTransform(),
      position,
    },
  }
}

export function brushOutline(node: BrushNode): Vec2[] {
  return getStroke(
    node.samples.map(({ x, y, pressure }) => [x, y, pressure]),
    {
      size: node.settings.size,
      thinning: node.settings.pressure,
      smoothing: node.settings.smoothing,
      streamline: node.settings.stability,
      simulatePressure: node.simulatePressure,
      last: node.complete,
      start: { cap: true },
      end: { cap: true },
    },
  ).map(([x, y]) => ({ x, y }))
}

const average = (a: number, b: number) => (a + b) / 2
const fixed = (value: number) => value.toFixed(2)

/**
 * Converts perfect-freehand's outline polygon to a smooth, closed SVG path,
 * following the getSvgPathFromStroke helper in the library's official README.
 */
export function outlinePathData(points: Vec2[]): string {
  if (points.length < 4) return ''

  const [start, second, third] = points
  let data = `M${fixed(start.x)},${fixed(start.y)} Q${fixed(second.x)},${fixed(
    second.y,
  )} ${fixed(average(second.x, third.x))},${fixed(
    average(second.y, third.y),
  )} T`

  for (let index = 2; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    data += `${fixed(average(point.x, next.x))},${fixed(
      average(point.y, next.y),
    )} `
  }

  return `${data}Z`
}

export const brushPathData = (node: BrushNode) =>
  outlinePathData(brushOutline(node))
