import { MAX_ANCHORS, MAX_GENERATED_PIXELS, MAX_INBETWEENS } from './types'
import type { AnalysisOptions, AnalysisResult, AnchorPair, GenerationOptions, PixelPoint, Raster, Spacing } from './types'

type Ink = { width: number; height: number; coverage: Float32Array; center: PixelPoint; angle: number; radius: number; anisotropy: number; count: number }
type Mask = { width: number; height: number; scale: number; data: Uint8Array }
type MapPoint = (x: number, y: number) => PixelPoint
type FeaturePoint = PixelPoint & { tangent?: PixelPoint }
const MAX_SIDE = 2048
const ANALYSIS_SIDE = 256
const EPSILON = 1e-8

function checkRasters(from: Raster, to: Raster) {
  for (const raster of [from, to]) {
    if (!Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width < 1 || raster.height < 1 || raster.width > MAX_SIDE || raster.height > MAX_SIDE || !(raster.data instanceof Uint8ClampedArray) || raster.data.length !== raster.width * raster.height * 4) throw new Error('Line-art images must contain valid RGBA pixels and be no larger than 2048 × 2048.')
  }
  if (from.width !== to.width || from.height !== to.height) throw new Error('Both key drawings must have the same canvas dimensions.')
}

function checkThreshold(threshold: number) {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) throw new Error('Ink threshold must be between 0 and 1.')
}

/** Extract ink coverage from either transparent strokes or dark lines on white paper.
 * Threshold chooses the line support; neighboring antialias pixels retain their density. */
function prepare(raster: Raster, options: AnalysisOptions, label: string): Ink {
  const { width, height, data } = raster, length = width * height
  const raw = new Float32Array(length), support = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    const k = i * 4
    raw[i] = (1 - (data[k] * .2126 + data[k + 1] * .7152 + data[k + 2] * .0722) / 255) * data[k + 3] / 255
    support[i] = raw[i] >= options.threshold ? 1 : 0
  }
  if (options.removeSpecks) {
    // A reusable flood queue avoids a JS array/object allocation for every ink pixel.
    const queue = new Int32Array(length), seen = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      if (!support[i] || seen[i]) continue
      let start = 0, end = 1; queue[0] = i; seen[i] = 1
      while (start < end) {
        const p = queue[start++], x = p % width, y = Math.floor(p / width)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const q = ny * width + nx
          if (support[q] && !seen[q]) { seen[q] = 1; queue[end++] = q }
        }
      }
      if (end < 3) for (let p = 0; p < end; p++) support[queue[p]] = 0
    }
  }
  const coverage = new Float32Array(length)
  let count = 0, mass = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x
    if (support[i]) {
      count++; const weight = raw[i]; mass += weight; sx += x * weight; sy += y * weight; sxx += x * x * weight; syy += y * y * weight; sxy += x * y * weight
    }
    if (raw[i] < .005) continue
    let near = support[i] !== 0
    for (let dy = -1; !near && dy <= 1; dy++) for (let dx = -1; !near && dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && support[(y + dy) * width + x + dx]) near = true
    }
    if (near) coverage[i] = raw[i]
  }
  if (count < 3 || mass < .1) throw new Error(`${label} has no usable dark line art. Draw some lines, lower the ink threshold, or turn off speck removal.`)
  if (width > 8 && height > 8 && count > length * .8) throw new Error(`${label} is mostly solid ink. Use dark outlines on a white or transparent background.`)
  const center = { x: sx / mass, y: sy / mass }, xx = sxx / mass - center.x ** 2, yy = syy / mass - center.y ** 2, xy = sxy / mass - center.x * center.y
  return { width, height, coverage, center, angle: .5 * Math.atan2(2 * xy, xx - yy), radius: Math.sqrt(Math.max(.1, xx + yy)), anisotropy: Math.hypot(xx - yy, 2 * xy) / Math.max(.1, xx + yy), count }
}

function reduce(coverage: Float32Array, width: number, height: number, threshold: number, maxSide: number): Mask {
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / maxSide)), w = Math.ceil(width / scale), h = Math.ceil(height / scale), data = new Uint8Array(w * h)
  // Max pooling keeps one-pixel lines that ordinary image resizing can remove.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (coverage[y * width + x] >= threshold) data[Math.floor(y / scale) * w + Math.floor(x / scale)] = 1
  return { width: w, height: h, scale, data }
}

