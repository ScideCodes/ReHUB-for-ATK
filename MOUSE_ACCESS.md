# Mouse hardware access — current Phase 6

Audited2026-10-28. Source: ../extracted/asar_unpacked/static/filter-B6RHekbD.js, SHA-256 e62a7f70c49ed277fa7b4f850edd4c86cb88c824b48f6e79da997ff4c75fa3e6. Source Wt controller @69700; GetMouseCIDMID=16 (0x10) @15000. The earlier 0x93/0x81 receiver claim was incorrect for this transport. No mouse permissions, opcodes or write implementation changed. Physical hardware is untested.

## Verdict counts

All190 runtime mouse endpoints were joined to the source protocol ledger:8 existing compatible endpoints,45 receiver endpoints requiring runtime paired identity,137 demo/local endpoints. There are90 generated mouse models; endpoint counts are not model counts. The larger212-row source cache includes entries outside this runtime registry and duplicates; it is not the runtime count.

| Source sensor/family | Existing direct controls | Runtime-identity receivers | Demo/local |
| --- | ---: | ---: | ---: |
| PAW3311 | 0 | 0 | 7 |
| PAW3315 | 0 | 0 | 1 |
| PAW3395 | 0 | 0 | 14 |
| PAW3395SE | 0 | 0 | 18 |
| PAW3395Ultra | 0 | 0 | 9 |
| PAW3950 | 0 | 0 | 11 |
| PAW3950DM | 0 | 0 | 1 |
| PAW3950Ultra | 8 | 0 | 38 |
| PAW3955MASTER | 0 | 0 | 36 |
| CORE26K | 0 | 0 | 2 |
| Receiver | 0 | 45 | 0 |

PAW3950Ultra alone is insufficient: only the existing eight source profiles with noDpiRGB and noBottomButton pass the integrated codec/feature gate. The other38 Ultra endpoints and every alternate sensor family remain demo/local: their codec/feature combination and complete readback path are not integrated. Sensor or marketing-name similarity does not grant access. No new mouse family was promoted.

## Receiver and write gates

- All45 receiver endpoints still require a runtime CID/MID reply resolving to one of the eight compatible source profiles. Unknown0/0 or255/255 identities never grant writes. Source CID/MID lookup is model evidence, not permission to use an unrelated wired endpoint.
- Wired identities require their matching VID/PID and CID/MID. A correct model identity on a different wired PID remains rejected.
- Existing supported controls keep mandatory per-packet readback and identity/EEPROM validation: DPI/stages/active stage,polling,debounce,LOD,sensor standby and signed rotation. Rotation uses two's-complement -30..30 at EEPROM189 with inverted0x55 checksum; existing tests cover it.
- HP/LP sensor model, shortcut sequences, macros and unverified DownLoadData packing remain local/blocked. Center-point remains local where the source sensorCenterPointV2 capability is absent. Extra RGB/six-button/sensor features do not inherit ZERO EX writes.
- validateOutgoing, opcode allowlist,isKnownDevice,EEPROM checks,Safe Mode,per-session consent,permanent0x0D block and FF02 exclusions are unchanged. Cache or ACK is never a confirmed save.

## Phase 16 — sensor sampling mode (Basic / Competitive / Competitive MAX) (2026-10-31)

Source performance UI (demoMode.store @3069400) sets sensorModel (enum keyboard.assets p: Base 0, Athletics 1, AthleticsMax 2) and calls Wt.setMousePerformance, which writes the whole st block (st.create: sleep enabled, sleep time / 10, sensorModel, each with its 0x55 crc) at EEPROM 181..186. AthleticsMax is listed only when the mouse is CID 1, or for CID 2 when ATK's server reports a firmware threshold (not available offline, so held like the original offline). The reader takes the mode from the 6-byte block with its crc; the setting maps to sensorPowerMode LP/HP/MAX; the EEPROM 185-186 write block is lifted. Parity against the original Wt: 77/77 (new scenarios sensorCompetitive, sensorCompetitiveMax).

## Phase 15 — executed parity with the original Wt controller (2026-10-31)

With the user's permission the original mouse controller (filter-B6RHekbD.js `Wt`, initialized via its lazy block and a no-op HostServices stub) ran in Node against a recording fake EEPROM mouse (scripts/parity/env.mjs, scripts/parity/mice.mjs; no hardware, no network). For 7 models covering every sensor codec (ZERO EX PAW3950Ultra, X1 Lite PAW3395, A9 Mini + PAW3955MASTER, VXE R1SE PAW3395SE, VXE R1SE+ CORE26K, VXE R1S+ PAW3311, F1 PRO PAW3950) and 9 UI actions (polling, DPI stage, debounce, sleep time, motion sync, LOD, DPI button, far distance, rotation), the original read its config with getMouseFunction, applied the action through its own setter, and recorded the EEPROM bytes it changed and its non-EEPROM commands (src/devices/parity/mice.json, starting images mouse-images.json). src/devices/parity/mice.parity.test.ts replays each action through this app's real apply path on a mock with the same image: 63/63 match.

Fixed by this comparison: sleep time now also writes sensor sleep on with the same time (source setMouseSleepTime writes the st block); far distance is sent with data length 10 (source Ge.create). The mock's default image now has valid button-mode and sensor-sleep CRCs and the ZERO EX LOD code for 1.0mm.

Documented exceptions (asserted explicitly): controls the original does not show offline for that model are held (far distance on noFarDistance models; rotation on CID 2 mice without catalog support, which the original gates on a server firmware threshold); on CID 2 mice the original, lacking server bhop data, writes 00 00 at EEPROM 6-7 when the report-rate block changes, while this app rewrites the bhop bytes it read.

## Phase 14 — parity with the original driver (static review of its builders, 2026-10-30)

Running the original controller modules for an executed comparison was blocked by the session's safety classifier, so each of our frames was compared with the source builders by reading them. Fixed deviations (these also applied to the verified ZERO EX):
- LOD: the source has two schemes (demoMode.store SilenceHeight @3155623, SilenceHeightUltimate @3157575; sensor lists UUe/NUe). PAW3950Ultra and PAW3955MASTER: 0.7-1.7mm in 0.1mm steps, codes 1-11. PAW3395/SE/Ultra and CORE26K: 1mm = 1, 2mm = 2; PAW3950/DM add 0.7mm = 3. PAW3311/PAW3315: no LOD. We used one mapping (0.7 = 1, 1.0 = 2, 2.0 = 3) for every mouse, which on Ultimate mice wrote 0.8mm for 1.0mm and could not read codes 4-11. `lodOptions` / `encodeLod` / `decodeLod` now follow the source; the LOD card offers exactly the source choices (slider, segments, or hidden).
- Report-rate block (je @36922): the source rewrites bhop and buttonOperationMode from the config it read; we wrote bhop 0 and rebuilt the mode byte from three bits, so polling or DPI-count changes switched bhop off and cleared unmodelled mode bits. The block read is now kept and those bytes are rewritten as read.
Matching after review: stabilization block (at @44328: debounce, motion sync, sleep/10, linear correction, ripple), classic and PAW3955MASTER DPI records, connect-type query, polling codes.

