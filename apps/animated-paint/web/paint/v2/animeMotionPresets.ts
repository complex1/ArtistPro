import { animationSourceHash } from './core/animationTiming'
import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Every exported recipe includes these helpers. Animation files can therefore
// be shared and evaluated without importing this module or retaining state.
const PATH_HELPERS = `
  var items = [];
  if (!points.length) return items;
  function mod(value, period) { return ((value % period) + period) % period; }
  function random(salt) {
    var value = Math.sin(seed * 0.017 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }
  var path = [points[0]], distances = [0];
  for (var n = 1; n < points.length; n++) {
    var last = path[path.length - 1];
    var span = Math.hypot(points[n].x - last.x, points[n].y - last.y);
    if (span > 0.000001) {
      path.push(points[n]);
      distances.push(distances[distances.length - 1] + span);
    }
  }
  var length = distances[distances.length - 1];
  function at(distance) {
    if (path.length === 1) return { x: path[0].x, y: path[0].y, pressure: path[0].pressure, angle: 0 };
    var d = Math.max(0, Math.min(length, distance));
    var lo = 1, hi = distances.length - 1;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (distances[mid] < d) lo = mid + 1; else hi = mid;
    }
    var a = path[lo - 1], b = path[lo];
    var mix = (d - distances[lo - 1]) / (distances[lo] - distances[lo - 1]);
    return { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix,
      pressure: a.pressure + (b.pressure - a.pressure) * mix,
      angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function body(p) { return config.size * (0.35 + p.pressure * 0.65); }
  function mark(p, size, first) {
    return { x: p.x, y: p.y, size: Math.max(0.1, size), rotation: p.angle,
      opacity: config.opacity, color: config.color, stampIndex: 0,
      kind: "segment", breakBefore: first, blur: config.blurRadius,
      glow: config.glow, shadow: config.shadow };
  }
`

const ANIME_JIGGLE = `function animate(points, config, time) {${PATH_HELPERS}
  var pose = mod(Math.floor(time * 12), 12);
  var phase = (pose / 12 + random(1)) * Math.PI * 2;
  var minX = path[0].x, maxX = minX, minY = path[0].y, maxY = minY;
  for (var j = 1; j < path.length; j++) {
    minX = Math.min(minX, path[j].x); maxX = Math.max(maxX, path[j].x);
    minY = Math.min(minY, path[j].y); maxY = Math.max(maxY, path[j].y);
  }
  var centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  var extent = Math.max(1, maxX - minX, maxY - minY);
  // Keep the outline coherent: move and squash it around one shared centre.
  // Cap displacement for long strokes instead of magnifying the jiggle.
  var angle = Math.min(0.025, config.size * 0.8 / extent) * Math.sin(phase);
  var squash = 1 + Math.min(0.035, config.size / extent) * Math.sin(phase * 2 + 0.6);
  var dx = config.size * 0.2 * Math.sin(phase * 2 + 0.2);
  var dy = config.size * 0.25 * Math.cos(phase);
  var cosine = Math.cos(angle), sine = Math.sin(angle);
  var divisions = length < 0.000001 ? 0 : Math.min(479, Math.max(1, Math.ceil(length / Math.max(3, config.spacing))));
  for (var i = 0; i <= divisions; i++) {
    var u = divisions ? i / divisions : 0;
    var p = at(length * u);
    var x = (p.x - centerX) * squash, y = (p.y - centerY) / squash;
    var flex = i === 0 || i === divisions ? 0 : config.size * 0.025 *
      Math.sin(phase + u * Math.PI * 2) * Math.sin(u * Math.PI);
    p.x = centerX + x * cosine - y * sine + dx - Math.sin(p.angle) * flex;
    p.y = centerY + x * sine + y * cosine + dy + Math.cos(p.angle) * flex;
    items.push(mark(p, body(p), i === 0));
  }
  return items;
}
`