function skeleton(mask: Mask): Uint8Array {
  const { width: w, height: h } = mask, data = mask.data.slice(), remove: number[] = []
  // Zhang–Suen thinning. The iteration cap bounds work for broad filled regions.
  for (let pass = 0; pass < 48; pass++) {
    let changed = false
    for (let phase = 0; phase < 2; phase++) {
      remove.length = 0
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (!data[i]) continue
        const p = [data[i - w], data[i - w + 1], data[i + 1], data[i + w + 1], data[i + w], data[i + w - 1], data[i - 1], data[i - w - 1]]
        let sum = 0, transitions = 0
        for (let n = 0; n < 8; n++) { sum += p[n]; if (!p[n] && p[(n + 1) % 8]) transitions++ }
        if (sum < 2 || sum > 6 || transitions !== 1) continue
        if (phase === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue
        remove.push(i)
      }
      if (remove.length) changed = true
      for (const i of remove) data[i] = 0
    }
    if (!changed) break
  }
  return data
}

function cloud(ink: Ink, threshold: number): FeaturePoint[] {
  const mask = reduce(ink.coverage, ink.width, ink.height, threshold, ANALYSIS_SIDE), thin = skeleton(mask), points: FeaturePoint[] = []
  const neighbors = (index: number, exclude = -1) => {
    const result: number[] = [], x = index % mask.width, y = Math.floor(index / mask.width)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= mask.width || y + dy < 0 || y + dy >= mask.height) continue
      const next = (y + dy) * mask.width + x + dx
      if (thin[next] && next !== exclude) result.push(next)
    }
    return result
  }
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    if (!thin[y * mask.width + x]) continue
    let mass = 0, sx = 0, sy = 0
    // Recover the ink centroid inside each pooled cell so a one-pixel motion
    // remains measurable even when the canvas is larger than the analysis grid.
    for (let py = y * mask.scale; py < Math.min(ink.height, (y + 1) * mask.scale); py++) for (let px = x * mask.scale; px < Math.min(ink.width, (x + 1) * mask.scale); px++) {
      const weight = ink.coverage[py * ink.width + px]; mass += weight; sx += px * weight; sy += py * weight
    }
    if (mass) {
      const point: FeaturePoint = { x: sx / mass, y: sy / mass }, index = y * mask.width + x
      if (neighbors(index).length === 1) {
        let current = index, previous = -1
        for (let step = 0; step < 4; step++) { const next = neighbors(current, previous); if (next.length !== 1) break; previous = current; current = next[0] }
        const dx = current % mask.width - x, dy = Math.floor(current / mask.width) - y, length = Math.hypot(dx, dy)
        if (length) point.tangent = { x: dx / length, y: dy / length }
      }
      points.push(point)
    }
  }
  const endpoints = spread(points.filter(point => point.tangent), 128), others = points.filter(point => !point.tangent), stride = Math.max(1, Math.ceil(others.length / Math.max(1, 1200 - endpoints.length)))
  return [...endpoints, ...others.filter((_, i) => i % stride === 0)]
}

