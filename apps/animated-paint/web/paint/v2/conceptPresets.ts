import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Embed helpers in each recipe so brush JSON remains portable.
const PATH_HELPERS = `
  var items = [];
  if (!points.length) return items;
  function mod(value, period) { return ((value % period) + period) % period; }
  function random(cell, salt) {
    var value = Math.sin(cell * 127.1 + salt * 311.7 + seed * 0.017) * 43758.5453;
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
    if (path.length === 1) return { x: path[0].x, y: path[0].y,
      pressure: path[0].pressure, velocity: path[0].velocity, angle: 0 };
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
      velocity: a.velocity + (b.velocity - a.velocity) * mix,
      angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function body(p) { return config.size * (0.35 + p.pressure * 0.65); }
  function mark(p, width, alpha, color, first) {
    return { x: p.x, y: p.y, size: Math.max(0.1, width), rotation: p.angle,
      opacity: config.opacity * alpha, color: color || config.color,
      stampIndex: 0, kind: "segment", breakBefore: first,
      blur: config.blurRadius, glow: config.glow, shadow: config.shadow };
  }
  function local(p, along, across) {
    return { x: p.x + Math.cos(p.angle) * along - Math.sin(p.angle) * across,
      y: p.y + Math.sin(p.angle) * along + Math.cos(p.angle) * across, angle: p.angle };
  }
`

const ZIPPER_INK = `function animate(points, config, time) {${PATH_HELPERS}
  var count = Math.min(128, Math.max(1, Math.ceil(length / Math.max(5, config.spacing, config.size * 0.45)) + 1));
  var phase = mod(time, 4) / 4 * Math.PI * 2 + random(0, 9) * Math.PI * 2;
  for (var i = 0; i < count; i++) {
    var d = count > 1 ? length * i / (count - 1) : 0;
    var p = at(d), width = body(p);
    var opening = Math.pow(0.5 + 0.5 * Math.sin(d / Math.max(30, config.size * 5) - phase), 2);
    for (var side = -1; side <= 1; side += 2) {
      var shift = side * width * 0.12;
      var outer = side * width * (0.5 + opening * 0.65);
      var inner = side * width * (0.02 + opening * 0.65);
      var tip = Math.max(0.45, width * 0.12);
      // Separate hooked teeth interlock when closed; there is no solid core.
      items.push(mark(local(p, shift - width * 0.16, outer), tip, 1, config.color, true));
      items.push(mark(local(p, shift - width * 0.16, inner), tip, 1, config.color, false));
      items.push(mark(local(p, shift + width * 0.16, inner), tip, 1, config.color, false));
    }
  }
  return items;
}
`

const LIVING_STITCH = `function animate(points, config, time) {${PATH_HELPERS}
  var gap = Math.max(6, config.spacing, config.size * 0.85);
  var count = Math.min(96, Math.max(1, Math.ceil(length / gap) + 1));
  var phase = mod(time, 3) / 3 * Math.PI * 2 + random(0, 17) * Math.PI * 2;
  for (var i = 0; i < count; i++) {
    var d = count > 1 ? length * i / (count - 1) : 0;
    var p = at(d), width = body(p);
    var loose = 0.5 + 0.5 * Math.sin(d / Math.max(30, config.size * 4) - phase);
    // Thread endpoints stay anchored while each short arc pulls taut and relaxes.
    for (var j = 0; j <= 5; j++) {
      var u = j / 5;
      var along = (u - 0.5) * width * 0.55 + Math.sin(u * Math.PI) * width * 0.42 * loose;
      var across = (u - 0.5) * width * 0.9;
      items.push(mark(local(p, along, across), Math.max(0.4, width * (0.055 + loose * 0.035)),
        0.92, config.color, j === 0));
    }
  }
  return items;
}
`

// Reusable alpha stamps avoid per-particle blur and support selected ink colors.
const FIREFLY_SHAPE = `shape:data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="g"><stop offset="0" stop-color="white"/><stop offset=".12" stop-color="white"/><stop offset=".24" stop-color="white" stop-opacity=".65"/><stop offset=".55" stop-color="white" stop-opacity=".15"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#g)"/></svg>')}`
const PIXEL_SHAPE = `shape:data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="white" d="M0 0H32V32H0Z"/></svg>')}`

