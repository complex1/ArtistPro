# Contributing to Artist Studio

Install [development dependencies](docs/development.md), create a branch, and make a focused change. Preserve existing project formats and user data. New tools need a `tool.json`, route integration, a README, screenshots, and website catalog content.

Run `npm test` and `npm run build`. Run the relevant real-browser harness for canvas, WebGL, input, persistence, or export changes. For documentation/site changes, run `npm run build:site` and `npm run check:docs`. Linux browser checks need a display such as Xvfb. Desktop packaging should be verified on its target OS/CPU.

Include the concrete problem, resulting behavior, relevant checks, and any remaining limitation in your PR. Update tool guides when behavior changes. Use original or appropriately licensed demo assets and never add personal project data, credentials, generated installers, or virtual environments to Git.

Report reproducible bugs through the issue template. For security issues, use the private reporting route in [SECURITY.md](SECURITY.md). Contributions are distributed under the repository's MIT license.