const distance2 = (a: PixelPoint, b: PixelPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
function nearest(point: PixelPoint, points: PixelPoint[]) {
  let index = 0, distance = Infinity
  for (let i = 0; i < points.length; i++) { const d = distance2(point, points[i]); if (d < distance) { distance = d; index = i } }
  return { index, distance }
}

function spread<T extends PixelPoint>(points: T[], maximum: number): T[] {
  if (points.length <= maximum) return points.slice()
  const chosen = [points[0]], distances = new Float64Array(points.length).fill(Infinity)
  while (chosen.length < maximum) {
    let farthest = -1, score = 0
    for (let i = 0; i < points.length; i++) {
      distances[i] = Math.min(distances[i], distance2(points[i], chosen[chosen.length - 1]))
      if (distances[i] > score) { score = distances[i]; farthest = i }
    }
    if (farthest < 0 || score < 1) break
    chosen.push(points[farthest])
  }
  return chosen
}

function rigidMap(from: Ink, to: Ink, angle: number): MapPoint {
  const scale = Math.max(.15, Math.min(6, to.radius / from.radius)), cosine = Math.cos(angle) * scale, sine = Math.sin(angle) * scale
  return (x, y) => ({ x: to.center.x + cosine * (x - from.center.x) - sine * (y - from.center.y), y: to.center.y + sine * (x - from.center.x) + cosine * (y - from.center.y) })
}

export function analyzeLineArt(from: Raster, to: Raster, options: AnalysisOptions): AnalysisResult {
  checkRasters(from, to); checkThreshold(options.threshold)
  const a = prepare(from, options, 'The first drawing'), b = prepare(to, options, 'The second drawing'), pa = cloud(a, options.threshold), pb = cloud(b, options.threshold)
  if (!pa.length || !pb.length) throw new Error('No line features were found. Try a lower ink threshold.')
  const angles = [0]
  if (a.anisotropy > .12 && b.anisotropy > .12) { const difference = b.angle - a.angle; angles.push(difference, difference + Math.PI, difference - Math.PI) }
  const sourceSample = spread(pa, 100), targetSample = spread(pb, 100), unit = Math.max(8, Math.min(a.radius, b.radius)), scores = angles.map(angle => {
    const map = rigidMap(a, b, angle), moved = sourceSample.map(p => map(p.x, p.y))
    const forward = moved.reduce((sum, p) => sum + Math.min(unit * unit, nearest(p, pb).distance), 0) / moved.length
    const backward = targetSample.reduce((sum, p) => sum + Math.min(unit * unit, nearest(p, moved).distance), 0) / targetSample.length
    // Prefer the smaller rotation when geometry is symmetric and both fits are comparable.
    return { map, angle, score: (forward + backward) / 2 + Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) * .025 }
  }).sort((x, y) => x.score - y.score)
  const best = scores[0], maxDistance = Math.max(3, unit * .3), sourceEndpoints = spread(pa.filter(point => point.tangent), 20), targetEndpoints = pb.map((point, index) => ({ point, index })).filter(item => item.point.tangent)
  const endpointCandidates = sourceEndpoints.flatMap(p => {
    const expected = best.map(p.x, p.y), toward = best.map(p.x + p.tangent!.x, p.y + p.tangent!.y), dx = toward.x - expected.x, dy = toward.y - expected.y, length = Math.hypot(dx, dy)
    const compatible = targetEndpoints.filter(item => (dx * item.point.tangent!.x + dy * item.point.tangent!.y) / length > .6)
    if (!compatible.length) return []
    const match = nearest(expected, compatible.map(item => item.point)), selected = compatible[match.index]
    return [{ from: p, to: selected.point, index: selected.index, distance: Math.sqrt(match.distance) }]
  })
  // Reserve guides for stroke endpoints, then retain spatial coverage. Ranking
  // only by low match error lets a static outer contour crowd out moving eyes.
  const candidates = [...endpointCandidates, ...spread(pa, 40).map(p => {
    const expected = best.map(p.x, p.y), match = nearest(expected, pb)
    return { from: p, to: pb[match.index], index: match.index, distance: Math.sqrt(match.distance) }
  })]
  const used = new Set<number>(), pairs: AnchorPair[] = []
  let matchedEndpoints = 0
  for (const candidate of candidates) {
    if (used.has(candidate.index) || candidate.distance > maxDistance || pairs.some(pair => distance2(pair.from, candidate.from) < .01)) continue
    used.add(candidate.index)
    if (candidate.from.tangent && candidate.to.tangent) matchedEndpoints++
    pairs.push({ id: `auto-${pairs.length + 1}`, from: { x: candidate.from.x, y: candidate.from.y }, to: { x: candidate.to.x, y: candidate.to.y }, confidence: Math.exp(-(candidate.distance ** 2) / Math.max(1, maxDistance * maxDistance * .25)) })
    if (pairs.length >= 32) break
  }
  if (!pairs.length) throw new Error('These drawings could not be matched. Use more similar poses or add an intermediate key drawing.')
  const fit = Math.exp(-Math.sqrt(best.score) / Math.max(2, unit * .14)), retention = pairs.length / Math.min(32, candidates.length), countRatio = Math.min(a.count, b.count) / Math.max(a.count, b.count)
  const endpointCoverage = sourceEndpoints.length ? Math.min(1, matchedEndpoints / sourceEndpoints.length) : 1
  const confidence = Math.max(0, Math.min(1, fit * Math.sqrt(retention) * (.65 + .35 * countRatio) * (.7 + .3 * endpointCoverage))), warnings: string[] = []
  if (confidence < .65) warnings.push('Some strokes do not match confidently. Move or add guides on the same features before generating.')
  if (endpointCoverage < .8) warnings.push('Some stroke ends could not be paired. Check small moving details and add guides where needed.')
  if (countRatio < .6) warnings.push('The drawings contain substantially different amounts of ink. Appearing, disappearing, or hidden strokes need manual cleanup.')
  if (Math.abs(Math.atan2(Math.sin(best.angle), Math.cos(best.angle))) > Math.PI * .42) warnings.push('This pose change is large. Another key drawing can avoid collapsing or crossing strokes.')
  if (a.anisotropy < .12 && b.anisotropy < .12) warnings.push('The overall shape is nearly symmetric. Check that guides follow the intended motion.')
  return { pairs, confidence, warnings }
}

