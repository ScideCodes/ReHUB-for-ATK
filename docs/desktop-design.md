# ReHUB desktop and community device reports

Approved direction: the user accepted the Electron desktop application and explicitly chose GitHub-only, fully open-source reporting on 2026-10-31. Proceed with implementation in an isolated branch; no hosted submission service.

## Experience
Windows installer bundles Chromium and the built React app. No Node installation, terminal, HTTP server or browser selection. Normal minimize goes to the taskbar. Optional close-to-tray and start-at-login are off by default. Tray exposes Open, Disconnect devices and Quit. Settings expose desktop preferences and a manual GitHub release check with an explicit download link (no silent binary installation).

HID requests use an accessible in-app device chooser. Never automatically select a device. Preserve Chromium's blocklist and all existing protocol/write guards. Permissions last for the window lifetime; selecting again after restarting is explicit. Disconnect cancels pending selection and reloads the renderer, closing its connections and clearing pending work; warn that unsaved changes are lost before doing so.

Device contribution is reachable from the header, Settings and Diagnostics, including when the device is unsupported. Metadata inspection uses requestDevice and reads descriptors only; it never opens a device or sends a report. VID/PID, usage pages, report sizes and IDs are collected automatically; model, connection, firmware and outcome are user-confirmed. A supplied diagnostics snapshot contributes only allowlisted identity/timing/error metadata, never frame bytes. Preview is frozen for export/sharing. GitHub issue creation remains the user's action in their browser. Large reports use a downloaded attachment and short issue body; nothing is silently dropped. Public-sharing consent precedes opening GitHub. No account/token inside ReHUB.

## Architecture and limits
Electron main uses a secure standard rehub://app origin to serve only bundled dist assets. Renderer is sandboxed, context-isolated and has no Node access. A narrow preload exposes preference, chooser and release-check IPC, validated against the main frame. Navigation/external links restricted to intended HTTPS destinations. No network on startup; update checks are explicit and only contact GitHub. Stable origin preserves local storage.

Use existing dialogs, buttons, spacing, typography and theme variables. Keep device reports as a single readable form with an explicit review step; existing light/dark style applies. Installer packaging uses electron-builder NSIS with per-user installation. Keep browser development and builds working.

## Approaches
Native launcher + external browser is smaller but requires two windows and compatible browser selection. Electron was selected for a unified interface and consistent WebHID environment. GitHub reports were selected instead of a hosted service, accepting GitHub sign-in and public issues.

## Verification
Unit tests: metadata-only collection, redaction, unknown devices, boot endpoints, URL length handling, protocol path containment, IPC origin checks, chooser cancellation/removal. Real Electron smoke: custom origin, assets, isolation, chooser, tray preferences, report review/export, restart persistence, external navigation. Build Windows installer and inspect artifacts. Existing unit suite, typecheck, lint, production build. No physical hardware writes; mock validation cannot certify device support.
