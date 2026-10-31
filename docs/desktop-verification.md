# Desktop verification — 2026-10-31

ReHUB 1.5.0, Electron 45.2.1, Windows x64. Based on public repository commit e578b31.

## Passed locally

- Production build and TypeScript check.
- ESLint for application, Electron runtime, new test scripts and external theme initializer.
- 712 application tests across 67 files, including report metadata/privacy and composite-interface coverage.
- Five Electron policy/chooser tests: app origin, path containment, external URL allowlist, boot collection exclusion, hotplug/cancel lifecycle.
- Browser report form and review checks at 1440, 1100 and 900 pixels, both light and dark: 12 accessibility scans, zero violations. Fake composite devices expose both interfaces; zero open/send calls; serial/product-name strings absent from reports. Local browser report download passed.
- Real Electron development smoke and packaged executable smoke: secure custom origin, renderer sandbox/context isolation, no Node access, HID availability and picker cancellation, native event hotplug/unplug handling, clipboard write permission with read denied, report review/consent, GitHub issue URL, native local report save, close-to-tray, preferences retained across renderer reload.
- NSIS x64 installer built successfully. Installer and unpacked executable remain in ignored `release/`; SHA-256 manifest accompanies the installer.
- Independent review completed; hotplug event shape, clipboard permissions and composite-interface omissions were found and fixed. Follow-up review found no remaining actionable issues.

## Limits

Live-details correction: the previous inventory was printed only after extraction, leaving the pane empty during installation. The packaging hook now enables details before extraction. Regression test, six desktop tests, targeted ESLint, NSIS rebuild, and loading/executing the final hook through electron-builder's hook resolver passed. Checksum refreshed. Interactive installer UI verification remains outstanding.

Installer follow-up: enabled the standard **Show details** button for installation and removal, added an installed-file listing and uninstaller path, and rebuilt the NSIS x64 installer successfully. The build generated and bundled its uninstaller. The SHA-256 manifest was refreshed. The installer UI and a full install/uninstall cycle were not exercised.

- No physical device configuration writes or hardware-support certification.
- Installer built and packaged executable launched; clean-machine installation/uninstallation and launch-at-login registration were not exercised on this workstation.
- Installer is unsigned. No release, update or device report was published during testing.
- Existing `npm run shots` fails before running because this public repository lacks its imported `scripts/shots/` helper files. New browser/desktop checks above run independently.
- Hidden Electron windows can stop producing screenshot frames; desktop smoke asserts live state rather than screenshotting a hidden tray window. Visual evidence comes from the browser checks.

## Reproduce

```sh
npm ci
npm test
npm run test:desktop
npm run build
npx playwright install chromium
npm run test:support:browser
npm run test:desktop:smoke
npx electron-builder --win nsis --x64 --publish never
node scripts/desktop-smoke.mjs "release/win-unpacked/ReHUB for ATK.exe"
```

Machine-readable smoke/browser evidence and screenshots are generated under ignored `audit/desktop/`. The Windows desktop workflow publishes the installer, checksum and test evidence as workflow artifacts, without creating a release.
