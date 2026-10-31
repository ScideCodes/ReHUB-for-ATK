# Contributing to Re-HUB for ATK

Thanks for helping out! Real-hardware reports are the most valuable contribution right now. Use the **Hardware test report** issue template.

## Setup

```bash
npm ci
npm run dev
```

Use demo mode for UI work: it never touches hardware.

## Before you open a pull request

- `npx tsc --noEmit`, `npm run lint` and `npm test` must pass. Run `npm run test:devices` when you touch device or protocol code.
- Add a test for new logic. Bug fixes need a test that fails without the fix.
- Keep changes focused: one concern per pull request.

## Ground rules for device code

- **Never invent protocol data.** Opcodes, layouts and capabilities must come from the original driver's source. Cite where they come from in the pull request.
- **Never weaken a safety gate:** identity checks, `validateOutgoing`, per-family validators, EEPROM checks, write readback, the permanent DFU block, and the exclusion of `FF02` boot endpoints.
- New write paths start in the opt-in "untested" tier until someone confirms them on real hardware.

## Style

TypeScript strict, ESLint clean, and match the surrounding code. Comment the *why*, not the *what*.
