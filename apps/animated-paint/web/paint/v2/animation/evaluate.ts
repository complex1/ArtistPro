import { mulberry32 } from '../core/rng'
import { parseDrawList } from '../core/schema'
import type { BrushV2, DrawItem, EngineDiagnostic, StrokePointV2 } from '../core/types'
import { DEFAULT_BUDGETS } from '../core/types'

export type AnimationRequest = {
  source: string
  points: StrokePointV2[]
  config: BrushV2
  time: number
  /** Seconds since the stroke started, already scaled by brush speed. */
  age?: number
  seed: number
  budgetMs?: number
}

export type AnimationResult = {
  items: DrawItem[]
  durationMs: number
  diagnostics: EngineDiagnostic[]
}

type AnimateFn = (
  points: StrokePointV2[],
  config: BrushV2,
  time: number,
  seed: number,
  rng: () => number,
  math: Math,
  age: number,
) => unknown

// Editing creates new source strings, so keep this bounded rather than retaining
// every keystroke. The wrapper still creates fresh script-local state per frame.
const compiled = new Map<string, AnimateFn>()
const MAX_COMPILED_ANIMATIONS = 128

export function compileAnimation(source: string): AnimateFn {
  const cached = compiled.get(source)
  if (cached) return cached
  const wrapped = `"use strict";
    const window = undefined;
    const document = undefined;
    const fetch = undefined;
    const Worker = undefined;
    const importScripts = undefined;
    const localStorage = undefined;
    const sessionStorage = undefined;
    const indexedDB = undefined;
    const XMLHttpRequest = undefined;
    const Function = undefined;
    ${source}
    if (typeof animate !== "function") {
      throw new Error("animation must declare function animate(points, config, time)");
    }
    return animate(points, config, time, age);
  `
  const fn = new Function(
    'points',
    'config',
    'time',
    'seed',
    'rng',
    'Math',
    'age',
    wrapped,
  ) as AnimateFn
  if (compiled.size >= MAX_COMPILED_ANIMATIONS) {
    compiled.delete(compiled.keys().next().value!)
  }
  compiled.set(source, fn)
  return fn
}

export function runAnimationSync(request: AnimationRequest): AnimationResult {
  const diagnostics: EngineDiagnostic[] = []
  const started = performance.now()
  const budget = request.budgetMs ?? DEFAULT_BUDGETS.animationBudgetMs
  try {
    const fn = compileAnimation(request.source)
    const raw = fn(
      request.points,
      request.config,
      request.time,
      request.seed,
      mulberry32(request.seed >>> 0),
      Math,
      request.age ?? request.time,
    )
    const durationMs = performance.now() - started
    if (durationMs > budget) {
      diagnostics.push({
        code: 'budget',
        message: `Animation exceeded ${budget}ms (${durationMs.toFixed(1)}ms)`,
      })
    }
    return {
      items: parseDrawList(raw),
      durationMs,
      diagnostics,
    }
  } catch (error) {
    diagnostics.push({
      code: 'animate-error',
      message: error instanceof Error ? error.message : 'Animation failed',
    })
    return {
      items: [],
      durationMs: performance.now() - started,
      diagnostics,
    }
  }
}
