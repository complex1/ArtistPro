# Local browser hosting

The app renderer is `dist/`; the landing website is `dist-site/`. SVG Studio, Animated Paint, and Cel need the Python API. TapPilot's desktop storage/execution need Electron.

## Development and built preview

Run `npm run dev:api` and `npm run dev:web` in separate terminals. Open `http://127.0.0.1:5173`. The default API is `http://127.0.0.1:8765`; `VITE_API_BASE` sets a build-time address and `?apiBase=...` overrides it for a session.

To preview a production build:

```sh
npm run build
npm run dev:api
```

In another terminal:

```sh
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`. Vite preview is for local verification, not a hardened public server. Browser origins/ports have separate IndexedDB data.

## Docker on your machine

```sh
docker compose up --build
```

Open `http://127.0.0.1:8080`. Compose binds renderer port 8080 and API port 8765 to host loopback. The `artist-data` named volume holds API projects; browser projects remain in your browser profile. The container does not run Electron or desktop shortcuts.

Stop with `docker compose down`. Avoid `--volumes` if you want to keep projects. This unauthenticated local API is unsuitable for public hosting without authentication, per-user isolation, limits, HTTPS, and backups. Container execution is not part of the recorded macOS checks unless listed in [testing](testing.md).

## Landing website

`npm run build:site` prepares `dist-site/` for GitHub Pages or any static host. Set `SITE_URL` during the build when changing its public base address. Relative links support repository subpaths. [Website guide](../website/README.md).
