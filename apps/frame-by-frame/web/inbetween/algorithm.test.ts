import { describe, expect, it } from 'vitest'
import { analyzeLineArt, generateLineArt, spacingAt } from './algorithm'
import type { AnchorPair, GenerationOptions, Raster } from './types'

type Stroke = { from: [number, number]; to: [number, number]; width?: number; opacity?: number }
function drawing(strokes: Stroke[], paper = false, width = 96, height = 80): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let coverage = 0
    for (const stroke of strokes) {
      const [ax, ay] = stroke.from, [bx, by] = stroke.to, dx = bx - ax, dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1, dx * dx + dy * dy)))
      coverage = Math.max(coverage, Math.max(0, Math.min(1, ((stroke.width ?? 1) + 1) / 2 - Math.hypot(x - ax - t * dx, y - ay - t * dy))) * (stroke.opacity ?? 1))
    }
    const i = (y * width + x) * 4
    if (paper) { data[i] = data[i + 1] = data[i + 2] = Math.round((1 - coverage) * 255); data[i + 3] = 255 }
    else data[i + 3] = Math.round(coverage * 255)
  }
  return { width, height, data }
}
const pair = (from: [number, number], to: [number, number], id = 'guide'): AnchorPair => ({ id, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] }, manual: true })
const settings = { threshold: .35, removeSpecks: true }
function generate(from: Raster, to: Raster, options: Partial<GenerationOptions> = {}): Raster[] {
  const frames: Raster[] = [], pairs = options.pairs ?? analyzeLineArt(from, to, settings).pairs
  generateLineArt(from, to, { ...settings, count: 1, spacing: 'linear', pairs, ...options }, frame => frames.push(frame))
  return frames
}
const alpha = (raster: Raster, x: number, y: number) => raster.data[(y * raster.width + x) * 4 + 3]
function stats(raster: Raster) {
  let mass = 0, x = 0, y = 0, max = 0, dark = 0
  for (let row = 0; row < raster.height; row++) for (let col = 0; col < raster.width; col++) { const a = alpha(raster, col, row); mass += a; x += col * a; y += row * a; max = Math.max(max, a); if (a > 127) dark++ }
  return { mass: mass / 255, x: x / mass, y: y / mass, max, dark }
}

describe('line-art analysis', () => {
  it('matches a translated one-pixel stroke without requiring a model', () => {
    const a = drawing([{ from: [15, 12], to: [15, 58] }]), b = drawing([{ from: [49, 19], to: [49, 65] }]), result = analyzeLineArt(a, b, settings)
    expect(result.pairs.length).toBeGreaterThan(3)
    expect(result.confidence).toBeGreaterThan(.85)
    for (const guide of result.pairs) { expect(guide.to.x - guide.from.x).toBe(34); expect(guide.to.y - guide.from.y).toBe(7) }
  })
  it('preserves hairline features when analysis reduces a large canvas', () => {
    const a = drawing([{ from: [100, 100], to: [100, 600] }], false, 1024, 768), b = drawing([{ from: [301, 100], to: [301, 600] }], false, 1024, 768)
    const result = analyzeLineArt(a, b, settings)
    expect(result.pairs.length).toBeGreaterThan(3)
    for (const guide of result.pairs) expect(guide.to.x - guide.from.x).toBe(201)
  })
  it('rejects empty and all-white key drawings explicitly', () => {
    const line = drawing([{ from: [20, 10], to: [20, 60] }])
    expect(() => analyzeLineArt(drawing([]), line, settings)).toThrow(/first drawing.*no usable/i)
    expect(() => analyzeLineArt(line, drawing([], true), settings)).toThrow(/second drawing.*no usable/i)
  })
  it('rejects an all-black background', () => {
    const black = drawing([]); for (let i = 3; i < black.data.length; i += 4) black.data[i] = 255
    expect(() => analyzeLineArt(black, black, settings)).toThrow(/mostly solid ink/)
  })
  it('removes tiny isolated dots without removing connected hairlines', () => {
    const image = drawing([{ from: [20, 10], to: [20, 60] }]); image.data[(5 * image.width + 80) * 4 + 3] = 255
    const [frame] = generate(image, image)
    expect(alpha(frame, 80, 5)).toBe(0); expect(alpha(frame, 20, 30)).toBe(255)
  })
  it('validates raster size, threshold, and matching canvas dimensions', () => {
    const image = drawing([{ from: [20, 10], to: [20, 60] }])
    expect(() => analyzeLineArt(image, { ...image, width: 20 }, settings)).toThrow(/RGBA/)
    expect(() => analyzeLineArt(image, drawing([], false, 32, 32), settings)).toThrow(/same canvas/)
    expect(() => analyzeLineArt(image, image, { ...settings, threshold: NaN })).toThrow(/threshold/)
  })
  it('recognizes a modest rotated pose automatically', () => {
    const a = drawing([{ from: [25, 20], to: [25, 60], width: 2 }]), b = drawing([{ from: [35, 20], to: [55, 55], width: 2 }]), result = analyzeLineArt(a, b, settings)
    expect(result.confidence).toBeGreaterThan(.7)
    const [frame] = generate(a, b, { pairs: result.pairs })
    expect(stats(frame).mass).toBeGreaterThan(stats(a).mass * .75)
    expect(stats(frame).x).toBeGreaterThan(33); expect(stats(frame).x).toBeLessThan(37)
  })
})