## Phase 13 — every source mouse in the opt-in tier; mock matrix (2026-10-30)

- Tier is now every readable, non-verified identity: all 166 wired source endpoints (incl. 36 PAW3955MASTER and the 45 without catalog entries) plus 46 receivers once paired. Consent, opcode restriction and readback are unchanged from Phase 12.
- Fixed identity bug: source `identifyByCidMid` endpoints share one VID/PID across models (e.g. 3554:F502 = 2,1 / 2,2 / 2,104); identity matched only the first source entry, so 21 wired models were never even readable. Wired identity now matches the entry with the exact VID/PID and CID/MID; a CID/MID from another PID is still rejected.
- Connect type: source Wt.getMouseInfo sends ze.get = DownLoadData at address 0, length 8 with 4 random bytes; the reply carries CID (byte 9), MID (10) and connect type (11; enum keymap-i18n-keys: dongle1K 0, dongle4K 1, wired1K 2, wired8K 3, dongle2K 4, dongle8K 5, wired2K 6, wired4K 7, nearlink 8). Only that exact shape is admitted (`isMouseInfoQuery`); every other DownLoadData stays blocked. The value is trusted only when the reply repeats the CID/MID.
- Limits from source rules instead of the catalog: polling per connect type (demoMode.store L @3069190: 125-1000 always; 2K-8K on wired8K/dongle8K/nearlink; 2K/4K on dongle4K; 2K on dongle2K; unknown type = 1000); dongle RGB only on dongle8K/nearlink without noDongleRGB (WUe); rotation for CID 1 or catalog hasSensorAngle (CID 2 needs a server firmware threshold, held).
- PAW3955MASTER DPI: one 6-byte Qe record per stage at paw3955Dpi1 + 6*i (6912..6954, outside the blocked macro range), Ct encoding (raw-1 below 40000, halved with the x2 flag above), checked by decoding before sending; source _setMouseDpiValuesBy3955.
- `npm run test:devices` (vitest.matrix.config.ts, ~3.5 min): every one of the 212 source endpoints on its own MockHidDevice with its VID/PID, CID/MID, connect type and sensor-encoded EEPROM: connect, identity, connect type, DPI read through the sensor codec, consent, DPI/polling/debounce write with GetEEPROM readback, opcode restriction, consent cleared on disconnect. 212/212 pass. Mocks prove the bytes follow the source; firmware acceptance is untested.

## Phase 12 — opt-in untested write tier (2026-10-30)

- New tier `untestedMouseIdentity`: readable, not verified, sensor encodable by source `de` (filter-B6RHekbD.js, next to `ue`), and a catalog entry (mouseModels.generated.json) supplying max polling and rotation. 77 wired source endpoints (75 CID/MIDs) qualify, plus receivers whose paired CID/MID resolves to one of them: PAW3950Ultra 20, PAW3395 18, PAW3395SE 17, PAW3950 9, PAW3395Ultra 7, PAW3311 4, PAW3315 1, PAW3950DM 1.
- Still read-only: PAW3955MASTER (36; DPI lives in 6-byte records at other addresses, the 4-byte writer would corrupt it) and 45 endpoints without catalog limits (incl. CORE26K 2). No limits are invented for them.
- Writes need explicit consent: the mouse panel's badge opens a confirm dialog; consent is session-only, keyed to VID/PID/CID/MID, never persisted, cleared on every disconnect (`allowUntestedMouseWrites` / `clearUntestedMouseWrites`).
- Untested tier may send only SetEEPROM, SetFarDistanceMode and Set4KRGBMode plus the read opcodes; factory reset, profile switch, macro download, pairing and DFU stay blocked. validateOutgoing, EEPROM range blocks, center-point block, mandatory readback and the DFU block are unchanged.
- DPI: `encodeSensorDpi` ports `de` and returns null unless decoding the bytes gives back exactly the requested value; such stages are skipped with a message. Cached table sensors (PAW3395SE/3311/3315) store `double` as a boolean, so they encode only up to 10000 DPI.
- Per-model holds (`holdUnsupportedForModel`, source custom flags now in sourceMouseProtocols.json via scripts/phase5-source.mjs): noFarDistance, noZeroKeyDebounce (0 ms), noDongleRGB, supportFastTrigger (fast trigger only where set), catalog maxPollingRate and hasSensorAngle. Held changes stay at the read value and are listed as skipped.
- Tests: src/protocol/codec.test.ts (encoder), src/hid/mouseUntestedTier.test.ts (tier membership, consent, X1 Lite PAW3395 write bytes, holds, opcode restriction, disconnect). Physical hardware untested for every untested-tier model.

## Phase 11 — PAW3311 / PAW3315 / CORE26K read tier; all source mice readable (2026-10-29)

- Last 10 profiles join `readableMouseIdentity` (all under the same Wt controller):
  - PAW3311 (7): source `ue` default branch → `oe` with table `le` (same as PAW3395SE).
  - PAW3315 (1): table `ge` (200 entries, stored as src/devices/paw3315DpiTable.json); ex bit1/bit5 select X/Y double. Codes outside the table are reported unsupported (the source falls back to 16000).
  - CORE26K (2): (1 + raw) · (ex bit1/bit5 ? 100 : 50) · (ex bit0/bit4 ? 2 : 1).
- Result: every one of the 145 wired source profiles and all 45 receivers (once their paired CID/MID resolves to a source profile) connect and read. Writes remain limited to the original 8 verified PAW3950Ultra profiles. Endpoints outside the source list, and receivers reporting an unknown CID/MID, still get identity reads only.
- Physical hardware untested for all read-only mice.

