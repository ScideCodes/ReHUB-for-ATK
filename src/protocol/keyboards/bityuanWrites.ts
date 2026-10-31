import { KeyboardSettingsSchema, LIGHT_MODES, type KeyboardSettings } from "../../devices/keyboardSettings";
import { keyboardBulkRead } from "../keyboardBulk";
import { readOnlyKeyboardFrame } from "./readOnly";
import { VERIFIED_KEY_CLASSES, type KeyboardWrite } from "../keyboardWrites";
import { customLedBlockPackets, hfdLedBlockPackets, validCustomLedBlock, validHfdLedBlock } from "./customLedBlocks";
import { triggerBufferPlan, validTriggerChunk, type TriggerRaw } from "./triggerBuffers";

// Opt-in untested write tier for BITYUAN (Tv controller, demoMode.store-CXKd1LXo.js) using its single-frame setters:
// bp/kp/Ap feature switches (3,150,17|29|30), gp dead zones (3,150,11, u16 BE x 0.001mm), rp keymap (5,layer,row,col,
// class,id), mp lighting (7,65,...), af custom LED blocks (customLedBlocks.ts; firmware < 2.1) and pp/vp travel / RT
// flash buffers (triggerBuffers.ts). Not written: polling (Tv sets Pp auto-restart 78 first, so the keyboard reboots
// before readback) and RGB area.
// HFD (Pm controller) shares only the keymap setter fm (5,layer,row,col,class,id); Pm sends Sm [250] end-transmission
// after it on PID 0x1231. HFD wm options/polling also rewrite unread sleep/low-latency bytes, Tm colours write 6-slot
// blocks including matrix holes and ym lighting carries validation bytes, so those stay local.
type Matrix = { rows: number; columns: number };
export type UntestedFamily = { family: "BITYUAN" | "HFD" | "DUCKBREAD" | "13"; endTransmission?: boolean };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const zeroFrom = (frame: Uint8Array, n: number) => frame.slice(n).every((b) => b === 0);
const word = (frame: Uint8Array, n: number) => frame[n] * 256 + frame[n + 1];

export function validateBityuanWrite(frame: Uint8Array, matrix?: Matrix, tier: UntestedFamily = { family: "BITYUAN" }) {
  if (frame.length !== 32) throw new Error("Keyboard frames must contain 32 bytes");
  const inMatrix = (row: number, col: number) => !!matrix && row < matrix.rows && col < matrix.columns;
  if (tier.family === "HFD" && tier.endTransmission && frame[0] === 250 && zeroFrom(frame, 1)) return;
  if (tier.family === "HFD" && frame[0] === 3 && frame[1] === 150) {
    // wm feature frame: RGB area and Mac 0, flags 0/1, report code 8/4/2/1, sleep u16 and low latency as read.
    if (
      frame[2] === 17 &&
      frame[3] === 0 &&
      frame[4] <= 1 &&
      frame[5] === 0 &&
      frame[6] <= 1 &&
      frame[7] <= 1 &&
      [1, 2, 4, 8].includes(frame[8]) &&
      frame[11] <= 1 &&
      zeroFrom(frame, 12)
    )
      return;
    if (frame[2] === 18 && zeroFrom(frame, 3)) return;
  }
  if (tier.family === "HFD" && matrix && validHfdLedBlock(frame, matrix)) return;
  if (tier.family === "BITYUAN" && frame[0] === 3 && frame[1] === 150) {
    if (frame[2] === 17 && frame.slice(4, 8).every((b) => b <= 1) && zeroFrom(frame, 8)) return;
    if ([29, 30].includes(frame[2]) && frame[3] <= 1 && zeroFrom(frame, 4)) return;
    if (frame[2] === 11 && word(frame, 3) <= 3300 && word(frame, 5) <= 3300 && zeroFrom(frame, 7)) return;
    if (frame[2] === 18 && zeroFrom(frame, 3)) return;
    if (frame[2] === 78 && frame[3] === 1 && zeroFrom(frame, 4)) return;
    if (frame[2] === 70 && frame[3] <= 3 && zeroFrom(frame, 4)) return;
  }
  if (
    frame[0] === 5 &&
    frame[1] < 4 &&
    inMatrix(frame[2], frame[3]) &&
    (VERIFIED_KEY_CLASSES as readonly number[]).includes(frame[4]) &&
    zeroFrom(frame, 6)
  )
    return;
  if (
    tier.family === "BITYUAN" &&
    frame[0] === 7 &&
    frame[1] === 65 &&
    LIGHT_MODES.some(([id]) => id === frame[2]) &&
    frame[3] === 0 &&
    frame[8] <= 100 &&
    frame[9] <= 1 &&
    zeroFrom(frame, 10)
  )
    return;
  // af.create block: [7, 66, row, 8n, n, n x rgb], n = min(8, columns - 8n).
  if (tier.family === "BITYUAN" && matrix && validCustomLedBlock(frame, matrix)) return;
  // Tv pp/vp travel and RT flash buffer chunks (0.001mm, up to 3.4mm).
  if (tier.family === "BITYUAN" && matrix && validTriggerChunk(frame, matrix, 3400)) return;
  throw new Error(`${tier.family} write blocked: packet is outside the untested write tier`);
}

