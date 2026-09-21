import { animationSourceHash } from './core/animationTiming'
import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Recipes embed their helpers so exported brush JSON has no module dependencies.
// Arc-length sampling gives sparse and dense input the same coverage, while the
// explicit per-recipe caps keep even very long strokes below the draw budget.
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
`

const COLOR_HELPERS = `
  // The color picker supplies hex. Other CSS colors remain usable as the base
  // and fall back to unshifted highlights rather than an unrelated palette.
  function tint(color, target, amount) {
    var hex = color.replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.replace(/./g, function(c) { return c + c; });
    if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
    var output = "#";
    for (var c = 0; c < 3; c++) {
      var channel = parseInt(hex.slice(c * 2, c * 2 + 2), 16);
      var value = Math.round(channel + (target[c] - channel) * amount);
      output += (value < 16 ? "0" : "") + value.toString(16);
    }
    return output;
  }
`

const CHROMATIC_ECHO = `function animate(points, config, time) {${PATH_HELPERS}${COLOR_HELPERS}
  var phase = (mod(time, 3.6) / 3.6 + random(0, 11)) * Math.PI * 2;
  var separation = Math.pow(0.5 - 0.5 * Math.cos(phase), 1.7);
  var colors = [tint(config.color, [105, 203, 224], 0.5),
    tint(config.color, [233, 111, 169], 0.5), config.color];
  var divisions = length < 0.000001 ? 0 : Math.min(319, Math.max(1, Math.ceil(length / Math.max(3, config.spacing))));
  // Two restrained color copies separate and reunite behind a stable ink core.
  // Each copy is a separate contour: no diagonal bridge joins its end to the next.
  for (var pass = 0; pass < 3; pass++) {
    var side = pass === 0 ? -1 : pass === 1 ? 1 : 0;
    for (var i = 0; i <= divisions; i++) {
      var p = at(divisions ? length * i / divisions : 0);
      var across = side * config.size * 0.65 * separation;
      var slide = side * config.size * 0.12 * separation;
      p.x += -Math.sin(p.angle) * across + Math.cos(p.angle) * slide;
      p.y += Math.cos(p.angle) * across + Math.sin(p.angle) * slide;
      items.push(mark(p, body(p) * (side ? 0.9 : 1), side ? 0.6 : 0.94, colors[pass], i === 0));
    }
  }
  return items;
}
`

const IRIDESCENT_RIBBON = `function animate(points, config, time) {${PATH_HELPERS}${COLOR_HELPERS}
  var phase = mod(time, 4) / 4 * Math.PI * 2 + random(0, 17) * Math.PI * 2;
  var colors = [config.color, tint(config.color, [156, 229, 236], 0.62),
    tint(config.color, [255, 229, 245], 0.82)];
  var divisions = length < 0.000001 ? 0 : Math.min(319, Math.max(1, Math.ceil(length / Math.max(3, config.spacing))));
  // A broad ink body stays fixed. Two narrow highlights travel along it, using
  // only three color swatches rather than cycling through a rainbow spectrum.
  for (var pass = 0; pass < 3; pass++) {
    for (var i = 0; i <= divisions; i++) {
      var d = divisions ? length * i / divisions : 0;
      var p = at(d), width = body(p);
      var light = Math.pow(0.5 + 0.5 * Math.cos(d / 65 - phase + p.angle * 0.7 + pass * 0.8), 5);
      var across = pass === 1 ? width * 0.12 : pass === 2 ? -width * 0.12 : 0;
      p.x -= Math.sin(p.angle) * across;
      p.y += Math.cos(p.angle) * across;
      items.push(mark(p, width * (pass === 0 ? 1 : pass === 1 ? 0.48 : 0.18),
        pass === 0 ? 1 : 0.08 + light * (pass === 1 ? 0.55 : 0.82), colors[pass], i === 0));
    }
  }
  return items;
}
`

const SCATTERED_PENCIL = `function animate(points, config, time) {${PATH_HELPERS}
  var pose = mod(Math.floor(time * 7), 21);
  // The stroke is made entirely from closely packed, disconnected pencil marks.
  // More stations replace the old solid core without raising the 960-item cap.
  var gap = Math.max(2, config.size * 0.25, config.spacing * 0.8, length / 239);
  var count = length < 0.000001 ? 1 : Math.min(240, Math.ceil(length / gap) + 1);
  for (var j = 0; j < count; j++) {
    var distance = count > 1 ? length * j / (count - 1) : 0;
    var p = at(distance);
    var speedWidth = 0.7 + 0.3 / (1 + Math.max(0, p.velocity) / 550);
    var width = body(p) * speedWidth;
    var cell = Math.floor(distance / Math.max(2, config.size * 0.25));
    for (var scratch = 0; scratch < 2; scratch++) {
      var key = cell * 3 + scratch;
      if (scratch && random(key, 3) > 0.25 + p.pressure * 0.7) continue;
      var across = (random(key, 5) - 0.5) * width * 0.34;
      across += (random(key, 101 + pose) - 0.5) * width * 0.08;
      var slide = (random(key, 7) - 0.5) * Math.min(gap, config.size) * 0.5;
      var angle = p.angle + (random(key, 11) - 0.5) * 0.48;
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

const SPEED_TAPER = `function animate(points, config, time) {${PATH_HELPERS}
  var divisions = length < 0.000001 ? 0 : Math.min(479, Math.max(1, Math.ceil(length / Math.max(2, config.spacing))));
  var taperDistance = Math.min(length * 0.18, config.size * 2.8 + 9);
  var phase = mod(time, 3) / 3 * Math.PI * 2 + random(0, 29) * Math.PI * 2;
  for (var i = 0; i <= divisions; i++) {
    var d = divisions ? length * i / divisions : 0;
    var p = at(d);
    // Velocity is recorded in canvas pixels/second, so mouse gestures also work.
    // A broad swell travels down the stroke as the timeline plays. Recorded
    // velocity and pressure shape the base width; the path itself stays fixed.
    var speedWidth = 0.23 + 0.77 / (1 + Math.max(0, p.velocity) / 430);
    var along = length > 0 ? d / length : 0;
    var swell = 0.5 + 0.5 * Math.cos(along * Math.PI * 2 - phase);
    var animatedWidth = 0.35 + 1.1 * swell;
    var edge = taperDistance > 0 ? Math.min(1, Math.min(d, length - d) / taperDistance) : 1;
    var taper = 0.14 + 0.86 * Math.sin(edge * Math.PI / 2);
    items.push(mark(p, body(p) * speedWidth * taper * animatedWidth, 1, config.color, i === 0));
  }
  return items;
}
`

export const EXPRESSIVE_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'chromaticEcho', name: 'Chromatic Echo', category: 'FX',
    renderer: 'line', animated: true, size: 9, spacing: 3,
    color: '#574782', opacity: 0.95, stability: 45, animationJs: CHROMATIC_ECHO,
  }),
  createBrushV2({
    id: 'iridescentRibbon', name: 'Iridescent Ribbon', category: 'FX',
    renderer: 'ribbon', animated: true, size: 24, spacing: 3,
    color: '#7563a9', opacity: 1, stability: 50, animationJs: IRIDESCENT_RIBBON,
  }),
  createBrushV2({
    id: 'scatteredPencil', version: 2, name: 'Scattered Pencil', category: 'Texture',
    renderer: 'line', animated: true, size: 18, spacing: 3,
    color: '#4c4540', opacity: 0.85, stability: 35, animationJs: SCATTERED_PENCIL,
    animationTiming: { mode: 'stepped', fps: 7, sourceHash: animationSourceHash(SCATTERED_PENCIL) },
  }),
  createBrushV2({
    id: 'speedTaper', version: 2, name: 'Speed Taper', category: 'Texture',
    renderer: 'line', animated: true, size: 22, spacing: 3,
    color: '#31364e', opacity: 1, stability: 40, animationJs: SPEED_TAPER,
  }),
]