| Model / endpoint | VID:PID | CID,MID | Sensor |
| --- | --- | --- | --- |
| VXE R1S+ | 0x373B:1084 | 2,63 | PAW3311 |
| VXE V3 NK | 0x373B:10E7 | 2,72 | PAW3311 |
| ATK A9 SE NK | 0x373B:1135 | 2,88 | PAW3311 |
| ATK U2 SE NK | 0x373B:1149 | 2,92 | PAW3311 |
| ATK Y9 SE NK | 0x373B:115D | 2,98 | PAW3311 |
| DRAGONFLY F1 V2 SE NK | 0x373B:114C | 2,95 | PAW3311 |
| VXE R1 S NK | 0x373B:121F | 2,117 | PAW3311 |
| VXE X3 | 0x373B:1248 | 2,121 | PAW3315 |
| VXE R1SE+ | 0x373B:1358 | 2,136 | CORE26K |
| VXE R1SE+ Silent | 0x373B:1359 | 2,137 | CORE26K |

## Phase 10 — PAW3950 / PAW3950DM read tier (2026-10-29)

- 12 profiles (PAW3950 11, PAW3950DM 1) join `readableMouseIdentity`. Source `ue` decodes them with the PAW3395 branch (50·(1 + raw), ×2 flags), already in `decodeSensorDpi`. Writes unchanged: none is writable.
- Counts: 135 readable wired endpoints (8 writable + 127 read-only), 45 receivers, 10 demo/local (PAW3311 7, PAW3315 1, CORE26K 2). Physical hardware untested.

| Model / endpoint | VID:PID | CID,MID | Sensor | Extra fields read |
| --- | --- | --- | --- | --- |
| ATK F1 PRO | 0x373B:1014 | 2,36 | PAW3950 | DPI LED colours, bottom button |
| ATK F1 PRO MAX | 0x373B:1015 | 2,37 | PAW3950 | DPI LED colours, bottom button |
| ATK X1 PRO | 0x373B:1016 | 2,38 | PAW3950 | DPI LED colours, bottom button |
| ATK X1 PRO MAX | 0x373B:1017 | 2,39 | PAW3950 | DPI LED colours, bottom button |
| ATK Z1 PRO | 0x373B:1018 | 2,40 | PAW3950 | DPI LED colours, bottom button |
| ATK Z1 PRO MAX | 0x373B:1019 | 2,41 | PAW3950 | DPI LED colours, bottom button |
| ATK U2 MINI | 0x373B:1086 | 2,64 | PAW3950 | DPI LED colours, bottom button |
| ATK U2 Ultra | 0x373B:10AC | 2,66 | PAW3950 | DPI LED colours, bottom button |
| ATK Y9 PRO MAX | 0x373B:10FD | 2,108 | PAW3950 | bottom button |
| MAD R MAJOR | 0x373B:103E | 2,47 | PAW3950 | DPI LED colours |
| MAD R MAJOR+ | 0x373B:104C | 2,55 | PAW3950 | DPI LED colours |
| ATK X1 Ultra Max 2.0 | 0x373B:12FF | 1,87 | PAW3950DM | DPI LED colours, bottom button |

## Phase 9 — PAW3395 / PAW3395SE / PAW3395Ultra read tier (2026-10-29)

- 41 profiles (PAW3395 14, PAW3395SE 18, PAW3395Ultra 9) join `readableMouseIdentity`. Writes unchanged: none is writable.
- Classic 4-byte DPI records [x, y, ex, crc] are now decoded per source sensor (`ue` in filter-B6RHekbD.js) by `decodeSensorDpi` in src/protocol/codec.ts:
  - PAW3395, PAW3395Ultra (also PAW3950, PAW3950DM): 50·(1 + (x | (ex&12)>>2<<8)), ×2 when ex bit0; Y uses (ex&192)>>6 and bit4.
  - PAW3395SE: source table `le` (hex → target/double, 200 entries, stored as src/devices/paw3395seDpiTable.json); ex bit1 selects X double, bit5 Y double. Codes not in the table are reported as unsupported (the source falls back to 18000; this app keeps the previous value instead of inventing one).
  - PAW3950Ultra keeps the existing codec; CORE26K is implemented for the next family.
- DPI LED colours, bottom button and center point are read where each profile declares them (same rules as Phase 7/8).
- Counts: 123 readable wired endpoints (8 writable + 115 read-only), 45 receivers, 22 demo/local. Physical hardware untested.

