# Security policy

Re-HUB talks to USB devices, so we take reports seriously, especially anything that could send an unintended HID report, bypass an identity or readback check, or reach firmware/boot commands.

## Reporting

Please **do not open a public issue.** Use GitHub's private advisory form instead:
https://github.com/ScideCodes/ReHUB-for-ATK/security/advisories/new

Include steps to reproduce, the affected device family, and the redacted diagnostics report if relevant. You can expect an acknowledgement within a week.

## Scope

- In scope: this repository's code, including the WebHID transport, packet validators, write planners and file import.
- Out of scope: ATK's own firmware, apps and services.
