<div align="center">

<a href="https://www.youtube.com/watch?v=ck-0Ct8F_g4" title="Watch the launch film on YouTube"><img src="docs/media/hero.png" alt="Re-HUB for ATK: the ATK web driver, rebuilt in the open" width="100%" /></a>

# Re-HUB for ATK

**The ATK web driver, rebuilt in the open.**<br />
An unofficial, open-source, local-first configurator for ATK mice and keyboards that runs in your browser over WebHID.

[![CI](https://github.com/ScideCodes/ReHUB-for-ATK/actions/workflows/ci.yml/badge.svg)](https://github.com/ScideCodes/ReHUB-for-ATK/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-ff6900.svg)](LICENSE)
![Tests](https://img.shields.io/badge/tests-707%20passing-2ea44f)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![WebHID](https://img.shields.io/badge/WebHID-Chromium-111111)
[![Stars](https://img.shields.io/github/stars/ScideCodes/ReHUB-for-ATK?style=flat&color=ff6900)](https://github.com/ScideCodes/ReHUB-for-ATK/stargazers)

[**▶ Watch the 36-second film on YouTube**](https://www.youtube.com/watch?v=ck-0Ct8F_g4) · [Quick start](#-quick-start) · [Features](#-features) · [Why Re-HUB](#-why-re-hub) · [Supported devices](#-supported-devices) · [Safety](#-safety-model) · [Changelog](CHANGELOG.md)

</div>

> [!WARNING]
> **Unofficial and hardware-untested.** Every write path follows the original driver's source and is verified against fake HID devices. None has been run on physical hardware yet. A bad write can leave a device misconfigured, so use it at your own risk. Real-device testers are very welcome: see [Hardware testing](HARDWARE_TEST.md).

## ✨ Why Re-HUB

<img src="docs/media/why.png" alt="Why Re-HUB: every write read back, 159 parity scenarios, 699 tests, MIT" width="100%" />

| | |
|---|---|
| **Every write is read back** | A setting only counts as saved when the device returns the same bytes. There are no acknowledgement-only "success" toasts. |
| **Matched to the original driver** | 159 parity scenarios replay ATK's own controllers and compare the outgoing HID reports byte for byte. |
| **Tested like software should be** | 707 automated tests, plus a mock matrix covering 342 device profiles, an accessibility audit and screenshot checks. |
| **Open source and local** | MIT licensed. No backend, no telemetry, no account: maps and settings stay in your browser's storage. |
| **Safe by construction** | Identity checks, an outgoing-packet allowlist and EEPROM verification are never bypassed. Firmware/DFU commands are permanently blocked and boot endpoints are never offered. |
| **Accessible** | Zero axe violations across 90 page states, in light and dark themes. |

## 🎛 Features

<table>
<tr>
<td width="50%"><img src="docs/media/dpi-1.png" alt="DPI stages" /><br /><b>DPI stages</b>: per-stage values and colours, with X/Y split where the mouse supports it.</td>
<td width="50%"><img src="docs/media/poll-8K.png" alt="Polling and sensor" /><br /><b>Polling and sensor</b>: 125 Hz to 8K and the sensor sampling modes, offered per model.</td>
</tr>
<tr>
<td width="50%"><img src="docs/media/keys-assigned.png" alt="Button remapping" /><br /><b>Button remapping</b>: DPI, config-file, wheel, keyboard and shortcut actions on any button.</td>
<td width="50%"><img src="docs/media/kb-light.png" alt="Keyboard lighting" /><br /><b>Keyboards</b>: lighting, trigger travel and rapid trigger, key remapping and per-key colour, where the family supports them.</td>
</tr>
</table>

Also included:
- **Offline maps:** edit, duplicate, import and export configurations without a device connected.
- **Demo mode:** try every screen with local mocks; no hardware is touched.
- **Diagnostics:** frame-level HID history, with redacted copy-to-clipboard reports.
- **Message center:** device and settings errors collect behind an unread badge on the bell, with one-click clear.
- **Nine languages:** English, 简体中文, 繁體中文, 한국어, 日本語, Deutsch, Français, Русский and Türkçe, remembered between visits.
- **Interface:** light and dark themes, background wallpapers on every screen, and a colourway picker per device.

## Windows desktop app

The desktop build opens ReHUB in its own window with no Node.js, terminal, browser setup or local server. It includes a device picker, optional close-to-tray and launch-at-login settings, and a manual GitHub update check.

Download `ReHUB-Setup-<version>-x64.exe` from [GitHub Releases](https://github.com/ScideCodes/ReHUB-for-ATK/releases) when a desktop asset is available. If the latest release has no installer yet, use the browser setup below or [build the desktop app from source](docs/desktop.md). Desktop artifacts are also produced by the Windows desktop GitHub Actions workflow.

**Help improve device support:** use **Help support my device** in the header, Settings or Diagnostics. ReHUB collects identifiers and report-layout metadata without sending device commands. Review the report, then download it or open a prefilled public GitHub issue. GitHub sign-in is required; nothing is submitted automatically. [Desktop and device-report guide](docs/desktop.md).

## 🚀 Quick start

You need two things:
- **Node.js:** download the **LTS** version from [nodejs.org](https://nodejs.org) and install it with the default options.
- **A Chromium-based browser:** Chrome, Edge, Brave or Opera. Firefox and Safari don't support WebHID.

### Windows: easiest way

1. On this page, click the green **Code** button, then **Download ZIP**.
2. Right-click the downloaded ZIP, choose **Extract All…**, and open the extracted folder.
3. Double-click **`start.bat`**.

The first start installs everything, which takes about a minute. After that your browser opens Re-HUB automatically.
Keep the black window open while you use Re-HUB, and close it to stop. Next time, just double-click `start.bat` again.

> If Windows asks for confirmation ("Windows protected your PC" or a security warning), click **More info** → **Run anyway**, or **Run**. `start.bat` is a short text file you can open in Notepad to check first.

### macOS and Linux

Download and extract the ZIP as above. Open a terminal in that folder and run:

```bash
./start.sh
```

### Using git and a terminal

```bash
git clone https://github.com/ScideCodes/ReHUB-for-ATK.git
```

```bash
cd ReHUB-for-ATK
```

```bash
npm ci
```

```bash
npm run dev
```

Then open the address it prints (usually http://localhost:5173). Run `npm ci` once; after that `npm run dev` is enough.
Always run the commands inside the `ReHUB-for-ATK` folder.

### First steps in the app

- **Try it safely:** click the demo icon (the small screen with a play button) in the header. Demo mode never talks to hardware.
- **Connect your own device:** click **Add Device** and pick it from the browser's list. First close the official ATK HUB app and any hub.atk.pro tab, because only one program can use the device at a time.

### Troubleshooting

| You see | Fix |
|---|---|
| `'vite' is not recognized…` | The install didn't finish. In the project folder, run `npm ci` again, then `npm run dev`. |
| `EPERM: operation not permitted` | Another copy of Re-HUB (or an editor) is using the files. Close every window running Re-HUB, then run `npm ci` again. |
| `Port 5173 is in use` | Nothing is wrong: Re-HUB picks the next free port. Open the address it prints. |
| `Cannot find path …` after `cd` | You're not in the right folder. Use the folder you extracted or cloned, for example `cd Downloads\ReHUB-for-ATK-main`. |
| Your device isn't in the list | Close the official ATK app and hub.atk.pro, plug the device in by cable or 2.4G receiver (Bluetooth isn't supported), and click **Add Device** again. |
| Nothing happens in Firefox or Safari | WebHID only works in Chrome, Edge, Brave or Opera. |

### For developers

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run preview` | Build and serve the static site |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:devices` | Mock matrix across every device profile |
| `npm run lint` / `npx tsc --noEmit` | Lint and type-check |
| `npm run shots` | Screenshot regression run (Playwright) |
| `node scripts/audit-browser.mjs` | Accessibility audit at three widths, in both themes |

## 🖱 Supported devices

The registry covers **320 ATK endpoints** (190 mouse, 130 keyboard). Access is granted per model, based on what the original driver's source proves.

| Tier | Devices | What you get |
|---|---|---|
| **Verified writes** | 8 mouse models on the PAW3950Ultra path (for example ZERO EX, 373B:11CC) and the ATK 68 V2 Pro keyboard (373B:1048) | Full settings, with mandatory readback |
| **Receivers** | 45 dongle endpoints | Writes only after the paired mouse's CID/MID proves a verified model |
| **Opt-in untested writes** | 108 keyboard endpoints (RS7, BITYUAN, HFD, BYKB families) | Source-backed writes, enabled per session after explicit consent |
| **Read-only** | 137 further mouse profiles, ARBITER keyboards | Settings are read; edits stay local |

Details: [mouse access](MOUSE_ACCESS.md) · [keyboard protocol](KEYBOARD_PROTOCOL.md).

## 🛡 Safety model

- **Identity first:** a device must match an exact VID/PID/usage identity (and CID/MID for receivers) before any write path opens.
- **Allowlisted packets:** every outgoing report passes `validateOutgoing` and per-family frame validators. Unknown commands are refused.
- **Readback on every write:** EEPROM and setting writes are compared byte for byte, and a mismatch is reported as a failure.
- **Never dangerous:** firmware update (DFU `0x0D`) is permanently blocked, and boot (`FF02`) endpoints are never offered in the picker.
- **No silent writes:** opening a device, switching maps or importing files never applies unrelated drafts.

## 🧱 Tech stack

Vite · React 19 · TypeScript (strict) · Tailwind · Zustand · Zod 4 · Vitest · Playwright. It's a static site with no server code.

```
src/
  devices/    device registry, layouts, capabilities, parity fixtures
  protocol/   packet codecs, per-family write planners and validators
  hid/        WebHID transport, keyboard/mouse clients, diagnostics
  hub/        the interface (mouse + keyboard workspaces, home, settings)
  features/   maps, device session, shared settings logic
  store/      Zustand stores (maps, keyboard, config)
```

## 🤝 Contributing

Issues and pull requests are welcome, and reports from real hardware are the most valuable. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and report security problems privately as described in [SECURITY.md](SECURITY.md).

## ⚖️ License and disclaimer

The source code is released under the [MIT License](LICENSE).

This project is **not affiliated with, endorsed by or sponsored by ATK**. "ATK" and product names are trademarks of their owners. Product images and videos under `public/` belong to their respective owners and are included only to identify the devices.

## ⭐ Star history

<a href="https://star-history.com/#scidecodes/rehub-for-atk&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=scidecodes/rehub-for-atk&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=scidecodes/rehub-for-atk&type=Date" />
    <img alt="Star history chart" src="https://api.star-history.com/svg?repos=scidecodes/rehub-for-atk&type=Date" />
  </picture>
</a>