export function spacingAt(t: number, spacing: Spacing): number {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error('Frame spacing must be between 0 and 1.')
  switch (spacing) {
    case 'linear': return t
    case 'ease-in': return t * t
    case 'ease-out': return 1 - (1 - t) ** 2
    case 'ease-in-out': return t * t * (3 - 2 * t)
    default: throw new Error('Choose a supported frame spacing.')
  }
}

/** Pivoted Gaussian elimination, used only for small TPS control systems. */
function solve(matrix: Float64Array[], values: Float64Array): Float64Array {
  const n = values.length, rows = matrix.map((row, i) => { const result = new Float64Array(n + 1); result.set(row); result[n] = values[i]; return result })
  for (let column = 0; column < n; column++) {
    let pivot = column
    for (let i = column + 1; i < n; i++) if (Math.abs(rows[i][column]) > Math.abs(rows[pivot][column])) pivot = i
    if (Math.abs(rows[pivot][column]) < 1e-12) throw new Error('These guides produce a collapsed deformation. Spread guides over the drawing or add another key pose.')
    ;[rows[pivot], rows[column]] = [rows[column], rows[pivot]]
    const denominator = rows[column][column]
    for (let j = column; j <= n; j++) rows[column][j] /= denominator
    for (let i = column + 1; i < n; i++) {
      const factor = rows[i][column]
      for (let j = column; j <= n; j++) rows[i][j] -= factor * rows[column][j]
    }
  }
  const result = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) { result[i] = rows[i][n]; for (let j = i + 1; j < n; j++) result[i] -= rows[i][j] * result[j] }
  return result
}

function similarity(source: PixelPoint[], target: PixelPoint[]): MapPoint {
  const n = source.length, a = { x: 0, y: 0 }, b = { x: 0, y: 0 }
  for (let i = 0; i < n; i++) { a.x += source[i].x / n; a.y += source[i].y / n; b.x += target[i].x / n; b.y += target[i].y / n }
  let denominator = 0, real = 0, imaginary = 0
  for (let i = 0; i < n; i++) {
    const x = source[i].x - a.x, y = source[i].y - a.y, u = target[i].x - b.x, v = target[i].y - b.y
    denominator += x * x + y * y; real += x * u + y * v; imaginary += x * v - y * u
  }
  if (denominator < EPSILON) return (x, y) => ({ x: x - a.x + b.x, y: y - a.y + b.y })
  real /= denominator; imaginary /= denominator
  return (x, y) => ({ x: b.x + real * (x - a.x) - imaginary * (y - a.y), y: b.y + imaginary * (x - a.x) + real * (y - a.y) })
}

