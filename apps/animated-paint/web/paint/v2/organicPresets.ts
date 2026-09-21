import { animationSourceHash } from './core/animationTiming'
import { createBrushV2 } from './core/defaults'
import type { BrushV2 } from './core/types'

// Embed helpers in each recipe: exported brush JSON must work on its own in the
// playground, without imports or hidden runtime dependencies. Noise is tied to
// distance along the stroke so appending points does not reshuffle old texture.
const HELPERS = `
  var items = [];
  function random(cell, salt) {
    var value = Math.sin(cell * 127.1 + salt * 311.7 + seed * 0.017) * 43758.5453;
    return value - Math.floor(value);
  }
  function noise(position, salt) {
    var cell = Math.floor(position);
    var mix = position - cell;
    mix = mix * mix * (3 - 2 * mix);
    return random(cell, salt) * (1 - mix) + random(cell + 1, salt) * mix;
  }
  function heading(index) {
    var before = points[Math.max(0, index - 1)];
    var after = points[Math.min(points.length - 1, index + 1)];
    return Math.atan2(after.y - before.y, after.x - before.x);
  }
  function mark(x, y, size, alpha, angle) {
    return {
      x: x, y: y, size: size, rotation: angle,
      opacity: config.opacity * alpha, color: config.color,
      stampIndex: 0, kind: "stamp", blur: config.blurRadius,
      glow: config.glow, shadow: config.shadow
    };
  }
  var along = 0;
`

const DRY_BRISTLE = `function animate(points, config, time) {${HELPERS}
  // Six long bristles. Missing ink is fixed; only the hairs flex gently.
  var step = Math.max(1, Math.ceil(points.length * 6 / 12000));
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (i > 0) along += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    if (i % step !== 0) continue;
    var angle = heading(i);
    var nx = -Math.sin(angle), ny = Math.cos(angle);
    var body = config.size * (0.35 + p.pressure * 0.65);
    for (var g = 0; g < 6; g++) {
      var coverage = noise(along / Math.max(8, config.size * 1.8), g + 10);
      if (g !== 2 && coverage < 0.28) continue;
      var flex = Math.sin(time * 1.6 + along * 0.035 + g * 1.7 + random(0, g) * 6.28);
      var across = ((g - 2.5) * 0.17 + (random(1, g) - 0.5) * 0.06) * body;
      across += flex * body * 0.025;
      var width = Math.max(0.4, body * (0.09 + random(2, g) * 0.12));
      var item = mark(p.x + nx * across, p.y + ny * across,
        width, (0.65 + coverage * 0.35) * (0.6 + p.pressure * 0.4), angle);
      item.scaleX = Math.max(1.6, config.spacing * step * 1.8 / width);
      item.scaleY = 0.8;
      items.push(item);
    }
  }
  return items;
}
`

const GRAPHITE_CRAWL = `function animate(points, config, time) {${HELPERS}
  var frame = Math.floor(time * 7);
  var step = Math.max(1, Math.ceil(points.length * 6 / 12000));
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (i % step !== 0) continue;
    var angle = heading(i);
    var nx = -Math.sin(angle), ny = Math.cos(angle);
    var body = config.size * (0.3 + p.pressure * 0.7);
    for (var g = 0; g < 6; g++) {
      var cell = i * 7 + g;
      // Stable grain positions, with a small stepped redraw inside each grain.
      var across = (random(cell, 3) + random(cell, 4) - 1) * body * 0.62;
      across += (random(cell, 41 + frame) - 0.5) * body * 0.13;
      var slide = (random(cell, 8) - 0.5) * config.spacing * step;
      var alpha = (0.45 + random(cell, 53 + frame) * 0.45) * (0.4 + p.pressure * 0.6);
      var item = mark(p.x + nx * across + Math.cos(angle) * slide,
        p.y + ny * across + Math.sin(angle) * slide,
        Math.max(0.35, body * (0.07 + random(cell, 11) * 0.1)),
        alpha, angle + (random(cell, 17) - 0.5) * 0.6);
      item.scaleX = 2 + random(cell, 23) * 2;
      item.scaleY = 0.7;
      items.push(item);
    }
  }
  return items;
}
`

const BREATHING_INK = `function animate(points, config, time) {${HELPERS}
  var step = Math.max(1, Math.ceil(points.length * 5 / 12000));
  var phase = random(0, 101) * Math.PI * 2;
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (i > 0) along += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    if (i % step !== 0) continue;
    var angle = heading(i);
    var nx = -Math.sin(angle), ny = Math.cos(angle);
    var body = config.size * (0.4 + p.pressure * 0.6);
    var breath = 0.5 + 0.5 * Math.sin(time * 1.4 + phase + along / Math.max(16, config.size * 3));
    for (var g = 0; g < 4; g++) {
      var side = g % 2 === 0 ? -1 : 1;
      var feather = noise(along / Math.max(5, config.size * 0.6), g + 31);
      var across = side * body * (0.24 + feather * 0.12 + breath * 0.075);
      var item = mark(p.x + nx * across, p.y + ny * across,
        body * (0.23 + feather * 0.2 + breath * 0.08),
        0.1 + feather * 0.09, angle);
      item.scaleX = 1.35;
      items.push(item);
    }
    // The core never moves: fine lettering retains its shape while edges breathe.
    items.push(mark(p.x, p.y, body * 0.65, 0.9, angle));
  }
  return items;
}
`

