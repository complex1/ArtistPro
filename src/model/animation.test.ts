import { describe, expect, it } from 'vitest'
import {
  armProperty,
  defaultAnimation,
  evaluateNodeAtTime,
  evaluateTransform,
  formatTimecode,
  pruneAnimation,
  remapAnimation,
  removeKeys,
  retimeKey,
  restValue,
  upsertKeyframe,
} from './animation'
import { mixHex } from './channels'
import { createShape } from './nodes'
import { defaultTransform } from './transform'
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
