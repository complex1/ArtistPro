# Security policy

## Reporting

Do not publish exploit details, credentials, or private project files in a public issue. If repository private vulnerability reporting is enabled, use the Security tab → Report a vulnerability. Otherwise contact the repository owner through a private channel before sharing details. No dedicated security email or response SLA has been established.

Include affected versions, OS/CPU, reproduction steps, impact, and a minimal non-sensitive example. The maintainers should enable GitHub private vulnerability reporting before a public release. The current code is 0.1.0; a supported-version policy will be established when releases are published.

## Current boundaries

- The Python API listens on loopback and has no per-user authentication. It is a local desktop service, not a public web API. Allowed origins include local development and Electron's file origin.
- Electron uses context isolation and renderer sandboxing. Navigation is limited to the application entrypoint; IPC requires a trusted top-level frame. External links allow HTTP(S), and the settings link is restricted to the expected macOS Accessibility panel.
- The app CSP allows dynamic JavaScript evaluation for procedural brush recipes. Shadowing globals is not a security sandbox. Import/edit recipes only from trusted sources; arbitrary brush JavaScript must be treated as executable code.
- TapPilot is an **unauthenticated LAN remote**. Starting its server exposes published profile actions to reachable clients. Use only a trusted private LAN, stop it after use, and never port-forward it. Pairing/authentication is a production follow-up for broader network use.
- Imported projects and assets are validated with format/size limits. These checks do not guarantee every malformed input or dependency vulnerability has been covered.

See [release gates](docs/production-plan.md) and [testing evidence](docs/testing.md). Guidance was checked against [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security).
