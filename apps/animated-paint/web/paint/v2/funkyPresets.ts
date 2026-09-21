import { animationSourceHash } from './core/animationTiming'
import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Recipes carry their own helpers so exported brushes work without this module.
// Travel uses physical distance, not point indices: uneven input sampling cannot
// turn a moving dash into a stationary, flickering mark.
const PATH_HELPERS = `
  var items = [];
  if (!points.length) return items;
  function mod(value, period) { return ((value % period) + period) % period; }
  function random(salt) {
    var value = Math.sin(seed * 0.017 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }
  function tint(color, amount) {
    var hex = color.replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.replace(/./g, function(c) { return c + c; });
    if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
    var rgb = parseInt(hex, 16), target = amount < 0 ? 0 : 255, weight = Math.abs(amount);
    var result = "#";
    for (var shift = 16; shift >= 0; shift -= 8) {
      var channel = (rgb >> shift) & 255;
      result += Math.round(channel + (target - channel) * weight).toString(16).padStart(2, "0");
    }
    return result;
  }
  var distances = [0];
  for (var n = 1; n < points.length; n++) {
    distances.push(distances[n - 1] + Math.hypot(points[n].x - points[n - 1].x, points[n].y - points[n - 1].y));
  }
  var length = distances[distances.length - 1];
  function at(distance) {
    if (length < 0.000001) return { x: points[0].x, y: points[0].y, pressure: points[0].pressure, angle: 0 };
    var d = Math.max(0, Math.min(length, distance));
    var lo = 1, hi = distances.length - 1;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (distances[mid] < d) lo = mid + 1; else hi = mid;
    }
    var a = points[lo - 1], b = points[lo];
    var span = distances[lo] - distances[lo - 1];
    var mix = span > 0 ? (d - distances[lo - 1]) / span : 0;
    return { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix,
      pressure: a.pressure + (b.pressure - a.pressure) * mix,
      angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function mark(p, size, alpha, color) {
    return { x: p.x, y: p.y, size: size, rotation: p.angle,
      opacity: config.opacity * alpha, color: color || config.color,
      stampIndex: 0, kind: "stamp", blur: config.blurRadius,
      glow: config.glow, shadow: config.shadow };
  }
  function body(p) { return config.size * (0.5 + p.pressure * 0.5); }
  function contour(start, end, width, alpha, color, divisions) {
    for (var k = 0; k <= divisions; k++) {
      var p = at(start + (end - start) * k / divisions);
      var item = mark(p, body(p) * width, alpha, color);
      item.kind = "segment";
      item.breakBefore = k === 0;
      items.push(item);
    }
  }
`

const CANDY_CONVEYOR = `function animate(points, config, time) {${PATH_HELPERS}
  var phase = mod(time, 3) / 3;
  if (length < 0.000001) {
    var tap = at(0);
    items.push(mark(tap, body(tap) * (0.92 + 0.08 * Math.sin((phase + random(1)) * Math.PI * 2)), 1));
    return items;
  }
  var colors = [config.color, tint(config.color, 0.55), tint(config.color, -0.28)];
  // Three colors travel three spaces per loop. Clipping a segment's centreline
  // at either endpoint lets it enter/leave naturally without wrapping across it.
  var gap = Math.max(12, config.size * 1.65, config.spacing, length / 480);
  // Tiny strokes must not vanish when the moving gap passes over the whole
  // path. Keep one gently pulsing capsule, including both input endpoints.
  if (length <= gap * 0.5) {
    var pulse = 0.92 + 0.08 * Math.sin((phase + random(1)) * Math.PI * 2);
    contour(0, length, 0.62 * pulse, 1, config.color, 2);
    return items;
  }
  var half = gap * 0.32;
  var offset = mod(phase * 3 + random(2) * 3, 3) * gap;
  for (var j = -3; j <= Math.ceil(length / gap); j++) {
    var center = j * gap + offset;
    var start = Math.max(0, center - half), end = Math.min(length, center + half);
    if (end <= start) continue;
    contour(start, end, 0.62, 1, colors[mod(j, 3)], 2);
  }
  return items;
}
`

