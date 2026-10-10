# Develop Artist Studio

Use Node.js 22.12+ (22 LTS recommended), npm, Git, and Python 3.13. The backend declares 3.11+; release CI uses 3.13. Recorded local verification used 3.14.

```sh
npm run setup
npm start
```

Commands avoid POSIX environment assignments. Windows uses `py -3` and `.venv/Scripts/python.exe`; Unix uses `python3` and `.venv/bin/python`. Set `ARTIST_PYTHON` to another absolute interpreter path if needed. JavaScript uses `package-lock.json`; Python pins are in `requirements.txt` and `requirements-dev.txt`.

| Command | Result |
| --- | --- |
| `npm run setup` | Install locked npm and pinned Python dependencies |
| `npm start` / `npm run dev` | Renderer, phone UI, Electron |
| `npm run dev:web` | Renderer on `127.0.0.1:5173` |
| `npm run dev:api` | API on `127.0.0.1:8765` |
| `npm run dev:tappilot-phone` | Phone development UI on 5174 |
| `npm test` | Vitest, TapPilot Node tests, pytest |
| `npm run test:browser` | Real Chromium harnesses, sequentially |
| `npm run build` | Type checking, renderer and phone builds |
| `npm run build:backend` | Frozen API in `build/backend-runtime/` |
| `npm run test:backend-runtime` | Frozen API without Python on PATH |
| `npm run test:packaged -- <executable>` | Real packaged host, isolated profile, lifecycle and IPC |
| `npm run licenses:collect` | Installed production dependency notices |
| `npm run package` / `npm run dist` | Unpacked app / installers |
| `npm run docs:screenshots` | Isolated demos, captures, QA report |
| `npm run build:site` / `npm run preview:site` | Static site / port 4174 |
| `npm run check:docs` | Local docs links and website assets |
| `npm run check` | Unit/API checks, app/site builds, docs validation |

## Architecture

Electron starts the loopback API, initializes TapPilot, and opens tool windows with a sandboxed preload bridge. React uses hash routes and tool modules. `tool.json` registers each tool in the launcher and Python host.

Development uses a Python virtual environment. Packaging freezes the host with PyInstaller and includes manifests/server sources as external resources; users do not need system Python. Build the runtime on the target OS/architecture. [Storage](data-and-backups.md) varies by tool.

Validate imported formats before writing, acknowledge saves only after committed storage, retain editable work after failures, and keep native privileges behind validated IPC. [Contribution guide](../CONTRIBUTING.md).
