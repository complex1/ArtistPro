# Funky animated brush studies

Reviewed 2026-09-21. This research distinguishes directly tried behavior, official screenshots, and our own proposed motion.

## References

**WigglyPaint by Internet Janitor.** I opened the author's standalone tool and tried ink, a colored marker, and the spray-like textured tool. Its small tool shelf, restricted palette, pixel edges, and redraw character make even simple marks playful. Our existing Line Boil, Textured Boil, and Graphite Crawl already cover much of that territory. The useful extension is giving larger individual marks a distinct pose and rhythm. The creator identifies itch.io, beyondloom.com, and Newgrounds as their releases; similarly named standalone domains should not be treated as the original publisher. [Creator page](https://internet-janitor.itch.io/wigglypaint), [standalone tool](https://beyondloom.com/tools/wigglypaint.html).

**AmberPaint – Motion Brush by ALVICOMP OU.** The official App Store screenshots show a segmented colored ribbon, crossing fine contours, textured lines, and dashed/solid marks. A Neon settings screenshot exposes width, line length, glow intensity, and color. The description adds speed, amplitude, and depth controls. This was a review of official screenshots and product information, not an installed-app hands-on test; exact temporal behavior and internal algorithms were not verified. AmberDraw is a separate app. [Official App Store listing](https://apps.apple.com/us/app/amberpaint-motion-brush/id6745322259).

## Original brushes to try

These are our names and independently written recipes, not copies of either product's brush code or exact claims about their motion.

| Brush | Intended character | Loop at speed 1 | Existing controls worth trying |
| --- | --- | ---: | --- |
| Candy Conveyor | Alternating colored segments travel along the drawn path | 3 seconds | Color, size, spacing, speed |
| Elastic Noodles | Three thin strands weave and sway about the stroke | 4 seconds | Size, spacing, speed |
| Neon Fuse | Sparse bright dashes chase along a dim trail | 2.4 seconds | Color, glow, size, speed |
| Jelly Beads | Large dotted marks bob and squash through held poses | 1.5 seconds, 8 fps | Size, spacing, speed |

The shared design priority is movement that reads clearly without requiring a cloud of thousands of particles. Recipes use deterministic seeds and bounded output. Jelly's explicit timing metadata lets the engine reuse held frames. The other recipes produce continuous motion at the selected preview rate. Neon glow is kept modest by default because per-mark effects have a real rendering cost.

All brushes live in the **Funky** category. Their scripts remain editable and exportable through the existing brush tools. The lab at `/apps/animated-paint/test/funky-brushes.html` shows the four together using the real renderer; playback stops after eight seconds and its load check is finite. It does not modify saved drawings.

## Verification

The Animated Paint suite passes **151 tests**, including **24 new recipe tests** covering deterministic replay, loop closure, import/export, seeds, settings, separate contours, arc-length travel, and bounded output on 4,000-point paths. A 480-frame short-stroke sweep prevents Candy marks from disappearing between dashes. Jelly scheduling metadata is tied to the actual script. The production build passes, including the render worker; the new TypeScript files pass lint.

Browser review confirmed all four in the existing brush library, Candy opening in the brush editor, and distinct rendered samples. The finite 50-stroke sampler check passed. Its representative stroke produces 60 Candy items, 318 Noodle items, 176 Neon items, and 44 Jelly items at time zero. These are draw-list items, not source input points.

One local 800×600, 50-stroke run measured median CPU generation/submission of 3.7 ms for Candy, 20.2 ms for Noodles, 13.6 ms for Neon, and 6.7 ms for Jelly. These short measurements exclude GPU completion and are not frame-rate or thermal guarantees. The sampler can rerun the same bounded check. Large canvases, high glow settings, and many overlapping strokes can still be expensive.
