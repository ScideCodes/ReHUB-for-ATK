# Keyboard protocol verification — current Phase 6

Source: ../extracted/asar_unpacked/static. Audited 2026-10-28 using static AST inspection, not execution of the original app. Offsets below are JavaScript string offsets. Physical hardware is untested; fake HID verifies this implementation, not actual firmware behavior. This ledger supersedes earlier mixed phase claims.

## HFD options, polling and colours; BITYUAN polling (2026-10-31)

Traced from the original controllers and checked with executed parity (82/82 keyboard scenarios):
- HFD options and polling: Pm.setKeyboardFunction sends wm.create [3, 150, 17, 0, wasd, 0, winLock, 6-key (0 = on), report (125/250/500/1000Hz = 8/4/2/1), sleep u16, lowLatency]; the source always writes RGB area and Mac as 0. The reader now takes these from wm.get (6-key inverted), keeps sleep and low latency as read (snapshot.hfdFeature) and rewrites them unchanged. Readback [2, 150, 17] bytes 3..11. Polling is saved through the same full-config frame the original keyboard UI uses (Pm.setReportRate alone would zero the other options).
- HFD per-key colours: Pm.setAllKeysCustomLed Tm [7, 69, row, 6n, 6, six [index, r, g, b]] per block (always six slots), then one save [3, 150, 18]; slot indexes and positions without a key come from the block read.
- BITYUAN polling: Tv.setReportRate sends Pp [3, 150, 78, 1] (auto-restart on) then Lp [3, 150, 70, code] (1000/2000/4000/8000Hz = 3/2/1/0); both read back. If the keyboard restarts before the readback, the apply reports a disconnect and the next read shows the new rate.
Still not written: HFD lighting (ym frame with validation bytes), BYKB lighting and travel, macros and advanced keys on every family, ARBITER, and the 19 entries without a source protocol.

## Executed parity with the original keyboard controllers (2026-10-31)

With the user's permission the original controllers ran in Node on a stateful fake keyboard (src/devices/parity/viaFake.ts; setters store, getters return; no hardware, no network): BITYUAN Tv (export `Ai` of demoMode.store) and, through a temp copy of the bundle with one appended export line (the extracted files are untouched), DUCKBREAD bP (ATK68/RS7) and HFD Pm. scripts/parity/keyboards.mjs runs one UI action per scenario the way the original UI does (getter, change one field, setter) and records the final device state (src/devices/parity/keyboards.json); src/devices/parity/keyboards.parity.test.ts replays each action through KeyboardClient (read, consent, plan, readback) on the same fake. 68/68 end in the original's state: BITYUAN on firmware 1.23 and 2.05 with colorful 0/1, ATK68, HFD A87 PRO and A87 Ultra (end transmission).

Fixed by the comparison:
- Travel and rapid trigger (ATK68 verified writer, RS7, BITYUAN): written as the source's whole-matrix flash buffers (IL/RL, pp/vp: 11 or 4 cells per chunk, flash op 1 erase / 0 / 2 write, 200ms after first and last), positions without a key keep their read values (snapshot.triggerRaw), verified by bulk reads after the write chunk (src/protocol/keyboards/triggerBuffers.ts). The single-key [3, 150, 3|7, row, col] setters the source never sends are no longer accepted. BITYUAN travel/RT are no longer held.
- ATK68/RS7 per-key colours: qL 8-key blocks plus one save, like BITYUAN (customLedBlocks.ts); single-key colour frames are rejected.
- BITYUAN 6-key rollover: Tv reads and writes the byte directly from firmware 2 and inverted before; reads were always direct, so firmware < 2 showed the opposite state. Now follows the source and is writable.
- BITYUAN lighting rewrites mp.colorful (byte 9) as read instead of 0.
- Values are mm x unit truncated as DataView.setUint16 does in the source (e.g. 0.29mm -> 28), not rounded.

## Parity review with the original driver (2026-10-30)

BITYUAN per-key colours now match Tv.setAllKeysCustomLed (v1): one af.create [7, 66, row, 8n, n, n x rgb] per changed 8-key block (n = min(8, columns - 8n)), then a single af.save [3, 150, 18]; matrix positions without a key keep the RGB read from that block (snapshot.colorBlocks). The previous single-key [7, 66, row, col, 1, rgb] shape is never sent by the original and is now rejected. Executed comparison against the original controllers was blocked by the session classifier (BYKB is the exception: traced with permission); every other keyboard frame was compared with the source builders by reading them.

## BYKB opt-in untested writes, traced from the SDK (2026-10-30)

