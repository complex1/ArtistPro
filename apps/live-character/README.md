# Live Character

A browser-based 2D character editor integrated into Artist Pro. Open the **Live Character** tool card, or navigate to `#/live-character`. Start with an empty character or the included starter rig.

## Workflow

1. **Create and assemble:** draw parts or import PNG, JPEG, WebP, GIF, or static SVG artwork. Name, reorder, hide, lock, transform, and parent layers.
2. **Mesh:** generate a low, medium, high, or custom subdivision grid for a layer. Adjust its base vertices on the canvas before animating.
3. **Rig:** add and parent bones, assign automatic or manual vertex weights, bind a whole layer to a bone, and create rotation controls or two-bone IK targets.
4. **Animate:** move the playhead and adjust parts or controls to record transform keys. Enable the mesh overlay and drag a vertex to record mesh deformation keys. Choose interpolation, scrub, and preview the animation.
5. **Export:** save a reusable `.live-character.json` document, a transparent PNG of the current frame, or a looping GIF.

In the starter, select a hand IK target in Animate mode and drag it at a later frame to try the complete workflow. Regenerating a mesh resets that layer's weights.

### Animate mesh points

Generate a mesh for a layer in **Mesh** mode, then switch to **Animate**. Select the layer, enable the mesh overlay, move the playhead, and drag a mesh point. With auto-key enabled, the editor records the layer's mesh pose at that frame and interpolates its vertices between keys. Mesh keys use their own timeline track and support the same easing controls as transform keys. Mesh deformation also works alongside bone and layer animation, and appears in PNG and GIF exports.

**Mesh** mode edits the base mesh used to attach the artwork; it does not create animation keys. **Animate** mode deforms the artwork while retaining its original texture coordinates. Once a layer has mesh animation keys, its base mesh, dimensions, and topology are protected from setup edits so existing poses stay valid. Delete that layer's mesh keys before editing, regenerating, or removing its base mesh.

## Project storage

Projects are stored in the `artist-studio-live-character` IndexedDB database, under the current browser/Electron origin. The feature works without the Python project service. Shared Artist Pro Recent Projects merges this store with the other tools' API project lists.

Save acknowledgment waits for the IndexedDB transaction to commit. Storage or validation failures are reported instead of silently falling back to temporary memory. Export project JSON for backups and moving characters between browsers or machines. Clearing site data removes browser projects. Importing a document or a full project record always creates an independent project ID.

## Current scope

- Meshes are rectangular subdivision grids with linear bone weighting; there is no automatic alpha-outline triangulation or weight painting brush.
- IK is a two-bone chain with a selectable bend direction. Rotation controls drive individual bones.
- Animation records transforms and mesh vertex poses; appearance, topology, mesh weights, and rig structure are setup properties rather than animation tracks.
- Imported SVG artwork is validated and rasterized into an embedded PNG texture; imported GIF artwork uses a single frame. Imported artwork textures are capped at 2,048 pixels on their longest side. SVG source paths are not editable after import.
- GIF export uses a white background and samples at most 240 frames at a maximum 800-pixel longest edge, retaining the playback duration. PNG export preserves transparency. Video export and Live2D/Spine runtime formats are not included.
- Browser storage is local to this browser/origin, with no account sync or collaboration.

## Code map

- `web/model.ts`, `web/engine.ts`: document format, mesh generation, transforms, skinning, IK, interpolation, and validation.
- `web/library.ts`: committed IndexedDB project persistence and safe project import.
- `web/LiveCharacterHome.tsx`: character library and starter/import entry points.
- `web/LiveCharacterStudio.tsx`: editor state, workflow, history, timeline, and autosave.
- `web/CharacterStage.tsx`, `web/CharacterInspector.tsx`: canvas interaction and rig controls.
- `web/render.ts`, `web/assets.ts`, `web/export.ts`: rendering, artwork import, and export.

Run feature checks with `npx vitest run apps/live-character apps/desktop/renderer/app/routes.test.ts apps/desktop/renderer/home/recentProjects.test.ts`.
