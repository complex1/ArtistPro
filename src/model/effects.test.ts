import { describe, expect, it } from 'vitest'
import { createEffect, filterPrimitives } from './effects'

describe('effects', () => {
  it('creates safe defaults for each starter effect', () => {
    expect(createEffect('blur')).toMatchObject({
      type: 'blur',
      enabled: true,
      radius: 6,
    })
    expect(createEffect('drop-shadow')).toMatchObject({
      type: 'drop-shadow',
      offset: { x: 6, y: 8 },
      radius: 6,
    })
    expect(createEffect('glow')).toMatchObject({
      type: 'glow',
      radius: 8,
      color: '#4F8CFF',
    })
  })

  it('keeps enabled primitives in stack order', () => {
    const shadow = createEffect('drop-shadow')
    const blur = createEffect('blur')
    const glow = { ...createEffect('glow'), enabled: false }

    expect(filterPrimitives([shadow, glow, blur]).map(({ tag }) => tag)).toEqual([
      'feDropShadow',
      'feGaussianBlur',
    ])
  })

  it('renders glow as a centered colored shadow', () => {
    const glow = createEffect('glow')
    const [primitive] = filterPrimitives([glow])

    expect(primitive).toMatchObject({
      tag: 'feDropShadow',
      attributes: {
        dx: 0,
        dy: 0,
        'flood-color': '#4F8CFF',
        'flood-opacity': 0.7,
      },
    })
  })
})
