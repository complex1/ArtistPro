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

// Anime line boil: cels are redrawn a few times a second, so the wobble has to
// snap to a low frame rate instead of sliding smoothly, and neighbouring points
// have to move together or the line reads as static instead of ink.
const BOIL = `function animate(points, config, time) {
  var items = [];
  var count = points.length;
  if (count === 0) return items;

  var frame = Math.floor(time * 12);
  var amplitude = config.size * 0.35;

  function noise(cell, salt) {
    var value = Math.sin(cell * 127.1 + salt * 311.7 + frame * 74.7 + seed * 0.017) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  }

  function wobble(along, nodes, salt) {
    var scaled = along * nodes;
    var cell = Math.floor(scaled);
    var fade = scaled - cell;
    fade = fade * fade * (3 - 2 * fade);
    return noise(cell, salt) * (1 - fade) + noise(cell + 1, salt) * fade;
  }

  var shiftX = noise(901, 13) * config.size * 0.12;
  var shiftY = noise(902, 13) * config.size * 0.12;

  for (var i = 0; i < count; i++) {
    var p = points[i];
    var n = i / Math.max(1, count - 1);
    var prev = i > 0 ? points[i - 1] : p;
    var next = i + 1 < count ? points[i + 1] : p;
    var angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    // Ends move least so the stroke keeps the anchors it was drawn with.
    var taper = 0.35 + 0.65 * Math.sin(Math.PI * n);
    var offset = (wobble(n, 5, 1) + wobble(n, 17, 7) * 0.35) * amplitude * taper;
    var width = 0.75 + (wobble(n, 4, 21) + 1) * 0.2;
    items.push({
      x: p.x - Math.sin(angle) * offset + shiftX,
      y: p.y + Math.cos(angle) * offset + shiftY,
      size: config.size * (0.45 + p.pressure * 0.55) * width,
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

// Same boil, but the mark is built from grain instead of a single polyline.
// Each stroke draws one of four textures, picked from its own seed, so a page
// of strokes looks like it was inked with a worn tool rather than cloned.
const TEXTURE_BOIL = `function animate(points, config, time) {
  var items = [];
  var count = points.length;
  if (count === 0) return items;

  var frame = Math.floor(time * 12);

  function fract(value) {
    return value - Math.floor(value);
  }

  // Re-rolled every boil frame, so the grain crawls the way inked texture does.
  function noise(cell, salt) {
    var value = Math.sin(cell * 127.1 + salt * 311.7 + frame * 74.7 + seed * 0.017) * 43758.5453;
    return fract(value) * 2 - 1;
  }

  // No frame term: whatever this returns stays with the stroke for its life.
  function strokeNoise(salt) {
    return fract(Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453);
  }

  function wobble(along, nodes, salt) {
    var scaled = along * nodes;
    var cell = Math.floor(scaled);
    var fade = scaled - cell;
    fade = fade * fade * (3 - 2 * fade);
    return noise(cell, salt) * (1 - fade) + noise(cell + 1, salt) * fade;
  }

  // chalk, dry brush, rough ink, stipple
  var grainCounts = [4, 3, 3, 5];
  var spreads = [0.7, 0.95, 0.5, 1.2];
  var edgeHoles = [0.15, 0.4, 0.1, 0.45];
  var bodyScales = [0.55, 0.55, 0.8, 0.35];
  var bodyHoles = [0.15, 0.36, 0.03, 0.28];
  var floors = [0.35, 0.4, 0.75, 0.3];
  var texture = Math.min(3, Math.floor(strokeNoise(1) * 4));
  var grains = grainCounts[texture];
  var spread = spreads[texture];
  var edgeHole = edgeHoles[texture];
  var bodyScale = bodyScales[texture];
  var bodyHole = bodyHoles[texture];
  var minAlpha = floors[texture];
  var stampIndex = config.stamps.length > 0 ? texture % config.stamps.length : 0;
  var amplitude = config.size * 0.3;

  for (var i = 0; i < count; i++) {
    var p = points[i];
    var n = i / Math.max(1, count - 1);
    var prev = i > 0 ? points[i - 1] : p;
    var next = i + 1 < count ? points[i + 1] : p;
    var angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    var acrossX = -Math.sin(angle);
    var acrossY = Math.cos(angle);
    var taper = 0.35 + 0.65 * Math.sin(Math.PI * n);
    var boil = (wobble(n, 5, 1) + wobble(n, 17, 7) * 0.35) * amplitude * taper;
    var body = config.size * (0.45 + p.pressure * 0.55);
    // Coverage is smooth along the path, so thin ink leaves long streaky
    // holidays instead of the even speckle that per-point noise would give.
    var cover = (wobble(n, 9, 5) + 1) * 0.5;

    for (var g = 0; g < grains; g++) {
      var cell = i * 6 + g;
      var edge = g > 0;
      if (edge && (noise(cell, 13) + 1) * 0.5 < edgeHole) continue;
      if (!edge && cover < bodyHole) continue;
      // Edge grain hugs the rim of the mark rather than filling it evenly.
      var rim = noise(cell, 29);
      var across = edge
        ? (rim < 0 ? -1 : 1) * (0.35 + Math.abs(rim) * 0.65) * body * spread
        : noise(cell, 29) * body * 0.2;
      var slide = noise(cell, 53) * config.spacing * 0.6;
      var scale = edge
        ? 0.2 + (noise(cell, 71) + 1) * 0.125
        : bodyScale * (0.8 + (noise(cell, 71) + 1) * 0.1);
      var alpha = minAlpha + (noise(cell, 97) + 1) * 0.5 * (1 - minAlpha);
      items.push({
        x: p.x + acrossX * (boil + across) + Math.cos(angle) * slide,
        y: p.y + acrossY * (boil + across) + Math.sin(angle) * slide,
        size: Math.max(0.5, body * scale),
        rotation: angle,
        opacity: config.opacity * alpha * (edge ? 0.4 + cover * 0.6 : 1),
        color: config.color,
        stampIndex: stampIndex,
        kind: "stamp",
        blur: config.blurRadius,
        glow: config.glow,
        shadow: config.shadow
      });
    }
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
    id: 'boil',
    name: 'Line Boil',
    category: 'Motion',
    renderer: 'line',
    animated: true,
    spacing: STROKE_SPACING,
    stability: 55,
    animationJs: BOIL,
  }),
  createBrushV2({
    id: 'textureBoil',
    name: 'Textured Boil',
    category: 'Texture',
    renderer: 'stamp',
    animated: true,
    stamps: ['dot'],
    size: 16,
    opacity: 0.9,
    spacing: 5,
    stability: 55,
    animationJs: TEXTURE_BOIL,
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
