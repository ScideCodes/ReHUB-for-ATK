# ReHUB 1.5.0 release security review

Reviewed on 2026-11-01: Electron main/preload and IPC, custom-protocol file handling, external navigation, device chooser, community report privacy, NSIS install/uninstall hooks, dependency lockfile, and GitHub workflows. This is a focused source/dependency review, not a penetration-test certification.

## Remediation

- The chooser filtered only top-level bootloader collections. It now checks nested collections too. A regression test failed with the old filter and passed after the change.
- Updated electron-builder to 26.18.1. Explicit npm overrides use minimatch 11.0.3, ASAR 4.3.1 with glob 14.0.3, and Electron universal 3.0.6. The newer ASAR/universal APIs avoid replacing a callable legacy minimatch API with an incompatible module namespace. These overrides need review when upgrading packaging tooling; Windows packaging is the supported target.
- Fixed dependency advisories: [minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) and [glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). The affected dependencies are build tooling; the app does not expose an untrusted glob-pattern service.
- Enabled Electron ASAR integrity validation and ASAR-only loading. Disabled RunAsNode, Node options environment injection, and Node inspector CLI arguments in the packaged executable. The packaged smoke check reads the actual fuse values and exercises the renderer without enabling the main-process inspector.
- CI now checks dependency advisories and includes installer-hook changes in Windows workflow triggers. Uploaded artifacts are restricted to the intended Setup executable and checksum.

## Boundaries retained

Renderer sandbox/context isolation, no renderer Node integration, validated main-frame IPC senders, local custom-protocol path containment, restrictive CSP, allowlisted external links, explicit HID selection, and existing device identity/write/readback safeguards remain enabled. Reports inspect descriptors without opening devices or sending commands, omit serials and packet contents, and require review/consent before opening a public issue draft.

## Secrets review

Gitleaks scanned repository history with redacted output. Its generic-key rule matched protocol documentation prose in `KEYBOARD_PROTOCOL.md`; the exact historical finding is documented in `.gitleaksignore`. No broad path or rule exclusion was added. Generated test evidence, tooling, profiles, and release binaries remain ignored by Git.

## Limits

The installer is unsigned. Physical device writes, a clean-machine install/uninstall cycle, and destructive keep/delete-data outcomes have not been certified. Browser storage and exported files are outside desktop uninstall cleanup. No automated scan can guarantee the absence of vulnerabilities; report new issues using `SECURITY.md`.
