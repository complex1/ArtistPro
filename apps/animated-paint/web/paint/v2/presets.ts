import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

const WIGGLE = `function animate(points, config, time) {
  var items = [];
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    var n = i / Math.max(1, points.length - 1);
    var wobble = Math.sin(time * 8 + n * 14) * config.size * 0.5;
    var angle = i + 1 < points.length ? Math.atan2(points[i + 1].y - p.y, points[i + 1].x - p.x) : 0;
    items.push({
      x: p.x - Math.sin(angle) * wobble,
      y: p.y + Math.cos(angle) * wobble,
      size: config.size * (0.4 + p.pressure * 0.6),
      rotation: angle,
      opacity: config.opacity,
      color: config.color,
      kind: "segment",
      blur: config.blurRadius,
      glow: config.glow,
      shadow: config.shadow
    });
  }
  return items;
}
`

const WAVE = `function animate(points, config, time) {
  var items = [];
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    var n = i / Math.max(1, points.length - 1);
    var wave = Math.sin(time * 6 + n * 18) * config.size * 0.7;
    items.push({
      x: p.x,
      y: p.y + wave,
      size: config.size,
      opacity: config.opacity,
      color: config.color,
      kind: "segment",
      glow: config.glow,
      shadow: config.shadow
    });
  }
  return items;
}
`

const PULSE = `function animate(points, config, time) {
  var scale = 0.65 + Math.sin(time * 8) * 0.35;
  return points.map(function (p) {
    return {
      x: p.x,
      y: p.y,
      size: config.size * scale,
      opacity: config.opacity * (0.55 + scale * 0.45),
      color: config.color,
      kind: "segment",
      glow: config.glow * scale,
      shadow: config.shadow
    };
  });
}
`

const FLOW = `function animate(points, config, time) {
  var items = [];
  var count = points.length;
  for (var i = 0; i < count; i++) {
    var n = (i / Math.max(1, count) + time * 0.35) % 1;
    var p = points[Math.floor(n * (count - 1))];
    items.push({
      x: p.x,
      y: p.y,
      size: config.size * (0.5 + (i % 3) * 0.2),
      opacity: 0.35 + (i % 5) * 0.12,
      color: config.color,
      stampIndex: i % Math.max(1, config.stamps.length),
      kind: "stamp",
      glow: config.glow,
      shadow: config.shadow
    });
  }
  return items;
}
`

const RISE = `function animate(points, config, time) {
  var items = [];
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    var life = (time * 0.7 + i * 0.07 + rng()) % 1;
    items.push({
      x: p.x + Math.sin(time * 4 + i) * 6,
      y: p.y - life * config.particle.velocity * 20,
      size: config.size * (1 - life * 0.6),
      opacity: config.opacity * (1 - life),
      color: config.color,
      kind: "particle",
      glow: config.glow,
      shadow: config.shadow,
      life: life
    });
  }
  return items;
}
`

const DRAW_ON = `function animate(points, config, time) {
  var progress = time % 1;
  var end = Math.max(1, Math.floor(points.length * progress));
  return points.slice(0, end).map(function (p) {
    return {
      x: p.x,
      y: p.y,
      size: config.size,
      opacity: config.opacity,
      color: config.color,
      kind: "segment",
      glow: config.glow,
      shadow: config.shadow
    };
  });
}
`

const RAINBOW = `function animate(points, config, time) {
  return points.map(function (p, i) {
    var hue = (i * 12 + time * 80) % 360;
    return {
      x: p.x,
      y: p.y,
      size: config.size,
      opacity: config.opacity,
      color: "hsl(" + hue + " 90% 55%)",
      kind: "segment",
      glow: config.glow,
      shadow: config.shadow
    };
  });
}
`

// Line and ribbon brushes resample tightly so the stroked polyline reads as a
// continuous mark rather than visible vertices.
const STROKE_SPACING = 4

export const BUILTIN_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'round',
    name: 'Round',
    category: 'Basic',
    renderer: 'line',
    spacing: STROKE_SPACING,
  }),
  createBrushV2({
    id: 'marker',
    name: 'Flat Marker',
    category: 'Basic',
    renderer: 'ribbon',
    opacity: 0.75,
    spacing: STROKE_SPACING,
  }),
  createBrushV2({
    id: 'star',
    name: 'Star',
    category: 'Basic',
    renderer: 'stamp',
    stamps: ['star'],
    spacing: 24,
  }),
  createBrushV2({
    id: 'spray',
    name: 'Spray',
    category: 'Basic',
    renderer: 'particle',
    opacity: 0.42,
    scatter: { along: 2, across: 10, seed: 4 },
    particle: { count: 3, lifetime: 1, velocity: 0, gravity: 0, spawn: 1 },
  }),
  createBrushV2({
    id: 'wiggle',
    name: 'Wiggle',
    category: 'Motion',
    renderer: 'line',
    animated: true,
    spacing: STROKE_SPACING,
    animationJs: WIGGLE,
  }),
  createBrushV2({
    id: 'wave',
    name: 'Wave',
    category: 'Motion',
    renderer: 'line',
    animated: true,
    spacing: STROKE_SPACING,
    animationJs: WAVE,
  }),
  createBrushV2({
    id: 'pulse',
    name: 'Pulse',
    category: 'Motion',
    renderer: 'line',
    animated: true,
    glow: 10,
    spacing: STROKE_SPACING,
    animationJs: PULSE,
  }),
  createBrushV2({
    id: 'flow',
    name: 'Flow',
    category: 'Motion',
    renderer: 'stamp',
    stamps: ['dot'],
    spacing: 16,
    animated: true,
    animationJs: FLOW,
  }),
  createBrushV2({
    id: 'fire',
    name: 'Fire',
    category: 'Particles',
    renderer: 'particle',
    animated: true,
    color: '#ff6b1a',
    glow: 14,
    particle: { count: 2, lifetime: 1, velocity: 18, gravity: -12, spawn: 1 },
    animationJs: RISE,
  }),
  createBrushV2({
    id: 'rainbow',
    name: 'Rainbow',
    category: 'FX',
    renderer: 'line',
    animated: true,
    glow: 8,
    spacing: STROKE_SPACING,
    animationJs: RAINBOW,
  }),
  createBrushV2({
    id: 'drawOn',
    name: 'Draw On',
    category: 'Reveal',
    renderer: 'line',
    animated: true,
    speed: 0.4,
    spacing: STROKE_SPACING,
    animationJs: DRAW_ON,
  }),
]

export function getBuiltinBrush(id: string): BrushV2 {
  return BUILTIN_BRUSHES.find((brush) => brush.id === id) ?? BUILTIN_BRUSHES[0]
}

export const ANIMATION_JS_BY_V1: Record<string, string> = {
  wiggle: WIGGLE,
  wave: WAVE,
  pulse: PULSE,
  flow: FLOW,
  rise: RISE,
  rainbow: RAINBOW,
  drawOn: DRAW_ON,
  breathing: PULSE,
  crawl: FLOW,
}