const FIREFLY_TRAIL = `function animate(points, config, time) {${PATH_HELPERS}
  var settings = config.particle;
  var spawn = Math.max(0, Math.min(8, settings.spawn));
  if (!spawn) return items;
  var count = Math.min(96, Math.max(1, Math.ceil(Math.max(1, length / Math.max(14, config.spacing, config.size * 1.4)) * settings.count * spawn)));
  var lifetime = Math.max(0.1, settings.lifetime);
  var phase = mod(time, lifetime) / lifetime * Math.PI * 2;
  var travel = Math.min(100, Math.max(0, settings.velocity)) * 0.35;
  // One fixed stamp dimension per stroke keeps the tint cache small.
  var diameter = Math.max(4, Math.round(config.size / 4) * 4);
  for (var i = 0; i < count; i++) {
    var p = at(length * (i + random(i, 19)) / count);
    var offset = random(i, 23) * Math.PI * 2;
    var theta = phase + offset;
    var q = local(p, Math.sin(theta) * travel,
      (random(i, 29) - 0.5) * config.size * 2 + Math.cos(theta * 2) * travel * 0.6);
    q.y += Math.max(-400, Math.min(400, settings.gravity)) * 0.02 * (1 - Math.cos(theta));
    var blink = Math.pow(0.5 + 0.5 * Math.sin(theta + random(i, 31) * Math.PI), 3);
    var item = mark(q, diameter, 0.12 + blink * 0.88, config.color, false);
    item.kind = "particle";
    item.rotation = 0;
    item.scaleX = item.scaleY = (0.65 + p.pressure * 0.35) * (0.75 + random(i, 37) * 0.45);
    items.push(item);
  }
  return items;
}
`

const PIXEL_MELT = `function animate(points, config, time) {${PATH_HELPERS}
  var cell = Math.max(2, config.size / 3);
  var count = Math.min(64, Math.max(1, Math.ceil(length / Math.max(cell, config.spacing)) + 1));
  var phase = mod(time, 4) / 4 * Math.PI * 2 + random(0, 41) * Math.PI * 2;
  for (var i = 0; i < count; i++) {
    var d = count > 1 ? length * i / (count - 1) : 0;
    var p = at(d);
    for (var row = -1; row <= 1; row++) {
      var key = i * 3 + row + 1;
      var theta = phase - d / Math.max(40, config.size * 5) + random(key, 43) * 0.65;
      var melt = Math.pow(0.5 + 0.5 * Math.sin(theta), 3);
      var q = local(p, 0, row * cell);
      // Screen-aligned blocks fall below their rest positions, then rebuild.
      q.x = Math.round(q.x / cell) * cell + (random(key, 47) - 0.5) * cell * melt;
      q.y = Math.round(q.y / cell) * cell + melt * config.size * (1.2 + random(key, 53) * 1.8);
      var item = mark(q, cell, 1 - melt * 0.72, config.color, false);
      item.kind = "stamp";
      item.rotation = 0;
      item.scaleX = item.scaleY = (0.65 + p.pressure * 0.35) * (1 - melt * 0.35);
      items.push(item);
    }
  }
  return items;
}
`

export const CONCEPT_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'zipperInk', name: 'Zipper Ink', category: 'Funky', renderer: 'line',
    animated: true, size: 18, spacing: 6, color: '#536a88', animationJs: ZIPPER_INK,
  }),
  createBrushV2({
    id: 'livingStitch', name: 'Living Stitch', category: 'Texture', renderer: 'line',
    animated: true, size: 20, spacing: 10, color: '#a64d68', animationJs: LIVING_STITCH,
  }),
  createBrushV2({
    id: 'fireflyTrail', name: 'Firefly Trail', category: 'Particles', renderer: 'particle',
    animated: true, size: 18, spacing: 16, color: '#b39419', animationJs: FIREFLY_TRAIL,
    stamps: [FIREFLY_SHAPE], particle: { count: 2, lifetime: 3, velocity: 35, gravity: 0, spawn: 1 },
  }),
  createBrushV2({
    id: 'pixelMelt', name: 'Pixel Melt', category: 'FX', renderer: 'stamp',
    animated: true, size: 21, spacing: 5, color: '#6a56b5', animationJs: PIXEL_MELT,
    stamps: [PIXEL_SHAPE],
  }),
]
