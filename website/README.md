# Artist Studio landing website

Independent static homepage and nine tool pages with actual screenshots, documentation/release links, metadata, structured data, sitemap, and robots.txt. No backend or external font service is needed.

From the repository root:

```sh
npm ci
npm run build:site
npm run preview:site
```

Open `http://127.0.0.1:4174`. Output is `dist-site/`. Refresh captures with `npm run docs:screenshots` after installing the API environment.

`tools.json` IDs must match application manifests. `index.html`, `styles.css`, and `app.js` define the homepage; `scripts/build-site.mjs` generates tool pages. Inter is bundled from an existing dependency; the Studio icon is original vector artwork.

## GitHub Pages

Set repository Settings → Pages → Source to **GitHub Actions**. The Pages workflow uploads `dist-site/` and supports manual dispatch or relevant pushes to main/master. The intended default URL is `https://complex1.github.io/ArtistPro/`; this is not a claim that Pages is already enabled.

For another host, set `SITE_URL` during the build. PowerShell:

```powershell
$env:SITE_URL = 'https://example.com/studio/'
npm run build:site
```

macOS/Linux:

```sh
SITE_URL=https://example.com/studio/ npm run build:site
```

Upload the contents of `dist-site/` to any static host. This website does not run the creative app API. [Local app hosting](../docs/local-hosting.md).

Visual QA captures: [desktop](../docs/screenshots/website/desktop.jpg), [phone](../docs/screenshots/website/mobile.jpg), and [tool detail](../docs/screenshots/website/tool-detail.jpg). The generated font notice is included at `assets/Inter-OFL.txt`.