export function bityuanWritePlan(
  before: KeyboardSettings,
  draft: KeyboardSettings,
  unread: (keyof KeyboardSettings)[],
  /** Raw RGB per 8-key block as read ("row:col"); undefined when colours were not read. */
  colorBlocks: Record<string, number[]> | undefined,
  matrix?: Matrix,
  tier: UntestedFamily = { family: "BITYUAN" },
  /** Firmware ("major.minor") decides the 6-key byte; colorful is mp byte 9 as read. */
  device: { firmware?: string; colorful?: number; triggerRaw?: TriggerRaw; hfdFeature?: number[] } = {},
) {
  const hfd = tier.family === "HFD";
  // Tv.setKeyboardFunction: sixKeyNoPunch written directly from firmware 2, inverted before.
  const sixKeyByte = (on: boolean) => (Number(device.firmware) >= 2 ? +on : +!on);
  KeyboardSettingsSchema.parse(before);
  const next = KeyboardSettingsSchema.parse(draft);
  const packets: KeyboardWrite[] = [],
    skipped = new Set<string>();
  const frame = (bytes: number[]) => {
    const f = new Uint8Array(32);
    f.set(bytes);
    return f;
  };
  const add = (field: keyof KeyboardSettings, packet: KeyboardWrite) => {
    if (unread.includes(field)) skipped.add(`${packet.label}: device value unread`);
    else packets.push(packet);
  };
  if (hfd) {
    // Pm.setKeyboardFunction wm.create @201580 (traced): [3, 150, 17, 0, wasd, 0, winLock, 6-key (0 = on), report,
    // sleep u16, lowLatency]. RGB area and Mac are always written 0 by the source; sleep and low latency are kept as read.
    const offered = ["exchangeWasd", "winLock", "sixKeyNoPunch"] as const;
    for (const field of ["rgbArea", "macSwitch", "bottomTrigger", "performanceMode"] as const)
      if (before.options[field] !== next.options[field]) skipped.add(`${field}: not offered for this keyboard`);
    const featureChanged =
      before.pollingRate !== next.pollingRate || offered.some((field) => before.options[field] !== next.options[field]);
    const report = ({ 125: 8, 250: 4, 500: 2, 1000: 1 } as Record<number, number>)[next.pollingRate];
    if (featureChanged) {
      if (!device.hfdFeature || unread.includes("options")) skipped.add("Options and polling: device value unread");
      else if (report === undefined) skipped.add("Polling: rate not offered by this keyboard");
      else
        packets.push({
          label: "Keyboard options and polling",
          frame: frame([3, 150, 17, 0, +next.options.exchangeWasd, 0, +next.options.winLock, next.options.sixKeyNoPunch ? 0 : 1, report, ...device.hfdFeature.slice(6, 9)]),
          read: readOnlyKeyboardFrame("HFD", "polling"),
          start: 3,
          end: 12,
        });
    }
    if (!equal(before.light, next.light)) skipped.add("Lighting: frame layout not verified for this keyboard");
    if (!equal(before.deadZone, next.deadZone)) skipped.add("Dead zones: no write path for this keyboard");
  } else {
    // Tv.setReportRate (traced): Pp auto-restart [3, 150, 78, 1], then Lp [3, 150, 70, code]; 1000/2000/4000/8000Hz = 3/2/1/0.
    // The keyboard may restart to apply the rate; if it drops before the readback, the next read shows the result.
    if (before.pollingRate !== next.pollingRate) {
      const code = ({ 1000: 3, 2000: 2, 4000: 1, 8000: 0 } as Record<number, number>)[next.pollingRate];
      if (code === undefined) skipped.add("Polling: rate not offered by this keyboard");
      else {
        add("pollingRate", { label: "Polling auto-restart", frame: frame([3, 150, 78, 1]), read: frame([2, 150, 78]), start: 3, end: 4 });
        add("pollingRate", { label: "Polling", frame: frame([3, 150, 70, code]), read: readOnlyKeyboardFrame("BITYUAN", "polling"), start: 3, end: 4 });
      }
    }
    // mp.create @26429: [7, 65, effect, 0, speed, r, g, b, brightness]; ranges wf 0-100 / bf 0-255 (@66147) are shared.
    if (!equal(before.light, next.light)) {
      const rgb = next.light.color.slice(1).match(/../g)!.map((v) => parseInt(v, 16));
      add("light", {
        label: "Lighting",
        // mp.colorful (byte 9) is rewritten as read, as the source passes its whole read config.
        frame: frame([7, 65, next.light.mode, 0, next.light.speed, ...rgb, next.light.brightness, device.colorful ?? 0]),
        read: frame([8, 65]),
        start: 2,
        end: 10,
      });
    }
    if (before.options.rgbArea !== next.options.rgbArea) skipped.add("RGB area: value meanings unverified");
    // RGB area is rewritten as read (its value meanings are unverified).
    const options = (s: KeyboardSettings) => [
      before.options.rgbArea,
      +s.options.exchangeWasd,
      +s.options.macSwitch,
      +s.options.winLock,
      sixKeyByte(s.options.sixKeyNoPunch),
    ];
    if (!equal(options(before), options(next)))
      add("options", { label: "Keyboard options", frame: frame([3, 150, 17, ...options(next)]), read: readOnlyKeyboardFrame("BITYUAN", "options"), start: 3, end: 8 });
    for (const [field, command, read] of [
      ["bottomTrigger", 29, "bottom"],
      ["performanceMode", 30, "performance"],
    ] as const)
      if (before.options[field] !== next.options[field])
        add("options", { label: field, frame: frame([3, 150, command, +next.options[field]]), read: readOnlyKeyboardFrame("BITYUAN", read), start: 3, end: 4 });
    const micro = (mm: number) => {
      const n = Math.round(mm * 1000);
      return [n >> 8, n & 255];
    };
    if (!equal(before.deadZone, next.deadZone))
      add("deadZone", {
        label: "Global dead zones",
        frame: frame([3, 150, 11, ...micro(next.deadZone.top), ...micro(next.deadZone.bottom)]),
        read: readOnlyKeyboardFrame("BITYUAN", "deadZone"),
        start: 3,
        end: 7,
      });
  }
  next.keys.forEach((key, i) => {
    const old = before.keys[i],
      label = `Key ${key.row}:${key.col}`;
    key.layers.forEach((code, layer) => {
      if (equal(old.layers[layer], code)) return;
      if (!matrix) return void skipped.add("Key assignments: this model's key matrix is not verified");
      if (code.length !== 2 || code[1] > 255) return void skipped.add("Wide keycodes: no write path");
      if (!(VERIFIED_KEY_CLASSES as readonly number[]).includes(code[0]))
        return void skipped.add("Advanced assignments: packet verification required");
      // Readback: the 28-byte keymap buffer chunk (cp, id 18) holding this key's [class, id].
      const offset = ((layer * matrix.rows + key.row) * matrix.columns + key.col) * 2,
        chunk = offset - (offset % 28);
      add("keys", {
        label: `${label} layer ${layer + 1}`,
        frame: frame([5, layer, key.row, key.col, ...code]),
        read: keyboardBulkRead("keys", chunk),
        start: 4,
        end: 6,
        readAt: 4 + offset - chunk,
        ...(tier.endTransmission && { commit: frame([250]) }),
      });
    });
  });
  const colorsChanged = next.keys.some((key, i) => key.color !== before.keys[i].color);
  if (colorsChanged && hfd) {
    // Pm.setAllKeysCustomLed Tm (traced): [7, 69, row, 6n, 6, six [index, r, g, b]] per block, then one save.
    const blocks = matrix ? hfdLedBlockPackets(before, next, colorBlocks) : null;
    if (!blocks) skipped.add("Per-key colors: device value unread");
    else blocks.forEach((packet) => add("keys", packet));
  } else if (colorsChanged) {
    // Tv.setAllKeysCustomLed (v1) af blocks; see customLedBlocks.ts.
    const colorPackets = matrix ? customLedBlockPackets(before, next, colorBlocks) : null;
    if (!colorPackets) skipped.add("Per-key colors: device value unread");
    else colorPackets.forEach((packet) => add("keys", packet));
  }
  const triggerChanged = next.keys.some((key, i) => key.actuation !== before.keys[i].actuation || !equal(key.rt, before.keys[i].rt));
  if (triggerChanged && !hfd) {
    // Tv.setAllKeysTravel / setAllKeysRt pp/vp flash buffers (0.001mm); see triggerBuffers.ts.
    if (!matrix || !device.triggerRaw || unread.includes("keys")) skipped.add("Travel and rapid trigger: device values unread");
    else packets.push(...triggerBufferPlan(before, next, matrix, device.triggerRaw, 1000));
  }
  for (const field of ["macros", "advanced"] as const)
    if (!equal(before[field], next[field])) skipped.add(`${field}: packet verification required`);
  return { packets, skipped: [...skipped] };
}
