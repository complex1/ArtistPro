import { describe, expect, it } from 'vitest'
import {
  GRID_PRIMITIVE_LIMIT,
  generateGridPrimitives,
  gridColorGroups,
  gridPathData,
  guideFamilyColor,
  guideFamilyCount,
  snapPointToGrid,
  snapPointToPrimitives,
  withGuideColor,
} from './grid'
import type { GridSettings } from './types'

const base = {
  enabled: true,
  locked: false,
  color: '#4f8cff',
  opacity: 0.35,
  snap: true,
  snapThreshold: 8,
}

const regular: GridSettings = {
  ...base,
  type: 'grid',
  spacing: 100,
  origin: { x: 0, y: 0 },
}

const inside = (value: number, max: number) => value >= -1e-6 && value <= max + 1e-6

describe('generateGridPrimitives', () => {
  it('emits axis-aligned lines clipped to the artboard', () => {
    const primitives = generateGridPrimitives(regular, 400, 200)

    expect(primitives.length).toBeGreaterThan(0)
    for (const primitive of primitives) {
      expect(primitive.kind).toBe('line')
      if (primitive.kind !== 'line') continue
      for (const point of [primitive.a, primitive.b]) {
        expect(inside(point.x, 400)).toBe(true)
        expect(inside(point.y, 200)).toBe(true)
      }
    }
  })

  it('coarsens spacing instead of emitting unbounded lines', () => {
    const dense = generateGridPrimitives(
      { ...regular, spacing: 0.001 },
      4000,
      4000,
    )
    expect(dense.length).toBeLessThanOrEqual(GRID_PRIMITIVE_LIMIT)
  })

  it('draws one family per orthographic axis', () => {
    const primitives = generateGridPrimitives(
      {
        ...base,
        type: 'orthographic',
        spacing: 60,
        origin: { x: 200, y: 100 },
        angles: [0, 60, 120],
      },
      400,
      200,
    )
    expect(primitives.filter((item) => item.role === 'axis')).toHaveLength(3)
  })

  it('converges perspective rays on each vanishing point', () => {
    for (const [type, count] of [
      ['perspective-1', 1],
      ['perspective-2', 2],
      ['perspective-3', 3],
    ] as const) {
      const vanishingPoints = [
        { x: 200, y: 90 },
        { x: -160, y: 90 },
        { x: 200, y: 400 },
      ].slice(0, count)
      const settings: GridSettings =
        type === 'perspective-1'
          ? {
              ...base,
              type,
              density: 8,
              horizonAngle: 0,
              vanishingPoints,
            }
          : { ...base, type, density: 8, vanishingPoints }
      const primitives = generateGridPrimitives(
        settings,
        400,
        200,
      )
      expect(primitives.filter((item) => item.role === 'horizon')).toHaveLength(1)
      expect(primitives.filter((item) => item.role === 'ray').length).toBeGreaterThan(
        count,
      )
    }
  })

  it('falls back to sensible vanishing points when none are supplied', () => {
    const primitives = generateGridPrimitives(
      {
        ...base,
        type: 'perspective-2',
        density: 8,
        vanishingPoints: [],
      },
      400,
      200,
    )
    expect(primitives.filter((item) => item.role === 'ray').length).toBeGreaterThan(0)
  })

  it('samples fisheye guides as curves', () => {
    const primitives = generateGridPrimitives(
      {
        ...base,
        type: 'fisheye',
        spacing: 40,
        center: { x: 200, y: 100 },
        radius: 90,
      },
      400,
      200,
    )
    expect(primitives.some((item) => item.kind === 'polyline')).toBe(true)
    expect(primitives.length).toBeLessThanOrEqual(GRID_PRIMITIVE_LIMIT)
  })

  it('returns nothing for a degenerate artboard', () => {
    expect(generateGridPrimitives(regular, 0, 200)).toEqual([])
  })
})

