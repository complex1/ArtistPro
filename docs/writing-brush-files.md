# Writing and importing brush files

A brush file is a JSON snapshot of one brush: mark settings plus optional animation JavaScript. You can author it in the playground, export it, share it, and import it on another machine. Import always creates a **new** brush identity, so the original is never overwritten.

## Export and import in the app

Open **Animated Paint → Playground** (`#/paint/playground`).

**From the library (gallery)**

1. Click **Import brush**.
2. Choose a `.json` file (exports use the name `*.artist-brush.json`).
3. If the file is valid, it is saved locally and the brush editor opens.

**From a brush editor**

- **Export** downloads the current brush as pretty-printed JSON.
- **Import** loads a file the same way as the library, then opens the imported copy.

**From code**

- Export: `JSON.stringify` of a validated brush (see `apps/animated-paint/web/paint/v2/brushTransfer.ts`).
- Import: parse JSON → validate with `parseBrush` → assign a new `id` and `category: "Custom"`.
- Invalid JSON, or a value that is not an object, is rejected (`That file is not a valid brush config.`).

Filename for downloads: the brush name, lowercased, non-alphanumerics replaced with `-`, plus `.artist-brush.json`. Example: `Cloud / Glow` → `cloud-glow.artist-brush.json`.

## File shape

The file is a single JSON object. Missing fields are filled with defaults. Out-of-range numbers are clamped. Unknown extra keys are ignored.

Minimal valid file:

```json
{
  "name": "My brush"
}
```

That becomes a static stamp brush named “My brush”, size 12, color `#111111`.

A complete example (wiggle-style line):

```json
{
  "version": 1,
  "name": "Sideways wiggle",
  "category": "Motion",
  "renderer": "line",
  "animated": true,
  "size": 12,
  "color": "#111111",
  "opacity": 1,
  "stamps": ["dot"],
  "spacing": 4,
  "scatter": { "along": 0, "across": 0, "seed": 1 },
  "stability": 35,
  "blurRadius": 0,
  "glow": 0,
  "shadow": {
    "offsetX": 0,
    "offsetY": 0,
    "blur": 0,
    "color": "#000000",
    "opacity": 0
  },
  "rotation": "followPath",
  "rotationDegrees": 0,
  "stampsPerPoint": 1,
  "drift": 0,
  "distortion": 0,
  "blendMode": "source-over",
  "hardness": 1,
  "particle": {
    "count": 1,
    "lifetime": 1,
    "velocity": 0,
    "gravity": 0,
    "spawn": 1
  },
  "speed": 1,
  "seed": 1,
  "animationJs": "function animate(points, config, time) {\n  var items = [];\n  for (var i = 0; i < points.length; i++) {\n    var p = points[i];\n    var n = i / Math.max(1, points.length - 1);\n    var wobble = Math.sin(time * 8 + n * 14) * config.size * 0.5;\n    var angle = i + 1 < points.length ? Math.atan2(points[i + 1].y - p.y, points[i + 1].x - p.x) : 0;\n    items.push({\n      x: p.x - Math.sin(angle) * wobble,\n      y: p.y + Math.cos(angle) * wobble,\n      size: config.size * (0.4 + p.pressure * 0.6),\n      rotation: angle,\n      opacity: config.opacity,\n      color: config.color,\n      kind: \"segment\",\n      blur: config.blurRadius,\n      glow: config.glow,\n      shadow: config.shadow\n    });\n  }\n  return items;\n}\n"
}
```

`id` in the file is ignored on import. A fresh UUID is always assigned. `category` is reset to `"Custom"` so imported brushes land in the Custom group.

## Field reference

Values below are **as stored in the file** (not the 0–100 labels in some sliders).

