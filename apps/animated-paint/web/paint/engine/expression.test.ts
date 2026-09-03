import { describe, expect, it } from 'vitest'
import {
  evaluateMathExpression,
  validateMathExpression,
} from './expression'
import type { BrushContext } from './types'

const context: BrushContext = {
  x: 20,
  y: 30,
  index: 4,
  progress: 0.5,
  time: 1,
  speed: 2,
  amount: 10,
  pressure: 0.75,
  seed: 3,
}

describe('math brush expressions', () => {
  it('evaluates wave expressions with the controlled context', () => {
    expect(
      evaluateMathExpression(
        'sin(time * speed + index * 0.2) * amount',
        context,
      ),
    ).toBeCloseTo(Math.sin(2.8) * 10)
  })

  it('supports numeric constants and whitelisted functions', () => {
    expect(evaluateMathExpression('max(1, cos(PI) + 3)', context)).toBe(2)
  })

  it.each([
    ['window.location', 'Expression type "MemberExpression" is not allowed'],
    ['document.cookie', 'Expression type "MemberExpression" is not allowed'],
    ['fetch(1)', 'Unknown function "fetch"'],
    ['sin()', 'Function "sin" expects 1 argument'],
    ['pow(2)', 'Function "pow" expects 2 arguments'],
    ['constructor(1)', 'Unknown function "constructor"'],
    ['toString()', 'Unknown function "toString"'],
    ['unknown + 1', 'Unknown variable "unknown"'],
    ['1 / 0', 'Expression must return a finite number'],
  ])('rejects unsafe or invalid expression %s', (source, message) => {
    expect(() => evaluateMathExpression(source, context)).toThrow(message)
  })

  it('allows empty optional fields during validation', () => {
    expect(validateMathExpression('')).toBeNull()
    expect(validateMathExpression('sin(time)')).toBeNull()
    expect(validateMathExpression('1 / progress')).toBeNull()
    expect(validateMathExpression('Math.sin(time)')).toBe(
      'Member access is not allowed',
    )
  })

  it('limits expression source and AST complexity', () => {
    expect(validateMathExpression('1 + '.repeat(100) + '1')).toBe(
      'Expression is too long',
    )
    expect(validateMathExpression('sin('.repeat(14) + 'time' + ')'.repeat(14))).toBe(
      'Expression is nested too deeply',
    )
  })
})