const FOLLOW_THROUGH = `function animate(points, config, time) {${PATH_HELPERS}
  var pose = mod(Math.floor(time * 12), 36);
  var phase = (pose / 36 + random(2)) * Math.PI * 2;
  var root = at(0);
  var divisions = length < 0.000001 ? 0 : Math.min(479, Math.max(1, Math.ceil(length / Math.max(3, config.spacing))));
  for (var i = 0; i <= divisions; i++) {
    var u = divisions ? i / divisions : 0;
    var p = at(length * u);
    // Delay motion toward the free end, with a smaller secondary oscillation.
    // The attachment stays exact even as the rest of the stroke bends.
    var angle = Math.min(0.2, config.size * 3 / Math.max(1, length)) * u * u *
      (Math.sin(phase - u * 1.35) + 0.18 * Math.sin(phase * 2 - u * 2.1));
    var x = p.x - root.x, y = p.y - root.y;
    var flex = config.size * 0.22 * u * u * Math.sin(phase - u * 3);
    p.x = root.x + x * Math.cos(angle) - y * Math.sin(angle) - Math.sin(p.angle) * flex;
    p.y = root.y + x * Math.sin(angle) + y * Math.cos(angle) + Math.cos(p.angle) * flex;
    var taper = divisions ? 0.4 + 0.6 * Math.sqrt(1 - u) : 0.94 + 0.06 * Math.sin(phase);
    items.push(mark(p, body(p) * taper, i === 0));
  }
  return items;
}
`

const SPEED_LINES = `function animate(points, config, time) {${PATH_HELPERS}
  var pose = mod(Math.floor(time * 12), 12);
  var phase = pose / 12;
  var gap = Math.max(96, config.size * 16, config.spacing * 3, length / 72);
  // Three tracks, at most 73 clipped dashes per track and six marks per dash.
  // Spacing grows with the entire path, so the budget never chops off its tail.
  for (var lane = 0; lane < 3; lane++) {
    var across = (lane - 1) * config.size * 0.85;
    var offset = mod(phase + random(3) + lane * 0.21, 1) * gap;
    if (length <= gap * 0.55) {
      var divisions = length < 0.000001 ? 0 : 3;
      for (var k = 0; k <= divisions; k++) {
        var u = divisions ? k / divisions : 0.5;
        var p = at(length * (divisions ? u : 0));
        p.x -= Math.sin(p.angle) * across;
        p.y += Math.cos(p.angle) * across;
        var pulse = 0.9 + 0.1 * Math.sin((phase + random(3) + lane * 0.21) * Math.PI * 2);
        items.push(mark(p, body(p) * (0.08 + 0.42 * Math.sin(Math.PI * u)) * pulse, k === 0));
      }
      continue;
    }
    for (var dash = -1; dash <= Math.ceil(length / gap); dash++) {
      var tail = dash * gap + offset - gap * 0.32;
      var head = tail + gap * 0.56;
      var start = Math.max(0, tail), end = Math.min(length, head);
      if (end <= start) continue;
      for (var k = 0; k <= 5; k++) {
        var d = start + (end - start) * k / 5;
        var u = (d - tail) / (head - tail);
        var p = at(d);
        p.x -= Math.sin(p.angle) * across;
        p.y += Math.cos(p.angle) * across;
        // A thin tail grows into a broad shoulder before the pointed head.
        var taper = u < 0.8 ? 0.06 + u * 0.6 : 0.54 * (1 - u) / 0.2 + 0.02;
        items.push(mark(p, body(p) * taper, k === 0));
      }
    }
  }
  return items;
}
`

function steppedBrush(id: string, name: string, size: number, color: string, animationJs: string): BrushV2 {
  return createBrushV2({
    id, name, category: 'Anime', renderer: 'line', animated: true,
    size, spacing: 3, color, opacity: 1, stability: 45, animationJs,
    animationTiming: { mode: 'stepped', fps: 12, sourceHash: animationSourceHash(animationJs) },
  })
}

export const ANIME_MOTION_BRUSHES: BrushV2[] = [
  steppedBrush('animeJiggle', 'Anime Jiggle', 6, '#29253d', ANIME_JIGGLE),
  steppedBrush('followThrough', 'Follow Through', 10, '#6858a6', FOLLOW_THROUGH),
  steppedBrush('speedLines', 'Speed Lines', 8, '#30598d', SPEED_LINES),
]
