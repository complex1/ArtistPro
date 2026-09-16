# Drawing Canvas

A raster drawing workspace in Artist Pro, available at `#/drawing-canvas`.

## Included in this version

- A local canvas gallery with named landscape, square, portrait, and custom canvases; search; JSON project import; and confirmed deletion.
- A brush engine with ink, pencil, marker, airbrush, and flat presets. Size, opacity, flow, hardness, spacing, smoothing, and supported stylus pressure control each stroke. Erasing uses the same brush dynamics.
- Rectangle and ellipse shapes, an eyedropper, and contiguous color fill with adjustable tolerance.
- Rectangle, ellipse, and freehand lasso selections. Drawing, erasing, fill, and clearing respect the selection.
- Transform modes for resizing, skewing, and four-corner perspective, with draggable handles and live pixel previews. Numeric width, height, skew, and rotation controls complement translation and horizontal/vertical flips. Transforms affect selected pixels or the active layer and commit destructively; undo restores the previous pixels.
- Layers with naming, visibility, locking, opacity, order, duplication, merging, and deletion. Blend modes: Normal, Multiply, Screen, Overlay, Darken, and Lighten. Merge Down requires two visible, unlocked layers with Normal blending to preserve their appearance.
- Zoom, pan, background color/transparency, raster image import, flattened PNG export, and editable JSON project export.
- Undo/redo and browser-local autosave with explicit failure status. A saved project survives reloads in the same browser profile; exported project files provide portable copies.

This is the drawing foundation for further development. Advanced painting features such as smudge, wet-media simulation, custom brush-tip import, masks, adjustment layers, mesh warp, text, animation, and PSD/Procreate interoperability are future extensions. There is no cloud synchronization.

## Controls

| Shortcut | Action |
| --- | --- |
| B / E | Brush / eraser |
| G / I | Fill / eyedropper |
| R / O | Rectangle / ellipse shape |
| M / Shift M / L | Rectangle / ellipse / freehand selection |
| V | Transform |
| H or hold Space | Pan |
| Scroll | Zoom around the pointer |
| Shift + scroll | Pan |
| 0 | Fit canvas |
| [ / ] | Decrease / increase brush size |
| Cmd/Ctrl Z | Undo |
| Cmd/Ctrl Shift Z or Cmd/Ctrl Y | Redo |
| Cmd/Ctrl S | Save locally |
| Cmd/Ctrl D | Deselect |
| Cmd/Ctrl + / − | Zoom in / out |
| Delete / Backspace | Clear selected pixels, or the active layer |
| Escape | Cancel a gesture and deselect |

Hold Shift while drawing a shape to constrain equal sides. Keyboard shortcuts yield to text and numeric inputs. Pressure dynamics require a device/browser that supplies pointer pressure; mouse input uses a stable pressure value.

### Transform

Choose **Transform** (`V`) and select **Resize**, **Skew**, or **Perspective** in the inspector. The handles surround the selection, or the painted content of the active layer when there is no selection.

- **Resize:** drag any of the eight handles, or enter independent width and height percentages. Enable **Lock aspect** or hold Shift while dragging a corner to preserve proportions.
- **Skew:** drag an edge handle to shear the artwork, or enter horizontal and vertical skew angles.
- **Perspective:** move individual corners to change the artwork's perspective. Corners must form a convex quadrilateral; crossing or collapsing them is rejected.
- Drag inside the transform box to move the artwork. Rotation and flip controls remain available in the inspector.

Dragging previews the pixels without changing the saved drawing. Releasing applies one undoable transform and refreshes the handles around the resulting bounds. Escape or an interrupted pointer gesture cancels the preview. Numeric settings apply with **Apply transform**.

## Architecture and format

- `web/engine/types.ts` defines document, layer, brush, selection, and transform types.
- `web/engine/brush.ts` implements raster brush tips and pressure-aware stamps.
- `web/engine/geometry.ts` contains selection geometry and transform math.
- `web/engine/projective.ts` renders projective previews and commits perspective transforms with inverse mapping and premultiplied-alpha bilinear sampling.
- `web/engine/fill.ts` implements contiguous pixel flood fill.
- `web/engine/history.ts` bounds undo history by steps and retained raster memory.
- `web/engine/engine.ts` owns immutable committed layer buffers, live strokes, compositing, edits, and document serialization.
- `web/document.ts` validates and copies the portable format without allocating DOM/canvas objects.
- `web/library.ts` stores validated records in the isolated `artist-studio-drawing-canvas` IndexedDB database. Writes resolve after transaction commit. Imports always receive a new project ID.
- `web/transformControls.ts` defines handle geometry and resize, skew, and perspective gesture calculations.
- `web/DrawingHome.tsx` and `web/DrawingEditor.tsx` provide the gallery and editor. Desktop routing and the shared recent-project list integrate the tool with Artist Pro.

Version 1 documents store dimensions, name, background, active layer ID, and layers ordered **bottom to top**. Every layer contains metadata and either a lossless embedded PNG with matching canvas dimensions or `null` for blank pixels. Library records wrap the document with ID and timestamps. The editor exports a raw document; the gallery accepts both forms. Validation rejects unsupported versions, malformed values, duplicate IDs, invalid active layers, unsupported blends, external images, and oversized data. The drawing engine additionally decodes PNGs before use.

Limits: 1–4096 pixels per dimension; up to 32 layers; at most 64 MiPixels across all logical layers (256 MiB of raw RGBA pixels); and 128 MiB of encoded layer image data per project. Thus a 4096 × 4096 canvas supports up to four layers. Additional working buffers and browser overhead consume memory. Undo history retains up to 30 steps within its 128 MiB buffer budget; large canvases can retain fewer steps. Temporary selections, viewport position, and undo history are editor-session state rather than portable document content.

Keep new pixel operations in the engine, selection geometry in the geometry module, and UI controls in the editor. Extend the portable format deliberately and update validation/import tests when persistence changes. Do not report storage success before IndexedDB commits.

## Validation

From the repository root:

```sh
npx vitest run apps/drawing-canvas/web
npm run test:drawing-canvas:browser
npm run build
```

Unit tests cover document boundaries, independent imports, committed persistence, storage failures, selection/transform math, flood fill, and history. The Electron/Chromium smoke test exercises the actual Canvas 2D engine and checks rendered pixel output.
