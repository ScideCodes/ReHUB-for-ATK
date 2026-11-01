# ReHUB for ATK

**An open-source Windows desktop configurator for ATK mice and keyboards.**

ReHUB runs locally in its own desktop window. Install it once and open it from the Start menu—no Node.js, terminal, browser setup, or local server is required.

[**Download Windows Setup 1.5.1**](https://github.com/ScideCodes/ReHUB-for-ATK/releases/download/v1.5.1/ReHUB-Setup-1.5.1-x64.exe) · [Release notes and checksum](https://github.com/ScideCodes/ReHUB-for-ATK/releases/tag/v1.5.1) · [Open-source code](https://github.com/ScideCodes/ReHUB-for-ATK/tree/desktop-source) · [Changelog](CHANGELOG.md)

## Install

1. Download `ReHUB-Setup-1.5.1-x64.exe` from this repository's Releases.
2. Run Setup and choose **Install / update ReHUB for ATK**.
3. Open ReHUB, close any other configurator using the device, and choose your device in the picker.

Windows x64 is the supported distribution target. The installer is currently unsigned, so Windows may display an unknown-publisher warning. Obtain it only from this repository and verify its checksum:

```powershell
Get-FileHash -Algorithm SHA256 .\ReHUB-Setup-1.5.1-x64.exe
```

Compare the result with `SHA256SUMS.txt` in the same release.

## Features

- Device-specific mouse and keyboard configuration, local profiles, and configuration import/export.
- Readback verification for supported hardware writes, diagnostics, and a hardware-free demo mode.
- Optional close-to-tray and launch-at-login settings.
- Installation details and a bundled uninstaller.
- User-reviewed community device reports to help improve hardware support.

Availability depends on the device family. Firmware flashing and bootloader interfaces are blocked. Physical-device behavior is not certified by the automated test suite.

## Update or uninstall

Use the app's manual update check or download the latest Setup from Releases.

To remove ReHUB, run Setup and select **Uninstall**, or use Windows **Settings → Apps → Installed apps**. The uninstaller asks whether to delete saved desktop profiles, settings, and cached data. Keeping them is the default. Browser data and exported files are outside desktop cleanup.

## Support

Use **Help support my device** in ReHUB to prepare a report. Review its contents before downloading it or opening a public GitHub issue draft. Reports collect device identifiers and descriptor metadata without opening the device or sending commands; they omit serial numbers, packet contents, and saved settings. Nothing is submitted automatically.

For ATK product or order support, use the [official ATK Help Center](https://www.atk.store/pages/contact/?ref=xStore). Report ReHUB security issues privately through [SECURITY.md](SECURITY.md).

## Source and license

This branch contains desktop download documentation. Complete buildable source, tests, and packaging configuration are public on [`desktop-source`](https://github.com/ScideCodes/ReHUB-for-ATK/tree/desktop-source), with [release source archives](https://github.com/ScideCodes/ReHUB-for-ATK/archive/refs/tags/v1.5.1.zip). The standalone web distribution has been retired. The installer is hosted in Releases rather than Git history because it exceeds GitHub's per-file size limit.

ReHUB is licensed under [MIT](LICENSE). Bundled dependencies retain their own licenses. It is an independent community project and is not affiliated with or endorsed by ATK.
