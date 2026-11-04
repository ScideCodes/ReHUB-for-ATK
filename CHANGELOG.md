# Changelog

All notable changes to ReHUB for ATK. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.5.3] - 2026-11-04

First published build with the 1.5.2 changes below.

### Fixed
- The **Fingertip Ripple** keyboard lighting mode showed its Chinese source name (指尖涟漪) in every language. It now has an English name and translations for all eight languages.
- The desktop device picker could close by itself when the app updated its address (switching maps rewrites the `#/map/...` hash). Only a real page load now cancels a pending device selection.
- The desktop device picker could show a stale device list when its initial request returned after a live update, and a failed initial request raised an unhandled rejection.
- Removed a duplicate mouse hotplug handler that only matched one of the two ATK vendor IDs. The HID client already reconnects every supported mouse and refreshes its settings.

### Verification
- Typecheck, lint, 740 application tests, 8 desktop tests and the desktop smoke test pass. Physical hardware was not tested.

## [1.5.2] - 2026-11-04

### Changed
- **New LOD height illustration** in the mouse Parameter panel: a side view of the mouse lifted above the desk, with the sensor beam and a dimension marker showing the selected height. The gap grows across the sensor's full range (it used to move about 4 px), and the drawing follows the light/dark theme and the colourway accent. It is an original drawing, not artwork taken from the ATK driver.
- The ATK ZERO EX and its 8K Dongle-H receiver are now shown as **ATK Frost Zero Extreme** everywhere: device picker, home cards, mouse page, help text, mock device and the hardware checklist.
- The window opens at a size that fits the screen and remembers its last position, size and maximized state.
- The notification badge sits clear of the bell icon.
- The "Store (Rubik)" font preset is now **Default (Manrope)**. Rubik was never bundled, so that preset silently fell back to Segoe UI in some panels.

### Fixed
- **Selecting a mouse that was not already connected did nothing.** A missing pair of braces attached the "connect" branch to the wrong `if`, so a new mouse never connected, and an already-connected busy mouse was reconnected mid-operation instead.
- **Opening a different mouse during a save or read showed the wrong device.** The device page now refuses with "Wait for the current mouse operation." instead of labelling the old session with the new model.
- **Quitting the desktop app threw a ReferenceError** (`saveWindowBounds is not defined`), so the window position was not saved on quit.
- **Changing close-to-tray or launch-at-login erased the saved window position.** Preferences and window bounds are now written together, synchronously, so a close and a quit can no longer interleave two writes of the same file.
- Saved window bounds with missing or non-numeric coordinates are ignored instead of being passed to the window.
- **Packaged builds showed raw HID names in the device picker.** `electron/deviceNames.json` was not included in the installer, so every model-name lookup silently failed. The renderer's duplicate hard-coded name mapping is removed.
- **Mouse finishes were missing when no model was selected.** The default finish list looked the mouse up by its old name and found nothing.
- A receiver paired with the Frost Zero Extreme reported the old model name after connecting.
- Keyboard map exports are named `atk-keyboard-maps.json` instead of `atk68-keyboard-maps.json` for every keyboard.
- The app no longer requests a missing `/favicon.ico`; it uses the bundled app icon.
- **At the minimum window size (1024 px) the DPI, Parameter and Configuration panels ran off the right edge.** A fixed 960 px panel width overrode the narrow layout, so the second DPI column, sensor rotation and the **New** button were cut off. The panel now sits beside the device tile, and the parameter grid stacks into one column below 1268 px.
- **Clicking a control could slide the whole app sideways with no way back.** The app root hid its overflow, so moving focus to a cut-off control scrolled the header and device tile off-screen. The root now clips instead.
- **The bottom section dock was cut off below about 1300 px** ("Other settings" hidden, active highlight misplaced). It now drops its icons and tightens spacing below 1320 px, and fits in English, German, Russian, French and Turkish down to 1024 px.
- "Latest VersionV 3.01" now reads "Latest Version V3.01", and an unknown firmware shows "—" instead of "V—".
- The mouse Computer Config note was missing a space ("computer.Temporarily").
- 21 interface strings stayed in English in every other language, including the sleep-time and calibration help text, the advanced-key names and descriptions (DKS, MT, TGL, SOCD), firmware labels, **Help support my device** and several button tooltips. They now have translations for all eight languages.

- **A corrupt saved mouse-map list crashed the app on every start.** Saved maps were loaded from browser storage without validation. They are now checked on load; invalid data falls back to the default maps and the original is kept under `atk-webhid-config-storage.invalid` for recovery.
- **A broken image or font file could be set as the wallpaper or UI font.** Files that pass the type check but cannot be decoded now show "This image could not be read. Try another file." (or the font error) and are not saved.
- **Error toasts covered the section dock** on device pages. They now appear above it.
- The configuration lists marked the active map and onboard slot with a permanent "Applying" badge, which read like an operation in progress. It now says **In use**.
- The wallpaper page showed background blur in `%`; it is in `px`.
- The font note claimed "Default (OPPO Sans + HarmonyOS)"; neither font is bundled. It now says **Default (Manrope)**.
- The interface said "Re-HUB" in several places (Settings, firmware and calibration notes); it now says ReHUB everywhere, like the window title and installer.
- Upload and import error messages were English in every language; they are now translated.
- A mouse command that timed out could remove a different pending command with the same opcode from the wait list, so a late reply could resolve the wrong request. Each command now removes only its own entry.

