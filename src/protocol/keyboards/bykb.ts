import type { KeyboardRead } from "../keyboard";
import { KeyboardSettingsSchema, type KeyboardSettings } from "../../devices/keyboardSettings";
import type { KeyboardWrite } from "../keyboardWrites";

// BYKB (solutionProvider 13) SDK in bykb-advanced-keys.util-Brq4qqRJ.js, traced against a fake HID device:
// 63-byte frames [op, cmd, 0, 1, 0, len, payload..., checksum]; checksum = 0xFF - (reportId + bytes 0..61).
// The SDK takes the report ID from the device's own collections (E @5345) and rejects 0.
export const BYKB_FRAME_LENGTH = 63;
const reads: Partial<Record<KeyboardRead, readonly number[]>> = {
  version: [0x82, 0x02, 0, 1, 0, 2], // getFirmwareVersion: u16 LE at payload 6..7
  polling: [0x84, 0x17, 0, 1, 0, 0], // getPollingRate: SDK rate code at payload 6
};

export function bykbReadFrame(kind: KeyboardRead) {
  const header = reads[kind];
  if (!header) throw new Error(`Unverified BYKB ${kind} read; settings stay local`);
  const frame = new Uint8Array(BYKB_FRAME_LENGTH);
  frame.set(header);
  return frame;
}

export function sealBykbFrame<T extends Uint8Array>(frame: T, reportId: number): T {
  const sum = frame.slice(0, 62).reduce((total, b) => total + b, reportId);
  frame[62] = (0xff - sum) & 0xff;
  return frame;
}

// remapping.getKeymaps (traced): [0x83, layer code, 0, packet count, packet index, 2n, n key IDs u16 BE], 9 IDs per
// packet. Layer code = sdkLayer + 4 * system; controller y(): UI layers 0..3 -> codes 0, 1, 4, 5.
const LAYER_CODES = [0, 1, 4, 5];
export function bykbKeymapFrames(layer: number, ids: readonly number[]) {
  const frames: Uint8Array[] = [];
  const count = Math.ceil(ids.length / 9);
  for (let index = 0; index < count; index++) {
    const chunk = ids.slice(9 * index, 9 * index + 9);
    const frame = new Uint8Array(BYKB_FRAME_LENGTH);
    frame.set([0x83, LAYER_CODES[layer], 0, count, index, 2 * chunk.length]);
    chunk.forEach((id, i) => frame.set([id >> 8, id & 255], 6 + 2 * i));
    frames.push(frame);
  }
  return frames;
}
/** Reply entries [key ID u16 BE, SDK keycode u32 BE]; byte 5 holds their total length. */
export function bykbKeymapEntries(reply: Uint8Array) {
  const view = new DataView(reply.buffer, reply.byteOffset, reply.byteLength);
  const entries: { id: number; keycode: number }[] = [];
  for (let at = 6; at + 6 <= 6 + Math.min(reply[5], 54); at += 6)
    entries.push({ id: view.getUint16(at), keycode: view.getUint32(at + 2) });
  return entries;
}

function validKeymapFrame(frame: Uint8Array) {
  const n = frame[5] / 2;
  return (
    frame[0] === 0x83 &&
    LAYER_CODES.includes(frame[1]) &&
    frame[2] === 0 &&
    frame[4] < frame[3] &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 9 &&
    Array.from({ length: n }, (_, i) => (frame[6 + 2 * i] << 8) | frame[7 + 2 * i]).every((id) => id > 0) &&
    frame.slice(6 + 2 * n, 62).every((b) => b === 0)
  );
}

// SDK getters traced against a fake device (value at payload byte 6): getWinKeyLock 0x15, getWasdArrowKeysSwapped
// 0x21, getOsMode 0x11 (OS enum w: Windows 0, MacOS 1). Setters are op 0x04 with the same feature byte.
export const BYKB_OPTIONS = { winLock: 0x15, exchangeWasd: 0x21, macSwitch: 0x11 } as const;
export function bykbOptionFrame(feature: number) {
  const frame = new Uint8Array(BYKB_FRAME_LENGTH);
  frame.set([0x84, feature, 0, 1, 0, 0]);
  return frame;
}

export function validateBykbFrame(frame: Uint8Array) {
  if (frame.length !== BYKB_FRAME_LENGTH)
    throw new Error("BYKB frames must contain 63 bytes");
  if (validKeymapFrame(frame)) return;
  if (
    frame[0] === 0x84 &&
    (Object.values(BYKB_OPTIONS) as number[]).includes(frame[1]) &&
    [0, 1, 0, 0].every((b, i) => frame[2 + i] === b) &&
    frame.slice(6, 62).every((b) => b === 0)
  )
    return;
  const ok = Object.values(reads).some(
    (header) =>
      header!.every((b, i) => frame[i] === b) &&
      frame.slice(header!.length, 62).every((b) => b === 0),
  );
  if (!ok) throw new Error("BYKB command blocked: only source-verified reads are allowed");
}

// SDK waitForResponse requires op, cmd and bytes 3..4 to echo; byte 2 and the length byte vary.
export function matchesBykbReply(request: Uint8Array, response: Uint8Array) {
  return [0, 1, 3, 4].every((i) => response[i] === request[i]);
}

/** BYKB SDK rate enum S: Rate1K=0, Rate500=1, Rate250=2, Rate125=3, Rate8K=4, Rate4K=5, Rate2K=6. */
export const BYKB_POLLING: Record<number, number> = {
  0: 1000, 1: 500, 2: 250, 3: 125, 4: 8000, 5: 4000, 6: 2000,
};

