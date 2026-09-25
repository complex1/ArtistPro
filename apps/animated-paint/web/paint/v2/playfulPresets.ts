import { animationSourceHash } from './core/animationTiming'
import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Helpers travel with exported recipes; all work is capped per stroke.
const HELPERS = `
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
  function stamp(p, width, alpha, color) {
    var item = mark(p, width, alpha, color, false); item.kind = "particle"; return item;
  }
  function countFor(gap, cap) { return Math.min(cap, Math.max(1, Math.ceil(length / Math.max(1, gap)) + 1)); }
  function distanceAt(i, count) { return count > 1 ? length * i / (count - 1) : 0; }
`

const SCRIBBLE = `function animate(points, config, time) {${HELPERS}
  var pose = mod(Math.floor(time * 12), 36);
  var count = countFor(Math.max(3, config.spacing), 240);
  // Independently redraw uneven, crossing contours instead of repeating loops.
  function jitter(d, pass, salt) {
    var position = d / Math.max(4, config.size * 0.65);
    var cell = Math.floor(position), mix = position - cell;
    mix = mix * mix * (3 - 2 * mix);
    return (random(cell + pass * 701, salt + pose * 17) * (1 - mix)
      + random(cell + 1 + pass * 701, salt + pose * 17) * mix - 0.5) * 2;
  }
  for (var pass = 0; pass < 2; pass++) {
    var shift = (random(pass, 100 + pose) - 0.5) * config.size * 0.5;
    for (var i = 0; i < count; i++) {
      var d = distanceAt(i, count), p = at(d), w = body(p);
      var across = jitter(d, pass, 211) * w * 0.7 + shift;
      var q = local(p, jitter(d, pass, 419) * w * 0.35, across);
      items.push(mark(q, Math.max(0.4, w * 0.11), pass ? 0.55 : 0.9, config.color, i === 0));
    }
  }
  return items;
}`

const GOO = `function animate(points, config, time) {${HELPERS}
  var phase = mod(time, 4) / 4 * Math.PI * 2 + random(0, 9) * Math.PI * 2;
  var count = countFor(Math.max(3, config.spacing), 160);
  for (var i = 0; i < count; i++) {
    var d = distanceAt(i, count), p = at(d), wave = Math.sin(d / 55 - phase);
    p.y += wave * config.size * 0.6;
    items.push(mark(p, body(p) * (0.55 + 0.22 * Math.cos(d / 35 + phase)), 1, config.color, i === 0));
  }
  var blobs = countFor(Math.max(12, config.size * 1.3, config.spacing), 64);
  for (var j = 0; j < blobs; j++) {
    var d = distanceAt(j, blobs), p = at(d), theta = phase + random(j, 17) * Math.PI * 2;
    p.y += Math.sin(d / 55 - phase) * config.size * 0.6;
    var q = local(p, Math.cos(theta) * config.size * 0.45, Math.sin(theta) * config.size * 0.35);
    var blob = stamp(q, body(p) * (0.85 + random(j, 23) * 0.35), 1, config.color);
    blob.scaleX = 1.1 + Math.sin(theta) * 0.4;
    blob.scaleY = 1 / blob.scaleX;
    items.push(blob);
  }
  return items;
}`

const PARTICLE = `function animate(points, config, time) {${HELPERS}
  var settings = config.particle, spawn = Math.max(0, Math.min(8, settings.spawn));
  if (!spawn) return items;
  var count = Math.min(160, Math.max(1, Math.ceil(Math.max(1, length / Math.max(12, config.spacing)) * settings.count * spawn)));
  var lifetime = Math.max(0.1, settings.lifetime);
  for (var i = 0; i < count; i++) {
    var p = at(length * (i + random(i, 3)) / count);
    var progress = mod(time / lifetime + random(i, 7), 1), age = progress * lifetime;
    var theta = random(i, 11) * Math.PI * 2 + progress * 1.4;
    var radius = Math.min(400, settings.velocity) * age * (0.4 + random(i, 13) * 0.6);
    var q = local(p, Math.cos(theta) * radius, Math.sin(theta) * radius);
    q.y += Math.max(-400, Math.min(400, settings.gravity)) * age * age * 0.5;
    var fade = Math.min(1, progress / 0.06) * Math.pow(1 - progress, 1.5);
    var item = stamp(q, body(p) * (0.2 + random(i, 19) * 0.3) * (1 - progress * 0.65), fade, config.color);
    item.rotation = theta + p.angle; item.scaleX = 1.8; item.scaleY = 0.55;
    items.push(item);
  }
  return items;
}`

