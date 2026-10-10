# Third-party notices

Artist Studio's own source and original geometric demo artwork are MIT licensed. Dependencies, fonts, icon sets, Electron/Chromium, and the bundled Python runtime keep their own licenses.

The generated [JavaScript license inventory](third-party-licenses.json) records production lockfile entries and package license declarations. Installed production package notices are copied into `licenses/npm/`; pinned backend/interpreter notices and their inventory are in `licenses/python/` and [python-licenses.json](python-licenses.json). Collect them with `npm run licenses:collect` (also run by the backend build). These inventories do not replace a review of the actual shipped artifact. Review exact release artifacts and resolve missing/custom license declarations before distribution.

Major components include React, TypeScript, Vite, Three.js, Zustand, CodeMirror, mediabunny, image tracing/rendering libraries, Iconify collections, FastAPI, uvicorn, Pydantic, Electron/Chromium, and Python. Development-only tools are not all distributed. GSAP is no longer a dependency; SVG playback uses the browser animation clock. PyInstaller hooks determine the frozen runtime contents; retain the notices needed by the included Python packages and interpreter.

Inter is distributed under the SIL Open Font License; its [bundled notice](licenses/Inter-OFL.txt) is copied from the installed package. The new Artist Studio mark is original SVG artwork. The existing TapPilot logo remains with that tool.

Useful upstream license references: [Electron](https://github.com/electron/electron/blob/main/LICENSE), [Python](https://docs.python.org/3/license.html), [PyInstaller licensing](https://pyinstaller.org/en/stable/license.html). PyInstaller's bootloader exception permits distributing generated applications under their own license; still review the bundled runtime components.

Supplemental notices in `licenses/upstream/` cover packages without standalone license files: cookie-signature includes its notice in its README; Lucide includes ISC and Feather notices; Material Design Icons declares its icon licensing through the [upstream notice](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE), with the Apache text included. The collector ties these supplements to the reviewed package versions and reports future omissions in `licenses/npm-review.json`.
