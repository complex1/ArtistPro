import { describe, expect, it } from 'vitest'
import { defaultAnimation, upsertKeyframe } from './animation'
import {
  applyPreset,
  buildPresetTracks,
  DEFAULT_PRESET_CONFIG,
  presetAffectedProperties,
  presetConflicts,
  type AnimationPresetConfig,
} from './animationPresets'
import { createShape } from './nodes'

const config = (
  update: Partial<AnimationPresetConfig> = {},
): AnimationPresetConfig => ({ ...DEFAULT_PRESET_CONFIG, ...update })

describe('animation presets', () => {
  it('builds fade, scale, and spin entrances relative to the rest pose', () => {
    const node = createShape('rect')
    node.transform.opacity = 0.8
    node.transform.scale = { x: 2, y: 3 }
    node.transform.rotation = 30

    const fade = buildPresetTracks(node, 'fade-in', config(), 0)
    expect(fade[0]).toMatchObject({
      property: 'opacity',
      keys: [{ time: 0, value: 0 }, { time: 1, value: 0.8 }],
    })

    const scale = buildPresetTracks(
      node,
      'scale-in',
      config({ startScale: 0.25 }),
      0.5,
    )
    expect(scale.map((track) => track.keys.map((key) => key.value))).toEqual([
      [2, 0.5, 2],
      [3, 0.75, 3],
    ])

    const spin = buildPresetTracks(
      node,
      'spin',
      config({ turns: 2, spinDirection: 'clockwise' }),
      0,
    )
    expect(spin[0].keys.map((key) => key.value)).toEqual([-690, 30])
  })

  it('uses only the position axis selected by slide direction', () => {
    const node = createShape('rect')
    node.transform.position = { x: 200, y: 100 }

    const left = buildPresetTracks(
      node,
      'slide-in',
      config({ slideDirection: 'left', distance: 60 }),
      1,
    )
    expect(left[0]).toMatchObject({
      property: 'position.x',
      keys: [
        { time: 0.999, value: 200 },
        { time: 1, value: 140 },
        { time: 2, value: 200 },
      ],
    })
    expect(
      presetAffectedProperties('slide-in', config({ slideDirection: 'down' })),
    ).toEqual(['position.y'])
  })

  it('builds the requested number of bounce and pulse cycles', () => {
    const node = createShape('rect')
    node.transform.position.y = 200
    const bounce = buildPresetTracks(
      node,
      'bounce',
      config({ bounceCount: 3, bounceHeight: 90 }),
      0,
    )
    expect(bounce[0].keys).toHaveLength(7)
    expect(bounce[0].keys[1].value).toBe(110)
    expect(bounce[0].keys.at(-1)?.value).toBe(200)

    const pulse = buildPresetTracks(
      node,
      'pulse',
      config({ pulseCount: 2, pulseScale: 1.25 }),
      0,
    )
    expect(pulse).toHaveLength(2)
    expect(pulse[0].keys).toHaveLength(5)
    expect(pulse[0].keys.map((key) => key.value)).toEqual([
      1, 1.25, 1, 1.25, 1,
    ])
  })

  it('reports conflicts and replaces only affected property tracks', () => {
    const node = createShape('rect')
    let animation = upsertKeyframe(
      defaultAnimation(),
      node.id,
      'position.x',
      0,
      10,
    )
    animation = upsertKeyframe(animation, node.id, 'opacity', 0, 0.5)

    expect(
      presetConflicts(animation, node.id, 'slide-in', config()),
    ).toEqual(['position.x'])

    const applied = applyPreset(animation, node, 'slide-in', config(), 2.5)
    expect(applied.duration).toBe(3.5)
    expect(
      applied.tracks.find((track) => track.property === 'opacity'),
    ).toBeDefined()
    expect(
      applied.tracks.find((track) => track.property === 'position.x')?.keys,
    ).toMatchObject([{ time: 2.499 }, { time: 2.5 }, { time: 3.5 }])
  })
})
