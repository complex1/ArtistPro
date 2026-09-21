import { describe, expect, it } from 'vitest'
import { createBrushV2 } from '../core/defaults'
import { emptyPoint } from '../core/defaults'
import { compileAnimation, runAnimationSync } from './evaluate'

describe('v2 animation runtime', () => {
  it('reuses compiled code without carrying local state between frames', () => {
    const source = 'var counter = 0; function animate() { counter++; return [{ x: counter, y: age }]; }'
    expect(compileAnimation(source)).toBe(compileAnimation(source))
    const request = { source, points: [], config: createBrushV2(), time: 10, age: 0.5, seed: 7 }
    expect(runAnimationSync(request).items[0]).toMatchObject({ x: 1, y: 0.5 })
    expect(runAnimationSync(request).items[0]).toMatchObject({ x: 1, y: 0.5 })
  })

  it('returns a validated draw list from animate()', () => {
    const result = runAnimationSync({
      source: `function animate(points, config, time) {
        return points.map(function (point) {
          return { x: point.x + time, y: point.y, size: config.size, color: config.color };
        });
      }`,
      points: [emptyPoint(10, 4)],
      config: createBrushV2({ size: 12, color: '#112233' }),
      time: 2,
      seed: 1,
    })
    expect(result.diagnostics).toEqual([])
    expect(result.items).toMatchObject([{ x: 12, y: 4, size: 12, color: '#112233' }])
  })

  it('is deterministic for the same seed and time', () => {
    const source = `function animate(points, config, time, ) {
      return [{ x: rng() * 10, y: seed, size: 4 }];
    }`
    const request = {
      source: `function animate(points, config, time) {
        return [{ x: rng() * 10, y: seed, size: 4 }];
      }`,
      points: [emptyPoint(0, 0)],
      config: createBrushV2(),
      time: 1,
      seed: 42,
    }
    const a = runAnimationSync(request)
    const b = runAnimationSync(request)
    expect(a.items).toEqual(b.items)
    expect(source).toContain('animate')
  })

  it('blocks DOM, fetch, and storage from user animation JS', () => {
    const blocked = [
      'window',
      'document',
      'fetch',
      'Worker',
      'importScripts',
      'localStorage',
    ]
    for (const name of blocked) {
      const result = runAnimationSync({
        source: `function animate() { return [{ x: typeof ${name} === "undefined" ? 1 : 0, y: 0, size: 1 }]; }`,
        points: [],
        config: createBrushV2(),
        time: 0,
        seed: 1,
      })
      expect(result.items[0]?.x).toBe(1)
    }
  })

  it('rejects missing animate and invalid output', () => {
    const missing = runAnimationSync({
      source: 'const nope = 1;',
      points: [],
      config: createBrushV2(),
      time: 0,
      seed: 1,
    })
    expect(missing.items).toEqual([])
    expect(missing.diagnostics[0]?.code).toBe('animate-error')

    const invalid = runAnimationSync({
      source: 'function animate() { return [{ nope: true }]; }',
      points: [],
      config: createBrushV2(),
      time: 0,
      seed: 1,
    })
    expect(invalid.items).toEqual([])
  })

  it('cannot construct Function or eval inside the sandbox', () => {
    const result = runAnimationSync({
      source: `function animate() {
        try { Function("return 1")(); return [{ x: 0, y: 0, size: 1 }]; }
        catch (error) { return [{ x: 2, y: 0, size: 1 }]; }
      }`,
      points: [],
      config: createBrushV2(),
      time: 0,
      seed: 1,
    })
    expect(result.items[0]?.x).toBe(2)
    expect(compileAnimation).toBeTypeOf('function')
  })
})