- **Mice that also expose a bootloader interface could not create a support report**, although they connect normally (for example the Frost Zero Extreme receiver). The report picker hid them and the report builder refused them. Reports now leave bootloader collections out and refuse only devices that expose nothing else.

### Verification
- CI now lints the whole repository (`npm run lint`), including `electron/`, which is where the quit-time ReferenceError went unnoticed.
- The bundle audit (`npm run audit:bundle`) failed on every build because its allowlist predated the keyboard layout and DPI table datasets. It now blocks raw extraction inputs by name instead.
- New regression test: selecting a mouse that is not connected starts a connection (fails before the fix, passes after).
- Six unit tests that still expected the old model name were updated. Results: 735 unit tests, 342 mock-device scenarios, 8 desktop tests and the support-flow browser smoke all pass; the browser accessibility audit reports 0 axe violations across 90 screen, width and theme combinations.
- An exploratory pass drove every demo device and section in all nine languages at 1024, 1180 and 1280 px, clicking each safe control and checking for page errors, console errors, off-screen controls, clipped text and untranslated strings. It found the layout and translation defects above.
- The browser audit now also runs at 1024 and 1240 px and fails when content, including the section dock, runs past the window edge at any width the desktop window allows (fails before the layout fixes, passes after).
- Not run here: the Electron desktop and packaged smoke tests (no Electron binary or Windows host), and `scripts/open-flow-cls.mjs`, which still targets a retired home screen and is not part of CI.

## [1.5.1] - 2026-11-01

### Changed
- ReHUB is now distributed as a Windows desktop application. The default branch is a download/documentation page, and complete buildable source is preserved on the public `desktop-source` branch and release source archives.
- Removed standalone browser launchers, static-site preview commands, and the broken legacy screenshot command. `npm run dev` now opens the desktop application.
- Rewrote repository, contribution, and support documentation around the desktop distribution.

### Fixed
- The ATK help center button now opens `https://www.atk.store/pages/contact/?ref=xStore`, including from the Windows desktop app.
- Supported-device hotplug cannot replace an active mouse session, and cancelled discovery/open/identification cannot revive a disconnected session.
- Queued commands remain bound to the session that created them, including disconnect/reconnect of the same device.
- Mouse configuration import rejects missing/duplicate buttons, invalid DPI stage identities, and timer values hardware cannot represent. Long deep-sleep settings preserve the independently supported standby timer.
- BYKB keyboards select the valid nonzero output report when report zero is listed first.
- Keyboard reset, backup import, and numeric shortcuts preserve the current device layout. Imported key matrices must match the selected layout and key order.
- Recording shortcuts and unsaved macro editor state cannot leak into another keyboard map.
- Mouse button remapping exposes its explicit save action on the current device screen.
- Replacing a custom wallpaper or font refreshes the displayed asset, and failed local asset saves are handled.
- Setup rejects unrelated nonempty folders before replacing an installation. Uninstall removes ReHUB's login startup registration while updates preserve it.

### Verification
- Repeated segment review, independent cross-review, and new failing-before/passing-after regression checks cover the fixes. The Windows workflow also executes compiled installer-directory safety fixtures after packaging.
- Hardware, clean-machine installation, and destructive user-profile removal require separate validation; automated checks use mocks or temporary fixture folders.

## [1.5.0] - 2026-11-01

### Added
- Windows x64 desktop installer: opens ReHUB directly without Node.js, npm, a separate browser, or a local server.
- Optional close-to-tray and launch-at-login settings, device picker, and manual GitHub release checks.
- Setup offers install/update or uninstall, with a live **Show details** log and a bundled uninstaller.
- Uninstall asks whether to delete desktop profiles, settings, and cached data. Keeping data is the default; browser storage and exported files are untouched.
- Community device reports collect VID/PID and HID report-layout metadata without opening the device or sending commands. Review and download the report or open a prefilled public GitHub issue with explicit consent.
- Windows packaging workflow and SHA-256 checksums for downloadable installers.

### Security
- Sandboxed renderer, context isolation, validated IPC senders, restricted custom protocol, restrictive content policy, and allowlisted external HTTPS links.
- Packaged Electron disables RunAsNode, Node options environment injection, and Node inspector arguments, and requires integrity-validated `app.asar` code.
- Device picker excludes bootloader collections at every nesting level.
- Updated packaging tooling and pinned transitive security fixes for minimatch and glob; release validation requires a clean npm vulnerability audit.

### Notes
- The Windows installer is unsigned. Review the release source and verify its SHA-256 checksum.
- Automated tests use fake devices. Physical hardware writes and a clean-machine install/uninstall cycle have not been certified.

## [1.4.1] - 2026-10-31

