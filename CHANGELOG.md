# Changelog

All notable changes to Re-HUB for ATK. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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

[1.5.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ScideCodes/ReHUB-for-ATK/releases/tag/v1.0.0
