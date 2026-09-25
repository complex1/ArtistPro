# Keyboard shortcuts

Every Artist Pro workspace exposes the keyboard button and `?` or `Mod+/` for a context-specific guide. `Mod` is Command on macOS and Control on Windows/Linux. The guide uses a native modal dialog with focus restoration, Escape dismissal, and an always-visible scrollbar.

Animated Paint now supports B/E/V/H tools, brackets for brush size, Space for playback, Mod+Z / Mod+Shift+Z / Mod+Y history, Mod+S save, Mod+= / Mod+- zoom, 0 fit, Mod+Shift+E export, Mod+Shift+N add layer, Mod+D duplicate layers, Mod+G / Mod+Shift+G group/ungroup, Delete/Backspace delete the selected stroke, and Escape deselect. Layer deletion remains an explicit UI action. Brush editing supports save, import, export, and playback.

SVG adds V/A/H/R/O/P/B/N/T/I for Select/Nodes/Pan/Rectangle/Ellipse/Pen/Brush/Pencil/Text/Image. Shape keys use the same insertion action as their toolbar buttons. Draw-only keys are inactive in Animate mode. SVG also supports zoom, fit, and Mod+Shift+E export, with existing history, grouping, duplication, and animation keys retained.

Drawing Canvas, FrameByFrame, and Live Character retain their established keys, now documented in the guide with safer text/modal handling. All three add Mod+Shift+E export. Live Character also accepts Mod+Y for redo. Cel adds Mod+O image selection, zoom/fit, 1/2/3 preview toggles, Mod+Shift+E SVG export, and Mod+Alt+E PNG export. TapPilot adds Mod+S profile save, Mod+Shift+L activity log, and Mod+Shift+C connection settings; it requires Electron. These keys do not execute remote device actions or publish profiles. The shared SVG/Paint/Cel launchpads support Mod+Alt+N to focus the new-project form.

New bindings register actions through `useShortcuts` in the shared UI package. Unmounting removes handlers and guide entries. Matching requires exact modifiers, ignores IME composition, and protects editable fields, native controls, dialogs, inert surfaces, and inputs inside TapPilot's shadow root. Discrete new commands ignore held-key repeats; size and zoom commands can repeat. Existing keyboard listeners use the shared guard, and the guide captures keys to isolate all underlying editors.

Validation: shortcut matcher/guard tests, the full Vitest suite, TypeScript, and production builds. Browser checks cover Paint tool selection, brush size, layer creation/undo, guide opening, modal isolation, typing isolation, launchpad form focus, SVG shape insertion/undo, and workspace-specific guide contents. TapPilot's IPC actions require desktop verification and are not exercised by the browser checks.
