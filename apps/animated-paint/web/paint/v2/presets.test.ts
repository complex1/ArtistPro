import { describe, expect, it } from 'vitest'
import { runAnimationSync } from './animation/evaluate'
import { emptyPoint } from './core/defaults'
import { getBuiltinBrush } from './presets'

const points = Array.from({ length: 24 }, (_, index) =>
  emptyPoint(index * 4, 80, index * 0.016),
)

function boilFrame(time: number) {
  const brush = getBuiltinBrush('boil')
  return runAnimationSync({
    source: brush.animationJs,
    points,
    config: brush,
    time,
    seed: 7,
  })
}

// Four named stamps make the texture a stroke picked readable as a stampIndex.
function textureFrame(seed: number, time: number) {
  const brush = getBuiltinBrush('textureBoil')
  return runAnimationSync({
    source: brush.animationJs,
    points,
    config: { ...brush, stamps: ['dot', 'star', 'heart', 'dot'] },
    time,
    seed,
  })
}

describe('textured boil brush', () => {
  it('grains the mark out of stamps around the path', () => {
    const frame = textureFrame(3, 0)
    expect(frame.diagnostics).toEqual([])
    expect(frame.items.every((item) => item.kind === 'stamp')).toBe(true)
    // One body grain per point, plus edge grain that can drop out.
    expect(frame.items.length).toBeGreaterThan(points.length)
  })

  it('uses one texture for a whole stroke and keeps it while boiling', () => {
    const early = textureFrame(3, 0)
    const later = textureFrame(3, 2)
    const chosen = new Set(early.items.map((item) => item.stampIndex))
    expect(chosen.size).toBe(1)
    expect(new Set(later.items.map((item) => item.stampIndex))).toEqual(chosen)
    expect(later.items).not.toEqual(early.items)
  })

  it('spreads textures across strokes', () => {
    const picked = new Set(
      Array.from({ length: 40 }, (_, index) =>
        textureFrame(index + 1, 0).items[0]?.stampIndex,
      ),
    )
    expect(picked.size).toBe(4)
  })
})

describe('line boil brush', () => {
  it('draws the whole stroke as a polyline', () => {
    const frame = boilFrame(0)
    expect(frame.diagnostics).toEqual([])
    expect(frame.items).toHaveLength(points.length)
    expect(frame.items.every((item) => item.kind === 'segment')).toBe(true)
  })

  it('holds still inside one boil frame and jumps on the next', () => {
    const early = boilFrame(0.01)
    const late = boilFrame(0.07)
    const next = boilFrame(0.1)
    expect(late.items).toEqual(early.items)
    expect(next.items).not.toEqual(early.items)
  })

  it('wobbles off the path without running away from it', () => {
    const frame = boilFrame(0.5)
    const brush = getBuiltinBrush('boil')
    const offsets = frame.items.map((item, index) =>
      Math.hypot(item.x - points[index].x, item.y - points[index].y),
    )
    expect(Math.max(...offsets)).toBeGreaterThan(0.2)
    expect(Math.max(...offsets)).toBeLessThan(brush.size)
  })
})
