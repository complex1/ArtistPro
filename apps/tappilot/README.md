# TapPilot

TapPilot is an Artist Studio tool for building phone-controlled shortcut decks.

## Starter profiles

The TapPilot home screen includes editable starter decks for Figma, Adobe
Photoshop, Blender, and Visual Studio Code. Creating one makes a local,
unpublished profile with common shortcuts and opens it in the existing editor.
Review its bindings before publishing: the examples use the software's common
default shortcuts, but personal keymaps and platform conventions can differ.
Starter profiles only send actions while their named target app is active.

## Structure

- `src/` — desktop editor rendered inside Artist Studio
- `phone/` — LAN phone interface and PWA
- `shared/` — profile types and shared widget rendering
- `electron/` — profile storage, shortcut execution, and LAN/WebSocket runtime
- `test/` — profile schema migration and validation tests

The desktop editor is exported by `src/index.ts`. The Artist Studio Electron
host initializes `electron/runtime.cjs` and exposes its IPC contract as
`window.tapPilot`.

Profiles and key styles are stored below the Artist Studio user-data directory
in `artist-studio/tappilot/`.

Use the repository-level commands:

- `npm run dev` — run Artist Studio, TapPilot's phone UI, and Electron
- `npm run build` — build Artist Studio and the phone PWA
- `npm test` — run all frontend, backend, and TapPilot schema tests