With the user's permission the BYKB SDK (bykb-advanced-keys.util-Brq4qqRJ.js) was run in Node against a fake WebHID device that only records frames (no hardware, no network). Traced (report ID 6, 63-byte frames, checksum 0xFF - (reportId + bytes 0..61)):

| SDK call | Frame | Readback getter (value at byte 6) |
| --- | --- | --- |
| setPollingRate(code) | 04 17 00 01 00 01 code (enum S: Rate1K 0, 500 1, 250 2, 125 3, 8K 4, 4K 5, 2K 6) | 84 17 00 01 00 00 |
| setWinKeyLock(bool) | 04 15 00 01 00 01 0/1 | 84 15 |
| setWasdArrowKeysSwapped(bool) | 04 21 00 01 00 01 0/1 | 84 21 |
| changeOsMode(w) | 04 11 00 01 00 01 0/1 (w: Windows 0, MacOS 1; controller macSwitch -> MacOS) | 84 11 |
| remapping.setKeymap({layer, system, id, keycode}) | 03 <layer + 4*system> 00 01 00 06 id u16 BE keycode u32 BE | 83 <code> 00 01 00 02 id -> [id, keycode] at 6..11 |

Reader now fills winLock / exchangeWasd / macSwitch from those getters (other option fields do not exist on BYKB). Writes require the per-connection untested consent; validateBykbWrite admits only these shapes, polling codes from the enum, 0/1 flags and key IDs of the device's own layout. src/hid/bykbReads.test.ts checks the planner against the traced bytes and checksums (dd/d1/e1). Not written: lighting (BYKB effect ids differ from LIGHT_MODES and lighting is unread), travel/RT, colours, macros, advanced keys.

## Keyboard phase: all BITYUAN matrices, RS7 and BITYUAN lighting writes, per-device mock matrix (2026-10-30)

- **Source matrices for all 92 BITYUAN.** scripts/generate-keyboard-layouts.mjs now reads custom.row/col/layer straight from the normal Tv filter in demoMode.store when the legacy sourceCatalog lacks the endpoint, following `...spread` objects in order and taking the definition nearest before the filter (minified names repeat). 37 endpoints added (EDGE 60 5x14, EDGE 63HE 5x14, Hex80 6x17, RS8 Air 6x17, ...); the 67 existing matrices are unchanged. Two resolve to generic source names (RS6 V2 0x1330 inline "Keyboard" 5x16; EDGE 63 V2 Vv "Keyboard 60A" firmwareMark edge63 5x15); they are the source's own entries. All 92 now get key matrix reads and keymap/colour writes.
- **RS7 (373B:1044) opt-in writes.** xP instantiates the same bP controller as the ATK68, so it uses the ATK68 setter rules (validateDuckbreadWrite), bounded by its own rs7 layout keys and bP TRAVEL_INFO_MAP 3.4mm travel/RT (340); dead zones keep 3.3mm. Untested on RS7 hardware.
- **BITYUAN lighting.** mp.create @26429 sends [7, 65, effect, 0, speed, r, g, b, brightness] (identical to the ATK68 frame); brightness 0-100 (wf) and speed 0-255 (bf) @66147 are shared by every Tv mode list, so lighting is no longer held. Modes stay limited to LIGHT_MODES (Streamer 14 / 41 excluded). Readback [8, 65] bytes 2..9.
- **`npm run test:devices`** now also runs src/devices/keyboards.matrix.ts: all 130 registry keyboards. 101 writable entries (ATK68 + 100 untested) run on a stateful fake that applies setters and answers reads from state: read, consent required, write keymap (+ options, dead zones, lighting, colours outside HFD; + polling and travel on DUCKBREAD), readback, A87 Ultra [250]. ARBITER (2) and BYKB (8) refuse every write frame; the 19 unverified/placeholder entries never touch WebHID and open as local demos. 130/130 pass (342/342 with mice).
- Still not written: BITYUAN polling (auto-restart before readback), BITYUAN travel/RT (whole-matrix flash buffers), HFD options/colours/lighting, ARBITER, BYKB, and the 19 entries without a source protocol chain.

## HFD, ARBITER, BYKB untested-tier verdicts (2026-10-30)

