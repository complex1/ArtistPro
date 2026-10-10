# Saving and backups

Artist Studio has no cloud synchronization. Data belongs to its app profile, browser origin, or API directory.

| Tools | Storage | Backup |
| --- | --- | --- |
| SVG Studio, Animated Paint, Cel | Python API directory | Copy the full directory, including assets/brushes |
| Drawing Canvas, FrameByFrame, Live Character, 3D Reference, Anime 3D | IndexedDB in renderer profile/origin | Export editable project JSON |
| TapPilot | Files under Electron user data | Export profiles/styles and copy its directory |

Standalone API defaults to `~/.artist-studio`; `ARTIST_DATA_ROOT` overrides it. Desktop uses `<Electron userData>/artist-studio`, with TapPilot below `artist-studio/tappilot`. Typical userData parents are macOS `~/Library/Application Support/artist-studio`, Windows `%APPDATA%/artist-studio`, and Linux `~/.config/artist-studio` (or XDG config). Exact spelling can depend on app naming; the host uses `app.getPath('userData')`.

Chromium stores IndexedDB elsewhere under the same Electron profile, outside the API folder. Copying only the API directory does not copy browser projects.

## Reliable backups

1. Save and wait for confirmation where provided.
2. Export editable files from IndexedDB tools to a separate folder.
3. Quit the app before copying its complete user-data directory.
4. Stop standalone API sessions before copying the entire `ARTIST_DATA_ROOT`.
5. Test a restore in a separate profile/directory before deleting originals.

PNG, GIF, video, and flattened SVG are output artwork; they may not preserve rigging, layers, recipes, or timing. Keep editable files as well.

## Origins and updates

Development port 5173, built preview port 4173, different hostnames, and packaged Electron are separate storage contexts. Changing ports can make galleries appear empty. Clearing site data or deleting a profile can erase projects. Back up before updates/migrations. Gallery imports generally receive independent IDs; consult each guide for formats and limits.

For an independent portable/test desktop session, set `ARTIST_PROFILE_DIR` to an absolute directory before launching the app. Its project data, browser storage, and TapPilot store use that profile; use a new directory for testing and export working projects before moving between profiles.