describe('snapPointToGrid', () => {
  it('pulls a near-miss onto the grid crossing', () => {
    const snapped = snapPointToGrid({ x: 203, y: 98 }, regular, 400, 200, 8)

    expect(snapped).not.toBeNull()
    expect(snapped!.point.x).toBeCloseTo(200, 6)
    expect(snapped!.point.y).toBeCloseTo(100, 6)
  })

  it('projects onto a single guide when only one is in range', () => {
    const snapped = snapPointToGrid({ x: 197, y: 150 }, regular, 400, 200, 8)

    expect(snapped!.point.x).toBeCloseTo(200, 6)
    expect(snapped!.point.y).toBeCloseTo(150, 6)
  })

  it('ignores points beyond the threshold', () => {
    expect(snapPointToGrid({ x: 150, y: 150 }, regular, 400, 200, 8)).toBeNull()
  })

  it('always lands on a real guide within the threshold', () => {
    const modes: GridSettings[] = [
      regular,
      { ...base, type: 'orthographic', spacing: 60, origin: { x: 200, y: 100 }, angles: [0, 60, 120] },
      { ...base, type: 'perspective-2', density: 10, vanishingPoints: [{ x: -160, y: 90 }, { x: 560, y: 90 }] },
      { ...base, type: 'fisheye', spacing: 40, center: { x: 200, y: 100 }, radius: 90 },
    ]

    for (const mode of modes) {
      const primitives = generateGridPrimitives(mode, 400, 200)
      for (const probe of [
        { x: 123, y: 77 },
        { x: 201, y: 101 },
        { x: 318, y: 164 },
      ]) {
        const snapped = snapPointToPrimitives(probe, primitives, 12)
        if (!snapped) continue
        expect(Math.hypot(snapped.point.x - probe.x, snapped.point.y - probe.y)).toBeLessThanOrEqual(
          12 + 1e-6,
        )
        expect(snapped.guide).toBeDefined()
      }
    }
  })

  it('snaps onto sampled fisheye curves', () => {
    const fisheye: GridSettings = {
      ...base,
      type: 'fisheye',
      spacing: 40,
      center: { x: 200, y: 100 },
      radius: 90,
    }
    const snapped = snapPointToGrid({ x: 202, y: 100 }, fisheye, 400, 200, 10)

    expect(snapped).not.toBeNull()
    expect(snapped!.guide).toBeDefined()
  })
})

describe('perspective horizons', () => {
  it('rotates a one-point horizon around its vanishing point', () => {
    const primitives = generateGridPrimitives(
      {
        ...base,
        type: 'perspective-1',
        density: 10,
        horizonAngle: 30,
        vanishingPoints: [{ x: 200, y: 100 }],
      },
      400,
      200,
    )
    const horizon = primitives.find((item) => item.role === 'horizon')

    expect(horizon?.kind).toBe('line')
    if (horizon?.kind !== 'line') return
    expect(
      (horizon.b.y - horizon.a.y) / (horizon.b.x - horizon.a.x),
    ).toBeCloseTo(Math.tan(Math.PI / 6), 6)
  })

  it('joins the first two vanishing points in two-point perspective', () => {
    const primitives = generateGridPrimitives(
      {
        ...base,
        type: 'perspective-2',
        density: 10,
        vanishingPoints: [
          { x: -100, y: 40 },
          { x: 500, y: 160 },
        ],
      },
      400,
      200,
    )
    const horizon = primitives.find((item) => item.role === 'horizon')

    expect(horizon?.kind).toBe('line')
    if (horizon?.kind !== 'line') return
    expect(
      (horizon.b.y - horizon.a.y) / (horizon.b.x - horizon.a.x),
    ).toBeCloseTo(0.2, 6)
  })

  it('ignores the third point when deriving a three-point horizon', () => {
    const settings: GridSettings = {
      ...base,
      type: 'perspective-3',
      density: 10,
      vanishingPoints: [
        { x: -100, y: 40 },
        { x: 500, y: 160 },
        { x: 200, y: 500 },
      ],
    }
    const first = generateGridPrimitives(settings, 400, 200).find(
      (item) => item.role === 'horizon',
    )
    settings.vanishingPoints[2] = { x: 20, y: -500 }
    const second = generateGridPrimitives(settings, 400, 200).find(
      (item) => item.role === 'horizon',
    )

    expect(second).toEqual(first)
  })
})

