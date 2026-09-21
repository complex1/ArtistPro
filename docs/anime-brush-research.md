# Anime brush studies

Reviewed 2026-09-21. These are original procedural brush recipes informed by animation practice. The proposed frame rates and loop durations are our design choices, not universal rules for anime.

## Research and scope

- **Speed and focus lines** communicate movement, action, and emotion. Parallel streaks suit directional movement; radial lines draw attention toward a focal area. [Clip Studio Paint manual](https://help.clip-studio.com/en-us/manual_en/540_comic/Speed_lines_and_Focus_lines.htm).
- **Follow-through and overlap** let secondary parts such as hair or clothing trail the main motion. An attached root and a delayed free tip translate well to a drawn stroke. [Toon Boom animation principles](https://learn.toonboom.com/modules/animation-principles/topic/follow-through-principle).
- **Lightning, soft accents, and animated focus effects** can change a scene's mood. Animator Kevin Farias demonstrates adapting manga effects to animation by varying a small set of drawings and repeating them. This motivates held poses for our accent brushes. [Creator's illustrated tutorial](https://tips.clip-studio.com/en-us/articles/10173).
- **Smears and multiples** help express fast movement between poses. They need knowledge of the action and timing; a generic repeated brush trail is only an approximation. We can explore them later with character or timeline controls. [Toon Boom interview with animator Étienne Côté](https://www.toonboom.com/etienne-cote-on-animating-smear-frames-and-multiples-in-ednora).

Camera shake, scene-wide impact frames, and squash of an entire character belong at the layer or timeline level. These brushes affect only their own strokes. Anime Jiggle can suggest a trembling contour, but does not rig or move an existing painted character.

## Brushes

| Brush | What to draw | Behavior | Loop at speed 1 |
| --- | --- | --- | --- |
| Anime Jiggle | An outline, expression mark, or loose object | Coherent held-pose tremble with small shape changes | 1 second / 12 fps |
| Follow Through | Hair, ribbon, or cloth from attachment to tip | Fixed starting point; lag and swing increase toward the free tip | 3 seconds / 12 fps |
| Speed Lines | A stroke in the direction of motion | Parallel tapered streaks travel along the path | 1 second / 12 fps |
| Impact Burst | Tap at a contact point, or drag for a trail | Sharp radial rays expand and fade in a repeating accent | 1.5 seconds / 12 fps |
| Power Aura | Trace an energy outline or arc | Jagged lightning redraws around the path | 2 seconds / 8 fps |
| Sparkle Star | Tap for a shine or drag for several | Four-point sparkles twinkle at staggered phases | 2 seconds / 8 fps |

Color, size, opacity, speed, and pressure use the existing brush controls. Effects remain editable as scripts and exportable through the brush editor. No competitor assets or brush code are included.

## Rendering approach

All six recipes use deterministic seed/time inputs and bounded draw lists. Held frames carry a hash of the actual script so the existing render scheduler can reuse their output safely; editing a recipe invalidates that timing hint. Default effects avoid expensive blur clouds. Long paths are sampled across their full length rather than cutting off the end. Independent lines explicitly begin new contours.

The sampler at `/apps/animated-paint/test/anime-brushes.html` uses the real renderer and synthetic examples. It never changes a saved painting. Playback stops automatically, and the load check renders a finite number of frames. Brush effects are not a guarantee of low temperature or a fixed frame rate on arbitrarily dense canvases.

## Verification

- **198 Animated Paint tests pass**, including 47 new recipe and integration tests. Coverage includes portable import/export, empty/repeated/short paths, deterministic loops and holds, pressure and effects, full-path budgets, pinned roots, separate contours, and actual travel. Integration tests check matching scheduler keys and rendered held poses at 0.5×, 1×, and 2× speeds.
- The production build and targeted lint pass. Browser review confirms all six entries in the Anime category. Drawing a fresh Follow Through stroke and tapping Impact Burst work in the sampler.
- For each brush, a finite 50-stroke scene rendered through the persistent worker with **exact pixel parity** against accurate Canvas2D at the checked frame. This checks worker integration, not GPU-preview antialiasing.
- The 800×600 local check measured median CPU generation/submission of 13.9 ms (Jiggle), 11.6 ms (Follow Through), 6.9 ms (Speed Lines), 5.2 ms (Impact), 8.4 ms (Aura), and 4.8 ms (Sparkle). These short readback-context measurements exclude GPU completion, are not FPS or thermal measurements, and should not be compared directly with other fixtures.
- Recipe maximums stay under 1,600 draw items per stroke on the tested 4,000-point paths. Typical short gestures are much smaller. Speed Lines uses roughly 72 px streaks at its default size to keep the movement readable and sparse.
