# Artist Studio

**A local creative suite for drawing, animation, character rigging, and 3D reference.**

[![CI](https://github.com/complex1/ArtistPro/actions/workflows/ci.yml/badge.svg)](https://github.com/complex1/ArtistPro/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-406e49.svg)](LICENSE)
[![Desktop](https://img.shields.io/badge/desktop-macOS%20%7C%20Windows%20%7C%20Linux-273c31.svg)](docs/installation.md)

Artist Studio brings nine creative workspaces into one Electron desktop app. Sketch with raster brushes, animate SVG artwork, paint with procedural recipes, draw frame-by-frame shots, rig a 2D character, or compose a 3D drawing reference. Projects stay on your device, with file exports for sharing and backups.

The repository name is `ArtistPro`; the public app name is **Artist Studio**. The suite is at **0.1.0**. Individual tools have different levels of maturity; Anime 3D is an early studio. Read each tool's current scope before relying on a workflow.

![Artist Studio home with all nine tools](docs/screenshots/desktop/home.png)

[Installation](docs/installation.md) · [Tool guides](docs/README.md) · [Releases](https://github.com/complex1/ArtistPro/releases) · [Testing evidence](docs/testing.md) · [Website source](website/README.md)

## The tools

| Tool | What you can do | Guide |
| --- | --- | --- |
| SVG Studio | Draw vectors, reuse symbols, keyframe motion, and render animations | [SVG](apps/svg-tool/README.md) |
| Animated Paint | Paint with living procedural brushes and write custom recipes | [Paint](apps/animated-paint/README.md) |
| Drawing Canvas | Raster drawing, layers, selections, fill, and perspective transforms | [Drawing](apps/drawing-canvas/README.md) |
| FrameByFrame Animation | Draw cels, retime exposures, onion skins, guided in-betweens | [Animation](apps/frame-by-frame/README.md) |
| Cel Restoration | Restore flat-color artwork and trace it into SVG | [Cel](apps/cel/README.md) |
| Live Character | Assemble artwork, mesh, rig, pose with IK, animate deformation | [Character](apps/live-character/README.md) |
| 3D Reference | Pose figures, import GLB models, frame scenes, transfer to drawing | [Reference](apps/reference-3d/README.md) |
| Anime 3D | Pose a procedural character, draw in space, render a cel-shaded still | [Anime](apps/anime-3d/README.md) |
| TapPilot | Build a phone-controlled desktop shortcut deck on trusted Wi-Fi | [Phone remote](apps/tappilot/README.md) |

## Quick start

Install **Node.js 22.12+ (22 LTS recommended)**, npm, Git, and **Python 3.13**. The backend declares Python 3.11+; release CI uses 3.13 and local verification used 3.14. Windows uses the `py` launcher; macOS/Linux use `python3`.

```sh
git clone https://github.com/complex1/ArtistPro.git
cd ArtistPro
npm run setup
npm start
```

`setup` installs locked JavaScript and pinned Python development dependencies in `.venv`. `start` launches the renderer, phone development UI, and desktop host; it installs missing dependencies on first use. If ports 5173 or 5174 are occupied, close the conflicting server and retry.

Downloaded desktop builds from the new workflow bundle Electron and a frozen backend runtime: Node.js and system Python are unnecessary. Check [Releases](https://github.com/complex1/ArtistPro/releases) for available installers. This source update does not itself publish a release. [Platform installation guide](docs/installation.md).

## Run in a local browser

Run these in separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Open `http://127.0.0.1:5173`. API-backed tools need the local API. TapPilot's desktop storage and execution require Electron. Video export depends on secure context and available codecs. [Production/local container hosting](docs/local-hosting.md).

## Build and verify

```sh
npm test                 # Frontend, TapPilot schema, and Python checks
npm run test:browser     # Real Chromium UI, pixels, persistence, export checks
npm run build            # Renderer and phone PWA
npm run package          # Unpacked app with bundled backend
npm run dist             # Native installers for the current OS/architecture
```

Build on the target operating system and CPU architecture. Installer outputs are in `release/`. CI prepares macOS Intel/Apple Silicon, Windows x64, and Linux x64 builds. These jobs and clean-machine installation checks must pass before public release. [Release guide](docs/releases.md).

## Website and documentation

```sh
npm run docs:screenshots # Isolated demo projects and real app captures
npm run build:site       # Landing page + nine tool pages → dist-site/
npm run preview:site     # http://127.0.0.1:4174
npm run check:docs       # Local documentation and website link/asset checks
```

The [Pages workflow](.github/workflows/pages.yml) deploys the independent static website when enabled in repository settings. Any static host can serve it. [Website guide](website/README.md).

## Your files and privacy

SVG Studio, Animated Paint, and Cel use the local API data directory. Drawing Canvas, FrameByFrame, Live Character, 3D Reference, and Anime 3D use browser/Electron IndexedDB. TapPilot stores profile files under Electron user data. **Clearing a browser profile can remove projects. Keep editable project exports and regular backups.** [Saving and backups](docs/data-and-backups.md).

TapPilot's current LAN protocol has no pairing authentication; reachable clients may send actions for published profiles. Use a trusted private network. Custom Animated Paint JavaScript should come from a trusted source. [Security boundaries](SECURITY.md).

## Repository map

```text
apps/             Nine tools and the desktop host
common/           Shared UI, rendering, API client, and storage
backend/host/     FastAPI host and manifest-based plugins
scripts/          Setup, packaging, testing, screenshots, site build
docs/             Guides, screenshots, demo projects, testing evidence
website/          Independent landing site source
.github/          CI, draft releases, Pages, issue and PR templates
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing. Release notes are in [CHANGELOG.md](CHANGELOG.md). Source is [MIT licensed](LICENSE); dependencies retain their own licenses. [Third-party notices](docs/third-party-notices.md).

Discoverability: SVG editor, vector animation, digital painting, procedural brushes, frame-by-frame animation, cel restoration, 2D character rigging, inverse kinematics, 3D drawing reference, local creative tools, Electron, React, TypeScript, Three.js, FastAPI, macOS, Windows, Linux. [Suggested GitHub topics](docs/github-setup.md).
