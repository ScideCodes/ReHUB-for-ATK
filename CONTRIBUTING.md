# Contributing

Development takes place on the public `desktop-source` branch. The default `main` branch contains download documentation.

## Development

```powershell
git clone --branch desktop-source https://github.com/ScideCodes/ReHUB-for-ATK.git
cd ReHUB-for-ATK
npm ci
npm run dev
```

Use demo mode for interface work. It never opens physical devices.

## Pull requests

- Target `desktop-source` and keep changes focused.
- Run type checking, lint, application tests, desktop tests, and `npm audit --audit-level=moderate`.
- Run `npm run test:devices` for protocol changes, and the packaged smoke check for Electron or packaging changes.
- Include a failing-before/passing-after regression test for a bug fix.
- Describe what changed and any checks that could not be completed.

## Device changes

Never invent protocol data. Cite the original driver's source or reproducible device observations. Keep identity checks, outgoing-packet validation, readback checks, firmware-command blocks, and bootloader exclusions intact. New hardware writes remain unverified until tested on the relevant device under [HARDWARE_TEST.md](HARDWARE_TEST.md).

For ordinary support, use the app's reviewed device-report flow or GitHub Issues. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).
