# Writing and importing brush files

A brush file is a JSON snapshot of one brush: mark settings plus optional animation JavaScript. You can author it in the playground, export it, share it, and import it on another machine. Import always creates a **new** brush identity, so the original is never overwritten.

## Export and import in the app

Open **Paint → Playground** (`#/paint/playground`).

**From the library (gallery)**

1. Click **Import brush**.
2. Choose a `.json` file (exports use the name `*.artist-brush.json`).
3. If the file is valid, it is saved locally and the brush editor opens.

**From a brush editor**

- **Export** downloads the current brush as pretty-printed JSON.
- **Import** loads a file the same way as the library, then opens the imported copy.

**From code**

- Export: `JSON.stringify` of a validated brush (see `src/paint/v2/brushTransfer.ts`).
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
| `renderer` | string | `"stamp"` | `stamp`, `line`, `ribbon`, `particle` | How draw items are painted. If `renderer` is `stamp` or `particle`, `segment` items are converted to stamps/particles before paint. |
| `animated` | boolean | `false` | — | `false`: engine builds a static draw list from the path. `true`: `animationJs` runs every frame. |
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

## Stamps

`stamps` is an array of strings. The renderer picks `stamps[stampIndex]`.

**Named stamps** (drawn as vector shapes):

- `dot` (or any unrecognized name) — circle
- `star` — five-point star
- `heart` — heart

**Image stamps** are treated as images if the string starts with `data:`, `http`, `blob:`, or `/`. Prefer a **PNG or JPEG data URL** in the file so the brush is self-contained. Remote `http` URLs depend on network and CORS.

In the editor, **Upload stamp** downscales the longest edge to 256px and stores a PNG data URL. That keeps local storage small: every stroke copies the whole brush, including stamps.

For stamp-looking marks, set `"renderer": "stamp"` (or `"particle"`). If animation returns `kind: "segment"` on a stamp brush, the engine still converts those items to stamps.

## Animation method

When `animated` is `true`, every frame the engine:

1. Resamples the stroke with `spacing` and `scatter`.
2. Calls `animate(points, config, time)`.
3. Validates the return value into a draw list (max **12_000** items).
4. Applies renderer kind, `stampsPerPoint`, `rotationDegrees`, `drift`, and `distortion`.
5. Paints with Canvas2D.

If `animate` throws, the last good draw list is reused (or a static fallback).

### Signature

```js
function animate(points, config, time) {
  return items;
}
```

The name **must** be `animate`. Arrow functions assigned to another name will fail.

| Argument | Meaning |
| --- | --- |
| `points` | Sampled path. Each point: `x`, `y`, `t`, `pressure` (0–1), `tiltX`, `tiltY`, `altitude`, `velocity`. |
| `config` | Full brush snapshot (same fields as this file). Use `config.size`, `config.color`, `config.stamps`, `config.particle`, etc. |
| `time` | Continuous seconds × `config.speed`. Not wrapped. Loop yourself, e.g. `var progress = time % 1`. |

Also in scope (not parameters):

- `rng()` — seeded random in `[0, 1)`. Same seed + time → same result. Prefer this over `Math.random()`.
- `seed` — numeric seed for this stroke.
- `Math` — standard Math.

### Sandbox

Animation JS cannot use `window`, `document`, `fetch`, `Worker`, `importScripts`, `localStorage`, `sessionStorage`, `indexedDB`, `XMLHttpRequest`, `Function`, or `eval`. Stay in pure number/string/array work. Budget is about **24ms** per stroke per frame; over budget still draws but is flagged.

Use classic `function` / `var` if you want the same style as built-in brushes. ES5 is enough.

### Draw items

Return an **array**. Each item needs numeric `x` and `y`. Invalid entries are dropped.

| Field | Required | Default after parse | Notes |
| --- | --- | --- | --- |
| `x`, `y` | yes | — | Position. |
| `size` | no | `8` | 0.25–400. |
| `kind` | no | `"stamp"` | `stamp`, `segment`, or `particle`. `segment` strokes as a polyline between consecutive segment items. |
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

**Particles** — `kind: "particle"`, fade with `life`, move with `config.particle.velocity` and `rng()`.

**Empty list** — nothing is drawn for that frame. For a static brush, set `"animated": false` and omit custom JS.

## After `animate`: engine dynamics

These run on the draw list even if you did not mention them in JS:

- **Renderer kind** — stamp/particle brushes force non-segment kinds so images and named stamps actually paint.
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

Imported brushes live in the same local brush library as editor-created ones (`localStorage`). They are available in the main Paint canvas brush list after save.

## Related code

| Piece | Path |
| --- | --- |
| Import / export | `src/paint/v2/brushTransfer.ts` |
| Validation and clamps | `src/paint/v2/core/schema.ts` |
| Defaults | `src/paint/v2/core/defaults.ts` |
| Built-in animation examples | `src/paint/v2/presets.ts` |
| Sandbox | `src/paint/v2/animation/evaluate.ts` |
| Frame pipeline | `src/paint/v2/render/engine.ts` |