const GLITTER = `function animate(points, config, time) {${HELPERS}
  var count = countFor(Math.max(3, config.spacing, config.size * 0.4), 240);
  var phase = mod(time, 3) / 3 * Math.PI * 2;
  for (var i = 0; i < count; i++) {
    var p = at(distanceAt(i, count)), theta = phase * (1 + i % 3) + random(i, 31) * Math.PI * 2;
    var shine = Math.pow(0.5 + 0.5 * Math.sin(theta), 7);
    var q = local(p, (random(i, 37) - 0.5) * config.size, (random(i, 41) - 0.5) * config.size * 1.5);
    var item = stamp(q, Math.max(2, config.size * 0.45), 0.16 + shine * 0.84, config.color);
    item.rotation = random(i, 43) * Math.PI + Math.sin(theta) * 0.25;
    item.scaleX = (0.2 + shine * 0.8) * (0.5 + p.pressure * 0.5);
    item.scaleY = (0.45 + shine * 0.8) * (0.5 + p.pressure * 0.5);
    items.push(item);
  }
  return items;
}`

const CASCADE = `function animate(points, config, time) {${HELPERS}
  var count = countFor(Math.max(8, config.spacing, config.size * 1.6), 128);
  var phase = mod(time, 4) / 4;
  var hex = config.color.replace(/^#/, "");
  if (hex.length === 3) hex = hex.replace(/./g, function(c) { return c + c; });
  var valid = /^[0-9a-f]{6}$/i.test(hex);
  var r = valid ? parseInt(hex.slice(0, 2), 16) : 0, g = valid ? parseInt(hex.slice(2, 4), 16) : 0, b = valid ? parseInt(hex.slice(4, 6), 16) : 0;
  var origin = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) / (Math.PI * 2);
  function colorAt(hue) {
    if (!valid) return config.color;
    var output = "#";
    for (var c = 0; c < 3; c++) {
      var v = Math.round(140 + 105 * Math.cos((hue - c / 3) * Math.PI * 2));
      output += (v < 16 ? "0" : "") + v.toString(16);
    }
    return output;
  }
  for (var i = 0; i < count; i++) {
    var u = mod(i / count + phase + random(0, 47), 1);
    var p = at(u * length);
    var fade = length > config.size ? Math.min(1, u * 12, (1 - u) * 12) : 1;
    var wave = 0.5 + 0.5 * Math.sin((u - phase * 2) * Math.PI * 2);
    items.push(stamp(p, body(p) * (0.55 + wave * 0.4), fade, colorAt(origin + u - phase * 2)));
  }
  return items;
}`

const CHARCOAL = `function animate(points, config, time) {${HELPERS}
  var count = countFor(Math.max(4, config.spacing, config.size * 0.24), 160);
  var phase = mod(time, 4) / 4 * Math.PI * 2;
  for (var i = 0; i < count; i++) {
    var d = distanceAt(i, count), p = at(d), theta = phase + random(i, 53) * Math.PI * 2;
    var q = local(p, Math.sin(theta) * config.size * 0.05, Math.cos(theta) * config.size * 0.08);
    q.y -= (0.5 + 0.5 * Math.sin(theta)) * config.size * 0.16;
    var item = stamp(q, config.size, (0.32 + p.pressure * 0.32) * (0.8 + Math.sin(theta) * 0.2), config.color);
    item.scaleX = item.scaleY = 0.65 + p.pressure * 0.35;
    item.rotation = p.angle + random(i, 59) * Math.PI;
    items.push(item);
  }
  return items;
}`

const FADED = `function animate(points, config, time) {${HELPERS}
  var pose = mod(Math.floor(time * 12), 36);
  var count = countFor(Math.max(3, config.spacing, config.size * 0.2), 192);
  for (var i = 0; i < count; i++) {
    var p = at(distanceAt(i, count));
    // Fixed fleck geometry with independently changing missing patches.
    var alpha = random(i, 71 + pose) > 0.25 ? 0.45 + random(i, 113 + pose) * 0.5 : 0.04;
    var item = stamp(p, config.size, alpha, config.color);
    item.scaleX = item.scaleY = 0.65 + p.pressure * 0.35;
    item.rotation = random(i, 67) * Math.PI * 2;
    item.stampIndex = Math.floor(random(i, 167 + pose) * 3);
    items.push(item);
  }
  return items;
}`

const DASHED = `function animate(points, config, time) {${HELPERS}
  var period = Math.max(12, config.size * 2.8, config.spacing * 2, length / 80);
  var dash = period * 0.58, offset = mod(time / 2 + random(0, 79), 1) * period;
  for (var start = offset - period; start <= length; start += period) {
    var from = Math.max(0, start), to = Math.min(length, start + dash);
    if (to < from) continue;
    var steps = Math.max(1, Math.min(8, Math.ceil((to - from) / Math.max(2, config.size * 0.35))));
    for (var j = 0; j <= steps; j++) {
      var p = at(from + (to - from) * j / steps);
      items.push(mark(p, body(p) * 0.55, 1, config.color, j === 0));
    }
  }
  if (!items.length && length < period * 0.42) {
    var p = at(length / 2); items.push(mark(p, body(p) * 0.55, 1, config.color, true));
  }
  return items;
}`