function affinePrior(source: PixelPoint[], target: PixelPoint[]): MapPoint {
  const meanX = source.reduce((sum, p) => sum + p.x, 0) / source.length, meanY = source.reduce((sum, p) => sum + p.y, 0) / source.length
  let xx = 0, yy = 0, xy = 0
  for (const p of source) { const x = p.x - meanX, y = p.y - meanY; xx += x * x; yy += y * y; xy += x * y }
  // Almost-collinear pixel samples are not enough evidence for an arbitrary
  // affine shear. A similarity prior avoids amplifying subpixel raster noise.
  if (xx * yy - xy * xy < (xx + yy) ** 2 * .002) return similarity(source, target)
  const matrix = Array.from({ length: 3 }, () => new Float64Array(3)), vx = new Float64Array(3), vy = new Float64Array(3)
  for (let i = 0; i < source.length; i++) {
    const p = [1, source[i].x, source[i].y]
    for (let row = 0; row < 3; row++) { vx[row] += p[row] * target[i].x; vy[row] += p[row] * target[i].y; for (let col = 0; col < 3; col++) matrix[row][col] += p[row] * p[col] }
  }
  try {
    const x = solve(matrix, vx), y = solve(matrix, vy)
    return (u, v) => ({ x: x[0] + x[1] * u + x[2] * v, y: y[0] + y[1] * u + y[2] * v })
  } catch { return similarity(source, target) }
}

const kernel = (squaredRadius: number) => squaredRadius < 1e-15 ? 0 : squaredRadius * Math.log(squaredRadius)
function deformation(source: PixelPoint[], target: PixelPoint[], scale: number): MapPoint {
  if (source.length <= 2) return similarity(source, target)
  const points = source.map(p => ({ x: p.x / scale, y: p.y / scale })), mapped = target.map(p => ({ x: p.x / scale, y: p.y / scale })), prior = affinePrior(points, mapped), realCount = points.length
  // Weak outer guides stabilize collinear ink and unconstrained empty paper.
  // Affine motion is reproduced exactly; actual feature guides receive much more weight.
  for (const p of [{ x: -.25, y: -.25 }, { x: 1.25, y: -.25 }, { x: 1.25, y: 1.25 }, { x: -.25, y: 1.25 }]) { points.push(p); mapped.push(prior(p.x, p.y)) }
  const n = points.length, matrix = Array.from({ length: n + 3 }, () => new Float64Array(n + 3)), vx = new Float64Array(n + 3), vy = new Float64Array(n + 3)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) matrix[i][j] = kernel(distance2(points[i], points[j]))
    matrix[i][i] += i < realCount ? 1e-8 : .1
    matrix[i][n] = matrix[n][i] = 1; matrix[i][n + 1] = matrix[n + 1][i] = points[i].x; matrix[i][n + 2] = matrix[n + 2][i] = points[i].y
    vx[i] = mapped[i].x; vy[i] = mapped[i].y
  }
  const wx = solve(matrix, vx), wy = solve(matrix, vy)
  return (px, py) => {
    const x = px / scale, y = py / scale
    let u = wx[n] + wx[n + 1] * x + wx[n + 2] * y, v = wy[n] + wy[n + 1] * x + wy[n + 2] * y
    for (let i = 0; i < n; i++) { const basis = kernel((x - points[i].x) ** 2 + (y - points[i].y) ** 2); u += wx[i] * basis; v += wy[i] * basis }
    return { x: u * scale, y: v * scale }
  }
}

function sample(data: Float32Array, width: number, height: number, x: number, y: number): number {
  if (x <= -1 || y <= -1 || x >= width || y >= height || !Number.isFinite(x + y)) return 0
  const left = Math.floor(x), top = Math.floor(y), fx = x - left, fy = y - top
  const a = left >= 0 && top >= 0 ? data[top * width + left] : 0
  const b = left + 1 < width && top >= 0 ? data[top * width + left + 1] : 0
  const c = left >= 0 && top + 1 < height ? data[(top + 1) * width + left] : 0
  const d = left + 1 < width && top + 1 < height ? data[(top + 1) * width + left + 1] : 0
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

function warp(ink: Ink, map: MapPoint): Float32Array {
  const { width, height, coverage } = ink, step = Math.max(2, Math.ceil(Math.max(width, height) / 192)), columns = Math.max(2, Math.ceil((width - 1) / step) + 1), rows = Math.max(2, Math.ceil((height - 1) / step) + 1)
  const gx = new Float32Array(columns * rows), gy = new Float32Array(columns * rows)
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) { const p = map(x * step, y * step), i = y * columns + x; gx[i] = p.x; gy[i] = p.y }
  const output = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const v = y / step, top = Math.min(rows - 2, Math.floor(v)), fy = v - top
    for (let x = 0; x < width; x++) {
      const u = x / step, left = Math.min(columns - 2, Math.floor(u)), fx = u - left, i = top * columns + left
      const mx = (gx[i] * (1 - fx) + gx[i + 1] * fx) * (1 - fy) + (gx[i + columns] * (1 - fx) + gx[i + columns + 1] * fx) * fy
      const my = (gy[i] * (1 - fx) + gy[i + 1] * fx) * (1 - fy) + (gy[i + columns] * (1 - fx) + gy[i + columns + 1] * fx) * fy
      output[y * width + x] = sample(coverage, width, height, mx, my)
    }
  }
  return output
}