describe('gridPathData', () => {
  it('flattens lines and curves into one path string', () => {
    const data = gridPathData([
      { kind: 'line', role: 'grid', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      {
        kind: 'polyline',
        role: 'arc',
        points: [
          { x: 0, y: 5 },
          { x: 5, y: 6 },
          { x: 10, y: 5 },
        ],
      },
    ])

    expect(data).toBe('M0.00 0.00 L10.00 0.00 M0.00 5.00 L5.00 6.00 L10.00 5.00')
  })

  it('skips primitives that cannot be drawn', () => {
    expect(gridPathData([{ kind: 'polyline', role: 'arc', points: [] }])).toBe('')
  })
})

describe('directional colors', () => {
  const orthographic: GridSettings = {
    ...base,
    type: 'orthographic',
    spacing: 60,
    origin: { x: 200, y: 100 },
    angles: [0, 60, 120],
    guideColors: ['#ff0000', '#00ff00', '#0000ff'],
  }

  const twoPoint: GridSettings = {
    ...base,
    type: 'perspective-2',
    density: 8,
    vanishingPoints: [
      { x: -200, y: 90 },
      { x: 600, y: 90 },
    ],
    guideColors: ['#ff0000', '#00ff00'],
  }

  it('tags every orthographic line with the axis it came from', () => {
    const families = new Set(
      generateGridPrimitives(orthographic, 400, 200).map((item) => item.family),
    )

    expect(families).toEqual(new Set([0, 1, 2]))
  })

  it('tags perspective rays with their vanishing point', () => {
    const primitives = generateGridPrimitives(twoPoint, 400, 200)

    expect(new Set(primitives.filter((item) => item.role === 'ray').map((item) => item.family))).toEqual(
      new Set([0, 1]),
    )
    expect(primitives.find((item) => item.role === 'horizon')?.family).toBeUndefined()
  })

  it('gives each direction its own path and leaves the horizon on the grid color', () => {
    const groups = gridColorGroups(
      generateGridPrimitives(twoPoint, 400, 200),
      twoPoint,
    )

    expect(groups.map((group) => group.color).sort()).toEqual([
      '#00ff00',
      '#4f8cff',
      '#ff0000',
    ])
    for (const group of groups) expect(group.data).not.toBe('')
  })

  it('falls back to the grid color for directions without one', () => {
    const partial: GridSettings = { ...orthographic, guideColors: ['#ff0000'] }
    const groups = gridColorGroups(generateGridPrimitives(partial, 400, 200), partial)

    expect(groups.map((group) => group.color).sort()).toEqual(['#4f8cff', '#ff0000'])
  })

  it('keeps the other directions when one is recolored', () => {
    const next = withGuideColor(orthographic, 1, '#ffffff')

    expect(guideFamilyColor(next, 0)).toBe('#ff0000')
    expect(guideFamilyColor(next, 1)).toBe('#ffffff')
    expect(guideFamilyColor(next, 2)).toBe('#0000ff')
  })

  it('pins previously implicit colors when a fallback direction is recolored', () => {
    const plain: GridSettings = { ...orthographic, guideColors: undefined }
    const next = withGuideColor(plain, 0, '#ffffff')

    expect(guideFamilyColor(next, 1)).toBe(base.color)
    expect(guideFamilyCount(next)).toBe(3)
  })

  it('leaves grids without directions untouched', () => {
    expect(guideFamilyCount(regular)).toBe(0)
    expect(withGuideColor(regular, 0, '#ffffff')).toBe(regular)
  })
})