/** Controller vt(): hex "major.minor" from the u16 LE firmware value. */
export function bykbFirmware(reply: Uint8Array) {
  if (reply[5] < 2) throw new Error("BYKB firmware reply has no payload");
  return `${reply[7].toString(16)}.${reply[6].toString(16).padStart(2, "0")}`;
}

/**
 * Opt-in untested BYKB writes, traced from the SDK with a recording fake device: setPollingRate [0x04, 0x17, 0, 1, 0,
 * 1, code], setWinKeyLock / setWasdArrowKeysSwapped / changeOsMode [0x04, feature, 0, 1, 0, 1, 0|1] and
 * remapping.setKeymap [0x03, layer code, 0, 1, 0, 6, key ID u16 BE, keycode u32 BE]. Key IDs must belong to the layout.
 */
export function validateBykbWrite(frame: Uint8Array, keyIds: ReadonlySet<number>) {
  if (frame.length !== BYKB_FRAME_LENGTH) throw new Error("BYKB frames must contain 63 bytes");
  const tail = (n: number) => frame.slice(n, 62).every((b) => b === 0);
  const head = (...bytes: number[]) => bytes.every((b, i) => frame[2 + i] === b);
  if (frame[0] === 0x04 && head(0, 1, 0, 1) && tail(7)) {
    if (frame[1] === 0x17 && frame[6] in BYKB_POLLING) return;
    if ((Object.values(BYKB_OPTIONS) as number[]).includes(frame[1]) && frame[6] <= 1) return;
  }
  if (frame[0] === 0x03 && LAYER_CODES.includes(frame[1]) && head(0, 1, 0, 6) && keyIds.has((frame[6] << 8) | frame[7]) && tail(12))
    return;
  throw new Error("BYKB write blocked: packet is outside the untested write tier");
}

const POLLING_CODES = Object.fromEntries(Object.entries(BYKB_POLLING).map(([code, hz]) => [hz, Number(code)]));
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Plans the untested BYKB writes; each packet is read back with the matching SDK getter at the same byte offsets. */
export function bykbWritePlan(
  before: KeyboardSettings,
  draft: KeyboardSettings,
  unread: { fields: (keyof KeyboardSettings)[]; keyLayers: boolean },
  keyIdAt: ReadonlyMap<string, number>,
) {
  const next = KeyboardSettingsSchema.parse(draft);
  const packets: KeyboardWrite[] = [],
    skipped = new Set<string>();
  const frame = (bytes: number[]) => {
    const f = new Uint8Array(BYKB_FRAME_LENGTH);
    f.set(bytes);
    return f;
  };
  if (before.pollingRate !== next.pollingRate) {
    const code = POLLING_CODES[next.pollingRate];
    if (unread.fields.includes("pollingRate")) skipped.add("Polling: device value unread");
    else if (code === undefined) skipped.add("Polling: rate not offered by this keyboard");
    else packets.push({ label: "Polling", frame: frame([0x04, 0x17, 0, 1, 0, 1, code]), read: bykbReadFrame("polling"), start: 6, end: 7 });
  }
  for (const [field, feature] of Object.entries(BYKB_OPTIONS) as [keyof typeof BYKB_OPTIONS, number][])
    if (before.options[field] !== next.options[field]) {
      if (unread.fields.includes("options")) skipped.add("Keyboard options: device value unread");
      else
        packets.push({
          label: field,
          frame: frame([0x04, feature, 0, 1, 0, 1, +next.options[field]]),
          read: bykbOptionFrame(feature),
          start: 6,
          end: 7,
        });
    }
  for (const field of ["rgbArea", "sixKeyNoPunch", "bottomTrigger", "performanceMode"] as const)
    if (before.options[field] !== next.options[field]) skipped.add(`${field}: not offered by this keyboard`);
  if (!sameJson(before.deadZone, next.deadZone)) skipped.add("Dead zones: no write path for this keyboard");
  if (!sameJson(before.light, next.light)) skipped.add("Lighting: this keyboard's effect ids are not mapped");
  next.keys.forEach((key, i) => {
    const old = before.keys[i];
    if (old.actuation !== key.actuation || !sameJson(old.rt, key.rt)) skipped.add("Travel and rapid trigger: not integrated");
    if (old.color !== key.color) skipped.add("Per-key colors: not integrated");
    key.layers.forEach((code, layer) => {
      if (sameJson(old.layers[layer], code)) return;
      const id = keyIdAt.get(`${key.row}:${key.col}`);
      if (unread.keyLayers) return void skipped.add("Key assignments: device value unread");
      if (!id || code[0] !== 0 || code.length !== 2) return void skipped.add("Key assignments: not a BYKB keycode");
      const value = code[1] >>> 0;
      packets.push({
        label: `Key ${key.row}:${key.col} layer ${layer + 1}`,
        frame: frame([0x03, LAYER_CODES[layer], 0, 1, 0, 6, id >> 8, id & 255, value >>> 24, (value >> 16) & 255, (value >> 8) & 255, value & 255]),
        read: bykbKeymapFrames(layer, [id])[0],
        start: 6,
        end: 12,
      });
    });
  });
  for (const field of ["macros", "advanced"] as const)
    if (!sameJson(before[field], next[field])) skipped.add(`${field}: packet verification required`);
  return { packets, skipped: [...skipped] };
}
