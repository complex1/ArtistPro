# Pen-friendly Animated Paint editor

Implemented from the supplied interface reference while retaining Artist Pro's existing theme colors and controls.

- Left: searchable brush preview cards, category filters, Favorites, and Recent. Favorites and the last 12 selected brushes persist locally. Card animation runs only on hover/focus and while visible.
- Center: fitted drawing canvas, floating Brush/Eraser/Select/Hand controls, bottom color/size/opacity controls, zoom and Fit. Header buttons collapse either side panel.
- Right: layer cards with static artwork thumbnails, visibility, add/group/duplicate/reorder/delete, opacity, and blend. Select multiple enables grouping with a pen without keyboard modifiers. Image-layer transformation remains on the canvas and under Transform image.
- Layers and Advanced settings share tabs in the right sidebar. Settings stay scrollable with a persistent track, and the existing settings shortcuts switch to that tab.
- Preview pauses the displayed animation time while allowing edits to repaint; export remains independently timed. Existing accurate/fast preview controls remain in advanced settings.

Scrollbar tracks are explicitly styled at 16 px, including the gallery, brush authoring page, and export/stamp dialogs. Editor lists use reserved, always-visible scroll tracks. At narrow widths panels can collapse; if minimum layout widths still overflow, the workspace itself exposes a horizontal scrollbar rather than silently hiding controls.

Layer thumbnails are 96×72 static canvases, rendered only when visible after a 180 ms debounce. They reuse existing assets, avoid isolated full-document layer scratch surfaces, and release render caches after painting. They show layer content independently of its visibility and blend with other layers.

Validation: TypeScript and targeted lint passed; 387 Animated Paint tests passed; production build passed with the existing chunk-size warnings. Browser checks at 1280×720 and 1024×768 covered direct scrollbar dragging in brush lists and settings, Favorites filtering, multi-layer selection enabling Group, panel collapse/restore, fit, preview pause, export access, and Add layer choices. Physical drawing-tablet hardware was not available for testing.

## Layer folders and dragging

Grouped layers appear in collapsible folders, based on saved `groupId` values. Grouping brings separated selected layers together at the topmost selected position. Drag grips use pointer capture for mouse, pen, and touch; drop indicators distinguish above/below from inside a folder, and edge scrolling helps with long lists. Folders move as complete blocks; individual layers can move between folders or back to the root. Nested folders are not supported. Keyboard users can focus a grip and use Up/Down to reorder or Escape to cancel dragging. Reordering is one undo step. Duplicated grouped layers get a new folder ID. The old layer-movement arrow buttons were removed.

Validated folder creation/collapse, whole-folder dragging, child reordering, moving a layer into/out of a folder, and undo in a separate browser demo. Automated ordering checks cover document/display order, source immutability, membership changes, and invalid/nested drops.