| Field | Type | Default | Clamp / allowed | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | new UUID | — | Identity. Replaced on import. |
| `version` | number | `1` | ≥ 1 | Brush schema version. |
| `name` | string | `"Untitled brush"` | — | Display name. |
| `category` | string | `"Custom"` | — | Library grouping. Reset to `"Custom"` on import. |
| `preview` | string | omitted | — | Optional preview data URL. Unused by import itself. |
| `renderer` | string | `"stamp"` | `stamp`, `line`, `ribbon`, `particle` | How static draw items are built. A `stamp` renderer also converts animated `segment` items to stamps before paint. Other renderers preserve the animation's item kinds. |
| `animated` | boolean | `false` | — | `false`: engine builds a static draw list from the path. `true`: `animationJs` runs every frame. |
| `closedPath` | boolean | `false` | supported brushes only | Connect the last point back to the first, with continuous motion around the join. |
| `fill.enabled` | boolean | `false` | supported brushes only | Fill the closed interior. Enabling fill also enables `closedPath`. |
| `fill.outline` | boolean | `true` | — | Keep the brush border when filling. |
| `size` | number | `12` | 0.5–400 | Mark size in pixels. |
| `color` | string | `"#111111"` | — | Fill / stroke color. `#RRGGBB` or any canvas color string (e.g. `hsl(...)`). |
| `opacity` | number | `1` | 0–1 | Base opacity. |
| `stamps` | string[] | `["dot"]` | non-empty after filter | Stamp names or image URLs. See [Stamps](#stamps). |
| `spacing` | number | `10` | 0.5–200 | Resample distance along the path. Line/ribbon brushes typically use `4` so the mark reads as a continuous stroke. Stamp brushes often use a larger value (e.g. `16`–`24`). |
| `scatter.along` | number | `0` | 0–200 | Jitter along the tangent, in pixels. |
| `scatter.across` | number | `0` | 0–200 | Jitter perpendicular to the path, in pixels. |
| `scatter.seed` | number | `1` | finite number | Extra seed for scatter. |
| `stability` | number | `35` | 0–100 | Pointer smoothing while drawing (percent). |
| `blurRadius` | number | `0` | 0–64 | Blur on each mark (px). |
| `glow` | number | `0` | 0–80 | Glow blur (px). |
| `shadow` | object | zeros / `#000000` | see below | Drop shadow. |
| `rotation` | string | `"followPath"` | `fixed`, `followPath`, `random` | Heading used by the **static** draw list. Animated scripts set `rotation` themselves. |
| `rotationDegrees` | number | `0` | −360–360 | Extra rotation applied after animation, in degrees. |
| `stampsPerPoint` | number | `1` | 1–32 (rounded) | Copies per stamp/particle item. Segments stay at 1. Copies cycle through `stamps`. |
| `drift` | number | `0` | 0–200 | Orbital offset (px) animated with time × speed. |
| `distortion` | number | `0` | 0–1 | Random aspect stretch on each copy (`scaleX` / `scaleY`). |
| `blendMode` | string | `"source-over"` | `source-over`, `multiply`, `screen`, `overlay`, `darken`, `lighten` | Canvas composite for this stroke. |
| `hardness` | number | `1` | 0–1 | Edge hardness (authoring). |
| `particle.count` | number | `1` | 1–64 | Particle density (particle renderer). |
| `particle.lifetime` | number | `1` | 0.05–20 | Particle lifetime. |
| `particle.velocity` | number | `0` | 0–400 | Particle speed. Animation can read this (see Fire). |
| `particle.gravity` | number | `0` | −400–400 | Particle gravity. |
| `particle.spawn` | number | `1` | 0–8 | Spawn rate. |
| `speed` | number | `1` | 0–20 | Scales animation time: `time = (elapsedMs / 1000) * speed`. There is no duration or loop mode; your script decides looping (`time % 1`, etc.). |
| `seed` | number | `1` | finite number | Default randomness seed. Each stroke also stores its own seed. |
| `animationJs` | string | empty `animate` that returns `[]` | must declare `function animate` when `animated` is true | See [Animation method](#animation-method). |
| `legacy` | object | omitted | — | Optional bag for migrated v1 fields. |

### Shadow object

| Field | Default | Clamp |
| --- | --- | --- |
| `offsetX` | `0` | −200–200 |
| `offsetY` | `0` | −200–200 |
| `blur` | `0` | 0–64 |
| `color` | `"#000000"` | string |
| `opacity` | `0` | 0–1 |

## Closed paths and fills

In the brush inspector, enable **Closed path** to join the ends, or **Fill enabled** to close and fill together. **Show outline** controls the border independently. These settings work for new strokes and for an existing stroke selected in the editor. Filled interiors can be clicked with Select, including textured gaps. Opening the path disables its fill.

The initial supported brushes are **Round, Flat Marker, Wiggle, Wave, Line Boil, Textured Boil, and Graphite Crawl**. Static line/ribbon brushes use a solid color fill. The animated line brushes use periodic closed-loop variants of their motion, so the join has no disconnected endpoints. Textured Boil and Graphite Crawl use seeded texture tiles clipped to the animated contour, with transparent grain gaps and the brush color. Texture tiles are bounded to 96×96 pixels and held at the recipe's frame rate; their grain-generation cost does not grow with the filled area.

Support for animated brushes is matched against the exact built-in animation source and renderer, not the brush id. Copies and exported/imported versions retain support. Editing the animation source, switching to an unsupported renderer, or replacing a texture brush's original dot stamp disables these controls; arbitrary particle and multi-contour scripts are not inferred as filled polygons. The original open-stroke behavior remains available for all brushes.

```json
{
  "renderer": "line",
  "animated": false,
  "closedPath": true,
  "fill": { "enabled": true, "outline": false }
}
```

Self-crossing shapes use the even-odd fill rule. Fewer than three non-collinear points fall back to a normal visible stroke. Existing brush files without these fields remain open and unfilled. Saving projects, brush export/import, undo/redo, worker preview, and image/video export all use the same settings. Browser software and accelerated canvas backends can differ in edge antialiasing.

## Stamps

`stamps` is an array of strings. The renderer picks `stamps[stampIndex]`.

**Named stamps** (drawn as vector shapes):

- `dot` (or any unrecognized name) — circle
- `star` — five-point star
- `heart` — heart

**Image stamps** are treated as images if the string starts with `data:`, `http`, `blob:`, or `/`. Prefer a **PNG or JPEG data URL** in the file so the brush is self-contained. Remote `http` URLs depend on network and CORS.

**Shape stamps** are image stamps prefixed with `shape:`. The editor converts the art to a grayscale coverage mask (optional invert) and the renderer tints that mask with the brush color.

In the editor, **Upload** or **Draw stamp** opens a config modal. Images are downscaled so the longest edge is 256px and stored as a PNG data URL. A brush can keep several stamps; the left sidebar lists all of them. That keeps local storage small: every stroke copies the whole brush, including stamps.

For stamp-looking marks, set `"renderer": "stamp"` (or `"particle"`). If animation returns `kind: "segment"` on a stamp brush, the engine still converts those items to stamps.

## Animation method

When `animated` is `true`, every frame the engine:

1. Resamples the stroke with `spacing` and `scatter`.
2. Calls `animate(points, config, time, age)` (the fourth argument is optional for existing scripts).
3. Validates the return value into a draw list (max **12_000** items).
4. Applies renderer kind, `stampsPerPoint`, `rotationDegrees`, `drift`, and `distortion`.
5. Paints with Canvas2D.

If `animate` throws, the last good draw list is reused (or a static fallback).

### Signature

```js
function animate(points, config, time, age) {
  return items;
}
```

The name **must** be `animate`. Arrow functions assigned to another name will fail.

| Argument | Meaning |
| --- | --- |
| `points` | Sampled path. Each point: `x`, `y`, `t`, `pressure` (0–1), `tiltX`, `tiltY`, `altitude`, `velocity`. |
| `config` | Full brush snapshot (same fields as this file). Use `config.size`, `config.color`, `config.stamps`, `config.particle`, etc. |
| `time` | Continuous seconds × `config.speed`. Not wrapped. Loop yourself, e.g. `var progress = time % 1`. |
| `age` | Seconds since this stroke started × `config.speed`, clamped to zero. Live strokes use their saved creation time; Playground uses its pausable preview clock. Export and export preview replay all strokes from age zero. |

For a one-shot drying effect, use `Math.min(1, age / 3)`. For ink that dries separately at each point, subtract `(p.t - points[0].t) * config.speed` from `age` first and clamp to zero. Reset animation time in the Playground restarts every preview stroke together. Library cards replay one-shot effects every six seconds.

Also in scope (not parameters):

- `rng()` — seeded random in `[0, 1)`. Prefer this over `Math.random()`. It is reseeded from the stroke seed on every frame, so the *n*th call returns the same number every frame. That is what you want for randomness baked into the stroke; for randomness that changes over time, hash the frame number instead (see [Anime line boil](#patterns)).
- `seed` — numeric seed for this stroke. Every stroke drawn on the canvas or in the playground gets its own random seed, saved with the stroke, so hashing `seed` is how a script varies one stroke from the next without ever changing what an existing stroke looks like. Previews and tests pass a fixed seed instead.
- `Math` — standard Math.

### Runtime and trust

Animation JavaScript runs synchronously in the app. A few global names are shadowed, but this is **not a security sandbox**: globals and dynamic code remain reachable. Only import scripts you trust, and keep animation code to pure number/string/array work. The **24ms** budget reports overruns after execution; it cannot interrupt a stuck script. Compiled functions are cached in a bounded cache, with fresh script-local variables and seeded randomness for every frame.

Use classic `function` / `var` if you want the same style as built-in brushes. ES5 is enough.

### Draw items

Return an **array**. Each item needs numeric `x` and `y`. Invalid entries are dropped.

| Field | Required | Default after parse | Notes |
| --- | --- | --- | --- |
| `x`, `y` | yes | — | Position. |
| `size` | no | `8` | 0.25–400. |
| `kind` | no | `"stamp"` | `stamp`, `segment`, or `particle`. `segment` strokes as a polyline between consecutive segment items. |
| `breakBefore` | no | `false` | Set `true` on the first segment of each separate contour to avoid connecting it to the previous contour. Preserved through draw-list packing. |
| `rotation` | no | `0` | Radians. |
| `opacity` | no | `1` | 0–1. |
| `color` | no | `"#111111"` | |
| `stampIndex` | no | `0` | Index into `config.stamps`. |
| `blur` | no | `0` | 0–64. |
| `glow` | no | `0` | 0–80. |
| `shadow` | no | default shadow | Same shape as brush `shadow`. |
| `life` | no | omitted | Optional particle life 0–1. |
| `vx`, `vy` | no | omitted | Optional velocity. |
| `scaleX`, `scaleY` | no | `1` | 0.05–20. Distortion multiplies these later. |

Copy `config.shadow` onto items if you want the brush shadow to show in animation.

### Patterns

**Static-looking animated stroke** — map every point to a `segment` (line) or `stamp`.

**Looping reveal** — `var progress = time % 1` then `points.slice(0, end)`.

**Wiggle / wave** — offset `x`/`y` with `Math.sin(time * k + n * k2)`.

**Color cycle** — `color: "hsl(" + ((i * 12 + time * 80) % 360) + " 90% 55%)"`.

**Anime line boil** — the shaky, noisy hand-drawn line. Two things make it read as anime rather than as a smooth wave: the wobble snaps to a low frame rate, and neighbouring points move together.

```js
var frame = Math.floor(time * 12); // boil at 12 fps, not per render frame

function noise(cell, salt) {
  var value = Math.sin(cell * 127.1 + salt * 311.7 + frame * 74.7 + seed * 0.017) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

// Value noise along the stroke: pick a random value per node, fade between them.
function wobble(along, nodes, salt) {
  var scaled = along * nodes;
  var cell = Math.floor(scaled);
  var fade = scaled - cell;
  fade = fade * fade * (3 - 2 * fade);
  return noise(cell, salt) * (1 - fade) + noise(cell + 1, salt) * fade;
}
```

Push each point along its normal by `wobble(n, 5, 1) * config.size * 0.35`, add a second `wobble` at a higher node count for finer grain, and scale the result by `0.35 + 0.65 * Math.sin(Math.PI * n)` so the stroke ends stay near where they were drawn. Sampling the noise per point instead of per node — or per render frame instead of per boil frame — gives buzzing static, not ink.

The `boil` built-in (**Line Boil**, Motion) is this script. `speed` scales the boil rate: `0.5` is a 6 fps shoot-on-twos feel, `2` is 24 fps.

**One texture per stroke** — a worn tool leaves a different mark each time you pick it up. Hash the stroke seed *without* the frame number, and the choice is random per stroke but fixed for that stroke's life:

```js
function strokeNoise(salt) {
  var value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

var texture = Math.min(3, Math.floor(strokeNoise(1) * 4));
var stampIndex = config.stamps.length > 0 ? texture % config.stamps.length : 0;
```

Use `texture` to index tables of grain settings, and `stampIndex` to choose among the brush's stamps — so a brush loaded with 3–4 texture PNGs (or `shape:` masks, which get tinted with the brush color) gives each stroke one of them. Roll the choice from `seed` only; rolling it from `time` makes the texture flip while the stroke sits on the canvas.

The `textureBoil` built-in (**Textured Boil**, Texture) combines this with the boil above. It emits one always-present body grain per sampled point plus edge grain that drops out for dry-brush gaps, and carries four settings tables — chalk, dry brush, rough ink, stipple — that differ in grain count, how far grain spreads across the path, dropout rate, and minimum opacity. Swap its `stamps` for your own textures and each stroke picks one.

**Particles** — `kind: "particle"`, fade with `life`, move with `config.particle.velocity` and `rng()`.

**Empty list** — nothing is drawn for that frame. For a static brush, set `"animated": false` and omit custom JS.

### Organic brush recipes

The **Organic** category contains five self-contained scripts in `organicPresets.ts`. Each recipe respects size, color, opacity, speed, and pressure, uses seeded randomness, and limits its output to 12,000 items while covering the full sampled path.

| Brush | Behavior | Starting point for customization |
| --- | --- | --- |
| Dry Bristle | Six narrow ink trails with fixed dry gaps and gently flexing bristles. | Change the coverage threshold and flex amplitude. |
| Graphite Crawl | Dense pencil grain with small redraws at 7 fps. | Change grain spread and redraw rate. |
| Breathing Ink | An anchored core surrounded by slowly breathing feathered edges. | Change edge reach and breathing amplitude. |
| Ink Bloom | Ink spreads for three seconds per point, then stays dry. | Change the drying duration and pooling width; uses `age`. |
| Sketch Echo | A steady primary contour with a faint secondary contour redrawn at 6 fps. | Change echo distance and opacity; uses `breakBefore`. |

These are procedural marks, with no image downloads or extra assets. They can be duplicated, edited, exported, and imported like other brushes. Layer opacity fades the completed layer as a group so overlapping grain retains its texture.

## After `animate`: engine dynamics

These run on the draw list even if you did not mention them in JS:

- **Renderer kind** — stamp brushes convert segment items to stamps so images and named stamps actually paint.
- **Stamps per point** — duplicates stamp/particle items and cycles stamp indices.
- **Angle** — adds `rotationDegrees` (converted to radians).
- **Drift** — `x += cos(elapsed + phase) * drift`, same for `y` with `sin`.
- **Distortion** — random `scaleX` / `scaleY` from `distortion`.

So a file can animate in JS **and** still use speed / drift / distortion sliders without changing the script.

## Hand-authoring checklist

1. Save UTF-8 JSON. Trailing commas are invalid.
2. Put `animationJs` on one string. Use `\n` for newlines, `\"` for quotes inside the script.
3. Set `"animated": true` if the script should run. Otherwise the engine ignores the script and uses the static path.
4. Match `kind` to `renderer`: `segment` + `"line"` or `"ribbon"` for continuous strokes; `stamp` + `"stamp"` for dots/images; `particle` + `"particle"` for spray/fire.
5. Keep spacing small (`4`) for lines; larger for distinct stamps.
6. Prefer data-URL stamps over huge photos.
7. Test by importing, drawing in the playground preview, then **Save brush**.

## Sharing

1. Open the brush → **Export**.
2. Send the `.artist-brush.json` file.
3. Recipient: Playground → **Import brush** (or editor **Import**).
4. They get a Custom copy; they can rename and save.

Imported brushes live in the same app brush library as editor-created ones, saved through the local API. Older `localStorage` libraries are migrated automatically. Brushes are available in the main Animated Paint canvas brush list after save.

## Related code

| Piece | Path |
| --- | --- |
| Import / export | `apps/animated-paint/web/paint/v2/brushTransfer.ts` |
| Validation and clamps | `apps/animated-paint/web/paint/v2/core/schema.ts` |
| Defaults | `apps/animated-paint/web/paint/v2/core/defaults.ts` |
| Built-in animation examples | `apps/animated-paint/web/paint/v2/presets.ts` |
| Organic brush recipes | `apps/animated-paint/web/paint/v2/organicPresets.ts` |
| Animation runtime | `apps/animated-paint/web/paint/v2/animation/evaluate.ts` |
| Frame pipeline | `apps/animated-paint/web/paint/v2/render/engine.ts` |


### Animation timing and preview performance

Brushes may include `animationTiming` metadata for a stepped recipe (`mode: "stepped"`, `fps`), a finite effect (`mode: "once"`, `settleSeconds`), or a recipe whose output depends only on the input and settings (`mode: "static"`). All require `sourceHash`, produced by `animationSourceHash(animationJs)` in `paint/v2/core/animationTiming.ts`. The metadata describes the existing recipe; it does not change how `time` or `age` is evaluated. It must accurately describe every time-dependent output. One-shot settle time is measured after the final input point and is scaled by brush speed. A static recipe still uses `animated: true` so its JavaScript runs when the stroke or settings change; its frame does not request animation ticks.

The engine ignores stale metadata after the source changes, and treats unknown animated recipes as continuous. Drift also prevents a stepped/settled cache from freezing motion. Editing point coordinates in place requires incrementing the stroke's transient `geometryRevision`; replacing the points array or appending points invalidates geometry automatically.

Live editor rendering runs in a worker when available. Keep scripts deterministic and return draw items without relying on DOM APIs or mutating external state. A worker provides scheduling isolation, not a secure sandbox for untrusted JavaScript. GPU grain preview is optional; custom scripts still run as JavaScript and exports retain Canvas2D rendering.