/** Approximate Euclidean nearest seed, with forward/backward chamfer passes. */
function nearestSeeds(mask: Uint8Array, width: number, height: number): Int32Array {
  const field = new Int32Array(mask.length).fill(-1)
  for (let i = 0; i < mask.length; i++) if (mask[i]) field[i] = i
  for (let pass = 0; pass < 2; pass++) {
    for (let y = pass ? height - 1 : 0; pass ? y >= 0 : y < height; y += pass ? -1 : 1) {
      for (let x = pass ? width - 1 : 0; pass ? x >= 0 : x < width; x += pass ? -1 : 1) {
        const i = y * width + x
        let best = field[i], distance = best < 0 ? Infinity : (best % width - x) ** 2 + (Math.floor(best / width) - y) ** 2
        for (let n = 0; n < 4; n++) {
          const dx = n === 0 ? (pass ? 1 : -1) : n - 2, dy = n === 0 ? 0 : (pass ? 1 : -1), nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const seed = field[ny * width + nx]
          if (seed < 0) continue
          const d = (seed % width - x) ** 2 + (Math.floor(seed / width) - y) ** 2
          if (d < distance) { best = seed; distance = d }
        }
        field[i] = best
      }
    }
  }
  return field
}

function synthesize(a: Float32Array, b: Float32Array, width: number, height: number, t: number, threshold: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  const supportThreshold = Math.min(threshold * .4, .12)
  let overlap = 0, union = 0
  for (let i = 0; i < a.length; i++) { const p = a[i] >= supportThreshold, q = b[i] >= supportThreshold; if (p || q) union++; if (p && q) overlap++ }
  if (!union) throw new Error('The deformation moved all ink outside the canvas. Reposition the guides or use a closer key pose.')
  // Every supported pixel must already agree. A global percentage would let a
  // large stationary contour hide a small moving feature and produce ghosts.
  if (overlap === union) {
    for (let i = 0; i < a.length; i++) data[i * 4 + 3] = Math.round((a[i] * (1 - t) + b[i] * t) * 255)
    return data
  }
  // Align nearby centerlines after the global TPS warp, then interpolate their
  // ink coverage. Blending only after alignment keeps the intended line weight.
  // This is a bounded geometric correction rather than optical flow. Unmatched
  // regions use the nearer key drawing instead of showing two ghost contours.
  const ma = reduce(a, width, height, supportThreshold, 384), mb = reduce(b, width, height, supportThreshold, 384), sa = skeleton(ma), sb = skeleton(mb), na = nearestSeeds(sa, ma.width, ma.height), nb = nearestSeeds(sb, mb.width, mb.height)
  const count = ma.data.length, seeds = new Uint8Array(count), flowX = new Float32Array(count), flowY = new Float32Array(count), radius = Math.max(2, Math.min(6, Math.max(width, height) * .018 / ma.scale))
  for (let i = 0; i < count; i++) {
    if (!sa[i] || nb[i] < 0) continue
    const j = nb[i], x = i % ma.width, y = Math.floor(i / ma.width), dx = j % ma.width - x, dy = Math.floor(j / ma.width) - y, back = na[j]
    if (dx * dx + dy * dy > radius * radius || back < 0 || (back % ma.width - x) ** 2 + (Math.floor(back / ma.width) - y) ** 2 > 4) continue
    const mx = Math.min(ma.width - 1, Math.max(0, Math.round(x + t * dx))), my = Math.min(ma.height - 1, Math.max(0, Math.round(y + t * dy))), mid = my * ma.width + mx
    seeds[mid] = 1; flowX[mid] = dx * ma.scale; flowY[mid] = dy * ma.scale
  }
  const nearestMatch = nearestSeeds(seeds, ma.width, ma.height), valid = new Uint8Array(count), expandedX = new Float32Array(count), expandedY = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const j = nearestMatch[i]
    if (j < 0 || (j % ma.width - i % ma.width) ** 2 + (Math.floor(j / ma.width) - Math.floor(i / ma.width)) ** 2 > (radius + 3) ** 2) continue
    valid[i] = 1; expandedX[i] = flowX[j]; expandedY[i] = flowY[j]
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, mx = (x + .5) / ma.scale - .5, my = (y + .5) / ma.scale - .5, cell = Math.min(ma.height - 1, Math.max(0, Math.round(my))) * ma.width + Math.min(ma.width - 1, Math.max(0, Math.round(mx)))
    let alpha: number
    if (valid[cell]) {
      const dx = sample(expandedX, ma.width, ma.height, Math.max(0, mx), Math.max(0, my)), dy = sample(expandedY, ma.width, ma.height, Math.max(0, mx), Math.max(0, my))
      alpha = sample(a, width, height, x - t * dx, y - t * dy) * (1 - t) + sample(b, width, height, x + (1 - t) * dx, y + (1 - t) * dy) * t
    } else alpha = t <= .5 ? a[i] : b[i]
    data[i * 4 + 3] = Math.round(Math.min(1, alpha) * 255)
  }
  return data
}

