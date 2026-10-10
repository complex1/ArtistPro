# Changelog

## 0.1.0 — release preparation (2026-10-10)

- Introduced the Artist Studio public name and MIT license.
- Added suite/per-tool documentation, real screenshots, demo fixtures, installation, hosting, backup, testing, and release guides.
- Added a static landing website with nine tool pages, SEO metadata, sitemap, and GitHub Pages workflow.
- Added portable setup/test/start commands and a PyInstaller backend runtime so new desktop distributions do not require system Python.
- Added native packaging targets, CI, draft releases, checksums, and GitHub contribution templates.
- Fixed Cel's native color-tracer configuration and replaced the SVG playback tween dependency with a browser animation clock.
- Updated vulnerable dependencies and preserved production dependency/runtime notices.
- Restricted Electron navigation, IPC senders, external URL schemes, and permissions; retained macOS backend availability when reopening the home window.

This entry describes prepared source. Public installers and hosted Pages require successful CI, signing decisions, and publication. See [testing](docs/testing.md) for checks actually executed.
