# Security policy

Re-HUB talks to USB devices, so we take reports seriously, especially anything that could send an unintended HID report, bypass an identity or readback check, or reach firmware/boot commands.

## Reporting

Please **do not open a public issue.** Use GitHub's private advisory form instead:
https://github.com/ScideCodes/ReHUB-for-ATK/security/advisories/new

Include steps to reproduce, the affected device family, and the redacted diagnostics report if relevant. You can expect an acknowledgement within a week.

## Scope

- In scope: this repository's code, including the WebHID transport, packet validators, write planners, file import, Electron bridge, and Windows installer/uninstaller.
- Out of scope: ATK's own firmware, apps and services.

## Desktop releases

Download installers only from this repository's GitHub Releases. The current Windows installer is unsigned. Compare `Get-FileHash -Algorithm SHA256 .\ReHUB-Setup-1.5.1-x64.exe` with the accompanying `SHA256SUMS.txt` before running it. A checksum verifies that the download matches the published artifact; it does not replace publisher signing or code review.

Desktop releases require a clean `npm audit --audit-level=moderate`, automated tests, and a packaged application smoke check. These checks cannot establish that all vulnerabilities are absent. See [the 1.5.1 code review](docs/audit-1.5.1.md) for scope and limitations.
