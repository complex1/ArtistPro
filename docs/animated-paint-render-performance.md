# Animated Paint render performance review

Reviewed and implemented 2026-09-21 after adding the five Organic brushes. The original baseline and plan are preserved below; this section records what shipped.

## Implemented

- **Cached geometry and frames:** completed sampled paths and held draw lists are reused. Static, stepped and settled strokes can reuse cropped raster images while preserving painter order, layer opacity and masks. Each destination has a 64 MiB estimated frame/raster cache budget, evicted on deletion and cleared on disposal/resize. This is a cache budget, not a total process-memory ceiling; document assets and browser/GPU allocations are additional.
- **Less per-frame work:** packed arrays are lazy, inactive dynamics take a fast path, tinted stamp variants have a 16 MiB cache, and animation error fallbacks have a bounded weak-reference window.
- **Animation scheduling:** source-validated timing metadata declares Graphite (7 fps), Sketch Echo (6 fps), the two Boil brushes (12 fps), and Ink Bloom (settles after the final point dries). Speed and drift are respected. Existing snapshots are recognized by exact built-in source; edited/unknown scripts stay continuous. Static scenes sleep until invalidated, hidden tabs pause, offscreen gallery cards pause, and the editor pauses under export. Export preview pauses while encoding.
- **Worker rendering:** the editor uses one persistent worker and OffscreenCanvas. Changed strokes and appended point tails cross the boundary, with at most one frame in flight and one replaceable pending request. Raster/image assets are transferred only when changed. Stale frame bitmaps are closed. Pointer feedback and selection remain on the main thread. Environments without the required APIs use Canvas2D on the main thread. Worker errors/timeouts pause the preview rather than retrying potentially stuck custom JS on the main thread.
- **Optional GPU grain preview:** WebGL2 batches circular/elliptical stamps in original order. Paths, image stamps, effects and unsupported compositing use Canvas2D. The GPU renderer intentionally does not create a cropped raster per grain stroke: that extra readback made changed Graphite frames slower in the first implementation. Tiny-grain coverage uses supersampling at edges. GPU antialiasing is not pixel-identical to Canvas2D, so it is opt-in, and exports use Canvas2D.
- **Controls:** the inspector defaults to **30 FPS · Save energy** and **Accurate**. Select **60 FPS · Smooth** for a higher preview ceiling, or **Faster grain · GPU** for dense grain drawings. Neither changes export frame rate or artwork data.
- **Brush previews on demand:** editor brush rows show a small preview on hover or keyboard focus. The playground gallery renders static thumbnails until hover or keyboard focus, with only one active preview at a time. Leaving a card stops its playback timer; hidden/offscreen previews pause and offscreen caches are released.
- **Image layers:** **Add → Image layer…** imports an image at its native resolution, then centers it to fit the canvas. Select it to drag, resize proportionally from a corner, or edit its position and size numerically. Transforms reuse the decoded source and send only metadata to the render worker. Image layers support undo/redo, saving, duplication, ordering, opacity, blend modes, and export. Uploads accept browser-decodable image files up to 20 MB, 32 megapixels, and 16,384 pixels per side; GIF/SVG imports are stored as static PNG pixels.

The scheduler remains on the main thread so it can coordinate visibility, pointer edits, and export overlays; brush evaluation and painting run in the worker. There is no worker per stroke and no shared-memory requirement.

WASM was not added. Cached sampling is no longer repeated on every frame, and the largest measured improvement comes from avoiding work and batching draw calls. Porting the remaining arbitrary JavaScript brush recipes requires a separate kernel/shader design; it is not an automatic WASM conversion. Shared-memory pthread deployment, structural-sharing undo, and a general GPU path for every effect remain future work.

## Verification after implementation

`npx vitest run apps/animated-paint/web`: **127 tests passed**. TypeScript and the full production build pass. Animated Paint lint has only the existing `StampConfigModal` effect warning; the build retains existing bundle-size warnings.

Open `/apps/animated-paint/test/render-checks.html` under the development server and click **Run renderer checks**. It is a finite test, does not alter projects, and verifies both pixel output and worker behavior. The original finite benchmark is also retained at `/apps/animated-paint/test/render-benchmark.html`.

Latest paired comparison on 800 × 600 synthetic scenes, 50 strokes each:

| Case | Accurate Canvas2D | GPU preview |
| --- | ---: | ---: |
| Graphite, changed animation frame | 132.7 ms | 30.4 ms |
| Dry Bristle, changed animation frame | 88.9 ms | 23.2 ms |
| Line Boil, changed frame (2D fallback) | 9.5 ms | 9.2 ms |

