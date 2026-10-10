# Testing and release evidence

This report records local verification on **2026-10-10**, macOS Apple Silicon. It distinguishes executed checks from configured CI and manual release work. Local verification used Node.js 22.23.1, Python 3.14.6, Electron 44.7.0, and electron-builder 26.17.0. CI is configured for Node.js 22 and Python 3.13.

## Executed results

| Check | Result |
| --- | --- |
| Vitest | 1,169 tests across 103 files passed |
| TapPilot Node tests | 12 passed |
| API pytest | 9 passed (two upstream deprecation warnings) |
| Suite Chromium smoke | 40 checks passed, including SVG playback advance/end/loop/pause |
| Drawing / FrameByFrame / 3D Reference / Anime 3D Chromium | 58 / 82 / 136 / 24 checks passed |
| Real macOS arm64 packaged app | 24 checks passed: all nine homes, preload/IPC, native tool windows, macOS close/reopen, shutdown |
| Frozen backend in packaged Resources | Passed with empty PATH/PYTHONPATH and isolated data; nine manifests and three API plugins |
| Renderer / phone PWA / static site | Type checking and production builds passed |
| Documentation/assets | Local link checks passed; every tool has home and editor captures |
| Website UI | Desktop and 390 × 844 phone review, all nine previews, detail navigation, copy/FAQ controls; no console errors or horizontal overflow |
| macOS arm64 artifacts | Unsigned DMG and ZIP built, SHA-256 checksums generated |
| Production npm audit | 0 reported advisories |
| Full npm audit (including build tools) | 8 moderate; no high or critical |

The automated counts comprise **1,190 unit/API tests, 340 browser checks, and 24 packaged application checks**. The packaged lifecycle test waits for native windows to finish closing before triggering macOS activation; this checks the application handler, not a physical Dock click or Finder installation.

## Automated coverage

| Check | Coverage |
| --- | --- |
| `npm test` | Documents, imports, transforms, geometry, rigging, animation, stores, render schedules, shortcuts, routes, API clients, backend plugins, TapPilot schemas |
| Suite Chromium smoke | Nine tools; project creation, pointer strokes, restoration/tracing, persistence/reload, brush playground, native TapPilot IPC |
| Drawing Canvas Chromium | Actual pixels, pressure/flow, selections, transforms, compositing, history, failed writes/navigation recovery |
| FrameByFrame Chromium | Held drawings, export pixels, GIF/video duration, cancellation, pointer strokes, timeline edits, generated in-betweens, save recovery |
| 3D Reference Chromium | WebGL, GLB/image assets, poses, groups, camera independence, PNG alpha, drawing transfer, shortcuts and storage |
| Anime 3D Chromium | WebGL, held pose keys, real world-space pointer drawing, undo, ordered saves, recovery, camera capture, PNG pixels |
| Frozen backend smoke | Starts with Python removed from PATH, reads nine manifests and three API plugins |
| Website/docs checks | Static build, tool catalog parity, local links/assets, desktop/mobile layout and tool preview controls |

## Evidence

Screenshots are in [the documentation index](README.md). Reproduce them with `npm run docs:screenshots`; the JSON report is in `build/qa/suite-browser.json`. Generated demos are in `samples/` and use no personal projects. [Suite report](qa/suite-browser.json), [packaged report](qa/packaged.json), [production audit](qa/audit-production.json), and [full audit](qa/audit-all.json) preserve the local results. There are 20 application captures plus one packaged-home and three website captures. A release should preserve CI evidence as artifacts.

Local unsigned macOS arm64 artifacts are in `release/0.1.0-validation/`; this directory is ignored by Git. It contains the actual app, DMG, ZIP, and SHA256SUMS.txt. They have not been signed, notarized, published, or installed on a separate clean machine.

## Platform/manual matrix

| Target | Automated configuration | Manual verification before publication |
| --- | --- | --- |
| macOS arm64 | Unit/API/build/runtime/browser checks locally; CI configured | DMG install, Finder launch, Dock reopen, signing/notarization, Accessibility, stylus |
| macOS x64 | Native CI runner configured | Intel install/launch, GPU behavior, signing, codecs |
| Windows x64 | Native CI runner configured | NSIS install/uninstall, paths with spaces, SmartScreen/signing, shortcuts, codecs |
| Linux x64 | Native CI and Xvfb browser checks configured | AppImage/DEB install, FUSE, graphics drivers, X11 shortcuts/volume |
| Docker local host | Dockerfile/Compose prepared | Image build, volume persistence, healthcheck, service shutdown |

CI configuration is not evidence that these remote jobs have run. No clean-machine test, signed release, hosted Pages deployment, Wayland automation, or stylus hardware test is implied.

## Findings and fixes

- Development API/test scripts used Unix virtual-environment paths and environment syntax; replaced with platform-aware Node wrappers.
- Packaging depended on matching system Python; new distributions include a frozen backend and are tested without Python on PATH.
- Startup terminated arbitrary processes on development ports; now reports conflicts without stopping unrelated processes.
- macOS last-window close stopped the backend with no reopen handler; host now retains services until Quit and supports Dock activation.
- Electron IPC sender/navigation/external-link boundaries were too broad; narrowed to trusted top-level renderer frames, known routes, HTTP(S), and the exact settings URL.
- Export fetching was blocked by the initial CSP; blob/data access is allowed for local image/export workflows.
- Cel passed a color-clustering setting of 8 to a native tracer requiring a value below 8, causing fallback after a native panic; now uses its supported default of 6 and is exercised in real Chromium.
- The dependency audit found runtime/build graph advisories; compatible fixes and patched Electron/build tooling now produce a clean production npm audit.
- SVG playback needed only a timer from GSAP. Replaced it with a monotonic browser animation clock, removed GSAP and its React wrapper, and checked playback completion, loops, and pause in Chromium. This also removes their custom-license dependency from the suite.
- Preserved installed production npm notices and pinned backend/interpreter license texts; supplemental notices cover three packages that omit standalone files. The reviewed versions produce no missing-notice entries.

## Remaining dependency finding

The full npm audit reports one underlying moderate `sprintf-js@1.1.3` advisory through `roarr` → `global-agent` → `@electron/get`, affecting eight entries in the electron-builder dependency chain. It is confined to development/build dependencies in this lockfile. The available upstream package has no patched version; npm suggests a disruptive builder downgrade. No forced downgrade or invented patch override was applied. Recheck the upstream advisory and compatible tool updates before publishing; a clean runtime audit does not make the build graph advisory-free. The complete advisory URL and affected chain are preserved in the linked audit report.

## Known limits

Large bundles (notably icon collections/3D/export tooling) still emit build size warnings. Local API pytest reports upstream TestClient/AnyIO deprecation warnings. TapPilot is unauthenticated and restricted by usage guidance to a trusted private LAN. Custom brush JavaScript is trusted code. Video codec availability and 3D performance vary by machine; all platform behavior is not established by this macOS run.

Before marking a public release ready, complete [production gates](production-plan.md) and [release checks](releases.md).
