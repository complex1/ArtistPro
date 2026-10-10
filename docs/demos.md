# Screenshots and demos

```sh
npm run setup
npm run docs:screenshots
```

The Electron harness uses an isolated API directory and Chromium profile, creates original demo projects through real UI, and captures home/editor views. Temporary app data is removed afterward. Outputs are `docs/screenshots/`, `docs/samples/`, and `build/qa/suite-browser.json`. These captures feed each README and the static site.

Samples use original geometric artwork and built-in studies/rigs. Tools with project JSON import can reopen their samples. Cel's JSON refers to an API image asset; regenerate it rather than treating JSON as a standalone image bundle. SVG/Paint JSON records fixture state; those galleries do not offer general project JSON import.

## Optional video walkthrough

This preparation supplies screenshots and repeatable fixtures. To record a video, use a separate test profile and your OS recorder or a trusted recording app. Suggested 90-second script:

1. 0–10 seconds: home screen and SVG Studio.
2. 10–25: draw/import original vectors and preview motion.
3. 25–40: moving brushstroke and playground.
4. 40–55: bouncing-ball study and exposure timing.
5. 55–75: 3D reference posing and transfer to Drawing Canvas.
6. 75–90: editable project export and backup/installation guides.

Hide personal information, include captions, and label current limits. Export MP4/WebM and keep large videos out of normal Git history. After uploading to a chosen release/video host, add its verified URL to the site and README. No placeholder video link is included.