| Model / endpoint | VID:PID | CID,MID | Sensor | Extra fields read |
| --- | --- | --- | --- | --- |
| ATK Dragonfly F1 PRO | 0x3554:F502 | 2,1 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 PRO | 0x3554:F502 | 2,2 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 PRO | 0x3554:F502 | 2,104 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 PRO MAX | 0x3554:F506 | 2,3 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 PRO MAX | 0x3554:F506 | 2,4 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 PRO MAX | 0x3554:F506 | 2,105 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 MOBA | 0x3554:F506 | 2,5 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 MOBA | 0x3554:F506 | 2,6 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 MOBA | 0x3554:F506 | 2,33 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 MOBA | 0x3554:F506 | 2,106 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 PRO MAX Elden | 0x3554:F506 | 2,48 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1 PRO MAX JOJO | 0x3554:F506 | 2,52 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly F1S | 0x3554:F50A | 2,19 | PAW3395 | DPI LED colours, bottom button |
| ATK Dragonfly Dragonfly F1S | 0x3554:F50A | 2,20 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 PRO | 0x3554:F58C | 2,7 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 PRO | 0x3554:F58C | 2,8 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 PRO MAX | 0x3554:F58C | 2,27 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 PRO MAX | 0x3554:F58C | 2,28 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 PRO MAX | 0x3554:F58C | 2,34 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 | 0x3554:F58F | 2,11 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 | 0x3554:F58F | 2,12 | PAW3395 | DPI LED colours, bottom button |
| MAD R | 0x373B:103F | 2,49 | PAW3395 | DPI LED colours |
| MAD R + | 0x373B:104B | 2,54 | PAW3395 | DPI LED colours |
| ATK X1 Lite | 0x373B:113E | 2,89 | PAW3395 | DPI LED colours, bottom button |
| ATK X1 S NK | 0x373B:1106 | 2,76 | PAW3395 | DPI LED colours, bottom button |
| ATK A9 Plus NK | 0x373B:1115 | 2,83 | PAW3395 | bottom button |
| ATK U2 Plus NK | 0x373B:110D | 2,78 | PAW3395 | DPI LED colours, bottom button |
| ATK Y9 Plus NK | 0x373B:115B | 2,96 | PAW3395 | DPI LED colours, bottom button |
| DRAGONFLY F1 V2 Plus NK | 0x373B:114A | 2,93 | PAW3395 | DPI LED colours, bottom button |
| VXE R1 UlTRA | 0x373B:11D2 | 2,114 | PAW3395 | DPI LED colours, bottom button |
| VXE R1SE+ Silent | 0x373B:12BF | 2,130 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1SE | 0x3554:F58F | 2,29 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1SE | 0x3554:F58F | 2,30 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1SE+ | 0x3554:F58F | 2,31 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1SE+ | 0x3554:F58F | 2,32 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1SE+ | 0x3554:F58F | 2,116 | PAW3395SE | DPI LED colours, bottom button |
| ATK A9 NK | 0x373B:1116 | 2,84 | PAW3395SE | bottom button |
| ATK X1E | 0x373B:113F | 2,90 | PAW3395SE | DPI LED colours, bottom button |
| ATK A9 | 0x373B:1157 | 2,99 | PAW3395SE | bottom button |
| ATK U2 | 0x373B:11AA | 2,109 | PAW3395SE | DPI LED colours, bottom button |
| ATK X1 SE NK | 0x373B:1107 | 2,77 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1 NK | 0x373B:1065 | 2,57 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1 NK | 0x373B:1066 | 2,57 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1 NK | 0x373B:10C7 | 2,67 | PAW3395SE | DPI LED colours, bottom button |
| VXE R1 NK | 0x373B:10C8 | 2,67 | PAW3395SE | DPI LED colours, bottom button |
| VXE V3 PRO NK | 0x373B:10E8 | 2,73 | PAW3395SE | DPI LED colours, bottom button |
| ATK U2 NK | 0x373B:110E | 2,79 | PAW3395SE | DPI LED colours, bottom button |
| ATK Y9 NK | 0x373B:115C | 2,97 | PAW3395SE | DPI LED colours, bottom button |
| DRAGONFLY F1 V2 NK | 0x373B:114B | 2,94 | PAW3395SE | DPI LED colours, bottom button |
| ATK A9 X | 0x373B:11A0 | 2,107 | PAW3395SE | DPI LED colours, bottom button |
| VXE X3 Pro | 0x373B:1249 | 2,122 | PAW3395SE | DPI LED colours, bottom button |
| VXE X3 Turbo | 0x373B:124A | 2,123 | PAW3395SE | DPI LED colours, bottom button |
| ATK A9 NB | 0x373B:1245 | 2,120 | PAW3395SE | bottom button |
| ATK A9 Pro Max | 0x373B:1117 | 2,85 | PAW3395Ultra | bottom button |
| ATK U2 Pro Max | 0x373B:1158 | 2,100 | PAW3395Ultra | DPI LED colours, bottom button |
| DRAGONFLY F1 V2 PRO MAX | 0x373B:11AB | 2,110 | PAW3395Ultra | DPI LED colours, bottom button |
| ATK A9 Ultra Max 2.0 | 0x373B:11DD | 1,6 | PAW3395Ultra | bottom button |
| ATK A9 Ultra Max 2.0 Tri-Mode | 0x373B:11F2 | 1,15 | PAW3395Ultra | bottom button |
| ATK F1 Ultra Max 2.0 | 0x373B:11ED | 1,12 | PAW3395Ultra | bottom button |
| ATK X1 Ultra Max 2.0 | 0x373B:11EC | 1,11 | PAW3395Ultra | DPI LED colours, bottom button |
| ATK U2 Ultra Max 2.0 | 0x373B:11F7 | 1,18 | PAW3395Ultra | DPI LED colours, bottom button |
| VXE R1 Ultra | 0x373B:11F9 | 1,20 | PAW3395Ultra | DPI LED colours, bottom button |

## Phase 8 — PAW3955MASTER read tier (2026-10-29)

- 36 PAW3955MASTER profiles join `readableMouseIdentity` (same Wt controller; source `isPaw3955Master()` branches). Writes unchanged: none of them is writable.
- DPI stages (source `_getMouseDpiValuesBy3955`, codec `Qe`): one 6-byte record per stage at EEPROM 6912 + 6·n (n = 0..7): [xLo, xHi, yLo, yHi, ex, crc], value (lo | hi<<8) + 1, ×2 when ex bit0 (X) / bit4 (Y), crc = 0x55 − (sum of five bytes). Bad CRC keeps the previous stage and logs a read issue.
- Sensor center point (EEPROM 6992, V2 layout) is read for PAW3955MASTER and for profiles with sensorCenterPointV2, as the source does.
- Not read yet (no schema field): dynamic sensitivity (6960/6964) and DPI RGB lighting effect (76).
- Limit: the app schema caps DPI at 36000 while the catalog lists 42000 for these models. A stored stage above 36000 is reported as unsupported and the previous value kept. The cap is not raised because it also bounds writes for the verified profiles.
- Counts: 82 readable wired endpoints (8 writable + 74 read-only), 45 receivers, 63 demo/local. Physical hardware untested.

