# ReHUB for ATK — Desktop source

An unofficial, open-source desktop configurator for Windows, macOS and Linux for ATK mice and keyboards. ReHUB runs locally, uses WebHID to communicate with supported devices, and reads supported settings back after writes.

[Download](https://github.com/ScideCodes/ReHUB-for-ATK/releases/latest) · [Changelog](CHANGELOG.md) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Distribution

The default `main` branch is the download and documentation page. This public `desktop-source` branch contains the complete MIT-licensed desktop application and its build configuration. Release tags identify the corresponding source revision. Installers and SHA-256 checksums are attached to GitHub Releases.

ReHUB is distributed as a desktop application: a Windows x64 installer, a universal macOS disk image (Apple Silicon and Intel), and a Linux x64 AppImage and `.deb` package. React and Vite build its internal Electron renderer; no standalone website or browser launcher is distributed.

## Install

- **Windows:** run `ReHUB-Setup-<version>-x64.exe`.
- **macOS:** open `ReHUB-<version>-mac-universal.dmg` and drag ReHUB to Applications. The app is not signed with an Apple Developer ID, so the first launch is blocked: open **System Settings → Privacy & Security** and choose **Open Anyway** (or Control-click the app and choose **Open**).
- **Linux (.deb):** `sudo apt install ./ReHUB-<version>-linux-amd64.deb`. The package installs a udev rule that lets the signed-in user reach supported ATK devices; reconnect the device once after installing.
- **Linux (AppImage):** make `ReHUB-<version>-linux-x86_64.AppImage` executable and run it. Linux only lets apps open USB devices that a udev rule allows, so install the rule once, then reconnect the device:

  ```sh
  sudo curl -fsSL -o /etc/udev/rules.d/70-rehub-atk.rules https://raw.githubusercontent.com/ScideCodes/ReHUB-for-ATK/desktop-source/electron/linux/70-rehub-atk.rules
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```

  On Ubuntu 24.04 and newer, AppImages need `libfuse2` (`sudo apt install libfuse2t64`).

## Desktop features

- Mouse configuration and keyboard configuration where supported by each device family.
- Local profiles, configuration import/export, diagnostics, and a demo mode that does not access hardware.
- Device picker, optional close-to-tray and launch-at-login (Windows and macOS) settings, and manual release checks.
- Windows Setup install/update/uninstall choices, installation details, and optional removal of desktop settings.
- User-reviewed community device reports containing interface identifiers and descriptor metadata.

## Build and test

Use Node.js 22.12 or newer. Each platform builds its own packages: Windows x64 for the installer, macOS for the disk image, Linux x64 for the AppImage and `.deb`.

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
npm run desktop:dist          # Windows installer
npm run desktop:dist:mac      # macOS universal .dmg
npm run desktop:dist:linux    # Linux AppImage and .deb
node scripts/packaged-smoke.mjs <path to the unpacked app executable>
```

Packages are written to `release/`. Automated renderer checks use a temporary loopback server as a test fixture; it is not part of the desktop distribution.

## Device safety and privacy

Identity checks, outgoing-command validation, readback verification, firmware-command blocking, and bootloader exclusions remain mandatory. Automated tests use fake devices. Physical hardware behavior and clean-machine installation/removal require separate validation; see [HARDWARE_TEST.md](HARDWARE_TEST.md).

Profiles stay on the computer. Device reports require review and consent before a public GitHub issue draft opens. ReHUB does not submit reports automatically or request a GitHub token. Read the [desktop guide](docs/desktop.md) for installation, removal, and report details.

The Windows installer and the macOS app are currently unsigned (macOS builds carry only an ad-hoc signature). Verify the published SHA-256 checksums (`SHA256SUMS.txt`, `SHA256SUMS-mac.txt`, `SHA256SUMS-linux.txt`) and obtain downloads only from this repository's Releases.

## License and affiliation

[MIT](LICENSE). Bundled dependencies retain their own licenses. ReHUB is a community project and is not affiliated with or endorsed by ATK. ATK product names and artwork belong to their respective owners.