const ELASTIC_NOODLES = `function animate(points, config, time) {${PATH_HELPERS}
  var phase = (mod(time, 4) / 4 + random(3)) * Math.PI * 2;
  if (length < 0.000001) {
    var tap = at(0);
    items.push(mark(tap, body(tap) * 0.48, 1));
    return items;
  }
  var divisions = Math.min(639, Math.max(1, Math.ceil(length / Math.max(4, config.size * 0.25, config.spacing))));
  for (var strand = 0; strand < 3; strand++) {
    for (var i = 0; i <= divisions; i++) {
      var d = length * i / divisions;
      var p = at(d);
      // Pin all strands at the ends, keeping lettering and joins readable.
      var envelope = i === 0 || i === divisions ? 0 : Math.sin(Math.PI * i / divisions);
      var wave = Math.sin(phase + d / Math.max(15, config.size * 2) + strand * Math.PI * 2 / 3);
      var across = envelope * body(p) * ((strand - 1) * 0.32 + wave * 0.4);
      p.x -= Math.sin(p.angle) * across;
      p.y += Math.cos(p.angle) * across;
      var item = mark(p, Math.max(0.4, body(p) * 0.13), 0.86);
      item.kind = "segment";
      item.breakBefore = i === 0;
      items.push(item);
    }
  }
  return items;
}
`

const NEON_FUSE = `function animate(points, config, time) {${PATH_HELPERS}
  var phase = mod(time, 2.4) / 2.4;
  var bright = tint(config.color, 0.65);
  if (length < 0.000001) {
    var tap = at(0);
    items.push(mark(tap, body(tap) * (0.4 + 0.12 * Math.sin((phase + random(4)) * Math.PI * 2)), 0.9, bright));
    return items;
  }
  var divisions = Math.min(599, Math.max(1, Math.ceil(length / Math.max(4, config.spacing))));
  contour(0, length, 0.18, 0.24, config.color, divisions);
  // The dim wire stays visible between the sparse travelling lights.
  for (var base = 0; base < items.length; base++) items[base].glow = config.glow * 0.25;
  var gap = Math.max(28, config.size * 4, length / 240);
  var offset = mod(phase + random(5), 1) * gap;
  for (var j = -1; j <= Math.ceil(length / gap); j++) {
    var center = j * gap + offset;
    var start = Math.max(0, center - gap * 0.15), end = Math.min(length, center + gap * 0.15);
    if (end <= start) continue;
    contour(start, end, 0.4, 1, bright, 3);
  }
  return items;
}
`

const JELLY_BEADS = `function animate(points, config, time) {${PATH_HELPERS}
  // Twelve hand-drawn poses: hold each one for an eighth of an animation second.
  var pose = mod(Math.floor(time * 8), 12);
  var phase = (pose / 12 + random(6)) * Math.PI * 2;
  var divisions = length < 0.000001 ? 0 : Math.min(949, Math.max(1, Math.ceil(length / Math.max(12, config.size * 1.4, config.spacing))));
  var shineColor = tint(config.color, 0.72);
  for (var i = 0; i <= divisions; i++) {
    var d = divisions ? length * i / divisions : 0;
    var p = at(d);
    var wave = Math.sin(phase + d / Math.max(12, config.size * 1.7));
    var envelope = divisions && i > 0 && i < divisions ? Math.sin(Math.PI * i / divisions) : 0;
    var bob = body(p) * 0.32 * wave * envelope;
    p.x -= Math.sin(p.angle) * bob;
    p.y += Math.cos(p.angle) * bob;
    var size = body(p) * 0.8;
    var squash = 1 + 0.22 * wave;
    var bead = mark(p, size, 1);
    bead.scaleX = squash;
    bead.scaleY = 1 / squash;
    items.push(bead);
    var shine = mark(p, size * 0.2, 0.65, shineColor);
    shine.x += size * 0.16 * (-Math.cos(p.angle) * squash + Math.sin(p.angle) / squash);
    shine.y -= size * 0.16 * (Math.sin(p.angle) * squash + Math.cos(p.angle) / squash);
    items.push(shine);
  }
  return items;
}
`

export const FUNKY_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'candyConveyor', name: 'Candy Conveyor', category: 'Funky',
    renderer: 'line', animated: true, size: 16, spacing: 3,
    color: '#ee5679', opacity: 0.95, stability: 45, animationJs: CANDY_CONVEYOR,
  }),
  createBrushV2({
    id: 'elasticNoodles', name: 'Elastic Noodles', category: 'Funky',
    renderer: 'line', animated: true, size: 20, spacing: 3,
    color: '#8651d0', opacity: 0.9, stability: 45, animationJs: ELASTIC_NOODLES,
  }),
  createBrushV2({
    id: 'neonFuse', name: 'Neon Fuse', category: 'Funky',
    renderer: 'line', animated: true, size: 12, spacing: 4,
    color: '#22adcf', opacity: 0.95, glow: 4, stability: 45, animationJs: NEON_FUSE,
  }),
  createBrushV2({
    id: 'jellyBeads', name: 'Jelly Beads', category: 'Funky',
    renderer: 'stamp', animated: true, size: 18, spacing: 3,
    color: '#ed8063', opacity: 0.95, stability: 40, animationJs: JELLY_BEADS,
    animationTiming: { mode: 'stepped', fps: 8, sourceHash: animationSourceHash(JELLY_BEADS) },
  }),
]