- **HFD (7, all with cached 8x16 matrix): key assignments only, opt-in.** Pm.setKey @213180 sends fm.create @195922 = [5, layer, row, col, class, id] (VIA keymap set), the same frame and VERIFIED_KEY_CLASSES as BITYUAN; readback via the vm buffer chunk [18, offset, 28]. On PID 0x1231 (A87 Ultra) Pm._checkNeedEndTransmission @223705 adds Sm.get @205846 = [250] after every key write; it is sent as the packet commit before readback. Lm @211191 matches replies on byte 0. Held: wm options/polling (wm.create @201580 rewrites sleep time and low-latency bytes we never read, and zeroes RGB area/Mac), Tm colours (6-slot blocks that include matrix holes), ym lighting (25-byte frame with validation bytes), packed >255 keycodes.
- **ARBITER (2): stays read-only.** Nm.setKey @232777 writes hy at 512*layer + 3*(16*row+col) + configIndex*KeyActionsOffset, but reads use the active matrix and configIndex is never read. setDeadZone @234331, setAllKeysRt @233168 and setKeyboardFunction/setLightConfig @241254/@237940 rewrite whole keyTriggerConfig / functionVariableArea / customInfo structures that are not read either.
- **BYKB (8): stays read-only.** Write paths live in the string-array-obfuscated SDK (bykb-advanced-keys.util); the reads were traced by running it with fake WebHID, but running the original bundle was blocked this session, and statically derived write frames would be guesses.
- Tests: src/hid/bityuanWrites.test.ts (HFD 0x1231 keymap write, [250] ordering, held fields).

## BITYUAN opt-in untested write tier (2026-10-30)

User decision: source-backed writes, off until consented. All 92 BITYUAN endpoints get `untestedWrites`; the existing per-connection consent dialog says the writes are untested, and consent resets on disconnect. Every frame is validated (`validateBityuanWrite`) and read back; a mismatch aborts the apply and forces a fresh read. Physical hardware untested.

| Write | Frame | Source (demoMode.store) | Readback |
| --- | --- | --- | --- |
| Win lock / WASD swap / Mac | 3,150,17, rgbArea, wasd, mac, win, 6-key | bp.create via Tv.setKeyboardFunction @97573 | [2,150,17] bytes 3..8 |
| Bottom optimisation / game mode | 3,150,29 / 3,150,30, 0-1 | kp / Ap.create @30743 | [2,150,29/30] byte 3 |
| Dead zones | 3,150,11, top u16 BE, bottom u16 BE (x0.001mm, max 3300) | gp.create @25710, Tv.setDeadZone @103735 | [2,150,11] bytes 3..7 |
| Key assignment (55 matrix endpoints) | 5, layer, row, col, class, id | rp.create, Tv.setKey @115273; Iu.id_dynamic_keymap_set_keycode=5 | keymap buffer chunk [18, offset, 28], key at 4 + offset % 28 |
| Per-key colour (55 matrix endpoints, firmware < 2.1) | 7,66,row,col,1,rgb then 3,150,18 | af.create/af.save, Tv.setAllKeysCustomLed @107150 | block [8,69,row,8n,8], key at 5 + 3*(col % 8) |

Write replies match as vv.isReplyFor (@86131): command 3 echoes bytes 0..2; 5 and 7 echo byte 0. RGB area and the 6-key byte are rewritten exactly as read (6-key meaning flips between firmware versions in bp). Key classes are the same VERIFIED_KEY_CLASSES as ATK68.

Held local, with a skipped message: polling (Tv.setReportRate sends Pp auto-restart 78 then Lp 70, so the keyboard reboots before readback), lighting (per-model brightness/speed ranges not cached), travel and RT (Tv only writes whole-matrix flash buffers pp/vp with erase/normal/write ops and 200ms pauses), macros, advanced keys, keymaps/colours on the 37 endpoints without a cached matrix, colours on firmware 2.1+. Tests: src/hid/bityuanWrites.test.ts (allowlist, consent, stateful fake-HID writes + readback, mismatch).

## Per-keyboard key layouts (2026-10-30)

- Source rule (demoMode.store): a keyboard's layout is `keymaps/<custom.firmwareMark, "-" -> "_">.json`, unless the filter carries an inline keyboardConfig. `scripts/generate-keyboard-layouts.mjs` (`npm run layouts:generate`, needs ../extracted) applies it with normalised names and a model-name fallback (e.g. "ATK RS6 Air" -> rs6_air.json). Only [row, col] matrix layouts are used; linear generic `kb_*` files are skipped.
- Result: 81 of 130 keyboard endpoints get their source layout (24 files, copied to src/devices/layouts/). The rest, e.g. plain ATK RS6 (firmwareMark "rs6" has no file), keep the ATK68 reference layout and say so.
- ATK68 V2 Pro is pinned to its built-in layout (atk68Layout.json == atk68_v2_pro.json), which its verified writer uses; the generator never remaps it.
- Keyboard maps now belong to one layout (`layout` field, default "atk68" for older saved maps). Opening a keyboard selects, or creates, a map of its layout; the Config File menu and Configuration Management list only that keyboard's maps. An ATK68 map must keep the exact ATK68 matrix order (map-level check), so the ATK68 writer's index addressing is unchanged.
- Type-13 layouts (A87/A98 Ultra, RS8 Neo, V75X Ultra) store 32-bit default actions, not this app's [class, code] bytes; their keys start unassigned instead of being mis-decoded.
- No new hardware reads or writes in this step.

