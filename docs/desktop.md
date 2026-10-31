# ReHUB desktop

The Windows desktop app bundles the built web interface and Electron. End users do not need Node.js, npm, a separate browser or a local server. The source and packaging configuration are in this repository under the MIT license; bundled dependencies retain their own licenses.

## Install and use

Download `ReHUB-Setup-<version>-x64.exe` from the release assets when published. The installer supports per-user installation, an installation folder choice, and Start menu/desktop shortcuts. Open ReHUB and choose your device in its device picker. Close the official configurator first. Bluetooth is not supported by the existing configurator.

Minimize uses the normal Windows taskbar. In Settings > Desktop app, optionally enable **Keep running in the system tray when I close the window** or **Launch ReHUB when I sign in to Windows**. Both are off by default. The tray menu can reopen ReHUB, disconnect devices and reload (after confirmation), open GitHub, or quit. Quit closes the app and its device connections. Disconnect/reload discards unsaved changes; finish any ongoing save first.

Device access requires choosing a device; no automatic blanket HID permissions. Electron retains permission for the current window lifetime. You may need to select the device again after restarting. Existing saved browser settings are separate from the desktop profile; export/import maps to transfer them.

**Check for updates** contacts GitHub Releases only when clicked. If a newer stable version exists, the app provides a GitHub download link; download and run the installer yourself. There is no updater service, silent download or background telemetry. Installation preserves the desktop profile in Electron's userData directory. Uninstall retains that profile so reinstalling can restore your maps/preferences.

The current local build is unsigned. Windows may display an unknown-publisher warning. Verify the release source and SHA-256 checksum; code signing is separate from the open-source build and requires the maintainer's signing credentials. No credentials are embedded in the app.

## Contribute a device report

Use the bug icon in the header, Settings > Community device support, or **Help support my device** in Diagnostics. A device does not have to be supported to create a report.

1. Optionally select a device. ReHUB reads already-exposed HID descriptors: VID/PID, usage pages/usages, report IDs and report byte sizes. It does not open the device or send commands. Bootloader collections are excluded.
2. Enter the model, connection type, symptoms, and optionally the firmware/OS and steps you tried. These are user-provided observations, not detected or verified values.
3. Review the exact report. No serial numbers, product-name strings, packet bytes, settings, macros or keystrokes are collected. When started from Diagnostics, only allowlisted identity/timing/error summaries are included; mock sessions remain labeled as mock.
4. Download the report, or acknowledge that GitHub issues are public and open a prefilled issue in your browser. GitHub sign-in is required. ReHUB never submits an issue for you and never asks for a GitHub token.
5. Large reports must be downloaded and attached to the issue; the URL contains attachment instructions instead of silently truncating the report. Offline users can download a report and attach it later.

VID/PID identify interfaces, not necessarily the mouse attached to a shared receiver. Reports guide protocol investigation; they do not grant write access or prove device support. Follow HARDWARE_TEST.md for separately supervised hardware testing.

## Develop and build

Requires Node.js 22.12+ for desktop tooling. Windows x64 is the packaged target.

```sh
npm ci
npm run desktop:dev
npm run test:desktop
npm run test:desktop:smoke
npm run test:support:browser
npm run desktop:dist
```

`desktop:dev` builds the site and opens it in Electron using `rehub://app/`; it does not require Vite to stay running. Rebuild/relaunch after editing. Browser development remains `npm run dev`.

`desktop:pack` builds an unpacked application under `release/win-unpacked`. `desktop:dist` builds the NSIS installer in `release/`. The icon is original generated artwork; regenerate with `node scripts/generate-desktop-icon.mjs`.

The Windows desktop workflow builds artifacts on relevant pull requests, version tags and manual dispatches. It does **not** automatically publish a release. Download its installer/checksum artifact and attach it to a reviewed GitHub Release. Builds without signing credentials remain unsigned.

## Security boundaries

- A standard secure custom protocol maps only to bundled `dist` files, with a restrictive CSP; no HTTP port is opened.
- Renderer sandboxing/context isolation are enabled, Node integration is disabled, and IPC verifies the requesting main frame/origin.
- External navigation only opens allowlisted HTTPS destinations in the user's browser. No remote pages execute inside the app.
- Chromium's HID blocklist and all existing protocol permission, identity, outgoing-packet and readback guards remain intact.
- Chooser permissions and packet inspection are distinct: report collection never connects or probes unknown hardware.

## Verification limits

Unit tests and automated Electron smoke checks use metadata/fake interfaces and never write physical hardware. A passing installer build is not physical-device certification. Test the installer on a clean Windows machine before publishing a release, and perform the existing hardware checklist separately with the relevant devices.