describe('guided line-art in-between generation', () => {
  it('moves geometry to the midpoint and leaves no silhouettes at either endpoint', () => {
    const a = drawing([{ from: [15, 12], to: [15, 58] }]), b = drawing([{ from: [49, 12], to: [49, 58] }]), [frame] = generate(a, b)
    expect(alpha(frame, 32, 30)).toBe(255)
    expect(alpha(frame, 15, 30)).toBe(0); expect(alpha(frame, 49, 30)).toBe(0)
    expect(stats(frame).x).toBeCloseTo(32, 4); expect(stats(frame).mass).toBeCloseTo(stats(a).mass, 2)
  })
  it('keeps a large-canvas hairline intact at a fractional midpoint', () => {
    const a = drawing([{ from: [100, 100], to: [100, 600] }], false, 1024, 768), b = drawing([{ from: [301, 100], to: [301, 600] }], false, 1024, 768), [frame] = generate(a, b)
    expect(stats(frame).x).toBeCloseTo(200.5, 2)
    expect(Math.abs(stats(frame).mass / stats(a).mass - 1)).toBeLessThan(.01)
    expect(alpha(frame, 100, 300)).toBe(0); expect(alpha(frame, 301, 300)).toBe(0)
    expect(alpha(frame, 200, 300)).toBeGreaterThan(120); expect(alpha(frame, 201, 300)).toBeGreaterThan(120)
  })
  it('handles collinear guides with a stable deformation', () => {
    const a = drawing([{ from: [20, 10], to: [20, 60], width: 3 }]), b = drawing([{ from: [40, 10], to: [40, 60], width: 3 }]), [frame] = generate(a, b, { pairs: [pair([20, 10], [40, 10], 'a'), pair([20, 35], [40, 35], 'b'), pair([20, 60], [40, 60], 'c')] })
    expect(alpha(frame, 30, 35)).toBe(255); expect(stats(frame).x).toBeCloseTo(30, 3)
  })
  it('supports a single translation guide and two similarity guides', () => {
    const a = drawing([{ from: [20, 10], to: [20, 60] }]), b = drawing([{ from: [40, 10], to: [40, 60] }])
    const [one] = generate(a, b, { pairs: [pair([20, 10], [40, 10])] }), [two] = generate(a, b, { pairs: [pair([20, 10], [40, 10], 'a'), pair([20, 60], [40, 60], 'b')] })
    expect(one.data).toEqual(two.data); expect(alpha(one, 30, 35)).toBe(255)
  })
  it('treats white-paper and transparent line art equivalently and produces transparent paper', () => {
    const strokes: Stroke[] = [{ from: [15.25, 10], to: [35.25, 62], width: 2 }], transparent = drawing(strokes), paper = drawing(strokes, true)
    const [a] = generate(transparent, transparent), [b] = generate(paper, paper)
    expect(a.data).toEqual(b.data); expect(alpha(b, 80, 70)).toBe(0); expect(stats(b).max).toBe(255)
  })
  it('retains the density and antialias edge of semi-transparent strokes', () => {
    const a = drawing([{ from: [15.25, 10], to: [15.25, 60], opacity: .65 }]), b = drawing([{ from: [45.25, 10], to: [45.25, 60], opacity: .65 }]), [frame] = generate(a, b, { pairs: [pair([15, 30], [45, 30])] })
    expect(alpha(frame, 30, 30)).toBe(alpha(a, 15, 30)); expect(alpha(frame, 31, 30)).toBe(alpha(a, 16, 30))
    expect(stats(frame).mass).toBeCloseTo(stats(a).mass, 2)
  })
  it('interpolates stroke density after aligning the moving contours', () => {
    const a = drawing([{ from: [20, 10], to: [20, 60], opacity: .4 }]), b = drawing([{ from: [40, 10], to: [40, 60] }]), [frame] = generate(a, b, { pairs: [pair([20, 30], [40, 30])] })
    expect(alpha(frame, 30, 30)).toBe(179)
    expect(alpha(frame, 20, 30)).toBe(0); expect(alpha(frame, 40, 30)).toBe(0)
  })
  it('does not erase a faint one-pixel line during a subpixel translation', () => {
    const a = drawing([{ from: [15, 10], to: [15, 60], opacity: .4 }]), b = drawing([{ from: [16, 10], to: [16, 60], opacity: .4 }]), [frame] = generate(a, b, { pairs: [pair([15, 30], [16, 30])] })
    expect(stats(frame).mass).toBeGreaterThan(stats(a).mass * .98)
    expect(alpha(frame, 15, 30)).toBeGreaterThanOrEqual(50); expect(alpha(frame, 16, 30)).toBeGreaterThanOrEqual(50)
  })
  it('interpolates a modest rotation through guide positions while keeping ink dark', () => {
    const a = drawing([{ from: [25, 20], to: [25, 60], width: 2 }]), b = drawing([{ from: [35, 20], to: [55, 55], width: 2 }]), [frame] = generate(a, b, { pairs: [pair([25, 20], [35, 20], 'a'), pair([25, 60], [55, 55], 'b')] })
    expect(alpha(frame, 35, 39)).toBeGreaterThan(220)
    expect(stats(frame).mass).toBeGreaterThan(stats(a).mass * .85)
    expect(alpha(frame, 25, 40)).toBe(0)
  })
  it('honors local non-affine guide motion instead of only moving the whole drawing', () => {
    const a = drawing([{ from: [15, 15], to: [15, 55], width: 2 }, { from: [15, 55], to: [60, 55], width: 2 }]), b = drawing([{ from: [15, 15], to: [25, 50], width: 2 }, { from: [25, 50], to: [60, 55], width: 2 }])
    const [frame] = generate(a, b, { pairs: [pair([15, 15], [15, 15], 'a'), pair([15, 55], [25, 50], 'b'), pair([60, 55], [60, 55], 'c')] })
    expect(alpha(frame, 20, 53)).toBeGreaterThan(150)
    expect(alpha(frame, 15, 15)).toBeGreaterThan(150)
    expect(alpha(frame, 60, 55)).toBeGreaterThan(150)
  })
  it('aligns small residual contour differences without retaining two outlines', () => {
    const a = drawing([{ from: [22, 10], to: [22, 60] }]), b = drawing([{ from: [24, 10], to: [24, 60] }]), [frame] = generate(a, b, { pairs: [pair([22, 30], [22, 30])] })
    expect(alpha(frame, 23, 30)).toBe(255)
    expect(alpha(frame, 22, 30)).toBe(0); expect(alpha(frame, 24, 30)).toBe(0)
    expect(stats(frame).mass).toBeCloseTo(stats(a).mass, 1)
  })
  it('does not let a large stationary contour hide a small moving feature', () => {
    const still: Stroke = { from: [10, 5], to: [10, 74] }, a = drawing([still, { from: [40, 30], to: [40, 34] }]), b = drawing([still, { from: [42, 30], to: [42, 34] }]), [frame] = generate(a, b, { pairs: [pair([10, 30], [10, 30])] })
    expect(alpha(frame, 10, 32)).toBe(255); expect(alpha(frame, 41, 32)).toBe(255)
    expect(alpha(frame, 40, 32)).toBe(0); expect(alpha(frame, 42, 32)).toBe(0)
  })
  it('streams exactly the requested drawings with progress and excludes both key frames', () => {
    const a = drawing([{ from: [10, 10], to: [10, 60] }]), b = drawing([{ from: [50, 10], to: [50, 60] }]), frames: Raster[] = [], indices: number[] = [], progress: number[] = []
    generateLineArt(a, b, { ...settings, pairs: [pair([10, 30], [50, 30])], count: 3, spacing: 'linear' }, (frame, index) => { frames.push(frame); indices.push(index) }, value => progress.push(value))
    expect(indices).toEqual([0, 1, 2]); expect(frames.map(frame => stats(frame).x)).toEqual([20, 30, 40]); expect(progress).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(new Set(frames.map(frame => frame.data.buffer)).size).toBe(3)
  })
  it('applies easing to motion rather than to image opacity', () => {
    const a = drawing([{ from: [10, 10], to: [10, 60] }]), b = drawing([{ from: [50, 10], to: [50, 60] }]), [frame] = generate(a, b, { pairs: [pair([10, 30], [50, 30])], spacing: 'ease-in' })
    expect(stats(frame).x).toBe(20); expect(stats(frame).max).toBe(255)
  })
  it('keeps the caller’s source pixels and guide coordinates unchanged', () => {
    const a = drawing([{ from: [20, 10], to: [20, 60] }]), original = a.data.slice(), guides = [pair([20, 30], [20, 30])], snapshot = JSON.stringify(guides)
    generate(a, a, { pairs: guides }); expect(a.data).toEqual(original); expect(JSON.stringify(guides)).toBe(snapshot)
  })
  it('supports one-pixel-wide canvases without invalid grid samples', () => {
    const a = drawing([{ from: [0, 2], to: [0, 12] }], false, 1, 16), [frame] = generate(a, a, { pairs: [pair([0, 4], [0, 4])] })
    expect(frame.data).toEqual(a.data)
  })
  it('rejects duplicate, missing, out-of-bounds, and colliding guides before streaming', () => {
    const a = drawing([{ from: [20, 10], to: [20, 60] }]), frames: Raster[] = [], invoke = (pairs: AnchorPair[]) => generateLineArt(a, a, { ...settings, pairs, count: 1, spacing: 'linear' }, frame => frames.push(frame))
    expect(() => invoke([])).toThrow(/matching guides/)
    expect(() => invoke([pair([20, 10], [20, 10]), pair([20, 10], [30, 10])])).toThrow(/same point/)
    expect(() => invoke([pair([200, 10], [20, 10])])).toThrow(/inside/)
    expect(() => invoke([pair([20, 10], [20, 60]), pair([20, 60], [20, 10])])).toThrow(/paths meet or cross/)
    expect(frames).toHaveLength(0)
  })
  it('enforces bounded frame count and total generated pixels', () => {
    const image = drawing([{ from: [20, 10], to: [20, 60] }])
    for (const count of [0, 1.5, 25, Infinity]) expect(() => generate(image, image, { count })).toThrow(/between 1 and 24/)
    const large = { width: 2048, height: 2048, data: new Uint8ClampedArray(2048 * 2048 * 4) }
    expect(() => generate(large, large, { pairs: [pair([1, 1], [1, 1])], count: 13 })).toThrow(/48 megapixels/)
  })
})