## Runtime verdicts

| Registry family | Endpoints | Current access | Source proof / remaining gap |
| --- | ---: | --- | --- |
| DUCKBREAD | 2 | ATK68 V2 Pro verified read/write; RS7 reads + opt-in untested bP writes | demoMode.store bP @769182, AP/xP definitions; source matrices differ |
| BITYUAN | 92 | Source-proven reads incl. key matrix on all 92; opt-in untested writes (options, dead zones, lighting, keymap, v1 colours) | Tv @92481 extends vv @86131; 55 existing endpoints plus 37 newly matched normal filters |
| HFD | 7 | Firmware, keymap and per-key colour reads; opt-in untested key-assignment writes; options/polling/lighting/colour writes held | RP @791264 -> Pm @212596; bm @201204; vm @196685; Tm @205934; Lm @211191 |
| Provider 13 / BYKB | 8 | Firmware, polling, option and keymap reads; opt-in untested writes (polling, Win lock, WASD, Mac, keymap) traced from the SDK | Aee filters (demoMode) -> BykbKeyboardController; SDK class in bykb-advanced-keys.util (obfuscated), wire format traced |
| ARBITER | 2 | Firmware, polling and dead-zone reads; keymap/trigger/lighting/writes not integrated | Nm @229859 / Km @227677; Fm @226587 64-byte frames, base offset 8, flag 0x55; command enum keyboard-info.util @57931 |
| undefined / placeholder | 5 | Demo/local only | Y5 @1579022 has getVersion returning a result without a firmware packet |
| unverified | 14 | Demo/local only | No matching normal endpoint/controller chain was established; PID hits inside boot objects are insufficient |
| Total | 130 | 101 source-backed reads: 1 existing writer + 100 read-only; 29 demo | No new writes enabled |

All exact identities retain FF60 usage 0061, report 0, canonical registry ID/VID/PID/family checks. New HFD identities additionally use the seven explicit source PIDs below. FF02 boot endpoints are never offered. The 37 added BITYUAN definitions change only their protocolFamily; names, features, images and colorways are unchanged. The older sourceCatalog.json extraction omitted these entries, so fresh normal-filter AST matches were checked against the original, independently of that cache.

## BITYUAN base reads and corrected decoding

| Field | Wire prefix | Source and interpretation |
| --- | --- | --- |
| Firmware | 2,150,0 | yp.get @28191; version bytes 5/6, hexadecimal dotted version |
| Options | 2,150,17 | bp @28352; rgb/WASD/mac/win/6-key at bytes 3..7; 6-key flag is direct, not inverted |
| Bottom optimization / game mode | 2,150,29 / 2,150,30 | kp @30237 / Ap @30744; strict boolean at byte 3 |
| Polling | 2,150,70 | Lp @37870, imported keymap I @11160: codes 3=1000,2=2000,1=4000,0=8000; unknown codes stay unread |
| Dead zones | 2,150,11 | gp @25711: BE u16 at bytes 3..6 multiplied by 0.001mm |
| Lighting | 8,65 | mp @26430: mode byte2,speed4,RGB5..7,brightness8 |

The former shared decoder sent selector34 (BITYUAN physical-key configuration, not polling), rejected valid polling code0, inverted 6-key rollover, and scaled dead zones by 0.01 instead of 0.001. These reads now have their own exact allowlist, zero-tail checks and source units. DUCKBREAD retains selector34, polling codes1/2/4/8 and 0.01mm dead zones. Reply matching retains command/selector checks, report0 and exactly32 bytes.

## Wide key assignments (BYKB, ARBITER)

Layer assignments accept each family's own encoding: [class, id] (DUCKBREAD/BITYUAN/HFD), BYKB [0, 32-bit SDK keycode], ARBITER [class, code, code1]. The ATK68 write planner skips any assignment that is not [class, byte] ("Wide keycodes: no write path"). Labels (src/devices/keycodeLabels.ts) decode structure checked against the source label functions run in Node: BYKB type 0 = modifiers (bits 16-23) + HID key, type 2 = HID consumer usage, 0x0D000000 = Fn, type 8 = lighting function; ARBITER class 16 = [modifier mask, HID key], 48 consumer, 112 macro M(n+1), 144-149 DKS/TGL/MT/RS/SOCD/OKS. Consumer names use the USB HID Usage Tables; the source's own BYKB function names (ht) are Chinese-only and are not shown, so other codes show their raw value.

