import { describe, expect, it } from 'vitest'
import {
  armProperty,
  defaultAnimation,
  duplicateKeys,
  evaluateChannels,
  evaluateNodeAtTime,
  evaluateScene,
  evaluateTransform,
  formatTimecode,
  pruneAnimation,
  remapAnimation,
  removeKeys,
  retimeKey,
  restValue,
  updateKeyframe,
  upsertKeyframe,
} from './animation'
import { mixHex } from './channels'
import { createShape } from './nodes'
import { createPath, createPathPoint } from './path'
import { defaultTransform, transformPoint } from './transform'
import type { EditorNode } from './types'

const rest = {
  ...defaultTransform(),
  position: { x: 10, y: 20 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  opacity: 1,
}

describe('evaluateTransform', () => {
  it('keeps the rest pose when a property is not armed', () => {
    const next = evaluateTransform(rest, defaultAnimation(), 'a', 1.5)
    expect(next).toEqual(rest)
  })

  it('holds the first and last keys outside the keyed range', () => {
    let animation = defaultAnimation()
    animation = upsertKeyframe(animation, 'a', 'position.x', 1, 100)
    animation = upsertKeyframe(animation, 'a', 'position.x', 2, 200)

    expect(evaluateTransform(rest, animation, 'a', 0).position.x).toBe(100)
    expect(evaluateTransform(rest, animation, 'a', 3).position.x).toBe(200)
  })

  it('interpolates linearly between keys', () => {
    let animation = defaultAnimation()
    animation = upsertKeyframe(animation, 'a', 'position.x', 0, 0, 'linear')
    animation = upsertKeyframe(animation, 'a', 'position.x', 2, 100, 'linear')

    expect(evaluateTransform(rest, animation, 'a', 1).position.x).toBe(50)
  })

  it('eases with power2.inOut between keys', () => {
    let animation = defaultAnimation()
    animation = upsertKeyframe(animation, 'a', 'opacity', 0, 0, 'power2.inOut')
    animation = upsertKeyframe(animation, 'a', 'opacity', 1, 1, 'power2.inOut')

    expect(evaluateTransform(rest, animation, 'a', 0.25).opacity).toBeCloseTo(0.125)
    expect(evaluateTransform(rest, animation, 'a', 0.75).opacity).toBeCloseTo(0.875)
  })
})

describe('armProperty', () => {
  it('seeds a rest key at t=0', () => {
    const animation = armProperty(defaultAnimation(), 'a', 'rotation', 15, 0)
    expect(animation.tracks[0].keys).toHaveLength(1)
    expect(animation.tracks[0].keys[0]).toMatchObject({ time: 0, value: 15 })
  })

  it('adds a second key when armed away from the start', () => {
    const animation = armProperty(defaultAnimation(), 'a', 'rotation', 15, 1.5)
    expect(animation.tracks[0].keys.map((key) => key.time)).toEqual([0, 1.5])
  })
})

describe('key edits', () => {
  it('updates a key that already sits on the playhead', () => {
    let animation = upsertKeyframe(defaultAnimation(), 'a', 'scale.x', 1, 1)
    animation = upsertKeyframe(animation, 'a', 'scale.x', 1, 2)
    expect(animation.tracks[0].keys).toHaveLength(1)
    expect(animation.tracks[0].keys[0].value).toBe(2)
  })

  it('drops a track when its last key is removed', () => {
    let animation = upsertKeyframe(defaultAnimation(), 'a', 'opacity', 0, 1)
    animation = removeKeys(animation, [animation.tracks[0].keys[0].id])
    expect(animation.tracks).toHaveLength(0)
  })

  it('retimes a key and merges collisions', () => {
    let animation = upsertKeyframe(defaultAnimation(), 'a', 'position.y', 0, 0)
    animation = upsertKeyframe(animation, 'a', 'position.y', 1, 50)
    const moving = animation.tracks[0].keys[1]
    animation = retimeKey(animation, moving.id, 0)
    expect(animation.tracks[0].keys).toHaveLength(1)
    expect(animation.tracks[0].keys[0].value).toBe(50)
  })

  it('updates a key value and easing', () => {
    let animation = upsertKeyframe(
      defaultAnimation(),
      'a',
      'opacity',
      1,
      0.5,
      'linear',
    )
    const key = animation.tracks[0].keys[0]

    animation = updateKeyframe(animation, key.id, {
      value: 0.75,
      easing: 'power2.inOut',
    })

    expect(animation.tracks[0].keys[0]).toMatchObject({
      value: 0.75,
      easing: 'power2.inOut',
    })
  })

  it('duplicates a key at the next free tenth of a second', () => {
    let animation = upsertKeyframe(defaultAnimation(), 'a', 'opacity', 1, 0.5)
    animation = upsertKeyframe(animation, 'a', 'opacity', 1.1, 0.6)
    const source = animation.tracks[0].keys[0]

    const duplicated = duplicateKeys(animation, [source.id])

    expect(duplicated.keyIds).toHaveLength(1)
    expect(duplicated.animation.tracks[0].keys).toHaveLength(3)
    expect(
      duplicated.animation.tracks[0].keys.find(
        (key) => key.id === duplicated.keyIds[0],
      ),
    ).toMatchObject({ time: 1.2, value: 0.5 })
  })
})

describe('prune and remap', () => {
  it('drops tracks for deleted nodes', () => {
    let animation = upsertKeyframe(defaultAnimation(), 'gone', 'opacity', 0, 1)
    animation = pruneAnimation(animation, [])
    expect(animation.tracks).toHaveLength(0)
  })

  it('copies tracks onto cloned ids', () => {
    let animation = upsertKeyframe(defaultAnimation(), 'old', 'opacity', 0, 0.5)
    const copies = remapAnimation(animation, new Map([['old', 'new']]))
    expect(copies[0].nodeId).toBe('new')
    expect(copies[0].keys[0].id).not.toBe(animation.tracks[0].keys[0].id)
    expect(copies[0].keys[0].value).toBe(0.5)
  })
})

describe('restValue', () => {
  it('reads every animatable channel', () => {
    const node = {
      transform: rest,
    } as EditorNode
    expect(restValue(node.transform, 'position.x')).toBe(10)
    expect(restValue(node.transform, 'position.y')).toBe(20)
  })
})

describe('formatTimecode', () => {
  it('carries hundredths into the seconds field', () => {
    expect(formatTimecode(0)).toBe('0:00.00')
    expect(formatTimecode(1.5)).toBe('0:01.50')
    expect(formatTimecode(1.999)).toBe('0:02.00')
    expect(formatTimecode(61.005)).toBe('1:01.01')
  })
})

describe('color interpolation', () => {
  it('mixes hex colors in RGB', () => {
    expect(mixHex('#000000', '#ffffff', 0.5).toLowerCase()).toBe('#808080')
  })

  it('evaluates fill keys onto the node', () => {
    const node = createShape('rect')
    node.id = 'swatch'
    if (node.type !== 'rect') throw new Error('expected rect')
    node.fill = '#000000'
    let animation = upsertKeyframe(defaultAnimation(), 'swatch', 'fill', 0, '#000000', 'linear')
    animation = upsertKeyframe(animation, 'swatch', 'fill', 1, '#ffffff', 'linear')
    const painted = evaluateNodeAtTime(node, animation, 0.5)
    if (painted.type !== 'rect') throw new Error('expected rect')
    expect(painted.fill.toLowerCase()).toBe('#808080')
  })
})

describe('path interpolation', () => {
  it('animates trim start, end, and offset channels', () => {
    const path = createPath({ x: 0, y: 0 })
    let animation = upsertKeyframe(
      defaultAnimation(),
      path.id,
      'path.trimEnd',
      0,
      0,
      'linear',
    )
    animation = upsertKeyframe(
      animation,
      path.id,
      'path.trimEnd',
      2,
      1,
      'linear',
    )
    animation = upsertKeyframe(
      animation,
      path.id,
      'path.trimStart',
      0,
      0.1,
    )
    animation = upsertKeyframe(
      animation,
      path.id,
      'path.trimOffset',
      0,
      0.25,
    )

    const painted = evaluateNodeAtTime(path, animation, 1)
    if (painted.type !== 'path') throw new Error('expected path')
    expect(painted.trimStart).toBe(0.1)
    expect(painted.trimEnd).toBe(0.5)
    expect(painted.trimOffset).toBe(0.25)
  })

  it('morphs anchors and handles between matching path keys', () => {
    const path = createPath(
      { x: 0, y: 0 },
      createPathPoint({ x: 0, y: 0 }, { x: 20, y: 10 }),
    )
    const start = path.points
    const end = start.map((point) => ({
      ...point,
      anchor: { x: 100, y: 50 },
      handleIn: { x: -40, y: 0 },
      handleOut: { x: 40, y: 0 },
    }))
    let animation = upsertKeyframe(
      defaultAnimation(),
      path.id,
      'path.points',
      0,
      start,
      'linear',
    )
    animation = upsertKeyframe(
      animation,
      path.id,
      'path.points',
      2,
      end,
      'linear',
    )

    const painted = evaluateNodeAtTime(path, animation, 1)
    if (painted.type !== 'path') throw new Error('expected path')
    expect(painted.points[0].anchor).toEqual({ x: 50, y: 25 })
    expect(painted.points[0].handleOut).toEqual({ x: 30, y: 5 })
  })
})

describe('motion path evaluation', () => {
  it('moves a node along a path while keeping its position as an offset', () => {
    const path = createPath({ x: 10, y: 20 }, createPathPoint({ x: 0, y: 0 }))
    path.id = 'route'
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    const follower = createShape('rect')
    follower.transform.position = { x: 5, y: 7 }
    follower.motionPath = { pathId: path.id, progress: 0.5, autoRotate: false }

    const evaluated = evaluateScene([path, follower], defaultAnimation(), 0)
    const moved = evaluated[1]

    expect(transformPoint(moved.transform, moved.transform.pivot)).toEqual({
      x: 65,
      y: 27,
    })
    expect(moved.transform.rotation).toBe(0)
  })

  it('leaves the path layer out of the channel pass', () => {
    const path = createPath({ x: 10, y: 20 }, createPathPoint({ x: 0, y: 0 }))
    path.id = 'route'
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    const follower = createShape('rect')
    follower.transform.position = { x: 5, y: 7 }
    follower.transform.rotation = 15
    follower.motionPath = { pathId: path.id, progress: 0.5, autoRotate: true }

    // Editing tools read this pose, so it has to match what they write back.
    const channels = evaluateChannels([path, follower], defaultAnimation(), 0)

    expect(channels[1].transform.position).toEqual({ x: 5, y: 7 })
    expect(channels[1].transform.rotation).toBe(15)
  })

  it('adds the transformed path tangent to the existing rotation', () => {
    const path = createPath({ x: 0, y: 0 }, createPathPoint({ x: 0, y: 0 }))
    path.id = 'route'
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    path.transform.rotation = 90
    const follower = createShape('rect')
    follower.transform.rotation = 15
    follower.motionPath = { pathId: path.id, progress: 0.5, autoRotate: true }

    const moved = evaluateScene([path, follower], defaultAnimation(), 0)[1]

    expect(moved.transform.rotation).toBeCloseTo(105)
  })

  it('interpolates progress and follows animated path geometry', () => {
    const path = createPath({ x: 0, y: 0 }, createPathPoint({ x: 0, y: 0 }))
    path.id = 'route'
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    const follower = createShape('rect')
    follower.id = 'follower'
    follower.transform.position = { x: 0, y: 0 }
    follower.motionPath = { pathId: path.id, progress: 0, autoRotate: false }
    let animation = upsertKeyframe(
      defaultAnimation(),
      follower.id,
      'motionPath.progress',
      0,
      0,
      'linear',
    )
    animation = upsertKeyframe(
      animation,
      follower.id,
      'motionPath.progress',
      2,
      1,
      'linear',
    )
    const end = path.points.map((point, index) => ({
      ...point,
      anchor: { ...point.anchor, y: index * 100 },
    }))
    animation = upsertKeyframe(animation, path.id, 'path.points', 0, path.points, 'linear')
    animation = upsertKeyframe(animation, path.id, 'path.points', 2, end, 'linear')

    const moved = evaluateScene([path, follower], animation, 1)[1]

    const pivot = transformPoint(moved.transform, moved.transform.pivot)
    expect(pivot.x).toBeCloseTo(50)
    expect(pivot.y).toBeCloseTo(25)
  })

  it('ignores missing and self-referencing target paths', () => {
    const follower = createShape('rect')
    follower.motionPath = {
      pathId: follower.id,
      progress: 0.5,
      autoRotate: true,
    }
    const unchanged = evaluateScene([follower], defaultAnimation(), 0)[0]
    expect(unchanged.transform).toEqual(follower.transform)

    follower.motionPath.pathId = 'missing'
    const missing = evaluateScene([follower], defaultAnimation(), 0)[0]
    expect(missing.transform).toEqual(follower.transform)
  })
})
