# ReHUB for ATK — Desktop source

An unofficial, open-source Windows desktop configurator for ATK mice and keyboards. ReHUB runs locally, uses WebHID to communicate with supported devices, and reads supported settings back after writes.

[Download Windows Setup](https://github.com/ScideCodes/ReHUB-for-ATK/releases/latest) · [Changelog](CHANGELOG.md) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Distribution

The default `main` branch is the download and documentation page. This public `desktop-source` branch contains the complete MIT-licensed desktop application and its build configuration. Release tags identify the corresponding source revision. Installers and SHA-256 checksums are attached to GitHub Releases.

ReHUB is distributed as a Windows x64 desktop application. React and Vite build its internal Electron renderer; no standalone website or browser launcher is distributed.

## Desktop features

- Mouse configuration and keyboard configuration where supported by each device family.
- Local profiles, configuration import/export, diagnostics, and a demo mode that does not access hardware.
- Device picker, optional close-to-tray and launch-at-login settings, and GitHub release checks with a top-bar update button that installs the verified update silently after you confirm.
- Setup install/update/uninstall choices, installation details, and optional removal of desktop settings.
- User-reviewed community device reports containing interface identifiers and descriptor metadata.

## Build and test

Use Windows x64 with Node.js 22.12 or newer.

```powershell
npm ci
npm run dev
```

`npm run dev` builds and opens the desktop application. It does not start a standalone web server. Rebuild and relaunch after editing the renderer.

```powershell
npm run typecheck
npm run lint
npm test -- --pool=threads --maxWorkers=2
npm run test:desktop
npm run test:devices
npm audit --audit-level=moderate
npm run desktop:dist
node scripts/packaged-smoke.mjs
```

The installer is written to `release/ReHUB-Setup-<version>-x64.exe`. Automated renderer checks use a temporary loopback server as a test fixture; it is not part of the desktop distribution.

## Device safety and privacy

Identity checks, outgoing-command validation, readback verification, firmware-command blocking, and bootloader exclusions remain mandatory. Automated tests use fake devices. Physical hardware behavior and clean-machine installation/removal require separate validation; see [HARDWARE_TEST.md](HARDWARE_TEST.md).

Profiles stay on the computer. Device reports require review and consent before a public GitHub issue draft opens. ReHUB does not submit reports automatically or request a GitHub token. Read the [desktop guide](docs/desktop.md) for installation, removal, and report details.

The Windows installer is currently unsigned. Verify its published SHA-256 checksum and obtain it only from this repository's Releases.

## License and affiliation

[MIT](LICENSE). Bundled dependencies retain their own licenses. ReHUB is a community project and is not affiliated with or endorsed by ATK. ATK product names and artwork belong to their respective owners.