| Read | Request | Decoding |
| --- | --- | --- |
| ARBITER keymap | GetUseKeyMatrix 8, addr 512 * layer, 384 bytes in 55-byte blocks (28 frames) | key k = row*16+col: bytes 3k..3k+2 (Nm.getCurrentKeyMatrix) |
| BYKB keymap | 83 <layer code> 00 <count> <index> <2n> + n key IDs u16 BE, 9 IDs per packet (remapping.getKeymaps, traced) | entries [key ID u16 BE, keycode u32 BE]; layer codes 0, 1, 4, 5 for UI layers 0-3 (controller y()); key IDs are the source layout's defaultKey[layer][0] (collectLayoutKeyIds) |

BYKB layouts now keep those key IDs and their 32-bit default assignments instead of blanking them. BYKB travel/RT, colours and lighting remain unread. Tests: src/devices/keycodeLabels.test.ts, src/hid/arbiterReads.test.ts, src/hid/bykbReads.test.ts, src/devices/keyboardLayouts.test.ts.

## Read display and partial key reads

Since the hub UI rebuild (a1af64a) hardware reads were only used for write planning. KeyboardWorkspace now copies every fresh read's verified fields into the active map of the device's layout (adoptRead, one undoable store edit, no writes queued); cached snapshots are never adopted. Snapshots carry unreadKeyLayers / unreadKeyTrigger / unreadKeyColors so partial per-key reads can be shown, while unreadFields keeps "keys" until layers and trigger are both read, so the write planner's rules are unchanged. HFD (no trigger hardware) counts layers alone.

The settings schema accepts 125/250/500Hz polling; the Performance control offers each family's source rates (HFD 125-1000, BYKB 125-8000, others 1000-8000). Newly read with this: HFD polling (wm [2,150,17], byte 8: 8=125, 4=250, 2=500, 1=1000Hz), BYKB 125-500Hz, and ARBITER per-key trigger (GetKeyTriggerTravel 160, 19 blocks; sy records, RT on when triggerType > 0, values (raw & 511 + 1)/100mm) and key colours (GetLedDefine 10, 7 blocks of RGB), indexed row*16+col as in Nm.getDeviceData. ARBITER replies must also echo the len byte, which the source uses to slice block data.

## DUCKBREAD RS7 key matrix reads (read-only)

RS7 (373B:1044, xP) instantiates the same bP controller as ATK68, so it uses the already-verified bulk reads sized by its own 6x16 matrix: CL keymap (bP.getCurrentKeyMatrix @778895, 18/offset/28, 768 bytes), IL travel (getAllKeysTravel @772791) and RL rapid trigger (getAllKeysRt @771804) at 0.01mm, and qL key colours (getAllKeysCustomLed @774640, rows x blocks of 8). Bounds come from the endpoint profile; keys land on the source `rs7` layout (DEVICE_PATHS 0x1044). bP TRAVEL_INFO_MAP gives RS7 travel/RT up to 3.4mm (ATK68 3.3mm), so the settings schema accepts 3.4mm while validateKeyboardWrite still caps ATK68 frames at 330 (3.3mm). RS7 writes remain blocked (keySettings false). Tests: src/hid/keyboardConnection.test.ts, src/protocol/keyboardBulk.test.ts. Physical hardware untested.

## BITYUAN key matrix reads (read-only)

Admitted only for the 55 endpoints in `src/devices/keyboardMatrix.json`: source `custom.row/col/layer=4` (Tv.init @95843 area) where every key of the device's source layout lies inside that matrix. Layouts follow the source rule `keymaps/<Gn.DEVICE_PATHS[vid][pid]>.json` (keyboard-info.util rl.getKeyboardMatrix @163796; DEVICE_PATHS @123352), emitted by `scripts/generate-keyboard-layouts.mjs`. The 37 BITYUAN endpoints missing from the legacy sourceCatalog have no cached row/col and stay base-read-only.

