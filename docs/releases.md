# Desktop releases

## Build on each target platform

```sh
npm run setup
npm run check
npm run test:browser
npm run dist
npm run test:backend-runtime
npm run release:checksums
```

`dist` type-checks/builds the renderer and phone PWA, freezes the Python host with PyInstaller, then invokes electron-builder without publishing. Outputs are in `release/`. `package` makes an unpacked app instead. Do not cross-build an Electron architecture while using a backend built for another architecture.

Release CI prepares macOS arm64 (`macos-15`), macOS x64 (`macos-15-intel`), Windows x64 (`windows-2022`), and Linux x64 (`ubuntu-24.04`). A `v*` tag must match `package.json`; all package jobs must succeed before a **draft** GitHub release is created. Manual dispatch uploads artifacts without creating a tagged release. It never automatically publishes the draft.

The frozen host includes its interpreter/dependencies; tool manifests/server sources are external resources. The smoke test removes Python from PATH and exercises the isolated runtime. Pass a packaged Resources directory to `npm run test:backend-runtime -- <resources-directory>` to test the copied backend and plugins. Run `npm run test:packaged -- "<path-to-packaged-executable>"` to launch the actual host in an isolated profile and verify all nine homes, IPC, native windows, macOS reopen, and clean shutdown. Its Node inspector listens on a temporary loopback port only for the test. Verify the entire packaged app on a clean machine as well; the backend test alone is not a native installation test.

## Signing and public distribution

Prepared CI defaults to unsigned development artifacts. Configure a Developer ID identity, hardened runtime/entitlements as required, and notarization credentials for macOS. Configure Windows publisher signing credentials for EXE distribution. Protect credentials in repository/environment secrets; never put them in config, documentation, or source.

Remove the deliberate `CSC_IDENTITY_AUTO_DISCOVERY=false` restriction only when configuring signed release jobs. Follow [electron-builder's signing documentation](https://www.electron.build/code-signing.html) and [Electron distribution guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing). Sign bundled native backend binaries as part of the release validation, then verify downloaded artifacts with OS tools.

## Maintainer checklist

1. Review [production gates](production-plan.md), test evidence, dependency advisories, licenses, and backups.
2. Update version in package/lock/backend metadata and changelog.
3. Commit reviewed source and push a matching version tag when release creation is intended.
4. Wait for every native build and installation/launch test; inspect failure logs.
5. Review draft title/notes, unsigned-build notices, tool limits, and SHA256SUMS.txt.
6. Verify a downloaded artifact's checksum: macOS `shasum -a 256`, Linux `sha256sum`, Windows PowerShell `Get-FileHash -Algorithm SHA256`.
7. Publish the reviewed draft and enable Pages when intended. Update the testing report with actual platform evidence.

Existing old artifacts in a local `release/` may use the former external-Python packaging scheme. Build into a clean output directory for a release, and do not include stale installers in checksum/upload sets.