const INK_BLOOM = `function animate(points, config, time, age) {${HELPERS}
  var step = Math.max(1, Math.ceil(points.length * 5 / 12000));
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (i > 0) along += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    if (i % step !== 0) continue;
    // Newly drawn parts remain wet even during a long stroke. Stop exactly at
    // three seconds per point, so a dried stroke has no residual shimmer.
    var localAge = Math.max(0, age - (p.t - points[0].t) * config.speed);
    var progress = Math.min(1, localAge / 3);
    var spread = 1 - Math.pow(1 - progress, 3);
    var angle = heading(i);
    var nx = -Math.sin(angle), ny = Math.cos(angle);
    var body = config.size * (0.4 + p.pressure * 0.6);
    for (var g = 0; g < 4; g++) {
      var side = g % 2 === 0 ? -1 : 1;
      var pool = noise(along / Math.max(5, config.size * 0.7), 61 + g);
      var across = side * body * (0.18 + spread * (0.08 + pool * 0.23));
      var item = mark(p.x + nx * across, p.y + ny * across,
        body * (0.18 + spread * (0.12 + pool * 0.3)),
        (0.08 + pool * 0.14) * spread, angle);
      item.scaleX = 1.25;
      items.push(item);
    }
    items.push(mark(p.x, p.y, body * 0.58, 0.95 - spread * 0.12, angle));
  }
  return items;
}
`

const SKETCH_ECHO = `function animate(points, config, time) {${HELPERS}
  var frame = Math.floor(time * 6);
  for (var pass = 0; pass < 2; pass++) {
    along = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (i > 0) along += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
      var angle = heading(i);
      var base = noise(along / Math.max(10, config.size * 5), 73) - 0.5;
      var redraw = noise(along / Math.max(10, config.size * 6), 89 + frame) - 0.5;
      var offset = config.size * (pass === 0 ? base * 0.12 : 0.7 + base * 0.3 + redraw * 0.65);
      var item = mark(p.x - Math.sin(angle) * offset, p.y + Math.cos(angle) * offset,
        config.size * (0.35 + p.pressure * 0.65) * (pass === 0 ? 0.72 : 0.28),
        pass === 0 ? 0.82 : 0.24, angle);
      item.kind = "segment";
      item.breakBefore = i === 0;
      items.push(item);
    }
  }
  return items;
}
`

export const ORGANIC_BRUSHES: BrushV2[] = [
  createBrushV2({
    id: 'dryBristle', name: 'Dry Bristle', category: 'Organic',
    renderer: 'stamp', animated: true, size: 24, spacing: 2,
    color: '#342c26', opacity: 0.9, stability: 45, animationJs: DRY_BRISTLE,
  }),
  createBrushV2({
    id: 'graphiteCrawl', name: 'Graphite Crawl', category: 'Organic',
    renderer: 'stamp', animated: true, size: 18, spacing: 2,
    color: '#373b40', opacity: 0.85, stability: 45, animationJs: GRAPHITE_CRAWL,
    animationTiming: { mode: 'stepped', fps: 7, sourceHash: animationSourceHash(GRAPHITE_CRAWL) },
  }),
  createBrushV2({
    id: 'breathingInk', name: 'Breathing Ink', category: 'Organic',
    renderer: 'stamp', animated: true, size: 22, spacing: 3,
    color: '#283f36', opacity: 0.85, stability: 50, animationJs: BREATHING_INK,
  }),
  createBrushV2({
    id: 'inkBloom', name: 'Ink Bloom', category: 'Organic',
    renderer: 'stamp', animated: true, size: 24, spacing: 3,
    color: '#293b50', opacity: 0.85, stability: 50, animationJs: INK_BLOOM,
    animationTiming: { mode: 'once', settleSeconds: 3, sourceHash: animationSourceHash(INK_BLOOM) },
  }),
  createBrushV2({
    id: 'sketchEcho', name: 'Sketch Echo', category: 'Organic',
    renderer: 'line', animated: true, size: 5, spacing: 3,
    color: '#5b483b', opacity: 0.9, stability: 40, animationJs: SKETCH_ECHO,
    animationTiming: { mode: 'stepped', fps: 6, sourceHash: animationSourceHash(SKETCH_ECHO) },
  }),
]