| Read | Request | Source | Decoding |
| --- | --- | --- | --- |
| Keymap | 18, offset u16, 28 | Tv.getCurrentKeyMatrix @114715, cp @19504 (Iu.id_dynamic_keymap_get_buffer=18) | 14 [class,id] pairs at bytes 4..31, layer-major then row, col |
| Travel | 2,150,13,0,0, offset u16, 12 | Tv.getAllKeysTravel @102545, pp @22212 (gu.bufferTogTh=13) | u16 at 8.. x 0.001mm (Tv.accuracy) |
| RT | 2,150,14,0,0, offset u16, 4 | Tv.getAllKeysRt @101540, vp @24695 (gu.bufferRt=14) | on, release u16, press u16 x 0.001mm |
| Key colours | 8,69,row,col,8 | Tv.getAllKeysCustomLed @106796, af @53473 (id_custom_get_value=8, getCustomLamplight=69) | RGB triples at 5..; firmware < 2.1 only |

Offsets are bounded by the device matrix; replies must echo offset/size (and row/col for colours). Firmware 2.1+ uses the packed v2 colour read (nf.getCustomColors), not integrated: colours stay unread. Values outside the editor schema (e.g. RT below 0.02mm, which some source models allow) leave keys unread with a warning rather than widening ATK68 write bounds. Tests: `src/hid/keyboardFamilyReads.test.ts`. Physical hardware untested.

## ARBITER firmware, polling and dead-zone reads (read-only)

ATK68 V2 (105E) and ATK68 V2 S (10C2) use Nm over Km. Source Nm filters are usagePage 1 / usage 0 (not FF60/0061), so the registry entries were corrected to the source values; report ID is 0 (Km.transferForResultAsync). Frames are 64 bytes: [0x55, command, key, checksum, len, addr u16 LE, 0, data from 8]; checksum = sum of bytes 4..63 (Fm.toUint8Array). Km resolves a transfer when reply byte 1 equals the command, so replies are matched on byte 1 only.

| Read | Request | Source | Decoding |
| --- | --- | --- | --- |
| Firmware | GetInfo 3 | ly.get @263486 | data bytes 1.0 (frame 9.8) as hex |
| Polling | GetFunc 5, len 56, addr 0 | ry.get (configIndex 0) | low nibble of frame 12: 1=8000, 2=4000, 3=2000, 4=1000Hz |
| Dead zones | GetAppDefine 241, len 56, addr 500 | yy.get / Nm.getDeadZone | global sy record at 24: top = (u16 LE @28 >> 9)/100, bottom = (u16 LE @30 >> 9)/100 mm |

Not integrated: the GetFunc option bits (no macSwitch/rgbArea/performance fields), lighting (ry mode ids), keymap (GetUseKeyMatrix 8, 3-byte [class, code, code1] keycodes), per-key trigger records (GetKeyTriggerTravel 160, 8 bytes per key) and LED colours (GetLedDefine 10): the shared `keys` field holds layers and travel together, so ARBITER per-key data needs that field split first. SetFunc (including ry.enterBootMode 0x51/0xAA/0xBB) and every other command are blocked. Tests: src/hid/arbiterReads.test.ts, src/devices/supportAudit.test.ts. Physical hardware untested.

## BYKB firmware and polling reads (read-only)

The 8 provider-13 endpoints (Aee filters: A87/A98/V75X Ultra, RS8 Neo, wired and 8K receiver; FF60/0061) use BykbKeyboardController, which drives an obfuscated SDK (bykb-advanced-keys.util-Brq4qqRJ.js, export y). Its wire format was established by running that SDK unchanged in Node against a fake WebHID device and recording sendReport, then varying single reply bytes:

- Frames are 63 bytes: [op, cmd, 0, 1, 0, len, payload..., checksum], checksum = 0xFF - (reportId + bytes 0..61) mod 256 (confirmed with report IDs 6 and 9).
- The SDK takes the report ID from the device's collections (E @5345) and throws on 0, so the client uses the opened FF60 collection's non-zero output report ID instead of the registry's 0. The real value is unknown until physical hardware is checked.
- Replies must echo bytes 0, 1, 3 and 4; the SDK ignores byte 2 and the reply checksum.

| Read | Request header | Decoding |
| --- | --- | --- |
| Firmware | 82 02 00 01 00 02 | u16 LE at 6..7, shown as hex major.minor (controller vt) |
| Polling | 84 17 00 01 00 00 | code at 6 (reply len >= 1): 0=1000, 1=500, 2=250, 3=125, 4=8000, 5=4000, 6=2000Hz (SDK enum S) |

125-500Hz falls outside the shared 1000-8000Hz schema and stays unread with a warning. Not integrated: keymaps (remapping.getKeymaps by layout key ID with 32-bit keycodes), lighting effects/per-key LEDs, travel/RT, OS mode (84 11), Win lock (84 15), WASD swap (84 21); every other frame is blocked and writes fail validateKeyboardWrite. Tests: src/hid/bykbReads.test.ts, src/devices/supportAudit.test.ts. Physical hardware untested.

