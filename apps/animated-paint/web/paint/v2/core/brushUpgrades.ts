import { PLAYFUL_BRUSHES } from '../playfulPresets'
import { ORGANIC_BRUSHES } from '../organicPresets'
import { PREVIOUS_SCRIBBLE_SOURCE, PREVIOUS_DRY_BRISTLE_SOURCE, PREVIOUS_DRY_BRISTLE_V2_SOURCE } from './previousInkRecipes'
import { EXPRESSIVE_BRUSHES } from '../expressivePresets'
import { animationSourceHash } from './animationTiming'
import type { BrushV2 } from './types'

// Keep the complete previous recipe: a matching id or short hash alone must
// never replace somebody's edited animation. This snapshot is also the fixture
// for verifying saved version-1 brushes and strokes against the exact old code.
export const PREVIOUS_SCATTERED_PENCIL_SOURCE = String.raw`function animate(points, config, time) {
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

  var pose = mod(Math.floor(time * 7), 21);
  var divisions = length < 0.000001 ? 0 : Math.min(319, Math.max(1, Math.ceil(length / Math.max(3, config.spacing))));
  // The faint core is constant. Short, individually disconnected scratches make
  // a looser texture than graphite grain without redrawing a dense stamp cloud.
  for (var i = 0; i <= divisions; i++) {
    var p = at(divisions ? length * i / divisions : 0);
    var speedWidth = 0.7 + 0.3 / (1 + Math.max(0, p.velocity) / 550);
    items.push(mark(p, body(p) * 0.14 * speedWidth, 0.26, config.color, i === 0));
  }
  var gap = Math.max(4, config.size * 0.4, config.spacing * 1.75, length / 159);
  var count = length < 0.000001 ? 1 : Math.min(160, Math.ceil(length / gap) + 1);
  for (var j = 0; j < count; j++) {
    var distance = count > 1 ? length * j / (count - 1) : 0;
    var p = at(distance), width = body(p);
    var cell = Math.floor(distance / Math.max(4, config.size * 0.4));
    for (var scratch = 0; scratch < 2; scratch++) {
      var key = cell * 3 + scratch;
      if (scratch && random(key, 3) > 0.25 + p.pressure * 0.7) continue;
      var across = (random(key, 5) - 0.5) * width * 1.25;
      across += (random(key, 101 + pose) - 0.5) * width * 0.13;
      var slide = (random(key, 7) - 0.5) * Math.min(gap, config.size);
      var angle = p.angle + (random(key, 11) - 0.5) * 1.15;
      var cx = p.x - Math.sin(p.angle) * across + Math.cos(p.angle) * slide;
      var cy = p.y + Math.cos(p.angle) * across + Math.sin(p.angle) * slide;
      var extent = width * (0.24 + random(key, 13) * 0.5);
      var ink = (0.4 + 0.45 * p.pressure) * (0.75 + random(key, 151 + pose) * 0.25);
      var tip = Math.max(0.35, width * (0.025 + random(key, 19) * 0.03));
      items.push(mark({ x: cx - Math.cos(angle) * extent / 2, y: cy - Math.sin(angle) * extent / 2, angle: angle },
        tip, ink, config.color, true));
      items.push(mark({ x: cx + Math.cos(angle) * extent / 2, y: cy + Math.sin(angle) * extent / 2, angle: angle },
        tip * 0.65, ink, config.color, false));
    }
  }
  return items;
}
`

// Speed Taper version 1 captured width only while drawing. Keep its exact
// source so the animated-width revision also reaches unedited saved strokes.
export const PREVIOUS_SPEED_TAPER_SOURCE = String.raw`function animate(points, config, time) {
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

  var divisions = length < 0.000001 ? 0 : Math.min(479, Math.max(1, Math.ceil(length / Math.max(2, config.spacing))));
  var taperDistance = Math.min(length * 0.18, config.size * 2.8 + 9);
  for (var i = 0; i <= divisions; i++) {
    var d = divisions ? length * i / divisions : 0;
    var p = at(d);
    // Velocity is recorded in canvas pixels/second, so mouse gestures also work.
    // Width is part of the drawing: animation time never changes it afterward.
    var speedWidth = 0.23 + 0.77 / (1 + Math.max(0, p.velocity) / 430);
    var edge = taperDistance > 0 ? Math.min(1, Math.min(d, length - d) / taperDistance) : 1;
    var taper = 0.14 + 0.86 * Math.sin(edge * Math.PI / 2);
    items.push(mark(p, body(p) * speedWidth * taper, 1, config.color, i === 0));
  }
  return items;
}
`

const previousPencilHash = animationSourceHash(PREVIOUS_SCATTERED_PENCIL_SOURCE)
const previousSpeedTaperHash = animationSourceHash(PREVIOUS_SPEED_TAPER_SOURCE)

/** Upgrade only the original built-in recipe; retain every user configuration. */
export function upgradeParsedBrush(brush: BrushV2): BrushV2 {
  const previousInk = brush.id === 'scribble' ? PREVIOUS_SCRIBBLE_SOURCE
    : brush.id === 'dryBristle' ? (brush.version === 2 ? PREVIOUS_DRY_BRISTLE_V2_SOURCE : PREVIOUS_DRY_BRISTLE_SOURCE) : undefined
  if ((brush.version === 1 || (brush.id === 'dryBristle' && brush.version === 2)) && previousInk && brush.animationJs === previousInk) {
    const current = [...PLAYFUL_BRUSHES, ...ORGANIC_BRUSHES].find(preset => preset.id === brush.id)!
    const timing = brush.animationTiming
    const animationTiming = timing?.sourceHash === animationSourceHash(previousInk)
      ? { ...timing, sourceHash: animationSourceHash(current.animationJs) }
      : timing ?? current.animationTiming
    return { ...brush, version: current.version, animationJs: current.animationJs, animationTiming }
  }

  if (brush.id === 'speedTaper' && brush.version === 1 &&
      brush.animationJs === PREVIOUS_SPEED_TAPER_SOURCE) {
    const current = EXPRESSIVE_BRUSHES.find((preset) => preset.id === 'speedTaper')!
    const timing = brush.animationTiming
    // The replacement varies continuously. Never carry the previous recipe's
    // static/settled scheduling authority onto it. Unrelated stale metadata may
    // remain only when it is also stale for the new source.
    const animationTiming = timing && timing.sourceHash !== previousSpeedTaperHash &&
      timing.sourceHash !== animationSourceHash(current.animationJs) ? timing : undefined
    return { ...brush, version: current.version, animationJs: current.animationJs, animationTiming }
  }
  if (brush.id !== 'scatteredPencil' || brush.version !== 1 ||
      brush.animationJs !== PREVIOUS_SCATTERED_PENCIL_SOURCE) return brush
  const current = EXPRESSIVE_BRUSHES.find((preset) => preset.id === 'scatteredPencil')!
  const timing = brush.animationTiming
  // Explicit user timing stays intact. Only a hash that authenticated the old
  // source can authenticate the replacement; already stale metadata stays stale.
  const animationTiming = timing
    ? timing.sourceHash === previousPencilHash
      ? { ...timing, sourceHash: animationSourceHash(current.animationJs) }
      : timing
    : current.animationTiming ? { ...current.animationTiming } : undefined
  return { ...brush, version: current.version, animationJs: current.animationJs, animationTiming }
}
