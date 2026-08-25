import { nanoid } from 'nanoid'
import { defaultTransform } from './transform'
import type { TextNode, Vec2 } from './types'

const FALLBACK_CHARACTER_WIDTH = 0.58

export function naturalTextWidth(
  text: string,
  style: Pick<
    TextNode,
    'fontFamily' | 'fontSize' | 'fontWeight' | 'letterSpacing'
  >,
): number {
  let measured = text.length * style.fontSize * FALLBACK_CHARACTER_WIDTH

  if (typeof document !== 'undefined') {
    const context = document.createElement('canvas').getContext('2d')
    if (context) {
      context.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`
      measured = context.measureText(text).width
    }
  }

  return Math.max(
    1,
    measured + Math.max(0, text.length - 1) * style.letterSpacing,
  )
}

export function createText(
  position: Vec2,
  text = 'Text',
): TextNode {
  const typography = {
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 400,
    letterSpacing: 0,
  }
  const width = naturalTextWidth(text, typography)

  return {
    id: nanoid(),
    name: 'Text',
    visible: true,
    locked: false,
    pivotPreset: 'center',
    effects: [],
    type: 'text',
    text,
    width,
    ...typography,
    textAlign: 'left',
    fill: '#1f2937',
    stroke: '#000000',
    strokeWidth: 0,
    transform: {
      ...defaultTransform(),
      position,
      pivot: { x: width / 2, y: typography.fontSize / 2 },
    },
  }
}
