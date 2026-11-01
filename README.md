<div align="center">

<a href="https://www.youtube.com/watch?v=ck-0Ct8F_g4" title="Watch the ReHUB showcase on YouTube">
  <img src="docs/media/hero.png" alt="ReHUB for ATK — rebuilt in the open" width="100%" />
</a>

# ReHUB for ATK

**Your ATK setup. Your settings. Open source.**

A local Windows desktop configurator for ATK mice and keyboards.

[![Release](https://img.shields.io/github/v/release/ScideCodes/ReHUB-for-ATK?color=ff6900&label=download)](https://github.com/ScideCodes/ReHUB-for-ATK/releases/latest)
![Windows x64](https://img.shields.io/badge/Windows-x64-0078D4?logo=windows&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-ff6900.svg)](LICENSE)
[![Application tests](https://img.shields.io/badge/tests-734%20passing-2ea44f)](https://github.com/ScideCodes/ReHUB-for-ATK/blob/desktop-source/docs/audit-1.5.1.md)
[![Stars](https://img.shields.io/github/stars/ScideCodes/ReHUB-for-ATK?style=flat&color=ff6900)](https://github.com/ScideCodes/ReHUB-for-ATK/stargazers)

### [Download Windows Setup](https://github.com/ScideCodes/ReHUB-for-ATK/releases/download/v1.5.1/ReHUB-Setup-1.5.1-x64.exe)

[Watch the showcase](#video-showcase) · [Screenshots](#screenshots) · [Features](#features) · [Install](#install) · [Source code](#open-source) · [Changelog](CHANGELOG.md)

</div>

ReHUB brings mouse and keyboard configuration into one desktop app: device-specific controls, local profiles, diagnostics, and a demo mode for exploring the interface. Install it once and launch it from the Start menu. No Node.js, terminal, separate browser, or local server is required.

## Video showcase

[**▶ Watch the 36-second showcase on YouTube**](https://www.youtube.com/watch?v=ck-0Ct8F_g4)

The original launch film introduces the interface, mouse controls, and keyboard workspace. Click the banner above to watch it.

## Screenshots

<a href="docs/media/home.png"><img src="docs/media/home.png" alt="ReHUB device dashboard showing a mouse and two keyboards" width="100%" /></a>

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="docs/media/dpi-1.png"><img src="docs/media/dpi-1.png" alt="Mouse DPI stage editor" width="100%" /></a>
      <br /><b>DPI stages</b><br />Per-stage sensitivity and colors, with separate X/Y values where supported.
    </td>
    <td width="50%" valign="top">
      <a href="docs/media/poll-8K.png"><img src="docs/media/poll-8K.png" alt="Polling rate and sensor settings" width="100%" /></a>
      <br /><b>Polling and sensor</b><br />Polling rates up to 8K and sensor options offered by the device family.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="docs/media/keys-assigned.png"><img src="docs/media/keys-assigned.png" alt="Mouse button assignment editor" width="100%" /></a>
      <br /><b>Button assignments</b><br />Mouse actions, keyboard shortcuts, and supported device functions.
    </td>
    <td width="50%" valign="top">
      <a href="docs/media/kb-light.png"><img src="docs/media/kb-light.png" alt="Keyboard lighting editor with per-key selection" width="100%" /></a>
      <br /><b>Keyboard workspace</b><br />Lighting, key remapping, trigger settings, and per-key color where supported.
    </td>
  </tr>
</table>

Select a screenshot to view it at full size. Images show the original interface in demo mode; available controls depend on the connected device.

## Features

| | What ReHUB provides |
| --- | --- |
| **Mouse configuration** | DPI stages, polling, sensor settings, button assignments, and power options where supported. |
| **Keyboard configuration** | Lighting, remapping, trigger travel, and rapid trigger for supported device families. |
| **Local profiles** | Edit, duplicate, import, and export configurations on your computer. |
| **Desktop controls** | Device picker, optional close-to-tray and launch-at-login, and manual release checks. |
| **Diagnostics and demo mode** | Inspect redacted device diagnostics or explore the interface without hardware. |
| **Appearance** | Light and dark themes, custom backgrounds, device colors, and nine interface languages. |
| **Community reports** | Review device identifiers and descriptor metadata before sharing a support report. |

## Device support and verification

Support is granted per device family and identity. Some models support verified writes, some require explicit consent for untested writes, and others remain read-only or demo-only. Firmware flashing and bootloader interfaces are blocked.

The 1.5.1 release passed **734 application tests**, **342 mock device scenarios**, and **8 desktop tests**, including compiled installer safety fixtures. Automated checks do not certify physical hardware behavior. See the [review record](https://github.com/ScideCodes/ReHUB-for-ATK/blob/desktop-source/docs/audit-1.5.1.md), [mouse access notes](https://github.com/ScideCodes/ReHUB-for-ATK/blob/desktop-source/MOUSE_ACCESS.md), and [hardware checklist](https://github.com/ScideCodes/ReHUB-for-ATK/blob/desktop-source/HARDWARE_TEST.md).

## Install

1. [Download ReHUB Setup 1.5.1 for Windows x64](https://github.com/ScideCodes/ReHUB-for-ATK/releases/download/v1.5.1/ReHUB-Setup-1.5.1-x64.exe).
2. Run Setup and choose **Install / update ReHUB for ATK**.
3. Open ReHUB, close other configurators using the device, and select your device in the picker.

The installer is currently unsigned. Obtain it from this repository's [Releases](https://github.com/ScideCodes/ReHUB-for-ATK/releases/latest) and compare its checksum with the accompanying `SHA256SUMS.txt`:

```powershell
Get-FileHash -Algorithm SHA256 .\ReHUB-Setup-1.5.1-x64.exe
```

For updates, use the app's manual release check or download the latest Setup. To uninstall, run Setup and select **Uninstall**, or use Windows **Settings → Apps → Installed apps**. You can keep or delete saved desktop profiles, settings, and cached data; keeping them is the default. Exported files and browser data are outside desktop cleanup.

## Open source

ReHUB is MIT licensed. The complete application source, tests, and packaging configuration are public on [`desktop-source`](https://github.com/ScideCodes/ReHUB-for-ATK/tree/desktop-source). Each release includes a matching source archive alongside the Windows installer and checksums.

[Browse the source](https://github.com/ScideCodes/ReHUB-for-ATK/tree/desktop-source) · [Build instructions](https://github.com/ScideCodes/ReHUB-for-ATK/tree/desktop-source#build-and-test) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Support

Use **Help support my device** inside ReHUB to prepare a community report. Review its contents before downloading it or opening a public GitHub issue draft. No device commands are sent to prepare the report, and nothing is submitted automatically.

- [Report a ReHUB issue](https://github.com/ScideCodes/ReHUB-for-ATK/issues)
- [Official ATK Help Center](https://www.atk.store/pages/contact/?ref=xStore) for ATK product and order support
- [Security policy](SECURITY.md) for private vulnerability reports

## Star history

<a href="https://star-history.com/#scidecodes/rehub-for-atk&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=scidecodes/rehub-for-atk&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=scidecodes/rehub-for-atk&type=Date" />
    <img alt="ReHUB for ATK GitHub star history" src="https://api.star-history.com/svg?repos=scidecodes/rehub-for-atk&type=Date" width="100%" />
  </picture>
</a>

## License and affiliation

Source code is released under [MIT](LICENSE); bundled dependencies retain their own licenses. ReHUB is an independent community project and is not affiliated with or endorsed by ATK. Product names and artwork belong to their respective owners.
