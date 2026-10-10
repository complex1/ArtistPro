# Install Artist Studio

Check [GitHub Releases](https://github.com/complex1/ArtistPro/releases) for published builds. A release exists only after its draft is reviewed and published. The build pipeline prepares:

| Platform | CPU | Files |
| --- | --- | --- |
| macOS | Apple Silicon arm64, Intel x64 | `.dmg`, `.zip` |
| Windows | x64 | NSIS `.exe` |
| Linux | x64 | `.AppImage`, `.deb` |

Names include version, OS, and architecture: `Artist Studio-0.1.0-mac-arm64.dmg`. Node.js and Python are bundled in the new desktop distributions. Working WebGL drivers are needed for 3D. Memory requirements depend on canvas size, layers, and imported models; minimum hardware performance has not been established.

## macOS

Open the matching DMG, drag Artist Studio to Applications, and launch it. TapPilot requires Accessibility access in System Settings → Privacy & Security → Accessibility for shortcuts.

Unsigned development builds may trigger security warnings. Public distribution should use Developer ID signing and notarization. Only open builds you trust; use macOS's per-app Open action when offered. Do not disable Gatekeeper globally. Signing is a release task described in [releases](releases.md).

## Windows

Run the x64 EXE installer, choose its installation directory/shortcuts, and launch from the Start menu. Unsigned builds may display SmartScreen or publisher warnings; verify their source and checksum. Windows signing requires a publisher certificate. TapPilot uses PowerShell; optional `nircmd` enables volume control.

## Linux

```sh
chmod +x 'Artist Studio-0.1.0-linux-x64.AppImage'
./'Artist Studio-0.1.0-linux-x64.AppImage'
```

Some distributions need FUSE for AppImage. Debian/Ubuntu users can install the DEB with their package manager. TapPilot uses `xdotool` on X11; Wayland input control is not verified. Optional `pactl`/`amixer` provide volume controls.

## Source builds

After [development setup](development.md), run `npm start`. Use `npm run dist` to create a current-platform installer in `release/`. Build on the target OS/CPU; initial setup and packaging downloads need network access.

## Troubleshooting

- **API missing:** source/browser sessions need `npm run setup:api` and `npm run dev:api`. Packaged apps need their `backend-runtime` resource.
- **Port occupied:** close the process using 5173/5174. Startup no longer terminates arbitrary port owners.
- **Blank 3D canvas:** check WebGL and graphics drivers.
- **Missing projects:** verify profile, origin, and API data directory. [Backups](data-and-backups.md).
- **Phone cannot connect:** use the same trusted LAN, start TapPilot's server, and check firewall/client isolation. Do not expose it to the internet.