| Model / endpoint | VID:PID | CID,MID | Fields read beyond the base map |
| --- | --- | --- | --- |
| ATK A9 Mini + | 0x373B:1269 | 1,31 | PAW3955 DPI records, center point, bottom button |
| ATK A9 Mini + | 0x373B:128E | 1,52 | PAW3955 DPI records, center point, bottom button |
| ATK ZERO EX + | 0x373B:1289 | 1,47 | PAW3955 DPI records, center point |
| ATK X1 Ultimate 2.0 + | 0x373B:1286 | 1,46 | PAW3955 DPI records, center point, DPI LED colours |
| ATK F1 V3 EXTREME + | 0x373B:129B | 1,58 | PAW3955 DPI records, center point |
| ATK F1 V3 LEVIATAN + | 0x373B:129D | 1,60 | PAW3955 DPI records, center point |
| ATK A9 Air + | 0x373B:1293 | 1,54 | PAW3955 DPI records, center point, bottom button |
| ATK A9 Ultimate + | 0x373B:1292 | 1,53 | PAW3955 DPI records, center point, bottom button |
| ATK U2 Mini 2.0 + | 0x373B:128D | 1,51 | PAW3955 DPI records, center point, DPI LED colours, bottom button |
| ATK U2 Ultimate 2.0 + | 0x373B:128C | 1,50 | PAW3955 DPI records, center point, DPI LED colours, bottom button |
| ATK PHANTOM ULTIMATE | 0x373B:1296 | 1,55 | PAW3955 DPI records, center point |
| ATK X1 EXTREME 2.0 + | 0x373B:1285 | 1,45 | PAW3955 DPI records, center point, DPI LED colours |
| ATK X1 Air + | 0x373B:12A2 | 1,61 | PAW3955 DPI records, center point, DPI LED colours |
| ATK Ghost Ultimate + | 0x373B:128B | 1,49 | PAW3955 DPI records, center point, DPI LED colours, bottom button |
| ATK Ghost EXTREME + | 0x373B:128A | 1,48 | PAW3955 DPI records, center point, DPI LED colours, bottom button |
| ATK F1 Ultimate 2.0 + | 0x373B:129C | 1,59 | PAW3955 DPI records, center point |
| ATK X1 Air + | 0x373B:127C | 1,42 | PAW3955 DPI records, center point, DPI LED colours |
| ATK F1 V3 ULTIMATE + | 0x373B:12A7 | 1,62 | PAW3955 DPI records, center point |
| ATK A9 NB ULTRA + | 0x373B:12AB | 2,129 | PAW3955 DPI records, center point, bottom button |
| ATK Y9 Ultimate + | 0x373B:12AF | 1,66 | PAW3955 DPI records, center point, bottom button |
| ATK Z1 Ultimate 2.0 + | 0x373B:12B0 | 1,67 | PAW3955 DPI records, center point, DPI LED colours, bottom button |
| ATK A9 Air + | 0x373B:127F | 1,40 | PAW3955 DPI records, center point, bottom button |
| ATK A9 Ultimate + | 0x373B:127E | 1,39 | PAW3955 DPI records, center point, bottom button |
| ATK F1 V3 ULTIMATE + | 0x373B:12A8 | 1,63 | PAW3955 DPI records, center point |
| ATK F1 V3 ULTIMATE + | 0x373B:12A9 | 1,64 | PAW3955 DPI records, center point |
| ATK A9 Wireless Charging | 0x373B:12C6 | 1,71 | PAW3955 DPI records, center point, bottom button |
| ATK X1 Ultimate 2.0 Silent | 0x373B:12B4 | 1,76 | PAW3955 DPI records, center point, DPI LED colours |
| ATK A9 Ultimate Silent | 0x373B:12B3 | 1,75 | PAW3955 DPI records, center point, bottom button |
| Mouse | 0x373B:1340 | 2,134 | PAW3955 DPI records, center point, bottom button |
| Mouse | 0x373B:1341 | 2,135 | PAW3955 DPI records, center point, DPI LED colours, bottom button |
| ATK F1 V3 PIKACHU Edition | 0x373B:132A | 1,90 | PAW3955 DPI records, center point |
| Mouse | 0x373B:12FB | 1,86 | PAW3955 DPI records, center point, DPI LED colours, bottom button |
| Mouse | 0x373B:133B | 1,91 | PAW3955 DPI records, center point, bottom button |
| Mouse | 0x373B:1316 | 1,88 | PAW3955 DPI records, center point, bottom button |
| Mouse | 0x373B:12F9 | 1,84 | PAW3955 DPI records, center point, bottom button |
| Mouse | 0x373B:12F7 | 1,80 | PAW3955 DPI records, center point, bottom button |

## Phase 7 — PAW3950Ultra read tier (2026-10-29)

Policy agreed with the user: every family gets source-backed reads; writes stay limited to already-verified profiles until someone confirms a model on real hardware.

- New tier `readableMouseIdentity`: all 46 PAW3950Ultra source profiles (same filter-B6RHekbD.js Wt controller and EEPROM map) plus receivers whose runtime CID/MID resolves to one of them. They connect for real and read settings; writes are unchanged (`verifiedMouseIdentity`, the original 8 profiles).
- hidClient: a read-tier identity may only send READ_ONLY_OPCODES (3,4,8,14,16,18,21,23,25,29). SetEEPROM, DownLoadData, pairing, factory reset, config switch, RGB/far-distance/dongle-light sets and DFU are refused with "Read-only mouse". Tested in mouseConnection.test.ts.
- New reads (source `et` codec, `_getMouseDpiColors`): DPI LED colours at EEPROM 44/52/60/68, two stages per 8 bytes as [r,g,b,0x55-(r+g+b)], read only when the profile lacks noDpiRGB; a bad checksum keeps the previous colour and logs a read issue. Bottom button key5 @116 read only when the profile lacks noBottomButton.
- Not read yet (no schema field): DPI RGB lighting effect @76 (source `tt`: mode/speed/brightness).
- Counts: 46 readable wired endpoints (8 writable + 38 read-only), 45 receivers, 99 demo/local. Pinned in supportAudit.test.ts.
- Physical hardware for the 38 read-only endpoints is untested.

| Model / endpoint | VID:PID | CID,MID | Extra fields read |
| --- | --- | --- | --- |
| ATK X1 Ultra | 0x373B:102F | 2,43 | DPI LED colours, bottom button |
| ATK FIERCE X | 0x373B:1030 | 2,44 | DPI LED colours, bottom button |
| ATK X1 Ultimate | 0x373B:103D | 2,46 | DPI LED colours |
| ATK Z1 Ultra | 0x373B:104A | 2,53 | DPI LED colours, bottom button |
| ATK F1 LEVIATAN | 0x373B:105B | 2,56 | DPI LED colours |
| ATK U2 Ultimate | 0x373B:1087 | 2,65 | DPI LED colours, bottom button |
| ATK X1 EXTREME | 0x373B:10E9 | 2,70 | DPI LED colours, bottom button |
| ATK A9 Ultra | 0x373B:1119 | 2,87 | bottom button |
| ATK A9 NB ULTRA | 0x373B:11F3 | 2,115 | bottom button |
| ATK A9 Ultimate | 0x373B:11B6 | 1,3 | bottom button |
| ATK A9 Air | 0x373B:120A | 1,21 | bottom button |
| ATK Y9 Ultimate | 0x373B:11CF | 1,5 | bottom button |
| ATK X1 Ultimate 2.0 | 0x373B:11E7 | 1,10 | DPI LED colours |
| ATK Duckbill Ultra | 0x373B:11A6 | 1,2 | DPI LED colours, bottom button |
| ATK Duckbill EXTREME | 0x373B:1230 | 1,25 | DPI LED colours, bottom button |
| ATK X1 EXTREME 2.0 | 0x373B:11E5 | 1,9 | DPI LED colours |
| ATK X1 EXTREME GT | 0x373B:120B | 1,22 | DPI LED colours |
| ATK U2 Mini 2.0 | 0x373B:11F6 | 1,17 | DPI LED colours, bottom button |
| ATK Z1 Ultimate 2.0 | 0x373B:1201 | 1,19 | DPI LED colours, bottom button |
| ATK U2 Ultimate 2.0 | 0x373B:11F5 | 1,16 | DPI LED colours, bottom button |
| ATK Ghost EXTREME | 0x373B:120D | 1,23 | DPI LED colours, bottom button |
| ATK Ghost Ultimate | 0x373B:120E | 1,24 | DPI LED colours, bottom button |
| ATK ZERO | 0x373B:124E | 1,26 | DPI LED colours |
| ATK A9 Mini | 0x373B:1256 | 1,27 | bottom button |
| ATK X EXTREME | 0x373B:1266 | 1,30 | DPI LED colours |
| ATK X1 Ultra Max 2.0 | 0x373B:1274 | 1,32 | DPI LED colours, bottom button |
| ATK F1 Ultra Max 2.0 | 0x373B:126E | 1,33 | bottom button |
| ATK A9 Ultra Max 2.0 Tri-Mode | 0x373B:1270 | 1,37 | bottom button |
| ATK A9 Ultra Max 2.0 | 0x373B:126F | 1,38 | bottom button |
| ATK U2 Plus NK | 0x373B:126C | 2,124 | DPI LED colours, bottom button |
| VXE R1 | 0x373B:1271 | 2,127 | DPI LED colours, bottom button |
| VXE R1 PRO | 0x373B:1272 | 2,125 | DPI LED colours, bottom button |
| VXE R1 PRO MAX | 0x373B:1273 | 2,126 | DPI LED colours, bottom button |
| ATK A9 Mini | 0x373B:125A | 1,28 | bottom button |
| ATK U2 Pro Max | 0x373B:126D | 2,128 | DPI LED colours, bottom button |
| Flow 7 | 0x373B:12D7 | 2,131 | DPI LED colours, bottom button |
| MAD R | 0x373B:132B | 2,133 | DPI LED colours |
| ATK X1 S NK | 0x373B:131A | 2,132 | DPI LED colours, bottom button |

