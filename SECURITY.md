# Security policy

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/ScideCodes/ReHUB-for-ATK/security/advisories/new). Do not publish exploit details or sensitive diagnostics in ordinary issues.

Include the ReHUB version, affected component, reproduction steps, and redacted evidence. Never include device serials, keystrokes, passwords, access tokens, or private configuration files.

## Downloads

Obtain Setup only from this repository's Releases and verify it against the accompanying `SHA256SUMS.txt`. The installer is currently unsigned. A matching checksum establishes that a download matches the published artifact; it is not a substitute for code review or publisher signing.

## Source and scope

The complete application source is available on the public [`desktop-source`](https://github.com/ScideCodes/ReHUB-for-ATK/tree/desktop-source) branch. The scope includes Electron, local storage/imports, device transports, packet validators, and installation/removal. ATK's firmware, stores, and services are maintained independently.

See the [1.5.1 review and verification record](https://github.com/ScideCodes/ReHUB-for-ATK/blob/desktop-source/docs/audit-1.5.1.md) for reviewed segments and limits. Automated scans and fake-device tests do not certify physical hardware behavior or guarantee the absence of vulnerabilities.
