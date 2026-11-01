# ReHUB Desktop Implementation Plan

> Execution: native implementation in this session, followed by an independent whole-change review, using the executing-plans workflow. User has authorized implementation.

**Goal:** Ship a Windows installer and GitHub-only device reporting without changing device protocol permissions.
**Architecture:** Bundled React app served through Electron's custom protocol; narrow sandboxed preload; metadata-only report builder and reviewed GitHub issue handoff.
**Tech Stack:** Existing React/TypeScript/Vite/Vitest; Electron; electron-builder NSIS; Playwright Electron smoke tests.
**Spec:** desktop-design.md

## Global constraints
- No protocol/write-gate changes, no telemetry, no automatic submissions, no physical hardware writes.
- No Node/browser prerequisite for end users. No HTTP server.
- Preserve unrelated files and browser workflows. Never publish a release or issue during tests.

## Review focus
- Unknown devices and boot collections: metadata collection does not open/send; boot endpoints excluded.
- Public reports: extra properties and frame bytes cannot cross the report allowlist; user text is explicitly reviewed.
- Malformed paths/URLs/IPC frames: deny file escape, external navigation and untrusted IPC.
- Device unplug/cancel/reload: resolve chooser callbacks once, remove stale selection, no leaked listeners.
- Offline/large report: export works offline, overlong issue URLs provide an attachment workflow.

## Tasks
- [x] 1. Add policy and reporting tests, run failing tests, implement pure policy/report builders and verify.
  Files: electron/policy.cjs, electron/policy.test.cjs, src/support/deviceReport.ts, src/support/deviceReport.test.ts.
- [x] 2. Implement Electron runtime, preload, native tray/preferences/release check, chooser UI and packaging. Preserve all HID gates.
  Files: electron/main.cjs, electron/preload.cjs, src/desktop/*, package.json, electron-builder.yml, scripts/desktop-smoke.mjs.
- [x] 3. Add contribution form with select/review/export/GitHub handoff, integrate header/settings/diagnostics, test browser and desktop paths.
  Files: src/support/DeviceReportDialog.tsx, src/support/support.css, src/hub/Header.tsx, src/hub/Pages.tsx, src/ui/Diagnostics.tsx.
- [x] 4. Build installer, add CI artifact workflow and open-source documentation, run existing checks and Electron smoke; independent review and fixes.
  Files: .github/workflows/desktop.yml, README.md, docs/desktop.md, .github/ISSUE_TEMPLATE/device-report.md.

## Evidence ledger
- Base: e578b31 (origin/main), clean worktree codex/desktop-github-reports.
- Completed; see desktop-verification.md. Installer and source are ready for draft PR review. No production release published.
