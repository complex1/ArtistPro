import { animationSourceHash } from './core/animationTiming'
import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Keep the geometry helpers inside the exported JavaScript. A saved brush must
// produce the same frames without importing app modules or retaining state.
const PATH_HELPERS = `
  var items = [];
  if (points.length === 0) return items;
  var lengths = [0], total = 0;
  for (var i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(total);
  }
  function at(distance) {
    if (distance <= 0 || total === 0) return points[0];
    if (distance >= total) return points[points.length - 1];
    var low = 0, high = points.length - 1;
    while (low + 1 < high) {
      var middle = Math.floor((low + high) / 2);
      if (lengths[middle] < distance) low = middle;
      else high = middle;
    }
    var from = points[low], to = points[high];
    var mix = (distance - lengths[low]) / Math.max(0.000001, lengths[high] - lengths[low]);
    return { x: from.x + (to.x - from.x) * mix,
      y: from.y + (to.y - from.y) * mix,
      pressure: from.pressure + (to.pressure - from.pressure) * mix,
      t: from.t + (to.t - from.t) * mix };
  }
  function mark(point, alpha) {
    return { x: point.x, y: point.y,
      size: config.size * (0.4 + point.pressure * 0.6),
      rotation: 0, opacity: config.opacity * alpha, color: config.color,
      stampIndex: 0, kind: "segment", blur: config.blurRadius,
      glow: config.glow, shadow: config.shadow };
  }
  function smooth(value) {
    var p = Math.max(0, Math.min(1, value));
    return p * p * (3 - 2 * p);
  }
  var elapsed = Math.max(0, age);
  var frozen = config.speed <= 0;
  // Include the final point explicitly; even extremely long imported paths
  // retain both ends without exceeding the engine's sampled-point budget.
  var step = Math.max(1, Math.ceil((points.length - 2) / 3998));
`

const CENTER_BLOOM = `function animate(points, config, time, age) {${PATH_HELPERS}
  // The growing interval is measured in distance, not point indices. Recorded
  // drawing time extends the reveal so appending to a long live stroke cannot
  // finish its animation before the last section has been drawn.
  var drawingTime = Math.max(0, points[points.length - 1].t - points[0].t) * config.speed;
  var progress = frozen ? 1 : smooth(elapsed / (drawingTime + 1.5));
  if (progress <= 0) return items;
  if (total === 0) {
    var dot = mark(points[0], progress);
    dot.size *= 0.25 + progress * 0.75;
    items.push(dot);
    return items;
  }
  var start = total * (1 - progress) * 0.5;
  var end = total - start;
  var first = mark(at(start), 1);
  first.breakBefore = true;
  items.push(first);
  for (var j = step; j < points.length - 1; j += step) {
    if (lengths[j] > start && lengths[j] < end) items.push(mark(points[j], 1));
  }
  items.push(mark(at(end), 1));
  return items;
}
`

const DUST_REVEAL = `function animate(points, config, time, age) {${PATH_HELPERS}
  function random(cell, salt) {
    var value = Math.sin(cell * 127.1 + salt * 311.7 + seed * 0.017) * 43758.5453;
    return value - Math.floor(value);
  }
  function progress(point) {
    return frozen ? 1 : Math.max(0, Math.min(1,
      (elapsed - Math.max(0, point.t - points[0].t) * config.speed) / 2));
  }
  function core(point) {
    var p = progress(point);
    return mark(point, smooth((p - 0.22) / 0.78));
  }
  var first = core(points[0]);
  first.breakBefore = true;
  items.push(first);
  for (var j = step; j < points.length - 1; j += step) items.push(core(points[j]));
  if (points.length > 1) items.push(core(points[points.length - 1]));

  // These are temporary grains, not an area-filling particle simulation. The
  // budget remains 192 even for very long paths or very large brush sizes.
  var count = Math.min(192, Math.max(12, Math.ceil(total / Math.max(3, config.size * 0.5))));
  for (var g = 0; g < count; g++) {
    var point = at(total * (g + 0.2 + random(g, 1) * 0.6) / count);
    var p = progress(point);
    if (p >= 1) continue;
    var remaining = 1 - smooth(p);
    var angle = random(g, 2) * Math.PI * 2 + p * (random(g, 3) - 0.5) * 2;
    var distance = config.size * (1.5 + random(g, 4) * 4) * remaining;
    var grain = mark(point, (0.35 + random(g, 5) * 0.55) * (1 - smooth((p - 0.55) / 0.45)));
    grain.x += Math.cos(angle) * distance;
    grain.y += Math.sin(angle) * distance;
    grain.size = Math.max(0.45, grain.size * (0.07 + random(g, 6) * 0.15));
    grain.kind = "particle";
    items.push(grain);
  }
  return items;
}
`

export const REVEAL_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'centerBloom', name: 'Center Bloom', category: 'Reveal',
    renderer: 'line', animated: true, size: 10, spacing: 3,
    color: '#7755bd', opacity: 0.95, stability: 45, animationJs: CENTER_BLOOM,
    animationTiming: { mode: 'once', settleSeconds: 1.5, sourceHash: animationSourceHash(CENTER_BLOOM) },
  }),
  createBrushV2({
    id: 'dustReveal', name: 'Dust Reveal', category: 'Reveal',
    renderer: 'line', animated: true, size: 10, spacing: 3,
    color: '#bd673b', opacity: 0.95, stability: 45, animationJs: DUST_REVEAL,
    animationTiming: { mode: 'once', settleSeconds: 2, sourceHash: animationSourceHash(DUST_REVEAL) },
  }),
]