Accurate rendering reused a held Graphite frame in **0.7 ms**, and settled Ink Bloom in **0.9 ms**. These are reuse timings, not the cost of generating new animation states. In the live editor, unchanged static scenes stop requesting frames altogether.

These figures are medians from six measured frames after two warmups, on readback-enabled 2D test contexts used for pixel comparison. Timings cover CPU generation and command submission, not GPU completion, sustained display FPS, power or thermals. They are a paired diagnostic comparison, not a guaranteed speedup on every device. The earlier baseline used a normal 2D context and should not be treated as an identical benchmark setup.

Browser checks passed:

- Accurate worker pixels matched the Canvas2D reference exactly for layer opacity, eraser masks, mask removal, stroke append, deletion/undo, uploaded image stamps and tinted shape stamps.
- A burst of queued edits reached the latest scene revision; unit tests additionally prove only the latest pending request is retained, stale bitmaps are closed, and hung workers terminate.
- GPU path used 50 instanced batches for 88,506 Graphite marks. In that scene its mean per-channel pixel difference from Canvas2D was 2.16/255; 10.39% of pixels differed by more than 10 in at least one channel. This is why GPU preview is optional. The line fallback matched exactly.
- Six PNG export frames were encoded. The first, last, and first again after a backward time seek matched reference pixels exactly.

## Original review and plan

The following findings describe the implementation **before** the changes above.

## Recommendation

Reduce repeated work and draw calls first. Move rendering to a persistent worker for UI responsiveness. Introduce a batched GPU renderer for dense animated stamps. Use WASM only for measured CPU kernels that remain expensive after these changes.

WASM, worker threads, and GPU rendering solve different problems. Porting the existing loop to WASM while still issuing tens of thousands of Canvas2D operations would leave the dominant cost in the tested grain-heavy scenes. Using more CPU cores can also increase power consumption; responsiveness and lower heat need separate validation.

## Browser baseline

Run the development server and open `/apps/animated-paint/test/render-benchmark.html`. Click **Run bounded benchmark**. It runs seven finite cases through the real `renderDocumentV2` and Canvas2D renderer, then stops. Each stroke contains 160 pressure-varying points along a roughly 480-pixel-wide curved path. Strokes vary in position and seed. Canvas size is 800 × 600. Each case discards two warm-up frames and reports medians over six measured frames, yielding between frames.

Observed in the connected Chromium 152 browser, reporting eight logical processors:

| Brush | Strokes | Marks/frame | CPU frame submission | Canvas calls within frame | Script execution alone | Packed buffer allocation/frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Round | 50 | 7,388 | 7.4 ms | 5.2 ms | 0 ms | 0.62 MB |
| Line Boil | 50 | 7,388 | 8.1 ms | 4.6 ms | 1.9 ms | 0.62 MB |
| Graphite Crawl | 10 | 17,490 | 23.1 ms | 15.1 ms | 3.5 ms | 1.47 MB |
| Graphite Crawl | 50 | 88,506 | 174.8 ms | 134.4 ms | 19.0 ms | 7.43 MB |
| Dry Bristle | 50 | 71,328 | 102.9 ms | 71.1 ms | 14.9 ms | 5.99 MB |
| Ink Bloom, settled | 50 | 49,220 | 58.8 ms | 37.3 ms | 4.5 ms | 4.13 MB |
| Rainbow | 20 | 2,950 | 4.2 ms | 3.2 ms | 0.2 ms | 0.25 MB |

These are development-session CPU timings, not display FPS or GPU completion measurements. They include browser/runtime scheduling effects, allocation, and sometimes deferred rendering work. They are a small diagnostic sample, not a controlled hardware benchmark. GPU rasterization, thermals, electrical power, input latency, and production Electron performance were not measured. The new grain brushes amplify an existing architectural limitation by emitting many marks per sampled point.

For context, the entire display pipeline has about 16.7 ms at 60 fps and 33.3 ms at 30 fps. In the 50-stroke Graphite case, Canvas calls alone already exceed either budget. The 7.43 MB figure is `marks × 21 floats × 4 bytes`; at a hypothetical 60 generated frames/second it would create about 446 MB/second of packed buffers, before JS objects. This is an allocation calculation, not observed throughput.

