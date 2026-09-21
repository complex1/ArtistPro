# Texture, particle, FX, and reveal brush plan

Research and engine review: 2026-09-21. The first eight presets below are now implemented. The remaining entries are proposals. Cost ratings in the research tables are relative engineering estimates, not measured frame-rate or temperature claims.

## Implemented first batch

| Category | Brush | Behavior and rendering limit |
| --- | --- | --- |
| Particles | Rain Streaks | Slanted falling drops with staggered lifetimes and fades; at most 144 elongated dot particles per stroke. |
| Particles | Soft Smoke | Rising, curling, expanding puffs; at most 72 tinted soft image stamps per stroke. No live blur or glow by default. |
| FX | Chromatic Echo | Two colored copies separate behind a stable ink core; at most 960 contour points. |
| FX | Iridescent Ribbon | A broad stable ribbon with two moving highlights from a limited color palette; at most 960 contour points. |
| Reveal | Center Bloom | Grows from the arc-length midpoint to both ends, then holds; finishes 1.5 seconds after the recorded drawing duration at normal speed. |
| Reveal | Dust Reveal | Up to 192 grains gather into the line; each part settles two seconds after its recorded drawing time at normal speed. |
| Texture | Scattered Pencil | Closely packed, disconnected scratches with no solid center line, held at 7 fps; at most 960 items. |
| Texture | Speed Taper | A smooth thick-to-thin swell travels along the stroke in a three-second loop, keeping tapered ends and a velocity/pressure base; up to 480 contour points. |

Particle count, lifetime, velocity, gravity, and spawn are available in the editor and playground. Count and spawn tune emission density; caps still apply to the complete stroke. Color, opacity, size, spacing, and speed remain the common controls. FX highlight colors derive from the selected hex color. Mouse movement supplies velocity; a pressure-sensitive pen also controls width and texture.

The new presets do not enable closed fill. Reveals play once and hold; their speed control adjusts the transition. Speed zero freezes weather/FX/pencil and shows completed reveals. Speed Taper continuously changes width along the timeline; its Speed control adjusts the three-second loop, and speed zero freezes it. Idle gallery cards remain still and animate on hover/focus only.

Recipes and timing metadata travel with saved strokes and exported brush JSON. Main-thread previews and the worker use the same normalized image bitmaps. Export waits for decoded image stamps before its first frame, including the smoke mask. The gallery and playground share sample paths that leave room for weather movement and include pressure/velocity variation. Scattered Pencil version 2 removes the center line and tightens its marks. Reopening a project upgrades only the exact, unedited version-1 builtin recipe while retaining brush settings. Speed Taper version 2 adds continuous timeline width motion and upgrades only the exact original builtin recipe, dropping its obsolete static timing. Long-stroke sampling now distributes the point budget over the whole path and preserves its exact endpoint instead of cutting off the tail.

### Browser validation

The finite fixture at `apps/animated-paint/test/expanded-brushes.html` passed 40 exact main-thread/worker pixel comparisons at forward and backward times, eight motion/holding checks, and transparent smoke PNG export from an empty image cache. The first and later PNG frames match the reference exactly and retain soft alpha.

A 960×600 mixed scene with 40 strokes (five of each new brush, default settings) took 11.26 ms on average and 16.1 ms at worst across 12 measured render calls after one warm-up frame in the local in-app browser. It contained up to 7,646 draw items; reuse rose to 10 strokes after the reveals finished. These are short-run CPU render-call measurements, excluding GPU completion; they do not establish sustained FPS or thermal behavior.

## Research basis

