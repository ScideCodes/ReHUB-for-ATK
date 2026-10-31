import type { KeyboardRead } from "../keyboard";
import { validKeyboardBulkRead } from "../keyboardBulk";

// demoMode.store-CXKd1LXo.js: yp/bp/kp/Ap/gp/Lp; keymap-UanExTfv.js:I (11160), reportRate=70.
const bityuanSelectors = {
  version: 0,
  options: 17,
  bottom: 29,
  performance: 30,
  polling: 70,
  deadZone: 11,
  // Pp auto-restart flag (78), read back after the polling write (Tv.setReportRate).
  restart: 78,
} as const;
type Family = "BITYUAN" | "HFD";

export function readOnlyKeyboardFrame(family: Family, kind: KeyboardRead) {
  // HFD bm.get @201374; keyboard-info.util-BQDDA2LZ.js:un @97371, version=38.
  const selector =
    family === "HFD"
      ? kind === "version"
        ? 38
        : kind === "polling"
          ? 17 // Pm.getKeyboardFunction wm.get (cc.feature): report rate at byte 8
          : undefined
      : bityuanSelectors[kind as keyof typeof bityuanSelectors];
  if (selector === undefined)
    throw new Error(`Unverified ${family} ${kind} read; settings stay local`);
  const frame = new Uint8Array(32);
  frame.set([2, 150, selector]);
  return frame;
}

export function validateReadOnlyKeyboardFrame(
  frame: Uint8Array,
  family: Family,
  /** Source row/col matrix; only then are BITYUAN key matrix reads admitted. */
  matrix?: { rows: number; columns: number },
) {
  if (frame.length !== 32)
    throw new Error("Keyboard frames must contain 32 bytes");
  const zeroFrom = (offset: number) =>
    frame.slice(offset).every((value) => value === 0);
  if (family === "HFD" && matrix) {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    // Pm.getCurrentKeyMatrix: vm.get(28n, 28) -> [18, offset u16, 28]. HFD has no IL/RL travel buffers.
    if (
      frame[0] === 18 &&
      view.getUint16(1) % 28 === 0 &&
      view.getUint16(1) < 4 * matrix.rows * matrix.columns * 2 &&
      frame[3] === 28 &&
      zeroFrom(4)
    )
      return;
    // Pm.getAllKeysCustomLed: Tm.get(row, 6n, 6, colours) with each slot's first byte = row*col + 6n + i.
    if (
      frame[0] === 8 &&
      frame[1] === 69 &&
      frame[2] < matrix.rows &&
      frame[3] % 6 === 0 &&
      frame[3] < matrix.columns &&
      frame[4] === 6 &&
      [0, 1, 2, 3, 4, 5].every(
        (i) =>
          frame[5 + 4 * i] === frame[2] * matrix.columns + frame[3] + i &&
          frame.slice(6 + 4 * i, 8 + 4 * i + 1).every((b) => b === 0),
      ) &&
      zeroFrom(29)
    )
      return;
  }
  if (family === "BITYUAN" && matrix) {
    // Tv.getCurrentKeyMatrix cp(18) / getAllKeysTravel pp(13) / getAllKeysRt vp(14).
    if (validKeyboardBulkRead(frame, matrix.rows, matrix.columns)) return;
    // Tv.getAllKeysCustomLed (firmware < 2.1): af.get(row, 8*n, 8) -> [8, 69, row, col, 8].
    if (
      frame[0] === 8 &&
      frame[1] === 69 &&
      frame[2] < matrix.rows &&
      frame[3] % 8 === 0 &&
      frame[3] < matrix.columns &&
      frame[4] === 8 &&
      zeroFrom(5)
    )
      return;
  }
  if (
    family === "BITYUAN" &&
    ([4, 18].includes(frame[0]) ||
      (frame[0] === 2 && [3, 7, 13, 14].includes(frame[2])))
  )
    throw new Error(
      "This model’s key matrix is not verified; key settings stay local",
    );
  const selectors: readonly number[] =
    family === "HFD" ? [38, 17] : Object.values(bityuanSelectors);
  if (
    frame[0] === 2 &&
    frame[1] === 150 &&
    selectors.includes(frame[2]) &&
    zeroFrom(3)
  )
    return;
  // Source BITYUAN mp @26430: lighting command 8, selector 65. HFD lighting is deliberately excluded.
  if (family === "BITYUAN" && frame[0] === 8 && frame[1] === 65 && zeroFrom(2))
    return;
  throw new Error(
    `${family} command blocked: only source-verified reads are allowed`,
  );
}