A separate Node 22 diagnostic using 50 copies of a different curved path measured geometry generation alone at approximately 3.2 ms for Round, 5.7 ms for Line Boil, 44.7 ms for Dry Bristle, 57.7 ms for Graphite Crawl, and 26.9 ms for Ink Bloom. These runs exclude Canvas2D and are not directly comparable to the browser table. Their value is confirming that CPU generation also becomes material as item counts grow.

## Findings in the current implementation

1. **Full redraw at every display tick.** `PaintStudio.tsx` unconditionally calls `renderDocumentV2` from `requestAnimationFrame`. Static and settled strokes still go through sampling, draw-list creation, dynamics, packing, and paint. Graphite's recipe changes at 7 fps, Sketch Echo at 6 fps, and Line Boil at 12 fps, but the runtime does not know this. Ink Bloom stops changing after drying but remains scheduled as animated.
2. **Only JavaScript compilation is cached.** `strokeFrame` resamples the same completed path every frame. It then constructs raw draw items, validated items, and another dynamics array. `lastGood` is an error fallback, not a render cache.
3. **Unused packed output.** `strokeFrame` always creates a `Float32Array` with 21 floats per item. `renderDocumentV2` paints `frame.items`; it does not consume `frame.packed`. Make packing demand-driven until a worker/GPU consumer uses it directly.
4. **Default dynamics still run math and allocate.** `applyBrushDynamics` creates a seeded RNG and computes phase, aspect, sine/cosine, and a copied object for every mark even with drift, distortion, and rotation all zero and only one copy. Add a semantics-preserving fast path.
5. **One Canvas2D operation sequence per mark.** `paintStamp` saves state, assigns alpha/color, transforms, paints, and restores per stamp. Lines similarly issue a separate stroked path per neighboring pair. This was the largest CPU component in the grain-heavy browser cases. Canvas2D may itself use GPU acceleration; the measured overhead is still present at the API/command level.
6. **Tinted images are recreated per mark.** `tintedStampImage` resizes a scratch canvas and recolors the same source for each stamp. Cache decoded/tinted stamp variants under a byte budget. This is a source-level finding; the browser benchmark used named procedural marks, not uploaded masks.
7. **Worker scaffolding is unused.** `AnimationWorkerHost` has no live renderer caller. It also posts full requests without transfer lists, has no latest-frame queue policy, and has no timeout/recovery path. Simply connecting it per stroke would introduce copies, queues, and main-thread paint work rather than solve the full problem.
8. **Limits are per stroke.** The 12,000-item cap and 24 ms warning do not bound total scene cost. A warning also does not interrupt execution. Existing `animationMs` excludes validation, sampling, dynamics, packing, and Canvas calls, so it is insufficient as a scene performance metric.
9. **Caches and secondary loops need lifecycle control.** The global `lastGood` map is not cleared by production callers. Gallery cards each schedule their own loop, including cards outside the visible scroll region and static brushes. Export preview can run alongside the main canvas. Browsers may throttle hidden tabs, but the app does not manage these workloads itself.
10. **Drawing also copies whole documents.** Undo snapshots use `structuredClone(document)` and retain up to 30 complete documents; autosave validates and serializes the complete document. Brush snapshots include scripts and image data. These can cause additional pauses as drawings grow, independently of the frame loop. This cost was not included in the benchmark.

## Implementation order

### 1. Cache, schedule, and measure

- Add per-stage frame metrics, dropped-frame/long-task counters, live mark counts, and memory-budget counters. Record p50/p95 timings against fixed seeds and representative scenes.
- Cache sampled paths by a stroke geometry revision and the sampling settings (spacing, scatter, and seed). Invalidate when points change during drawing, when settings change, or on edits/undo. Do not cache only by mutable array identity.
- Skip packing for the Canvas2D path. Fast-path inactive dynamics. Cache invariant color/style conversion and bounded stamp variants.
- Introduce explicit, persisted animation metadata: static, continuous, stepped with rate, and one-shot with settle time. Existing/custom JS defaults conservatively to continuous. Cache only when the effective output is unchanged, including drift, speed, and other time-dependent dynamics; `animated: false` alone is insufficient when drift is active.
- Stop work on static scenes until invalidated. Reuse stepped draw lists/pixels within a held frame; freeze settled one-shot strokes. Invalidate correctly when export seeks backward or restarts time.
- Maintain a single scheduler. Offer an energy-saving preview rate (for example 30 fps), keep pointer feedback responsive, pause covered/hidden workloads, and animate only visible gallery cards. A 30 fps cap reduces requested work only when the renderer can meet that rate; it will not cure a 175 ms frame.
- Cache static/settled raster runs or tiles while preserving original stroke order. Moving every static stroke below every animated stroke would change the picture. Bound caches by bytes; include masks, blend modes, opacity, and effects in invalidation. Keep vectors and snapshots as the authoritative document for editing/export.
- Consider command-based undo or structural sharing and deferred serialization after measuring interaction pauses.