const PENCIL = `function animate(points, config, time) {${HELPERS}
  var pose = mod(Math.floor(time * 12), 36);
  var count = countFor(Math.max(2, config.spacing), 180);
  for (var pass = 0; pass < 3; pass++) {
    for (var i = 0; i < count; i++) {
      var d = distanceAt(i, count), p = at(d), w = body(p);
      var cell = Math.floor(d / Math.max(4, config.size));
      var q = local(p, 0, (pass - 1) * w * 0.13 + Math.sin(d / 14 + random(pass, 191 + pose) * 6) * w * 0.08);
      var ink = (0.2 + p.pressure * 0.45) * (0.55 + random(cell + pass * 701, 193 + pose) * 0.45);
      items.push(mark(q, Math.max(0.25, w * 0.07), ink, config.color, i === 0 || random(i + pass * 701, 197) < 0.08));
    }
  }
  return items;
}`

// Small reusable alpha textures; no live blur filters or per-frame image creation.
function grainShape(variant: number, chipped: boolean): string {
  let shapes = ''
  for (let i = 0; i < (chipped ? 95 : 240); i++) {
    const noise = (salt: number) => { const n = Math.sin(i * 127.1 + salt * 311.7 + variant * 47.3) * 43758.5453; return n - Math.floor(n) }
    const x = 4 + noise(1) * 56, y = 4 + noise(2) * 56
    const edge = Math.max(0, 1 - Math.hypot(x - 32, y - 32) / 33)
    if (chipped) shapes += `<path d="M${x} ${y}l${2 + noise(3) * 6} -1 1 ${2 + noise(4) * 5} -5 2Z" fill-opacity="${0.3 + edge * 0.7}"/>`
    else shapes += `<circle cx="${x}" cy="${y}" r="${0.3 + noise(3) * 1.4}" fill-opacity="${edge * (0.25 + noise(4) * 0.7)}"/>`
  }
  return `shape:data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g fill="white">${shapes}</g></svg>`)}`
}
const GLITTER_SHAPE = `shape:data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="white" d="M16 0 20 12 32 16 20 20 16 32 12 20 0 16 12 12Z"/></svg>')}`
function stepped(source: string) { return { mode: 'stepped' as const, fps: 12, sourceHash: animationSourceHash(source) } }
export const PLAYFUL_BRUSHES: BrushV2[] = [
  createBrushV2({ id: 'scribble', version: 2, name: 'Scribble', category: 'Motion', renderer: 'line', animated: true, size: 10, spacing: 3, color: '#4a4058', animationJs: SCRIBBLE, animationTiming: stepped(SCRIBBLE) }),
  createBrushV2({ id: 'gooBlobs', name: 'Goo Blobs', category: 'Funky', renderer: 'particle', animated: true, size: 23, spacing: 4, color: '#77a853', animationJs: GOO }),
  createBrushV2({ id: 'particle', name: 'Particle', category: 'Particles', renderer: 'particle', animated: true, size: 9, spacing: 16, color: '#da753f', animationJs: PARTICLE, particle: { count: 3, lifetime: 2, velocity: 35, gravity: 8, spawn: 1 } }),
  createBrushV2({ id: 'glitter', name: 'Glitter', category: 'Particles', renderer: 'particle', animated: true, size: 14, spacing: 5, color: '#b88a26', animationJs: GLITTER, stamps: [GLITTER_SHAPE] }),
  createBrushV2({ id: 'cascade', name: 'Cascade', category: 'FX', renderer: 'particle', animated: true, size: 11, spacing: 12, color: '#638bd3', animationJs: CASCADE }),
  createBrushV2({ id: 'charcoal', name: 'Charcoal', category: 'Texture', renderer: 'stamp', animated: true, size: 28, spacing: 5, color: '#423d3b', animationJs: CHARCOAL, stamps: [grainShape(1, false)] }),
  createBrushV2({ id: 'faded', name: 'Faded', category: 'Texture', renderer: 'stamp', animated: true, size: 25, spacing: 5, color: '#ae6654', animationJs: FADED, stamps: [grainShape(3, true), grainShape(7, true), grainShape(11, true)], animationTiming: stepped(FADED) }),
  createBrushV2({ id: 'dashed', name: 'Dashed', category: 'Motion', renderer: 'line', animated: true, size: 10, spacing: 4, color: '#507aa2', animationJs: DASHED }),
  createBrushV2({ id: 'pencil', name: 'Pencil', category: 'Texture', renderer: 'line', animated: true, size: 7, spacing: 2, color: '#66606b', animationJs: PENCIL, animationTiming: stepped(PENCIL) }),
]
