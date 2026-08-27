import jsep, { type Expression } from 'jsep'
import type { BrushContext, BrushExpressions } from './types'

const MAX_SOURCE_LENGTH = 240
const MAX_AST_DEPTH = 12
const MAX_AST_NODES = 80
const MAX_CALL_ARGUMENTS = 4

export const BRUSH_EXPRESSION_KEYS = [
  'x',
  'y',
  'size',
  'rotation',
  'opacity',
  'hue',
  'saturation',
  'lightness',
  'blur',
  'glow',
  'shadowX',
  'shadowY',
  'shadowBlur',
  'shadowOpacity',
] as const satisfies ReadonlyArray<keyof BrushExpressions>

const VARIABLES = new Set<keyof BrushContext>([
  'x',
  'y',
  'index',
  'progress',
  'time',
  'speed',
  'amount',
  'pressure',
  'seed',
])

const CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
}

const FUNCTIONS: Record<string, (...values: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  sqrt: Math.sqrt,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
}

const FUNCTION_ARITY: Record<string, readonly [minimum: number, maximum: number]> = {
  sin: [1, 1],
  cos: [1, 1],
  tan: [1, 1],
  abs: [1, 1],
  sqrt: [1, 1],
  floor: [1, 1],
  ceil: [1, 1],
  round: [1, 1],
  min: [1, MAX_CALL_ARGUMENTS],
  max: [1, MAX_CALL_ARGUMENTS],
  pow: [2, 2],
}

const parsedExpressions = new Map<string, Expression>()

function assertAllowed(
  node: Expression,
  state = { depth: 0, nodes: 0 },
): void {
  state.nodes += 1
  if (state.nodes > MAX_AST_NODES) throw new Error('Expression is too complex')
  if (state.depth > MAX_AST_DEPTH) throw new Error('Expression is nested too deeply')
  const childState = { ...state, depth: state.depth + 1 }

  switch (node.type) {
    case 'Literal':
      if (typeof (node as jsep.Literal).value !== 'number') {
        throw new Error('Only numeric values are allowed')
      }
      return
    case 'Identifier': {
      const name = (node as jsep.Identifier).name
      if (
        !VARIABLES.has(name as keyof BrushContext) &&
        !Object.hasOwn(CONSTANTS, name)
      ) {
        throw new Error(`Unknown variable "${name}"`)
      }
      return
    }
    case 'UnaryExpression': {
      const expression = node as jsep.UnaryExpression
      if (!['+', '-'].includes(expression.operator)) {
        throw new Error(`Operator "${expression.operator}" is not allowed`)
      }
      assertAllowed(expression.argument, childState)
      state.nodes = childState.nodes
      return
    }
    case 'BinaryExpression': {
      const expression = node as jsep.BinaryExpression
      if (!['+', '-', '*', '/', '%', '**'].includes(expression.operator)) {
        throw new Error(`Operator "${expression.operator}" is not allowed`)
      }
      assertAllowed(expression.left, childState)
      assertAllowed(expression.right, childState)
      state.nodes = childState.nodes
      return
    }
    case 'CallExpression': {
      const expression = node as jsep.CallExpression
      if (expression.callee.type !== 'Identifier') {
        throw new Error('Member access is not allowed')
      }
      const name = (expression.callee as jsep.Identifier).name
      if (!Object.hasOwn(FUNCTIONS, name)) {
        throw new Error(`Unknown function "${name}"`)
      }
      const [minimum, maximum] = FUNCTION_ARITY[name]
      if (
        expression.arguments.length < minimum ||
        expression.arguments.length > maximum
      ) {
        throw new Error(
          `Function "${name}" expects ${minimum === maximum ? minimum : `${minimum}–${maximum}`} argument${maximum === 1 ? '' : 's'}`,
        )
      }
      expression.arguments.forEach((argument) =>
        assertAllowed(argument, childState),
      )
      state.nodes = childState.nodes
      return
    }
    default:
      throw new Error(`Expression type "${node.type}" is not allowed`)
  }
}

function parse(source: string): Expression {
  if (source.length > MAX_SOURCE_LENGTH) throw new Error('Expression is too long')
  const cached = parsedExpressions.get(source)
  if (cached) return cached
  const expression = jsep(source)
  assertAllowed(expression)
  if (parsedExpressions.size >= 200) parsedExpressions.clear()
  parsedExpressions.set(source, expression)
  return expression
}

function evaluateNode(node: Expression, context: BrushContext): number {
  switch (node.type) {
    case 'Literal': {
      const value = (node as jsep.Literal).value
      if (typeof value !== 'number') throw new Error('Only numeric values are allowed')
      return value
    }
    case 'Identifier': {
      const name = (node as jsep.Identifier).name
      if (VARIABLES.has(name as keyof BrushContext)) {
        return context[name as keyof BrushContext]
      }
      if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name]
      throw new Error(`Unknown variable "${name}"`)
    }
    case 'UnaryExpression': {
      const expression = node as jsep.UnaryExpression
      const value = evaluateNode(expression.argument, context)
      if (expression.operator === '+') return value
      if (expression.operator === '-') return -value
      throw new Error(`Operator "${expression.operator}" is not allowed`)
    }
    case 'BinaryExpression': {
      const expression = node as jsep.BinaryExpression
      const left = evaluateNode(expression.left, context)
      const right = evaluateNode(expression.right, context)
      switch (expression.operator) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
        case '%':
          return left % right
        case '**':
          return left ** right
        default:
          throw new Error(`Operator "${expression.operator}" is not allowed`)
      }
    }
    case 'CallExpression': {
      const expression = node as jsep.CallExpression
      if (expression.callee.type !== 'Identifier') {
        throw new Error('Member access is not allowed')
      }
      const name = (expression.callee as jsep.Identifier).name
      const fn = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined
      if (!fn) throw new Error(`Unknown function "${name}"`)
      return fn(...expression.arguments.map((item) => evaluateNode(item, context)))
    }
    default:
      throw new Error(`Expression type "${node.type}" is not allowed`)
  }
}

export function evaluateMathExpression(
  source: string,
  context: BrushContext,
): number {
  const value = evaluateNode(parse(source), context)
  if (!Number.isFinite(value)) {
    throw new Error('Expression must return a finite number')
  }
  return value
}

export function validateMathExpression(source: string): string | null {
  if (!source.trim()) return null
  try {
    parse(source)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid expression'
  }
}

export function sanitizeBrushExpressions(
  expressions: BrushExpressions | undefined,
): BrushExpressions | undefined {
  if (!expressions) return undefined
  const sanitized: BrushExpressions = {}
  for (const key of BRUSH_EXPRESSION_KEYS) {
    const source = expressions[key]?.trim()
    if (source && !validateMathExpression(source)) sanitized[key] = source
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}