function checkPairs(pairs: AnchorPair[], width: number, height: number) {
  if (!Array.isArray(pairs) || pairs.length < 1 || pairs.length > MAX_ANCHORS) throw new Error(`Add between 1 and ${MAX_ANCHORS} matching guides.`)
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    for (const side of ['from', 'to'] as const) {
      const point = pair?.[side]
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > width - 1 || point.y < 0 || point.y > height - 1) throw new Error('Every guide must be positioned inside its key drawing.')
      for (let j = 0; j < i; j++) if (distance2(point, pairs[j][side]) < .01) throw new Error('Two guides occupy the same point. Move or remove the duplicate guide.')
    }
  }
}

/** Streams frames one at a time; callers can transfer each raster out of a worker. */
export function generateLineArt(from: Raster, to: Raster, options: GenerationOptions, onFrame: (raster: Raster, index: number) => void, onProgress?: (value: number) => void): void {
  checkRasters(from, to); checkThreshold(options.threshold); checkPairs(options.pairs, from.width, from.height)
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > MAX_INBETWEENS) throw new Error(`Generate between 1 and ${MAX_INBETWEENS} drawings at a time.`)
  if (from.width * from.height * options.count > MAX_GENERATED_PIXELS) throw new Error('This batch is too large. Generate fewer drawings or use a smaller canvas (48 megapixels per batch).')
  spacingAt(.5, options.spacing)
  const source = options.pairs.map(pair => pair.from), target = options.pairs.map(pair => pair.to), times = Array.from({ length: options.count }, (_, i) => spacingAt((i + 1) / (options.count + 1), options.spacing))
  const positions = times.map(t => source.map((p, i) => ({ x: p.x * (1 - t) + target[i].x * t, y: p.y * (1 - t) + target[i].y * t })))
  // Validate the complete batch before streaming any frames to keep failure atomic.
  for (const points of positions) for (let i = 0; i < points.length; i++) for (let j = 0; j < i; j++) if (distance2(points[i], points[j]) < .01) throw new Error('Guide paths meet or cross at an in-between frame. Correct the pairings or add another key pose.')
  const a = prepare(from, options, 'The first drawing'), b = prepare(to, options, 'The second drawing'), scale = Math.max(from.width, from.height)
  onProgress?.(0)
  for (let index = 0; index < options.count; index++) {
    const t = times[index], points = positions[index], warpedA = warp(a, deformation(points, source, scale)), warpedB = warp(b, deformation(points, target, scale)), data = synthesize(warpedA, warpedB, from.width, from.height, t, options.threshold)
    onFrame({ width: from.width, height: from.height, data }, index)
    onProgress?.((index + 1) / options.count)
  }
}
