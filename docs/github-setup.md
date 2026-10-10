# GitHub repository setup

The existing remote is `complex1/ArtistPro`. These changes prepare local source; they do not push commits, enable Pages, or publish releases automatically from this chat.

## Repository presentation

Suggested description: **Local creative suite for drawing, SVG animation, procedural brushes, frame-by-frame animation, 2D character rigging, and 3D reference. Built with Electron, React, TypeScript, and FastAPI.**

Set the homepage after Pages is successfully deployed. Upload a real screenshot or original Studio artwork as the social preview. The site has descriptive titles, Open Graph metadata, structured data, a sitemap, and a page per tool. Avoid unrelated keywords or claims about features that are not implemented.

Choose relevant repository topics from this list (GitHub allows a limited number):

`digital-art`, `drawing-app`, `svg-editor`, `vector-graphics`, `vector-animation`, `animation`, `frame-by-frame-animation`, `procedural-brushes`, `digital-painting`, `character-animation`, `2d-animation`, `inverse-kinematics`, `3d-reference`, `threejs`, `electron`, `react`, `typescript`, `fastapi`, `cross-platform`, `creative-tools`.

These topics describe actual workflows and technologies. Keep README text readable; keywords do not replace documentation or guarantee search ranking.

## Settings

- Enable Actions; CI covers four native runner targets.
- Set Pages source to **GitHub Actions**, then run the landing-site workflow.
- Enable private vulnerability reporting and review `SECURITY.md`.
- Configure branch protection/rules requiring the relevant CI checks after their first successful run.
- Review Dependabot updates and dependency advisories; avoid automatic production dependency upgrades without checks.
- Configure signing secrets and protected release environments before distributing signed installers.
- Review and publish the tag-triggered draft release only after validation.

Issue forms, a PR template, MIT license, changelog, Dependabot, CI, Pages, and draft release workflows are included. For a new owner/repository, update package metadata, website links/default URL, badges, templates, and this guide together.

GitHub Pages workflow guidance: [official custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Runner labels: [official hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
