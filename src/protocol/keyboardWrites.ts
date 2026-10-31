import { verifiedKeyboardProfile } from "../devices/keyboardProtocols";
import {
  KeyboardSettingsSchema,
  type KeyboardSettings,
  KEY_LAYOUT,
  LIGHT_MODES,
} from "../devices/keyboardSettings";
import type { DeviceDefinition } from "../types/schema";
import { validateBityuanWrite, type UntestedFamily } from "./keyboards/bityuanWrites";
import { readOnlyKeyboardFrame } from "./keyboards/readOnly";
import { triggerBufferPlan, validTriggerChunk, type TriggerRaw } from "./keyboards/triggerBuffers";
import { customLedBlockPackets, validCustomLedBlock } from "./keyboards/customLedBlocks";
import { layoutFor } from "../devices/keyboardLayouts";
import { bykbReadFrame, validateBykbWrite } from "./keyboards/bykb";
import {
  keyboardRead,
  keyboardKeyRead,
  keyboardLightRead,
  validateKeyboardFrame,
} from "./keyboard";

export interface KeyboardWrite {
  label: string;
  frame: Uint8Array;
  start: number;
  end: number;
  commit?: Uint8Array;
  /** Where frame[start..end] must appear in the readback; defaults to start. */
  readAt?: number;
  /** No immediate readback (chunks of a flash buffer); `deferredReads` on the last chunk verify the whole buffer. */
  read?: Uint8Array;
  pauseAfter?: number;
  deferredReads?: { read: Uint8Array; at: number; expected: number[] }[];
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

// Source evidence: cached DUCKBREAD PL/BL/KL/NL/TL/DL/ML/AL, baseOffset 1.
// extracted/asar_unpacked/static/demoMode.store-CXKd1LXo.js:723800 (qM), 735708 (AL), 779459 (bP.setKey).
// Verified key classes supported by DUCKBREAD setKey (opcode 5) with readback opcode 4:
// 0: general, 64..67: lt0..3, 82: layer, 86: swap, 120: light, 124: system.
export const VERIFIED_KEY_CLASSES = [
  0, 64, 65, 66, 67, 82, 86, 120, 124,
] as const;

/** Untested write tier of an endpoint; HFD Pm ends key writes with Sm [250] on PID 0x1231 only. */
export function untestedTier(device: DeviceDefinition): UntestedFamily {
  if (device.protocolFamily === "HFD") return { family: "HFD", endTransmission: Number(device.PID) === 0x1231 };
  if (device.protocolFamily === "13") return { family: "13" };
  return { family: device.protocolFamily === "DUCKBREAD" ? "DUCKBREAD" : "BITYUAN" };
}

/** BYKB layouts carry the SDK key ID per position (collectLayoutKeyIds); writes may only address those IDs. */
export function bykbKeyIdMap(device: DeviceDefinition) {
  return new Map(
    layoutFor(device)
      .rows.flat()
      .filter((k) => k.keyId)
      .map((k) => [`${k.index[0]}:${k.index[1]}`, k.keyId!]),
  );
}
const bykbKeyIds = (device: DeviceDefinition) => new Set(bykbKeyIdMap(device).values());

// This separate gate never permits raw/custom commands or bootloader operations.
export function validateKeyboardWrite(
  frame: Uint8Array,
  device: DeviceDefinition,
) {
  const profile = verifiedKeyboardProfile(device);
  if (profile && "untestedWrites" in profile && profile.untestedWrites) {
    const tier = untestedTier(device);
    if (tier.family === "13") {
      validateKeyboardFrame(bykbReadFrame("version"), device);
      return validateBykbWrite(frame, bykbKeyIds(device));
    }
    if (tier.family === "DUCKBREAD") {
      // RS7 (xP) instantiates the same bP as the ATK68: its frame rules, bounded by its own layout keys and the
      // bP TRAVEL_INFO_MAP 3.4mm travel/RT limit.
      validateKeyboardFrame(keyboardRead("version"), device);
      const keys = layoutFor(device).rows.flat().map((k) => k.index);
      return validateDuckbreadWrite(frame, (row, col) => keys.some(([r, c]) => r === row && c === col), 340, profile);
    }
    validateKeyboardFrame(readOnlyKeyboardFrame(tier.family, "version"), device);
    return validateBityuanWrite(frame, profile.keyMatrixRead ? profile : undefined, tier);
  }
  if (!profile?.keySettings)
    throw new Error(
      "Unverified keyboard write identity; writes remain blocked for this model",
    );
  validateKeyboardFrame(keyboardRead("version"), device);
  validateDuckbreadWrite(
    frame,
    (row, col) => KEY_LAYOUT.flat().some((k) => k.index[0] === row && k.index[1] === col),
    330,
    profile,
  );
}

/** Planner context from a keyboard snapshot: matrix, raw trigger buffers and (when read) colour blocks. */
export function keyboardPlanContext(snapshot: {
  matrix?: { rows: number; columns: number };
  triggerRaw?: TriggerRaw;
  colorBlocks?: Record<string, number[]>;
  unreadKeyColors?: boolean;
}) {
  return {
    matrix: snapshot.matrix,
    triggerRaw: snapshot.triggerRaw,
    colorBlocks: snapshot.unreadKeyColors === false ? snapshot.colorBlocks : undefined,
  };
}

/** bP setter rules (EL/AL/KL/NL/qL); `travelMax` in 0.01mm (ATK68 330, RS7 340 from bP TRAVEL_INFO_MAP). */
function validateDuckbreadWrite(
  frame: Uint8Array,
  key: (row: number, col: number) => boolean,
  travelMax: number,
  matrix: { rows: number; columns: number },
) {
  if (frame.length !== 32)
    throw new Error("Keyboard frames must contain 32 bytes");
  const tail = (n: number) => frame.slice(n).every((b) => b === 0);
  const word = (n: number) => frame[n] * 256 + frame[n + 1];
  if (frame[0] === 3 && frame[1] === 150) {
    // Source EL.create and qL.save: bounded global dead zones and custom-color commit.
    if (frame[2] === 11 && word(3) <= 330 && word(5) <= 330 && tail(7)) return;
    if (frame[2] === 18 && tail(3)) return;
    if (frame[2] === 34 && [1, 2, 4, 8].includes(frame[3]) && tail(4)) return;
    if ([29, 30].includes(frame[2]) && frame[3] <= 1 && tail(4)) return;
    if (frame[2] === 17 && frame.slice(4, 8).every((b) => b <= 1) && tail(8))
      return;
    // IL/RL travel and rapid-trigger flash buffer chunks (the source never sends single-key travel or RT setters).
    if (validTriggerChunk(frame, matrix, travelMax)) return;
  }
  if (
    frame[0] === 5 &&
    frame[1] < 4 &&
    key(frame[2], frame[3]) &&
    (VERIFIED_KEY_CLASSES as readonly number[]).includes(frame[4]) &&
    tail(6)
  )
    return;
  // Source qL.create: one 8-key block of the matrix (bP.setAllKeysCustomLed).
  if (validCustomLedBlock(frame, matrix)) return;
  if (
    frame[0] === 7 &&
    frame[1] === 65 &&
    LIGHT_MODES.some(([id]) => id === frame[2]) &&
    frame[3] === 0 &&
    frame[4] >= 1 &&
    frame[8] >= 1 &&
    frame[8] <= 100 &&
    tail(9)
  )
    return;
  throw new Error("Keyboard write blocked: packet needs verification");
}

export function keyboardWritePlan(
  before: KeyboardSettings,
  draft: KeyboardSettings,
  unread: (keyof KeyboardSettings)[] = [],
  /** Device context from the read: matrix size, raw trigger buffers and colour blocks (positions without a key). */
  device: { matrix?: { rows: number; columns: number }; triggerRaw?: TriggerRaw; colorBlocks?: Record<string, number[]> } = {},
) {
  KeyboardSettingsSchema.parse(before);
  const next = KeyboardSettingsSchema.parse(draft);
  const packets: KeyboardWrite[] = [],
    skipped = new Set<string>();
  const add = (
    field: keyof KeyboardSettings,
    label: string,
    bytes: number[],
    read: Uint8Array,
    start: number,
    end: number,
  ) => {
    if (unread.includes(field)) {
      skipped.add(`${label}: device value unread`);
      return;
    }
    const frame = new Uint8Array(32);
    frame.set(bytes);
    packets.push({ label, frame, read, start, end });
  };
  if (before.pollingRate !== next.pollingRate)
    add(
      "pollingRate",
      "Polling",
      [3, 150, 34, next.pollingRate / 1000],
      keyboardRead("polling"),
      3,
      4,
    );
  const options = (s: KeyboardSettings) => [
    s.options.rgbArea,
    +s.options.exchangeWasd,
    +s.options.macSwitch,
    +s.options.winLock,
    +!s.options.sixKeyNoPunch,
  ];
  if (!equal(options(before), options(next))) {
    if (before.options.rgbArea !== next.options.rgbArea)
      skipped.add("RGB area: value meanings unverified");
    const values = options(next);
    values[0] = before.options.rgbArea;
    if (!equal(options(before), values))
      add(
        "options",
        "Keyboard options",
        [3, 150, 17, ...values],
        keyboardRead("options"),
        3,
        8,
      );
  }
  for (const [field, command, read] of [
    ["bottomTrigger", 29, "bottom"],
    ["performanceMode", 30, "performance"],
  ] as const) {
    if (before.options[field] !== next.options[field])
      add(
        "options",
        field,
        [3, 150, command, +next.options[field]],
        keyboardRead(read),
        3,
        4,
      );
  }
  if (!equal(before.light, next.light)) {
    const l = next.light,
      rgb = l.color
        .slice(1)
        .match(/../g)!
        .map((v) => parseInt(v, 16));
    add(
      "light",
      "Lighting",
      [7, 65, l.mode, 0, l.speed, ...rgb, l.brightness],
      keyboardLightRead(),
      2,
      9,
    );
  }
  // Source EL.create stores mm * 100 through DataView.setUint16, which truncates.
  const word = (value: number) => {
    const n = Math.trunc(value * 100) & 0xffff;
    return [n >> 8, n & 255];
  };
  if (!equal(before.deadZone, next.deadZone))
    add(
      "deadZone",
      "Global dead zones",
      [3, 150, 11, ...word(next.deadZone.top), ...word(next.deadZone.bottom)],
      keyboardRead("deadZone"),
      3,
      7,
    );
  next.keys.forEach((key, i) => {
    const old = before.keys[i],
      label = `Key ${key.row}:${key.col}`;
    key.layers.forEach((code, layer) => {
      if (equal(old.layers[layer], code)) return;
      if (code.length !== 2 || code[1] > 255) {
        skipped.add("Wide keycodes: no write path");
        return;
      }
      if (!(VERIFIED_KEY_CLASSES as readonly number[]).includes(code[0])) {
        skipped.add("Advanced assignments: packet verification required");
        return;
      }
      add(
        "keys",
        `${label} layer ${layer + 1}`,
        [5, layer, key.row, key.col, ...code],
        keyboardKeyRead(layer, key.row, key.col),
        4,
        6,
      );
    });
  });
  // bP.setAllKeysTravel / setAllKeysRt: whole-matrix IL/RL flash buffers in 0.01mm (triggerBuffers.ts).
  if (next.keys.some((key, i) => key.actuation !== before.keys[i].actuation || !equal(key.rt, before.keys[i].rt))) {
    if (!device.matrix || !device.triggerRaw || unread.includes("keys"))
      skipped.add("Travel and rapid trigger: device values unread");
    else packets.push(...triggerBufferPlan(before, next, device.matrix, device.triggerRaw, 100));
  }
  // bP.setAllKeysCustomLed: qL 8-key blocks plus one save (customLedBlocks.ts).
  if (next.keys.some((key, i) => key.color !== before.keys[i].color)) {
    const blocks = unread.includes("keys") ? null : customLedBlockPackets(before, next, device.colorBlocks);
    if (!blocks) skipped.add("Per-key colors: device value unread");
    else packets.push(...blocks);
  }
  for (const field of ["macros", "advanced"] as const)
    if (!equal(before[field], next[field]))
      skipped.add(`${field}: packet verification required`);
  return { packets, skipped: [...skipped] };
}