## HFD keymap and key colour reads (read-only)

All 7 HFD endpoints instantiate Pm (RP @791264), a non-Hall-effect controller: it has no travel, RT, dead-zone, DKS/MT/TGL/SOCD or calibration reads, so those capabilities were removed from the registry for these models. Reads admitted for the source 8x16 matrix (DEVICE_PATHS layouts a87/a98 fit it):

| Read | Request | Source | Decoding |
| --- | --- | --- | --- |
| Keymap | 18, offset u16, 28 | Pm.getCurrentKeyMatrix @213938, vm @196685 | 14 [class,id] pairs at 4..31, layer-major; 37 frames |
| Key colours | 8,69,row,col(6n),6, then 6 slots [row*16+col+i,0,0,0] | Pm.getAllKeysCustomLed @215187, Tm @205934 | [index,r,g,b] slots at 5..28; colours read from bytes 1..3 of each slot (getDeviceData @221473) |

Replies must echo offset/size (keymap) or bytes 0..4 (colours); forged slot indices and IL/RL frames are rejected. Still unread: wm feature flags [2,150,17] (no bottomTrigger/performance fields, 6-key flag inverted, sleep/low-latency extras), wm polling 125/250/500/1000Hz (outside the shared 1000-8000Hz schema), and ym lighting [8,65] (HFD effect ids and byte layout differ from MODE_NAMES). Tests: src/hid/keyboardFamilyReads.test.ts. Physical hardware untested.

## HFD firmware-only scope

HFD is deliberately narrower than BITYUAN. pm @195298 supplies 32-byte frames/base offset1; bm.get @201374 emits [2,150,38] with a zero tail. keyboard-info.util exports rn (C) @95072 with command2 and un (T) @97371 with customId150/version38. Pm.getVersion @213005 decodes firmware from bytes5/6. Reply matching requires command2/customId150/selector38, correct report ID and length. Snapshot settings stay explicitly unread; unsupported commands never reach sendReport. Source request encoding is established; echoed reply selectors are tested with fake HID and still require physical confirmation.

| Device | VID:PID | Registry ID | Scope |
| --- | --- | --- | --- |
| ATK A87 PRO | 0x373B:111E | atk-a87-pro-111e | Firmware only; all settings remain local |
| ATK A87 PRO | 0x373B:111F | atk-a87-pro-111f | Firmware only; all settings remain local |
| ATK A87 Ultra | 0x373B:1231 | atk-a87-ultra-1231 | Firmware only; all settings remain local |
| ATK A98 | 0x373B:114D | atk-a98-114d | Firmware only; all settings remain local |
| ATK A98 | 0x373B:114E | atk-a98-114e | Firmware only; all settings remain local |
| ATK A98 Pro | 0x373B:1151 | atk-a98-pro-1151 | Firmware only; all settings remain local |
| ATK A98 Pro | 0x373B:1152 | atk-a98-pro-1152 | Firmware only; all settings remain local |

The source declares 8x16 geometry, but key-matrix reads are not integrated. The UI says firmware-only read verification and keeps edits local. Connection eligibility and firmware reads use the family adapter, rather than assuming DUCKBREAD's selector0.

## Existing ATK68 permissions — unchanged

- Reads: firmware/options/flags/polling/dead zones, lighting, bounded per-key data and source IL/RL/CL bulk buffers. Travel: [2,150,13], BE offset5..6/count12 at7, values from8 in0.01mm. RT: [2,150,14], count4 of five-byte records from8. Keymap: opcode18, BE byte offset1..2,length28 at3, pairs from4. Only the integrated 5x15/four-layer ATK68 matrix may use these buffers.
- Existing writes: polling/options/actuation/RT, bounded EL dead zones, lighting and qL per-key RGB with settle/commit plus separate color readback. Assignment classes remain exactly0,64..67,82,86,120,124. No new class, write opcode, range or identity is admitted.
- Session consent, 20ms write pacing, exact independent readback and invalid/unread-field exclusion remain mandatory. Cache/ACK never establishes a write baseline or confirmed save. ATK68 full reads retain65 frames in the existing virtual5ms timing test.
- MT/TGL: GL @753215 uses the unintegrated Vial254 entryOp13 shared slot table; local only. DKS: HL @751050 packs shared-slot actions; no safe ownership/atomic readback integration, local only. RS/SOCD/OKS and other advanced actions remain local.
- Macros: _L @737232 queries buffer size with top-level0x0D, permanently blocked; SL @737381 manages a shared contiguous buffer. Macro/non-basic assignment packing and ownership are not promoted. Existing local recording/editing remains available.
- RS7 and every BITYUAN/HFD endpoint fail validateKeyboardWrite even after confirmWrites; all other unverified families remain gated before HID open/send.

