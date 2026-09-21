import { animationSourceHash } from './core/animationTiming'
import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Embedded helpers keep each exported recipe independent of the app bundle.
const ACCENT_HELPERS = `
  var items = [];
  if (!points.length) return items;
  function mod(value, period) { return ((value % period) + period) % period; }
  function random(salt) {
    var value = Math.sin(seed * 0.017 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
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
  function body(p) { return config.size * (0.5 + p.pressure * 0.5); }
  function mark(x, y, size, alpha, start) {
    return { x: x, y: y, size: size, rotation: 0, opacity: config.opacity * alpha,
      color: config.color, stampIndex: 0, kind: "segment", breakBefore: start,
      blur: config.blurRadius, glow: config.glow, shadow: config.shadow };
  }
`

const IMPACT_BURST = `function animate(points, config, time) {${ACCENT_HELPERS}
  var pose = mod(Math.floor(time * 12), 18);
  // Keep the whole path represented even when the mark budget is reached.
  var divisions = Math.min(55, Math.floor(length / Math.max(16, config.size * 4, config.spacing)));
  for (var i = 0; i <= divisions; i++) {
    var p = at(divisions ? length * i / divisions : length / 2);
    var phase = mod(pose + i * 3, 18);
    var expand = 0.68 + 0.65 * Math.min(1, phase / 5);
    var alpha = 0.12 + 0.88 * Math.pow(1 - phase / 18, 2);
    var radius = body(p) * expand;
    var turn = random(i * 19 + 1) * Math.PI * 2;
    for (var ray = 0; ray < 8; ray++) {
      var angle = turn + ray * Math.PI / 4 + (random(i * 19 + ray + 2) - 0.5) * 0.11;
      var reach = 1.05 + random(i * 19 + ray + 10) * 0.3;
      // Three decreasing widths make each ray taper without joining its neighbours.
      for (var k = 0; k < 3; k++) {
        var distance = radius * (k === 0 ? 0.32 : k === 1 ? 0.68 : reach);
        items.push(mark(p.x + Math.cos(angle) * distance, p.y + Math.sin(angle) * distance,
          body(p) * (k === 0 ? 0.12 : k === 1 ? 0.065 : 0.012), alpha, k === 0));
      }
    }
  }
  return items;
}
`

const POWER_AURA = `function animate(points, config, time) {${ACCENT_HELPERS}
  var pose = mod(Math.floor(time * 8), 16);
  var branches = [];
  function branch(x, y, angle, size, side, salt) {
    var forward = size * (0.15 + random(salt) * 0.16);
    var cos = Math.cos(angle), sin = Math.sin(angle);
    branches.push(mark(x, y, size * 0.065, 0.9, true));
    branches.push(mark(x + cos * forward - sin * size * 0.43 * side,
      y + sin * forward + cos * size * 0.43 * side, size * 0.04, 0.9, false));
    branches.push(mark(x + cos * forward * 0.35 - sin * size * 0.78 * side,
      y + sin * forward * 0.35 + cos * size * 0.78 * side, size * 0.012, 0.9, false));
  }
  if (length < 0.000001) {
    var tap = at(0), tapSize = body(tap);
    for (var ring = 0; ring <= 16; ring++) {
      var index = ring % 16, angle = index * Math.PI / 8;
      var radius = tapSize * (index % 2 ? 0.64 : 0.88 + random(pose * 31 + index) * 0.2);
      var x = tap.x + Math.cos(angle) * radius, y = tap.y + Math.sin(angle) * radius;
      items.push(mark(x, y, tapSize * 0.085, 0.95, ring === 0));
      if (ring < 16 && ring % 4 === 0) branch(x, y, angle - Math.PI / 2, tapSize * 0.6, 1, pose + index);
    }
    return items.concat(branches);
  }
  var divisions = Math.min(239, Math.max(2, Math.ceil(length / Math.max(6, config.size * 0.55, config.spacing))));
  for (var rail = 0; rail < 2; rail++) {
    var side = rail === 0 ? -1 : 1;
    for (var i = 0; i <= divisions; i++) {
      var p = at(length * i / divisions), size = body(p);
      var edge = i === 0 || i === divisions ? 0.3 : 1;
      var jag = (i % 2 ? -1 : 1) * (0.2 + random(pose * 997 + i * 11 + rail) * 0.24);
      var across = size * side * (0.42 + jag * edge);
      var x = p.x - Math.sin(p.angle) * across, y = p.y + Math.cos(p.angle) * across;
      items.push(mark(x, y, size * (rail === 0 ? 0.085 : 0.06), rail === 0 ? 1 : 0.8, i === 0));
      if (i > 0 && i < divisions && i % 4 === 2) branch(x, y, p.angle, size, side, pose * 73 + i);
    }
  }
  return items.concat(branches);
}
`

const SPARKLE_STAR = `function animate(points, config, time) {${ACCENT_HELPERS}
  var pose = mod(Math.floor(time * 8), 16);
  var divisions = Math.min(95, Math.floor(length / Math.max(14, config.size * 2.8, config.spacing)));
  for (var i = 0; i <= divisions; i++) {
    var p = at(divisions ? length * i / divisions : length / 2);
    var phase = (pose + i * 5 + random(i + 9) * 2) / 16 * Math.PI * 2;
    var twinkle = Math.pow(Math.max(0, Math.cos(phase)), 4);
    var radius = body(p) * (0.55 + 0.45 * twinkle);
    var alpha = 0.35 + 0.65 * twinkle;
    var turn = (random(i + 33) - 0.5) * 0.2;
    // Four tapered arms form a shine; no five-point named-star stamp is used.
    for (var arm = 0; arm < 4; arm++) {
      var angle = turn + arm * Math.PI / 2;
      var reach = radius * (arm % 2 ? 0.95 : 0.68);
      for (var k = 0; k < 4; k++) {
        var ratio = k === 0 ? 0 : k === 1 ? 0.18 : k === 2 ? 0.55 : 1;
        var width = radius * (k === 0 ? 0.22 : k === 1 ? 0.14 : k === 2 ? 0.045 : 0.012);
        items.push(mark(p.x + Math.cos(angle) * reach * ratio,
          p.y + Math.sin(angle) * reach * ratio, width, alpha, k === 0));
      }
    }
  }
  return items;
}
`

export const ANIME_ACCENT_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'impactBurst', name: 'Impact Burst', category: 'Anime', renderer: 'line',
    animated: true, size: 40, spacing: 4, color: '#ee7049', opacity: 0.95, stability: 40,
    animationJs: IMPACT_BURST,
    animationTiming: { mode: 'stepped', fps: 12, sourceHash: animationSourceHash(IMPACT_BURST) },
  }),
  createBrushV2({
    id: 'powerAura', name: 'Power Aura', category: 'Anime', renderer: 'line',
    animated: true, size: 22, spacing: 4, color: '#6559e8', opacity: 0.95, stability: 40,
    animationJs: POWER_AURA,
    animationTiming: { mode: 'stepped', fps: 8, sourceHash: animationSourceHash(POWER_AURA) },
  }),
  createBrushV2({
    id: 'sparkleStar', name: 'Sparkle Star', category: 'Anime', renderer: 'line',
    animated: true, size: 30, spacing: 4, color: '#db9a31', opacity: 0.95, stability: 40,
    animationJs: SPARKLE_STAR,
    animationTiming: { mode: 'stepped', fps: 8, sourceHash: animationSourceHash(SPARKLE_STAR) },
  }),
]