### Fixed
- **"Open the official ATK web driver" sat at the very edge of the Axial Alignment panel.** The keyboard picture now shrinks to make room, and the buttons keep a clear margin from the panel edge (the same goes for "Start Calibration" in demo mode).
- **The last "Apply" button in the mouse's Configuration Management** was pushed against the bottom edge on smaller windows. The list now scrolls cleanly inside the panel.

## [1.4.0] - 2026-10-31

### Added
- **Axial Alignment works in demo mode.** Start calibration, then click each key: it turns green and a counter shows your progress until you finish. On a real keyboard the page now explains that switch calibration rewrites data stored on the keyboard and hasn't been tested on hardware yet, and links to the official ATK web driver to do it there. Previously the button was simply disabled.

### Changed
- **Larger key labels only on the Light tab** (9 px to 10.5 px). The Trigger and Key Change tabs are back to their original size.
- **Configurations no longer show the Cloud Config panel**, the "Link Game/App" note or the cloud-upload icons. These need an ATK account or the desktop app, so they were never usable here.

### Fixed
- **Device images looked grainy and low-resolution**, most noticeably on the home page. Images are now ATK's original files wherever possible (up to 1600 px), instead of 800 px re-compressed copies.
- **The calibration colour legend no longer covers the keyboard.**

## [1.3.2] - 2026-10-31

### Fixed
- **Lighting effect names were cut off** ("Customiz…", "Single Col…"). The effect column now widens on larger screens, and long names wrap onto a second line instead of being shortened. In longer languages such as German and Russian, the panel scrolls slightly rather than hiding text.

### Changed
- **Key labels are 5% larger** on the keyboard, on the Light tab and in the Key Change picker.

## [1.3.1] - 2026-10-31

### Fixed
- **Keyboard toolbar labels were cut off in other languages.** "Select All Keys", "Invert Selection", "Clear Selection" and "Restore Default" sat in a fixed-width column, so longer translations (for example German, French and Turkish) were clipped. The column now widens to fit, and wraps a very long label onto two lines.

## [1.3.0] - 2026-10-31

### Fixed
- **"Reading keyboard · 100%" kept flashing** when you opened keyboard settings. After the first read, Re-HUB quietly loads the other tabs in the background, and each of those loads briefly showed the notice. Background loads are now silent, and a tab's own read only shows the notice if it takes longer than half a second.

### Changed
- **Background blur and brightness now update live** while you drag the slider, instead of only when you let go. Updates are limited to one per screen refresh and only the wallpaper is redrawn, so dragging stays smooth. The value is saved when you release the slider.

## [1.2.0] - 2026-10-31

### Fixed
- **Language could not be changed by clicking.** The page was drawn on top of the header's menus and tooltips, so a click on a language landed on the page instead. Header menus and tooltips now always sit above the page.
- **Header tooltips were cut off** on hover, for the same reason.
- **Open tabs pushed the header icons off-screen** when several were open (for example, a device, Wallpaper and Settings). Tabs now shrink and shorten their labels with "…"; hover to see the full name.
- **Home cards were clipped** when lifting on hover.
- **Picking a language now closes the menu.**

### Added
- **One-click start:** double-click `start.bat` on Windows, or run `./start.sh` on macOS and Linux. It installs everything on the first run and opens the app in your browser.
- **A rewritten Quick start in the README**, with step-by-step instructions for beginners and a troubleshooting table for common errors.
- **An automated check** that a real click reaches the header menus, so this regression can't slip back in.

## [1.1.0] - 2026-10-31

### Added
- **Nine interface languages:** English, 简体中文, 繁體中文, 한국어, 日本語, Deutsch, Français, Русский and Türkçe. Your choice is remembered between visits. Device names, key labels and your own data are never translated.
- **Message center:** errors from setting up a device are collected behind the bell, with an unread badge and a **Clear** button. Some of these errors were previously never shown anywhere.

### Changed
- **The header is simpler:** the mouse-sleep help button, the plugin market, the login and the "ATK HUB Client" download link are gone.
- **Settings and Wallpaper pages:** the side menu that did nothing is removed, the layout adapts to narrow windows, and **Back** returns to the screen you opened the page from.
- **Firmware Tools** now explains why Re-HUB never updates firmware, and links to the official ATK web driver.
- **Cloud Config panels** no longer show disabled login buttons.
- **Lighting mode 0 is now called "Off"** instead of "Close".

### Fixed
- **Background wallpapers never appeared.** A layout rule collapsed the wallpaper layer to zero height. Wallpapers now show on the home, mouse and keyboard screens, and your choice is kept after a reload.
- **Text on the wallpaper page squeezed** into narrow columns in smaller windows.

## [1.0.0] - 2026-10-31

### Added
- First public release: an unofficial, open-source, local-first WebHID configurator for ATK mice and keyboards, with read-back-verified writes, a demo mode, offline maps, diagnostics, light and dark themes, and a README, launch film, CI and contribution guides.

[1.5.2]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ScideCodes/ReHUB-for-ATK/releases/tag/v1.0.0