- [Procreate Brush Studio settings](https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings): grain, scatter, taper, speed-dependent size, and color variation suggest expressive marks with controlled variation.
- [Krita Spray engine](https://docs.krita.org/en/reference_manual/brushes/brush_engines/spray_brush_engine.html): particle distribution, tip shape, and color provide a useful vocabulary for sparse particle brushes.
- [Krita Hatching engine](https://docs.krita.org/en/reference_manual/brushes/brush_engines/hatching_brush_engine.html): angle, spacing, and pressure-dependent hatching suggest an ink texture distinct from the current grain brushes.
- [Unity particle color over lifetime](https://docs.unity.com/en-us/engine/6000.3/manual/particle-color): lifetime-driven color and transparency are useful references for smoke and atmospheric particles.
- [Blender Grease Pencil Build modifier](https://docs.blender.org/manual/en/latest/grease_pencil/modifiers/generate/build.html): stroke growth, disappearance, recorded drawing speed, and fading provide references for reveal effects.

The designs below are original adaptations for this app, not claims of identical brushes in those products.

## Particles

Painting sets the emission path. Particles move from that path over time; the brush does not infer surfaces elsewhere in the drawing.

| Proposal | Appearance and use | Engine approach | Estimated cost |
| --- | --- | --- | --- |
| Rain Streaks | Thin falling drops, staggered phases, optional slant. Paint a line above a subject to create a rain curtain. | Seeded short disconnected segments or elongated dot stamps. Compute drop position from lifetime; fade before wraparound to hide resets. | Low–medium |
| Soft Smoke | Puffs rise, spread, curl sideways, and disappear. Useful for chimneys, steam, and magical smoke. | A few reused soft alpha stamps with bounded emitters, controlled drift, and expanding size. Requires a small stamp asset, not a fluid simulator. | Medium; test overlap carefully |
| Snow Drift | Flakes descend at varied speeds while gently wandering sideways. | Seeded dots/ellipses with slow periodic drift and a finite lifetime. | Low |
| Confetti Flutter | Colored fragments fall and appear to tumble as they rotate and narrow. | Sparse colored segments or stamps; rotation and aspect changes suggest depth without 3D geometry. | Low–medium |

Suggested later controls: density, lifetime, travel distance, direction/wind. First presets can use current size, opacity, speed, spacing, and particle parameters; independent named controls require model and inspector additions.

## FX

These expand beyond the existing full-spectrum Rainbow and glowing Neon Fuse.

| Proposal | Appearance and use | Engine approach | Estimated cost |
| --- | --- | --- | --- |
| Chromatic Echo | Colored edge copies briefly separate and reunite, like a print registration shift. | Two or three offset versions of a path, with restrained colors and opacity. | Medium; multiplies path drawing |
| Iridescent Ribbon | A narrow moving highlight makes an ink ribbon look pearlescent. | Limited color bands driven by distance along the stroke and tangent direction. A stylized lighting illusion. | Low–medium |
| Thermal Ink | Fresh ink starts bright and warm, cools through orange/violet, then settles to a dark final color. | Per-point age drives a short color progression; mark the recipe settled afterward. | Low after settling |
| Glitch Ink | Short sections briefly shift sideways, change color, or disappear, then snap back. | Seeded held frames and disconnected contours, with a low event frequency. | Low–medium |

Use a palette derived from the selected color initially. Choosing separate highlight/shadow colors or palette stops is a small additional authoring feature, not something the current single-color inspector already supports.

## Reveal

Keep the stroke's shape recognizable while changing how it appears. Default one-shot effects should finish and hold; looping versions should be deliberate separate presets until loop controls exist.

| Proposal | Appearance and use | Engine approach | Estimated cost |
| --- | --- | --- | --- |
| Tapered Write & Hold | A pen-like tip draws the line, slows near the end, and leaves the finished stroke visible. | Arc-length or recorded-time reveal with a tapered leading edge and settled final frame. Different from current Draw On's repeating reset. | Low |
| Center Bloom | The line grows from its midpoint toward both ends. | Expand a visible interval over cumulative path length. | Low |
| Dash Assemble | Disconnected pieces appear in a seeded order and connect into the finished line. | Reveal short segment runs; `breakBefore` prevents bridges across hidden gaps. | Low |
| Dust Reveal | A small cloud of grains gathers into the line and leaves it intact. A later dissolve preset can reverse this. | Bounded temporary particles converge to sampled stroke locations, then switch to a stable final mark. | Medium during transition; low afterward |

These are per-stroke reveals. Replaying a whole drawing in its original cross-stroke order needs document-level timing beyond a brush recipe.

## Textures and width dynamics

| Proposal | Appearance and use | Engine approach | Estimated cost |
| --- | --- | --- | --- |
| Scattered Pencil | Closely packed short pencil scratches with gentle motion and no continuous center line. Good for rough sketches and shaded contours. | Seeded scratch segments rather than Graphite Crawl's small grain dabs; pressure changes density and spread. Optional slow redraw. | Medium |
| Crosshatch Ink | Short strokes at one or two angles create illustrated shading. | Sparse disconnected segment pairs with pressure-dependent density; optional held redraw. | Medium |
| Speed Taper | A traveling width swell animates the line; fast gestures remain finer than slow gestures, with tapered ends. | Recorded velocity and pressure shape the base width; timeline time drives a continuous three-second swell. | Low |
| Traveling Swell | Included in the revised Speed Taper. A thick section travels down the stroke while the rest stays thinner. | A smooth size wave along cumulative path distance. Different from Pulse, which scales the whole stroke together. | Low–medium |

The continuing width motion proposed as Traveling Swell is included in Speed Taper. Its geometry stays fixed while its thickness changes.

## First eight implemented

1. Rain Streaks and Soft Smoke.
2. Chromatic Echo and Iridescent Ribbon.
3. Center Bloom and Dust Reveal.
4. Scattered Pencil and Speed Taper.

This batch gives two distinct examples in every requested category. Snow Drift, Confetti Flutter, Thermal Ink, Glitch Ink, Tapered Write & Hold, Dash Assemble, and Crosshatch Ink remain future work.

## Verified engine fit and boundaries

- Recipes receive position, pressure, tilt, timestamp, recorded velocity, a deterministic seed, animation time, and per-stroke age. Outputs support per-mark size, color, opacity, rotation, scale, and disconnected segments. See `web/paint/v2/core/types.ts` and `animation/evaluate.ts` under the Animated Paint app.
- Particle `life`, `vx`, and `vy` fields do not integrate a physics simulation. Scripts compute positions directly from time and seed. Smoke, rain, and snow can use this existing model with repeatable previews and exports.
- Existing authoring controls are enough for initial recipes. Independent palette, wind, duration, density, and loop/once controls need explicit schema/inspector work; do not overload unrelated controls silently.
- Closed fills are matched to specific supported recipes in `core/fill.ts`. New brushes do not inherit filling automatically. Keep fill unavailable for particles, reveals, and disconnected scratches. Continuous width/color brushes can receive separately tested fill profiles later.
- No scene collisions, canvas-pixel sampling, persistent fluid state, or 3D lighting exists in this brush model. Defer smoke interacting with obstacles, rain hitting arbitrary painted objects, wet paint blending, and physical watercolor diffusion.

## Performance and acceptance criteria

- Set particle and emitter budgets per stroke well below the existing 12,000-item hard limit. Emitter count must be capped independently of path length; the existing hard limit is not a total-scene budget.
- Prefer small reused soft images over live blur on every smoke particle. Quantize repeated sprite sizes where this improves reuse. Softness and overlapping transparent puffs still require profiling.
- Hold pencil/hatching redraws around 6–12 fps where visually appropriate. One-shot reveals and Thermal Ink should settle and stop requesting frames. Rain and smoke may remain continuous, subject to the editor's preview cap.
- The optional GPU renderer accelerates eligible plain hex-color dot/ellipse batches. Paths, soft image sprites, effects, and unsupported blends use Canvas2D; do not describe every new particle brush as GPU accelerated.
- Verify fixed seed/time determinism, backward export seeks, long strokes, mixed brush scenes, transparent export, low-speed/zero-speed behavior, and tiny/empty paths.
- Preserve the current hover-only gallery previews. Benchmark representative scenes on the actual system before making speed or thermal claims.
