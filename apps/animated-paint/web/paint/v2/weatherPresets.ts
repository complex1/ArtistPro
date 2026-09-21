import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// A reusable alpha mask keeps smoke soft without running a blur filter per puff.
// The shape prefix lets the renderer tint the same small asset to the ink color.
const SMOKE_SHAPE = `shape:data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="p"><stop offset="0" stop-color="white" stop-opacity=".86"/><stop offset=".4" stop-color="white" stop-opacity=".55"/><stop offset=".75" stop-color="white" stop-opacity=".17"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#p)"/></svg>')}`

// Exported recipes contain every helper they need. Emitters are distributed by
// path distance, not input samples, and particle budgets cover the entire path.
const HELPERS = `
  var items = [];
  if (!points.length) return items;
  function clamp(value, low, high, fallback) {
    return Math.max(low, Math.min(high, Number.isFinite(value) ? value : fallback));
  }
  function random(index, salt) {
    var value = Math.sin(seed * 0.017 + index * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }
  function mod(value, period) { return ((value % period) + period) % period; }
  function smooth(value) { var v = Math.max(0, Math.min(1, value)); return v * v * (3 - 2 * v); }
  var settings = config.particle || {};
  var lifetime = clamp(settings.lifetime, 0.05, 20, 1);
  var velocity = clamp(settings.velocity, 0, 400, 0);
  var gravity = clamp(settings.gravity, -400, 400, 0);
  var spawn = clamp(settings.spawn, 0, 8, 1);
  if (spawn === 0) return items;
  var density = clamp(settings.count, 1, 64, 1) * spawn;
  var size = clamp(config.size, 0.25, 400, 12);
  var distances = [0];
  for (var n = 1; n < points.length; n++) {
    distances.push(distances[n - 1] + Math.hypot(points[n].x - points[n - 1].x, points[n].y - points[n - 1].y));
  }
  var length = distances[distances.length - 1];
  function at(distance) {
    if (length < 0.000001) return points[0];
    var lo = 1, hi = distances.length - 1;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (distances[mid] < distance) lo = mid + 1; else hi = mid;
    }
    var a = points[lo - 1], b = points[lo];
    var span = distances[lo] - distances[lo - 1];
    var blend = span > 0 ? (distance - distances[lo - 1]) / span : 0;
    return { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend,
      pressure: a.pressure + (b.pressure - a.pressure) * blend };
  }
  var clock = config.animated === false ? 0 : (Number.isFinite(time) ? time : 0);
  function phase(index) {
    return mod(clock / lifetime + random(index, 11), 1);
  }
  function source(index, count) {
    // Stratified locations cover the complete stroke even at the global cap.
    return at(length * (index + random(index, 19)) / count);
  }
  function mark(x, y, width, alpha, rotation) {
    return { x: x, y: y, size: width, rotation: rotation, color: config.color,
      opacity: config.opacity * alpha, stampIndex: 0, kind: "particle",
      blur: config.blurRadius, glow: config.glow, shadow: config.shadow };
  }
`

const RAIN_STREAKS = `function animate(points, config, time) {${HELPERS}
  var gap = Math.max(14, size * 1.5, config.spacing);
  var count = Math.min(144, Math.max(1, Math.ceil(Math.max(1, length / gap) * density)));
  for (var i = 0; i < count; i++) {
    var p = source(i, count);
    var progress = phase(i);
    var age = progress * lifetime;
    var speed = velocity * (0.8 + random(i, 23) * 0.4);
    var wind = speed * 0.18;
    var fade = smooth(progress / 0.08) * smooth((1 - progress) / 0.18);
    var width = size * (0.65 + p.pressure * 0.35) * (0.75 + random(i, 31) * 0.4);
    var item = mark(p.x + (random(i, 37) - 0.5) * size + wind * age,
      p.y + speed * age + gravity * age * age * 0.5, width,
      fade * (0.6 + random(i, 41) * 0.4), -Math.atan2(wind, Math.max(1, speed + gravity * age)));
    // Ellipses keep drops disconnected and eligible for the dot GPU renderer.
    item.scaleX = 0.18;
    item.scaleY = 1.7 + random(i, 47) * 0.9;
    items.push(item);
  }
  return items;
}
`

const SOFT_SMOKE = `function animate(points, config, time) {${HELPERS}
  var gap = Math.max(26, size * 1.4, config.spacing);
  var count = Math.min(72, Math.max(1, Math.ceil(Math.max(1, length / gap) * density)));
  for (var i = 0; i < count; i++) {
    var p = source(i, count);
    var progress = phase(i);
    var age = progress * lifetime;
    var phaseOffset = random(i, 23) * Math.PI * 2;
    var spread = Math.sin(progress * Math.PI * 1.8 + phaseOffset) - Math.sin(phaseOffset);
    var sideways = (random(i, 31) - 0.5) * velocity * age * 0.6 + spread * size * progress * 0.65;
    var rise = velocity * age * (0.7 + random(i, 37) * 0.6);
    var fade = smooth(progress / 0.12) * smooth((1 - progress) / 0.32);
    // Quantize sprite dimensions, leaving expansion and movement smooth through
    // scale. Tint cache keys stay limited to a small set per size and color.
    var expanded = Math.max(4, Math.min(400, size * (0.7 + progress * 1.65)));
    var diameter = Math.max(4, Math.round(expanded / 4) * 4);
    var item = mark(p.x + sideways, p.y - rise + gravity * age * age * 0.5,
      diameter, fade * (0.66 - progress * 0.24) * (0.6 + p.pressure * 0.4), phaseOffset * 0.25);
    item.scaleX = (1.1 + random(i, 43) * 0.15) * expanded / diameter;
    item.scaleY = (0.9 + random(i, 47) * 0.12) * expanded / diameter;
    items.push(item);
  }
  return items;
}
`

export const WEATHER_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'rainStreaks', name: 'Rain Streaks', category: 'Particles',
    renderer: 'particle', animated: true, size: 8, spacing: 20,
    color: '#4d8ab8', opacity: 0.85, stability: 45, animationJs: RAIN_STREAKS,
    particle: { count: 3, lifetime: 1.4, velocity: 74, gravity: 0, spawn: 1 },
  }),
  createBrushV2({
    id: 'softSmoke', name: 'Soft Smoke', category: 'Particles',
    renderer: 'particle', animated: true, size: 28, spacing: 20,
    color: '#74808e', opacity: 0.75, stability: 45, animationJs: SOFT_SMOKE,
    stamps: [SMOKE_SHAPE],
    particle: { count: 3, lifetime: 2.8, velocity: 22, gravity: 0, spawn: 1 },
  }),
]
