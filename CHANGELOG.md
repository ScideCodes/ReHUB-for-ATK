# Changelog

All notable changes to Re-HUB for ATK. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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

[1.3.1]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ScideCodes/ReHUB-for-ATK/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ScideCodes/ReHUB-for-ATK/releases/tag/v1.0.0
