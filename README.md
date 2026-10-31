# ATK Hub

An unofficial, local-first WebHID configurator for ATK mice and keyboards. Built with Vite, React 19, TypeScript, Tailwind, Zustand and Zod.
It has no backend, service worker or telemetry; everything runs in the browser.

> **Use at your own risk.** The write paths follow the original driver's source and are tested against fake HID devices only.
> They have **not** been tested on physical hardware. A bad write can leave a device misconfigured. See [Hardware test procedure](HARDWARE_TEST.md).

## Run

- `npm ci`, then `npm run dev`; open the printed URL in a WebHID-capable Chromium browser (Chrome, Edge, Brave).
- Choose **Add Device** for hardware, or the demo button in the header for a local mock that never touches hardware.
- `npm run build` generates the registry projections and builds the static site; `npm run preview` serves it.

## Hardware access

- Mouse: eight source-compatible models (including ZERO EX wired, 373B:11CC) use the verified settings path; receiver endpoints need a matching runtime CID/MID. Details: [mouse access](MOUSE_ACCESS.md).
- Keyboard: ATK 68 V2 Pro (373B:1048) writes with first-write consent and mandatory readback; other source-backed families are read-only or opt-in "untested" writes for the current session only. Details: [keyboard protocol](KEYBOARD_PROTOCOL.md).
- Identity checks, outgoing validation, opcode allowlists, EEPROM verification and write readback are never bypassed. DFU 0x0D stays blocked and FF02 boot endpoints are never offered.

## Data

- Device metadata: `src/devices/deviceRegistry.source.json`; `npm run registry:generate` produces the runtime registry.
- Some generators and parity scripts read the original driver's unpacked source from `../extracted/asar_unpacked`, which is not part of this repository.
- Maps and settings stay in the browser (localStorage / IndexedDB). Diagnostics reports exclude payloads, personal names and serials.

## Verify

- `npx tsc --noEmit`, `npm test`, `npm run test:devices`, `npm run lint`, `npm run build`, `npm run shots`.
- `node scripts/audit-browser.mjs`: axe accessibility audit of every demo page at 1440, 1100 and 900 px in both themes.

## Legal

This project is not affiliated with, endorsed by or sponsored by ATK. "ATK" and the product names are trademarks of their owners.
Product images and videos under `public/` are the property of their respective owners and are included only to identify the devices.
The source code is released under the [MIT License](LICENSE).