## Runtime endpoint verdicts

| Model / endpoint | VID:PID | CID,MID | Verdict |
| --- | --- | --- | --- |
| VXE R1S+ | 0x373B:1084 | 2,63 | Demo/local only |
| VXE V3 NK | 0x373B:10E7 | 2,72 | Demo/local only |
| ATK A9 SE NK | 0x373B:1135 | 2,88 | Demo/local only |
| ATK U2 SE NK | 0x373B:1149 | 2,92 | Demo/local only |
| ATK Y9 SE NK | 0x373B:115D | 2,98 | Demo/local only |
| DRAGONFLY F1 V2 SE NK | 0x373B:114C | 2,95 | Demo/local only |
| VXE R1 S NK | 0x373B:121F | 2,117 | Demo/local only |
| VXE X3 | 0x373B:1248 | 2,121 | Demo/local only |
| ATK Dragonfly F1 PRO | 0x3554:F502 | 2,1 | Demo/local only |
| ATK Dragonfly F1 PRO MAX JOJO | 0x3554:F506 | 2,3 | Demo/local only |
| ATK Dragonfly F1S | 0x3554:F50A | 2,19 | Demo/local only |
| VXE R1 PRO | 0x3554:F58C | 2,7 | Demo/local only |
| VXE R1SE+ | 0x3554:F58F | 2,11 | Demo/local only |
| MAD R | 0x373B:103F | 2,49 | Demo/local only |
| MAD R + | 0x373B:104B | 2,54 | Demo/local only |
| ATK X1 Lite | 0x373B:113E | 2,89 | Demo/local only |
| ATK X1 S NK | 0x373B:1106 | 2,76 | Demo/local only |
| ATK A9 Plus NK | 0x373B:1115 | 2,83 | Demo/local only |
| ATK U2 Plus NK | 0x373B:110D | 2,78 | Demo/local only |
| ATK Y9 Plus NK | 0x373B:115B | 2,96 | Demo/local only |
| DRAGONFLY F1 V2 Plus NK | 0x373B:114A | 2,93 | Demo/local only |
| VXE R1 UlTRA | 0x373B:11D2 | 2,114 | Demo/local only |
| VXE R1SE+ Silent | 0x373B:12BF | 2,130 | Demo/local only |
| ATK A9 NK | 0x373B:1116 | 2,84 | Demo/local only |
| ATK X1E | 0x373B:113F | 2,90 | Demo/local only |
| ATK A9 | 0x373B:1157 | 2,99 | Demo/local only |
| ATK U2 | 0x373B:11AA | 2,109 | Demo/local only |
| ATK X1 SE NK | 0x373B:1107 | 2,77 | Demo/local only |
| VXE R1 NK | 0x373B:1065 | 2,57 | Demo/local only |
| VXE R1 NK | 0x373B:1066 | 2,57 | Demo/local only |
| VXE R1 NK | 0x373B:10C7 | 2,67 | Demo/local only |
| VXE R1 NK | 0x373B:10C8 | 2,67 | Demo/local only |
| VXE V3 PRO NK | 0x373B:10E8 | 2,73 | Demo/local only |
| ATK U2 NK | 0x373B:110E | 2,79 | Demo/local only |
| ATK Y9 NK | 0x373B:115C | 2,97 | Demo/local only |
| DRAGONFLY F1 V2 NK | 0x373B:114B | 2,94 | Demo/local only |
| ATK A9 X | 0x373B:11A0 | 2,107 | Demo/local only |
| VXE X3 Pro | 0x373B:1249 | 2,122 | Demo/local only |
| VXE X3 Turbo | 0x373B:124A | 2,123 | Demo/local only |
| ATK A9 NB | 0x373B:1245 | 2,120 | Demo/local only |
| ATK A9 Pro Max | 0x373B:1117 | 2,85 | Demo/local only |
| ATK U2 Pro Max | 0x373B:1158 | 2,100 | Demo/local only |
| DRAGONFLY F1 V2 PRO MAX | 0x373B:11AB | 2,110 | Demo/local only |
| ATK A9 Ultra Max 2.0 | 0x373B:11DD | 1,6 | Demo/local only |
| ATK A9 Ultra Max 2.0 Tri-Mode | 0x373B:11F2 | 1,15 | Demo/local only |
| ATK F1 Ultra Max 2.0 | 0x373B:11ED | 1,12 | Demo/local only |
| ATK X1 Ultra Max 2.0 | 0x373B:11EC | 1,11 | Demo/local only |
| ATK U2 Ultra Max 2.0 | 0x373B:11F7 | 1,18 | Demo/local only |
| VXE R1 Ultra | 0x373B:11F9 | 1,20 | Demo/local only |
| ATK F1 PRO | 0x373B:1014 | 2,36 | Demo/local only |
| ATK F1 PRO MAX | 0x373B:1015 | 2,37 | Demo/local only |
| ATK X1 PRO | 0x373B:1016 | 2,38 | Demo/local only |
| ATK X1 PRO MAX | 0x373B:1017 | 2,39 | Demo/local only |
| ATK Z1 PRO | 0x373B:1018 | 2,40 | Demo/local only |
| ATK Z1 PRO MAX | 0x373B:1019 | 2,41 | Demo/local only |
| ATK U2 MINI | 0x373B:1086 | 2,64 | Demo/local only |
| ATK U2 Ultra | 0x373B:10AC | 2,66 | Demo/local only |
| ATK Y9 PRO MAX | 0x373B:10FD | 2,108 | Demo/local only |
| MAD R MAJOR | 0x373B:103E | 2,47 | Demo/local only |
| MAD R MAJOR+ | 0x373B:104C | 2,55 | Demo/local only |
| ATK X1 Ultra Max 2.0 | 0x373B:12FF | 1,87 | Demo/local only |
| ATK F1 Ultimate | 0x373B:102E | 2,42 | Existing verified controls |
| ATK X1 Ultra | 0x373B:102F | 2,43 | Demo/local only |
| ATK FIERCE X | 0x373B:1030 | 2,44 | Demo/local only |
| ATK F1 Ultra | 0x373B:103C | 2,45 | Existing verified controls |
| ATK X1 Ultimate | 0x373B:103D | 2,46 | Demo/local only |
| ATK F1 EXTREME | 0x373B:1045 | 2,50 | Existing verified controls |
| ATK Z1 Ultra | 0x373B:104A | 2,53 | Demo/local only |
| ATK F1 LEVIATAN | 0x373B:105B | 2,56 | Demo/local only |
| ATK U2 Ultimate | 0x373B:1087 | 2,65 | Demo/local only |
| ATK X1 EXTREME | 0x373B:10E9 | 2,70 | Demo/local only |
| ATK A9 Ultra | 0x373B:1119 | 2,87 | Demo/local only |
| ATK A9 NB ULTRA | 0x373B:11F3 | 2,115 | Demo/local only |
| ATK A9 Ultimate | 0x373B:11B6 | 1,3 | Demo/local only |
| ATK A9 Air | 0x373B:120A | 1,21 | Demo/local only |
| ATK Y9 Ultimate | 0x373B:11CF | 1,5 | Demo/local only |
| ATK F1 Ultimate 2.0 | 0x373B:11E4 | 1,8 | Existing verified controls |
| ATK X1 Ultimate 2.0 | 0x373B:11E7 | 1,10 | Demo/local only |
| ATK Duckbill Ultra | 0x373B:11A6 | 1,2 | Demo/local only |
| ATK Duckbill EXTREME | 0x373B:1230 | 1,25 | Demo/local only |
| ATK ZERO EX | 0x373B:11CC | 1,4 | Existing verified controls |
| ATK X1 EXTREME 2.0 | 0x373B:11E5 | 1,9 | Demo/local only |
| ATK X1 EXTREME GT | 0x373B:120B | 1,22 | Demo/local only |
| ATK F1 EXTREME 2.0 | 0x373B:11E3 | 1,7 | Existing verified controls |
| ATK F1 LEVIATAN 2.0 | 0x373B:11F0 | 1,13 | Existing verified controls |
| ATK U2 Mini 2.0 | 0x373B:11F6 | 1,17 | Demo/local only |
| ATK Z1 Ultimate 2.0 | 0x373B:1201 | 1,19 | Demo/local only |
| ATK U2 Ultimate 2.0 | 0x373B:11F5 | 1,16 | Demo/local only |
| ATK Ghost EXTREME | 0x373B:120D | 1,23 | Demo/local only |
| ATK Ghost Ultimate | 0x373B:120E | 1,24 | Demo/local only |
| ATK ZERO | 0x373B:124E | 1,26 | Demo/local only |
| ATK A9 Mini | 0x373B:1256 | 1,27 | Demo/local only |
| ATK X EXTREME | 0x373B:1266 | 1,30 | Demo/local only |
| ATK X1 Ultra Max 2.0 | 0x373B:1274 | 1,32 | Demo/local only |
| ATK F1 Ultra Max 2.0 | 0x373B:126E | 1,33 | Demo/local only |
| ATK A9 Ultra Max 2.0 Tri-Mode | 0x373B:1270 | 1,37 | Demo/local only |
| ATK A9 Ultra Max 2.0 | 0x373B:126F | 1,38 | Demo/local only |
| ATK U2 Plus NK | 0x373B:126C | 2,124 | Demo/local only |
| VXE R1 | 0x373B:1271 | 2,127 | Demo/local only |
| VXE R1 PRO | 0x373B:1272 | 2,125 | Demo/local only |
| VXE R1 PRO MAX | 0x373B:1273 | 2,126 | Demo/local only |
| ATK A9 Mini | 0x373B:125A | 1,28 | Demo/local only |
| ATK U2 Pro Max | 0x373B:126D | 2,128 | Demo/local only |
| Flow 7 | 0x373B:12D7 | 2,131 | Demo/local only |
| ATK F1 V3 ULTIMATE | 0x373B:12FA | 1,85 | Existing verified controls |
| MAD R | 0x373B:132B | 2,133 | Demo/local only |
| ATK X1 S NK | 0x373B:131A | 2,132 | Demo/local only |
| ATK A9 Mini + | 0x373B:1269 | 1,31 | Demo/local only |
| ATK A9 Mini + | 0x373B:128E | 1,52 | Demo/local only |
| ATK ZERO EX + | 0x373B:1289 | 1,47 | Demo/local only |
| ATK X1 Ultimate 2.0 + | 0x373B:1286 | 1,46 | Demo/local only |
| ATK F1 V3 EXTREME + | 0x373B:129B | 1,58 | Demo/local only |
| ATK F1 V3 LEVIATAN + | 0x373B:129D | 1,60 | Demo/local only |
| ATK A9 Air + | 0x373B:1293 | 1,54 | Demo/local only |
| ATK A9 Ultimate + | 0x373B:1292 | 1,53 | Demo/local only |
| ATK U2 Mini 2.0 + | 0x373B:128D | 1,51 | Demo/local only |
| ATK U2 Ultimate 2.0 + | 0x373B:128C | 1,50 | Demo/local only |
| ATK PHANTOM ULTIMATE | 0x373B:1296 | 1,55 | Demo/local only |
| ATK X1 EXTREME 2.0 + | 0x373B:1285 | 1,45 | Demo/local only |
| ATK X1 Air + | 0x373B:12A2 | 1,61 | Demo/local only |
| ATK Ghost Ultimate + | 0x373B:128B | 1,49 | Demo/local only |
| ATK Ghost EXTREME + | 0x373B:128A | 1,48 | Demo/local only |
| ATK F1 Ultimate 2.0 + | 0x373B:129C | 1,59 | Demo/local only |
| ATK X1 Air + | 0x373B:127C | 1,42 | Demo/local only |
| ATK F1 V3 ULTIMATE + | 0x373B:12A7 | 1,62 | Demo/local only |
| ATK A9 NB ULTRA + | 0x373B:12AB | 2,129 | Demo/local only |
| ATK Y9 Ultimate + | 0x373B:12AF | 1,66 | Demo/local only |
| ATK Z1 Ultimate 2.0 + | 0x373B:12B0 | 1,67 | Demo/local only |
| ATK A9 Air + | 0x373B:127F | 1,40 | Demo/local only |
| ATK A9 Ultimate + | 0x373B:127E | 1,39 | Demo/local only |
| ATK F1 V3 ULTIMATE + | 0x373B:12A8 | 1,63 | Demo/local only |
| ATK F1 V3 ULTIMATE + | 0x373B:12A9 | 1,64 | Demo/local only |
| ATK A9 Wireless Charging | 0x373B:12C6 | 1,71 | Demo/local only |
| ATK X1 Ultimate 2.0 Silent | 0x373B:12B4 | 1,76 | Demo/local only |
| ATK A9 Ultimate Silent | 0x373B:12B3 | 1,75 | Demo/local only |
| Mouse | 0x373B:1340 | 2,134 | Demo/local only |
| Mouse | 0x373B:1341 | 2,135 | Demo/local only |
| ATK F1 V3 PIKACHU Edition | 0x373B:132A | 1,90 | Demo/local only |
| Mouse | 0x373B:12FB | 1,86 | Demo/local only |
| Mouse | 0x373B:133B | 1,91 | Demo/local only |
| Mouse | 0x373B:1316 | 1,88 | Demo/local only |
| Mouse | 0x373B:12F9 | 1,84 | Demo/local only |
| Mouse | 0x373B:12F7 | 1,80 | Demo/local only |
| VXE R1SE+ | 0x373B:1358 | 2,136 | Demo/local only |
| VXE R1SE+ Silent | 0x373B:1359 | 2,137 | Demo/local only |
| Mouse 1K Dongle | 0x3554:F503 | Runtime identity | Receiver: paired identity required |
| Mouse 4K Dongle | 0x3554:F505 | Runtime identity | Receiver: paired identity required |
| Mouse 1K Dongle | 0x3554:F50B | Runtime identity | Receiver: paired identity required |
| Mouse 1K Dongle | 0x3554:F58A | Runtime identity | Receiver: paired identity required |
| Mouse 4K Dongle | 0x3554:F58D | Runtime identity | Receiver: paired identity required |
| Mouse 1K Dongle | 0x3554:F58E | Runtime identity | Receiver: paired identity required |
| MAD 1K Dongle | 0x373B:104D | Runtime identity | Receiver: paired identity required |
| VXE Mouse 1K Dongle | 0x3554:FB12 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 1k dongle   | 0x373B:1085 | Runtime identity | Receiver: paired identity required |
| R1 NK | 0x373B:1067 | Runtime identity | Receiver: paired identity required |
| R1 NK | 0x373B:1068 | Runtime identity | Receiver: paired identity required |
| R1 NK | 0x373B:1069 | Runtime identity | Receiver: paired identity required |
| R1 NK | 0x373B:106A | Runtime identity | Receiver: paired identity required |
| NK Mouse Dongle | 0x373B:10C9 | Runtime identity | Receiver: paired identity required |
| R1 NK | 0x373B:10CA | Runtime identity | Receiver: paired identity required |
| R1 NK | 0x373B:10CB | Runtime identity | Receiver: paired identity required |
| R1 NK | 0x373B:10CC | Runtime identity | Receiver: paired identity required |
| ATK Mouse 1K Dongle | 0x373B:101A | Runtime identity | Receiver: paired identity required |
| ATK Mouse 8K Dongle | 0x373B:101B | Runtime identity | Receiver: paired identity required |
| Wireless mouse -8K NANO dongle | 0x373B:111A | Runtime identity | Receiver: paired identity required |
| Wireless mouse -8K NANO dongle | 0x373B:111B | Runtime identity | Receiver: paired identity required |
| ATK Mouse 8K Dongle | 0x373B:11A7 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 4k dongle | 0x373B:11A9 | Runtime identity | Receiver: paired identity required |
| MAD 8K Dongle | 0x373B:1040 | Runtime identity | Receiver: paired identity required |
| ATK 8K Dongle Light Version | 0x373B:1031 | Runtime identity | Receiver: paired identity required |
| ATK 8K Dongle Light Version | 0x373B:1159 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k dongle | 0x373B:115E | Runtime identity | Receiver: paired identity required |
| Wireless mouse -8K TypeC dongle | 0x373B:11C8 | Runtime identity | Receiver: paired identity required |
| Wireless mouse-8K NANO dongle | 0x373B:11CE | Runtime identity | Receiver: paired identity required |
| Wireless mouse -8K TypeC dongle | 0x373B:11CD | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k dongle-H | 0x373B:11D8 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k dongle-L | 0x373B:11D9 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k dongle-L | 0x373B:1278 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k NANO dongle-L | 0x373B:11FE | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k NANO dongle-L | 0x373B:127A | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k NANO dongle-L | 0x373B:11FD | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k NANO dongle-L | 0x373B:1279 | Runtime identity | Receiver: paired identity required |
| Wireless mouse -8K TOWER dongle | 0x373B:11F4 | Runtime identity | Receiver: paired identity required |
| Wireless mouse -1K TOWER dongle | 0x373B:1246 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k dongle-H | 0x373B:12CC | Runtime identity | Receiver: paired identity required |
| Flow 7 | 0x373B:11B3 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k NANO dongle-M | 0x373B:12E9 | Runtime identity | Receiver: paired identity required |
| Wireless mouse 8k dongle-M | 0x373B:1303 | Runtime identity | Receiver: paired identity required |
| ATK Wireless Charging dongle | 0x373B:12DA | Runtime identity | Receiver: paired identity required |
| ATK Wireless Charging-S dongle | 0x373B:1342 | Runtime identity | Receiver: paired identity required |

## Verification

supportAudit.test.ts checks every endpoint, all45 receivers against all8 compatible paired identities, unknown identities and the unchanged8/45/137 totals. Existing fake-HID mouse tests retain wrong-PID/unknown-identity rejection and write/readback checks. Keyboard-only promotions do not change mouse transport behavior. Detailed source hashes/excerpts and grouped verdicts are cached locally under audit/source-support/.