describe('in-between timing curves', () => {
  it.each(['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const)('%s preserves the endpoints and is monotone', spacing => {
    const values = Array.from({ length: 21 }, (_, i) => spacingAt(i / 20, spacing))
    expect(values[0]).toBe(0); expect(values.at(-1)).toBe(1); expect(values).toEqual(values.toSorted((a, b) => a - b))
  })
  it('uses distinct easing positions', () => { expect(spacingAt(.25, 'linear')).toBe(.25); expect(spacingAt(.25, 'ease-in')).toBe(.0625); expect(spacingAt(.25, 'ease-out')).toBe(.4375); expect(spacingAt(.5, 'ease-in-out')).toBe(.5) })
})

it('automatically preserves small moving facial features inside a stationary outline', () => {
  const ellipse: Stroke[] = Array.from({ length: 80 }, (_, i) => ({ from: [104 + 70 * Math.cos(i * Math.PI / 40), 104 + 79 * Math.sin(i * Math.PI / 40)], to: [104 + 70 * Math.cos((i + 1) * Math.PI / 40), 104 + 79 * Math.sin((i + 1) * Math.PI / 40)], width: 2 }))
  const face = (offset: number, smile: number) => drawing([...ellipse,
    { from: [77 + offset, 92], to: [84 + offset, 92], width: 2 }, { from: [124 + offset, 92], to: [131 + offset, 92], width: 2 },
    { from: [104, 102], to: [104, 115], width: 2 },
    { from: [80, 130], to: [104, smile], width: 2 }, { from: [104, smile], to: [128, 130], width: 2 },
  ], false, 208, 208)
  const a = face(0, 140), b = face(6, 132), analysis = analyzeLineArt(a, b, settings), frames = generate(a, b, { count: 3, pairs: analysis.pairs })
  const roi = (image: Raster, left: number, top: number, right: number, bottom: number) => {
    let mass = 0, sx = 0, sy = 0
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) { const weight = alpha(image, x, y); mass += weight; sx += weight * x; sy += weight * y }
    return { x: sx / mass, y: sy / mass, mass: mass / 255 }
  }
  expect(frames).toHaveLength(3)
  const firstEye = roi(a, 70, 84, 99, 100), firstRightEye = roi(a, 116, 84, 148, 100), firstHead = roi(a, 25, 75, 45, 125)
  const mouthPositions = [a, ...frames, b].map(image => roi(image, 75, 124, 135, 148).y)
  expect(mouthPositions).toEqual([...mouthPositions].sort((left, right) => right - left))
  frames.forEach((image, index) => {
    const t = (index + 1) / 4, leftEye = roi(image, 70, 84, 99, 100), rightEye = roi(image, 116, 84, 148, 100), head = roi(image, 25, 75, 45, 125), mouth = roi(image, 75, 124, 135, 148)
    expect(Math.abs(leftEye.x - (firstEye.x + t * 6))).toBeLessThan(.25)
    expect(Math.abs(rightEye.x - (firstRightEye.x + t * 6))).toBeLessThan(.25)
    expect(Math.abs(leftEye.mass / firstEye.mass - 1)).toBeLessThan(.1)
    expect(Math.abs(rightEye.mass / firstRightEye.mass - 1)).toBeLessThan(.1)
    expect(Math.abs(head.x - firstHead.x)).toBeLessThan(.25)
    expect(Math.abs(head.mass / firstHead.mass - 1)).toBeLessThan(.08)
    expect(mouth.mass).toBeGreaterThan(95); expect(mouth.mass).toBeLessThan(112)
    for (const [x, y] of [[34, 104], [174, 104], [104, 25], [104, 183]]) expect(alpha(image, x, y)).toBeGreaterThan(230)
  })
})
