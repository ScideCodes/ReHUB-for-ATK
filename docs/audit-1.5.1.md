# ReHUB 1.5.1 code review and remediation

Reviewed on 2026-11-01 using the ponytail audit/review and code-review-and-quality skills. The expected load is one local desktop user with asynchronous device sessions, local profile storage, and explicitly initiated device writes. The work covered each runtime segment, build/distribution entry points, and the connected tests. It is not physical-device or penetration-test certification.

## Coverage

| Segment | Review focus |
| --- | --- |
| `src/hid`, `src/protocol` | Mouse/keyboard connection lifecycles, pending replies, descriptor selection, packet guards, readback, family adapters and caches |
| `src/features`, `src/types` | Queued commands, connection identity, write planners, snapshot validation, import schemas, profile sessions and diagnostics |
| `src/devices`, `src/mock` | Device identities, registry/layout derivation, mock transport behavior and source parity; generated catalogs checked through their generators and matrix tests |
| `src/app`, `src/hub`, `src/ui` | Device workspaces, save paths, keyboard recording, map switching, appearance assets, dialogs and asynchronous effects |
| `src/store`, `src/support`, `src/desktop`, `src/i18n` | Persistence/imports, keyboard layout isolation, report privacy/consent, desktop bridge controls and translation flows |
| `electron`, `scripts`, build/workflow configuration | IPC/origin/path boundaries, external links, installer removal paths, startup entries, packaging, tests, dependency/secrets checks and distribution |

## First review and fixes

- Device hotplug and stale asynchronous connection work could replace or revive a mouse session. Connection cancellation/generation checks now protect discovery, opening and identification.
- A queued packet captured its connection only after waiting behind another packet. It now binds at enqueue time and uses a generation identity that also distinguishes reconnection to the same device.
- Mouse configuration imports could contain duplicate/missing buttons or inconsistent DPI stage IDs. Shared schema validation rejects them before planning writes. Timer values must fit the ten-second hardware unit; unsupported standby values are no longer synthesized from longer deep-sleep values.
- A BYKB descriptor with output reports `[0, 6]` passed admission but selected report zero. Selection now uses the matching nonzero report.
- Keyboard reset/import/shortcuts could select another layout. Those flows now preserve the current device layout. Recording and unsaved editor state are scoped to the active map.
- Custom asset replacement could leave an old wallpaper/font rendered, and failed storage writes could reject unhandled. Asset replacement waits for storage commit, refreshes listeners and releases stale object URLs; the upload UI reports save failures.
- Setup could accept an existing unrelated folder that later uninstall would recursively remove. A compiled directory guard now requires a dedicated empty/new folder or a registered application installation and rejects sensitive/root locations before replacement begins.
- Uninstall left ReHUB startup registration behind. Removal now clears ReHUB's Run/StartupApproved entries while upgrades preserve startup behavior.

## Second review and follow-up fixes

Reviewers inspected another segment's changes, reran focused tests, and used temporary mutations to verify that the new assertions detect reverted fixes. This pass found the missing explicit mouse-button save route, repeated custom-font replacement, and wrong-order imported keyboard matrices. These were fixed with additional regression tests. Keyboard matrices are now checked for every known layout before index-based edits can reach hardware.

## Validation and limits

Final local results: 734 application tests across 71 files, 342 device-matrix scenarios, and eight desktop tests passed. Full lint, TypeScript/build, development smoke, renderer/report checks and hardened packaged smoke passed. NSIS compiled both installer and uninstaller. The dependency audit reported zero known vulnerabilities; history/staged secret scans were clean apart from the documented historical prose false positive.

Application tests, every-device mock matrix, desktop policies, TypeScript, lint, renderer accessibility/report checks, development smoke, NSIS packaging, and hardened packaged smoke are release gates. The compiler-backed installer fixture runs against temporary folders and verifies that unrelated content remains untouched. The Windows workflow reruns that fixture after downloading packaging tools so it cannot silently skip a required compiler.

The dependency audit and redacted Gitleaks scans are recorded with release validation. The exact historical documentation-prose false positive remains documented in `.gitleaksignore`; no broad secret-rule exclusions were introduced.

No physical device writes, live exploit testing, clean-machine installation, real-user startup registration change, or destructive uninstall of user profiles was performed during this review. Generated vendor catalogs were checked through derivation and matrix/parity tests rather than individually certified against hardware. The installer remains unsigned. These limits must not be interpreted as verified behavior or as proof that all defects are absent.