## Newly matched BITYUAN normal endpoints

Each row points to a filter object under controller Tv in demoMode.store, with literal VID373B, usagePageFF60,usage0061 and report0 from vv.transferForResult @86644. The initial search found42 of51 unknown PID literals, but only37 matched normal filters; boot records were excluded. Fourteen endpoints retain unverified status.

| Registry ID | VID:PID | Normal filter offset |
| --- | --- | ---: |
| atk-edge-60-10b0 | 0x373B:10B0 | 139421 |
| atk-edge-60-1082 | 0x373B:1082 | 139559 |
| atk-edge-60-1114 | 0x373B:1114 | 139697 |
| atk-edge-60-12eb | 0x373B:12EB | 139835 |
| atk-edge-60-10af | 0x373B:10AF | 139973 |
| atk-edge-60-115f | 0x373B:115F | 140111 |
| atk-edge-60-1160 | 0x373B:1160 | 140250 |
| atk-edge-60-1161 | 0x373B:1161 | 140389 |
| rs6-series-11b8 | 0x373B:11B8 | 147394 |
| velota-nothing-68-12ad | 0x373B:12AD | 151319 |
| velota-nothing-68-12ae | 0x373B:12AE | 151691 |
| velota-halo-68-12fc | 0x373B:12FC | 152063 |
| velota-halo-68-12fd | 0x373B:12FD | 152458 |
| rs6-air-cyber-1294 | 0x373B:1294 | 149362 |
| edge-63he-ultimate-113b | 0x373B:113B | 142654 |
| edge-63he-ultimate-113c | 0x373B:113C | 142832 |
| edge-63he-ultimate-113d | 0x373B:113D | 143010 |
| edge-63he-ultimate-1168 | 0x373B:1168 | 143188 |
| edge-63he-ultimate-1169 | 0x373B:1169 | 143367 |
| edge-63he-ultimate-116a | 0x373B:116A | 143546 |
| atk-edge-63-v2-12b5 | 0x373B:12B5 | 144187 |
| atk-edge-63-v2-135f | 0x373B:135F | 144342 |
| rs-63-air-126a | 0x373B:126A | 143725 |
| rs-63-air-126b | 0x373B:126B | 143878 |
| velota-fuzzy-63-12a6 | 0x373B:12A6 | 144031 |
| atk-x-qk-hex80-1176 | 0x373B:1176 | 160336 |
| atk-x-qk-hex80-1177 | 0x373B:1177 | 160512 |
| atk-rs6-v2-1330 | 0x373B:1330 | 152853 |
| atk-rs8-air-12a0 | 0x373B:12A0 | 160841 |
| atk-rs8-air-12a1 | 0x373B:12A1 | 160993 |
| atk-rs8-air-122c | 0x373B:122C | 160689 |
| atk-rs8-air-gengar-edition-1351 | 0x373B:1351 | 161145 |
| atk-rs8-air-12ca | 0x373B:12CA | 161413 |
| atk-rs8-air-12cb | 0x373B:12CB | 161574 |
| rs7-air-cyber-1295 | 0x373B:1295 | 158615 |
| atk-velota-desmond-125d | 0x373B:125D | 141290 |
| velota-fuzzy-60-v2-1267 | 0x373B:1267 | 141495 |

## Evidence fingerprints

| Extracted file | SHA-256 |
| --- | --- |
| demoMode.store-CXKd1LXo.js | 9c7863093c67eb21fa671a2acfbb6a2c0c734b53d1fd64f4ae01270643dd1029 |
| filter-B6RHekbD.js | e62a7f70c49ed277fa7b4f850edd4c86cb88c824b48f6e79da997ff4c75fa3e6 |
| keymap-UanExTfv.js | ef3761dbcb486e4d4b181da54dcce884f38170bafb42fdef408d670f1b4fdca5 |
| keyboard-info.util-BQDDA2LZ.js | 389978ee060c4ca59eaae19f5acc5063785f045c31511891dc653ef187d285d8 |
| bykb-keyboard-controller-1_zLiOUE.js | 18d524580dc7327bcf66bd48073b9e7c4f293fc5c0dc17ace89224269667e652 |

New tests cover four BITYUAN rates, unknown-code rejection, all37 new BITYUAN endpoints, all7 HFD endpoints, malformed/forged identities, blocked commands and unchanged mouse/keyboard write verdicts.
