# Production readiness plan

## Preparation stages

1. Inventory all nine tools and preserve existing 3D work.
2. Run model/API tests, real Chromium checks, and builds; record evidence in [testing](testing.md).
3. Capture original demos/screenshots in isolated storage.
4. Add root/per-tool guides and installation, hosting, backups, testing, release documentation.
5. Build a responsive static landing site and nine tool pages with metadata/sitemap.
6. Make setup and startup commands portable.
7. Freeze and bundle the backend; verify without system Python.
8. Add native packaging, CI, draft releases, checksums, MIT licensing, GitHub templates.
9. Restrict Electron navigation, IPC, URL schemes, permissions; fix macOS reopening.

## Public-release gates

- Pass the configured macOS Intel/Apple Silicon, Windows x64, and Linux x64 CI jobs.
- Install and launch every artifact on a clean machine without system Python.
- Configure macOS signing/notarization and Windows signing for distribution.
- Review dependency advisories and third-party licenses for the release lockfiles.
- Manually verify stylus input, codecs, Accessibility, Linux X11 automation, and backup restoration.
- Review TapPilot's unauthenticated trusted-LAN boundary; do not advertise it for shared/public networks.
- Enable Pages, review the website, and publish the reviewed draft release.

Workflow configuration is not evidence that remote CI has run. Authenticated phone pairing, automatic updates, longer stress tests, and broader graphics coverage remain follow-up work. Anime 3D's broader features are product work rather than packaging tasks.