### 2. Persistent rendering worker

- Keep React, pointer capture, selection UI, and a lightweight live-input overlay on the main thread.
- Give one persistent render worker an `OffscreenCanvas` and ownership of scene caches, scheduling, draw generation, and painting. Send incremental scene edits, not the full document every frame.
- Define versioned frame requests and a latest-request-wins policy with at most one pending request. Discard stale results after edits, undo, resize, or document switches. Do not await every worker sequentially for every stroke.
- Load stamps as `ImageBitmap` and create offscreen surfaces in the worker. The current `HTMLImageElement`/`document.createElement` helpers need adaptation. Handle resize, masks, context loss, asset readiness, and export explicitly.
- Use transferable buffers for large geometry if it must cross workers. Ordinary workers and transfers do not require shared-memory WASM or cross-origin isolation.
- Add a small helper-worker pool only when profiling shows independent geometry tasks justify it. Avoid one worker per stroke or filling all logical cores by default. If custom animation execution shares the renderer, a stuck script can stall that worker; design timeout/recovery or separate execution rather than treating a worker as a security sandbox.

### 3. Batched GPU renderer

- Add a WebGL2 instanced stamp path (or WebGPU after a capability/maintenance comparison). Upload stamp geometry and texture atlases once; update instance attributes or time uniforms as needed. Keep Canvas2D as a compatibility path while coverage is built out.
- Start with circles, textured stamps, and grain brushes, where the benchmark shows the largest draw-call overhead. Preserve painter's order and blend semantics when batching. Add line/ribbon geometry and masks after that.
- Use GPU formulas for suitable built-in motion. Retain a worker-based custom-JS path that supplies typed instance data. Arbitrary imported JavaScript will not automatically become a shader or a WASM module.
- Cache appropriate effect textures or use controlled filter passes. Do not blindly replace per-mark alpha, blur, or glow with one combined path/effect; overlapping translucent marks can look different.
- Verify seeded reference images, layer opacity, erase masks, blend modes, shape stamps, pressure widths, separate contours, and export parity before switching the default renderer.

### 4. Selective WASM and threading

Candidate kernels are path resampling/tessellation, noise generation, and sufficiently large particle calculations. Keep data in reusable typed buffers and call across the JS/WASM boundary in batches. The sampled browser cases indicate that changing only script math would leave the dominant Canvas submission cost; benchmark each port against optimized JavaScript.

The tested dev browser supports workers and OffscreenCanvas but reported `crossOriginIsolated: false` and no exposed `SharedArrayBuffer`. Shared-memory WASM threading therefore needs deployment work. Configure COOP/COEP and compatible resource loading for the browser build. The packaged Electron app currently uses `loadFile`, so validate a suitable secure serving/protocol strategy there instead of assuming dev-server headers carry over. Keep a non-shared-memory fallback. Do not disable web security to obtain shared memory.

## Proposed acceptance checks

- Re-run this fixed synthetic baseline after each phase, then add mixed/static/animated scenes, large canvases, masks, image stamps, glow, and multiple layers.
- Verify that an unchanged static scene stops regenerating frames; stepped brushes update only at their declared effective rate; dried ink no longer consumes animation work; exports still reconstruct every requested frame.
- Measure main-thread input latency separately from frame throughput. Worker migration should keep input responsive even if a frame is expensive.
- Profile p95 frame cost and sustained CPU/GPU activity on the actual desktop app. Compare an energy-saving mode and full preview quality at the same workload. No thermal or power reduction is promised from multithreading alone.
- Bound memory after repeated draw/undo/delete/project-switch cycles. Cache eviction must not change the exported picture.

## References

- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) — worker rendering and ownership transfer.
- [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#batch_draw_calls) — batching and texture atlases.
- [MDN: WebAssembly concepts](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts) — combining WASM and JavaScript.
- [Emscripten: pthreads support](https://emscripten.org/docs/porting/pthreads.html) — shared-memory threads and COOP/COEP requirements.
- [MDN: SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) — cross-origin isolation and shared memory.
- [web.dev: WebAssembly performance patterns](https://web.dev/articles/webassembly-performance-patterns-for-web-apps) — persistent workers and measuring task architecture.
