# FrameByFrame Animation

A manual raster animation workspace at `#/frame-by-frame`. The first release focuses on drawing poses and controlling their timing. Auto in-between generation is a later phase.

## Workflow

Create a shot with a canvas preset and frame rate, or open the editable bouncing-ball study. Paint on a drawing, add the next drawing, and use onion skins to compare neighboring poses. A drawing can be held for multiple frames (its **exposure**). The initial setting is two frames per drawing.

- **Drawing:** pressure-sensitive brush presets, eraser, fill, eyedropper, rectangle/ellipse, rectangular selection, and freehand lasso. The Drawing sidebar shows properties for the selected tool. Select a region to reveal eight resize handles and a round rotation handle, or enter width, height, and rotation in the sidebar. Move, resize, rotate, and flip selected pixels while preserving artwork outside the selection. Deselect is available above the canvas and in the sidebar.
- **Timeline:** scrub individual frames; add, duplicate, split, delete, and drag drawings; drag the right edge or change the exposure field to retime. Insertion and exposure changes ripple later drawings on that layer. Moving rejects overlap. Deleting leaves a gap. Other layers keep their timing.
- **Layers:** add, duplicate, reorder, rename, hide, lock, and adjust opacity. Each timeline row has an undoable track-delete button; the toolbar Delete button removes just the selected drawing. Deleting the last track leaves an empty editable track. Locked tracks cannot be deleted. Layers are composited from bottom to top.
- **Onion skins:** up to four previous and four next drawings, with separate red/blue tint or original colors and adjustable opacity. Counts refer to distinct drawings, not repeated hold frames. Hidden during playback and excluded from exports.
- **Playback:** elapsed-time scheduling, looping, frame stepping, configurable FPS and shot length. The timeline follows the playhead during playback.
- **Import/export:** import PNG/JPEG/WebP images, naturally sorted by filename. The first image replaces the current drawing; later images are inserted using the default exposure. Export editable JSON, current PNG, a numbered PNG sequence ZIP, GIF, or MP4/WebM according to available browser encoders. PNG preserves transparency; GIF/video use opaque paper.
- **Persistence:** local IndexedDB autosave, undo/redo for both artwork and timing, explicit save, portable project import/export, gallery search, and integration with the app's recent projects. Failed saves retain the editor and unsaved content when navigating away.

The **Drawing** tab follows tool selection. The **Shot** tab contains frame rate, shot length, paper, onion-skin, exposure, and layer settings. For a selected region, drag inside to move it, drag handles to resize/rotate, or draw outside it to replace the selection. Hold Shift to lock resize proportions or snap rotation to 15°. Escape cancels an active gesture; pressing it again deselects.

## Shortcuts

| Key | Action |
| --- | --- |
| B / E / G / I | Brush / eraser / fill / eyedropper |
| R / O / M / V | Rectangle / ellipse / select / move |
| L | Freehand lasso |
| H, Alt-drag, middle-drag | Pan |
| Wheel / Shift-wheel / 0 | Zoom / horizontal pan / fit |
| [ / ] | Brush size |
| Space | Play/pause |
| Left / Right | Previous/next frame |
| , / . | Previous/next drawing |
| N / Shift-N | New/duplicate drawing |
| Ctrl/Cmd-Z / Ctrl/Cmd-Shift-Z | Undo/redo |
| Ctrl/Cmd-S / Ctrl/Cmd-D | Save/deselect |
| Escape | Cancel gesture/deselect |
| Delete / Shift-Delete, with timeline focus | Delete drawing / delete track |

## Architecture

`model.ts` contains the versioned document format, validation, and immutable timeline operations. Each cel has a stable ID, start frame, exposure, embedded PNG, and thumbnail. Exposures are zero-based half-open intervals. A layer's cels cannot overlap. Blank drawings are explicit cels; gaps remain empty.

`session.ts` owns revision tracking, whole-document history, and serialized saving. It continues saving if a new revision arrives while an earlier save is pending. History is bounded to 40 steps and an approximate 96 MiB image budget.

`FrameEditor.tsx` reuses Drawing Canvas's raster engine for the active cel. Other tracks and onion skins are display layers. `raster.ts` uses a separate compositor and the shared render encoders for exports, so guides never enter exported pixels. `library.ts` owns a separate IndexedDB store.

Limits: up to 2048 pixels per dimension, 1–60 FPS, 2,400 frames, 500 drawings, 16 layers (also bounded by 32 MiPixels across layers), and 128 MiB of encoded image data per project. Projects live in the current browser/device; export editable JSON for a portable backup. GIF timing is rounded to the format's centisecond resolution. Video export requires localhost/HTTPS and an available browser codec.

## References and scope

Reviewed Callipeg's official [timeline](https://callipeg.com/learn-timeline/), [drawing layer](https://callipeg.com/learn-drawing-layer/), and [onion skin](https://callipeg.com/learn-onion-skin/) documentation. The shared concepts are held drawings, per-layer timing, and neighboring-pose overlays. This implementation has its own interface and project format. Audio tracks, camera animation, advanced selection/brush editing, and automatic in-betweens are outside this first release.

For the later in-between flow, generated images can be inserted as ordinary independent cels through the existing validated timeline operations and committed as one undoable document change. Keep endpoint poses and layer timing explicit; the current release does not generate interpolated poses.

## Verification

```sh
npx vitest run apps/frame-by-frame
npm run test:frame-by-frame:browser
npm run build
```

The Chromium harness uses an isolated profile and temporary Vite server. It verifies composite pixels, held poses, transparency, GIF frames, playable video duration, cancellation, real pointer drawing, timeline edits, save/reopen, rapid scrubbing, and recovery from failed storage writes.
