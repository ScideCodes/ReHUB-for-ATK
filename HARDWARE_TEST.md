# Physical hardware test

Status: **not run on physical devices**. Fake HID checks prove application flow and packet/readback handling only.

## Preparation
- Use the Windows desktop application. For source builds, run `npm run dev` from the `desktop-source` checkout; it opens ReHUB directly.
- Close atk-hub.exe, hub.atk.pro and other configurators that could hold the HID collection.
- Keep Safe Mode on. Back up maps with the existing export action. Never select a boot/FF02 collection, pair, flash firmware, calibrate or reset during this checklist.
- Test one device at a time. Record app version, browser version, connection type and pass/fail locally. Copied diagnostics deliberately omit device names, serials and payloads; do not add them when sharing.
- The timing limits below are acceptance targets, not measurements or guarantees. Start after accepting the HID picker; exclude human selection time.

## ATK 68 V2 Pro (373B:1048)
1. On Home select **Connect device**, select the keyboard, then open its card. Confirm the canonical ATK model name and real connection rather than Mock.
2. Open **Diagnostics** in the header. Confirm VID `0x373B`, PID `0x1048`, usage page `0xFF60`, usage `0x0061`, expected report `0x00`, and the actual collection/report IDs. Opening the panel or copying a report must not add HID frames.
3. Close Diagnostics. Target: initial controls usable in **under 2 s**, with background reads completing in **under 5 s** on a responsive device. If slower, copy diagnostics and record measured elapsed time; do not lower a timeout or write guard to force a pass. The fake 5 ms/frame reference is 12 frames/60 ms initially and 65 frames/325 ms for the full snapshot; it is not a physical result.
4. Open Lighting. Change global brightness by one displayed step. Approve the first-write session confirmation. Expect Saving then Saved for that exact control. This is a verified setting; do not test custom macro slots or advanced actions.
5. Reopen Diagnostics. Confirm an OUT lighting write, its IN acknowledgement, then an OUT lighting read and matching IN readback. The Copy report payload is intentionally redacted; inspect local hex only for the value comparison. Close the panel and select **Read device** to confirm the same brightness. Restore the original brightness and verify again.
6. Reload the page, reopen the saved keyboard card and confirm permissions reconnect without an unrelated device picker. A stored keyboard snapshot may appear as **cached/refreshing** before live reads finish. It must never count as a verified write baseline, saved receipt or fresh hardware state. Reopening must not write settings automatically.
7. Start **Read device** and unplug during the read. Target: disconnected controls in **under 1 s** after the browser disconnect event; no infinite busy state, automatic write retry or Saved receipt. Diagnostics must remain reachable with the captured frames/errors. Reconnect, read again and confirm the original settings remain intact. First-write consent must be required again.
8. In a new private session without a cached snapshot, repeat connect/read. Expect an honest loading state, not fabricated firmware or values. End by exporting a redacted diagnostics report and marking each check pass/fail.

## ATK Frost Zero Extreme, formerly ATK ZERO EX (373B:11CC wired / 373B:11D8 8K Dongle-H)
1. Connect through Home, open the mouse card and confirm **ATK Frost Zero Extreme**, CID/MID `1,4` and the correct wired/2.4G connection. The receiver endpoint alone never proves the attached mouse model.
2. Open Diagnostics. Confirm usage page `0xFF04`, usage `0x0002`, report `0x08`, actual VID/PID, collection IDs, IN/OUT hex frames and timing summary. Target: initial read usable in **under 2 s**, excluding the picker. Copying/opening Diagnostics must not send a command.
3. With the **11D8 receiver**, open Lighting and switch the dongle indicator to one other available mode. Expect acknowledgement **and Get4KRGBMode readback** before the app reports Saved. Refresh from device, confirm the same mode, restore the original and verify again. With **11CC wired only**, this lighting check is **not applicable**: do not force a dongle LED write; use one safe polling-rate step as the readback check instead. ZERO EX has no mouse DPI RGB/effects.
4. For an EEPROM setting such as polling, inspect an OUT SetEEPROM followed by an OUT GetEEPROM for the same address/length and matching readback bytes. An acknowledgement without matching readback must never produce success. Restore the original value.
5. Reload and reopen the saved mouse card. Saved maps persist; **a fresh mouse hardware snapshot is not cached across reload**. Do not interpret an offline map or its values as hardware state. Confirm a new hardware read and no automatic application of offline differences.
6. Click **Refresh** in the device panel and unplug the mouse/receiver. Target: disconnected state in **under 1 s** after the browser event; no stuck busy state or false Saved status. Reconnect/read and verify the last confirmed settings. Diagnostics retains the last capture until a new attachment starts one.
7. If the receiver reports an unsupported CID/MID, expect read-only access and only the identity query. An unverified wired model must open a labeled local demo with no hardware frames. Do not disable Safe Mode to bypass this result.

Diagnostics captures configurator command exchanges, not ordinary OS keystrokes. Unrelated/short reports are excluded. Collection metadata and headers are safe to copy; payload comparison stays local.

## Read-only keyboard families

- The registry admits 100 read-only keyboard endpoints: ATK RS7 base reads, 92 BITYUAN base reads and seven HFD firmware-only reads. These permissions come from shipped source and fake-HID tests, not physical testing. The other 29 keyboard endpoints remain demo/local.
- For a supported BITYUAN device, connect its normal FF60/0061 collection and confirm the canonical name, actual firmware and polling rate against the original configurator. Polling selector 70 maps raw codes 3/2/1/0 to 1000/2000/4000/8000 Hz; global dead-zone values use 0.001 mm units. Record disagreements without writing settings.
- For HFD, confirm only the 32-byte firmware request beginning `02 96 26` is sent. Confirm whether the actual reply echoes the expected selector and exposes firmware correctly; this behavior remains physically unverified. Other values must stay unread/local, rather than appearing as hardware-confirmed settings.
- Edit one local setting on either family and undo it. Expect local changes only, no write-consent dialog, no hardware writes and no Saved receipt claiming a device change. Reconnect and repeat; consent must never turn a read-only family into a writer.
- Reject FF02 boot collections, mismatched identities and unsupported families. Do not use custom frames or disable Safe Mode to make any checklist item pass.

## Record results
| Device | Initial read (<2 s) | Background read (<5 s, keyboard) | Lighting/readback | Reload/cache label | Unplug (<1 s) | Result |
|---|---|---|---|---|---|---|
| ATK 68 V2 Pro | Unmeasured | Unmeasured | Untested | Untested | Untested | Pending physical test |
| ZERO EX + Dongle-H | Unmeasured | Not applicable | Untested | Untested | Untested | Pending physical test |
| ZERO EX wired | Unmeasured | Not applicable | LED not applicable; polling untested | Untested | Untested | Pending physical test |
| BITYUAN read-only | Unmeasured | Unmeasured | Writes prohibited | Untested | Untested | Pending physical test |
| HFD firmware-only | Unmeasured | Not applicable | Writes prohibited | Untested | Untested | Reply selector pending physical test |

A failed physical check is a finding to investigate. Do not mark it passed using a fake HID result. Keep the backup and the redacted report; never share raw keyboard/macro frames or full local-storage exports.
