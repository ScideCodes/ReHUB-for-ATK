import type { KeyboardSettings } from "../../devices/keyboardSettings";
import type { KeyboardWrite } from "../keyboardWrites";

/**
 * Per-key colours as the original writes them (DUCKBREAD bP.setAllKeysCustomLed qL @774926, BITYUAN Tv v1 af @107150):
 * [7, 66, row, 8n, n, n x rgb] per 8-key block (n = min(8, columns - 8n)), then one save [3, 150, 18] 100ms later.
 * Only blocks holding a changed key are sent; positions without a key keep the RGB read from that block.
 * Readback: the block read [8, 69, row, 8n, 8]. Returns null when a needed block was not read.
 */
export function customLedBlockPackets(
  before: KeyboardSettings,
  next: KeyboardSettings,
  colorBlocks: Record<string, number[]> | undefined,
): KeyboardWrite[] | null {
  const blocks = new Set(
    next.keys.filter((key, i) => key.color !== before.keys[i].color).map((key) => `${key.row}:${key.col - (key.col % 8)}`),
  );
  if (!blocks.size) return [];
  if (!colorBlocks || [...blocks].some((block) => !colorBlocks[block])) return null;
  const frame = (bytes: number[]) => {
    const f = new Uint8Array(32);
    f.set(bytes);
    return f;
  };
  const packets: KeyboardWrite[] = [...blocks].map((block) => {
    const [row, col] = block.split(":").map(Number);
    const rgb = [...colorBlocks[block]];
    for (const key of next.keys.filter((k) => k.row === row && k.col >= col && k.col < col + 8))
      rgb.splice((key.col - col) * 3, 3, ...key.color.slice(1).match(/../g)!.map((v) => parseInt(v, 16)));
    const n = rgb.length / 3;
    return { label: `Colours row ${row}, keys ${col}-${col + n - 1}`, frame: frame([7, 66, row, col, n, ...rgb]), read: frame([8, 69, row, col, 8]), start: 5, end: 5 + 3 * n };
  });
  packets[packets.length - 1].commit = frame([3, 150, 18]);
  return packets;
}

/** [7, 66, row, 8n, n, rgb...] with n = min(8, columns - 8n) and a zero tail. */
export function validCustomLedBlock(frame: Uint8Array, matrix: { rows: number; columns: number }) {
  return (
    frame[0] === 7 &&
    frame[1] === 66 &&
    frame[2] < matrix.rows &&
    frame[3] % 8 === 0 &&
    frame[3] < matrix.columns &&
    frame[4] === Math.min(8, matrix.columns - frame[3]) &&
    frame.slice(5 + 3 * frame[4]).every((b) => b === 0)
  );
}

/**
 * HFD per-key colours (Pm.setAllKeysCustomLed Tm @205935, traced): [7, 69, row, 6n, 6, six [index, r, g, b] slots]
 * per block (always 6 slots, as the source sends), then one save [3, 150, 18]. Slot indexes and positions without a
 * key keep the bytes read from that block ([8, 69, row, 6n, 6, indexes]), which is also the readback.
 */
export function hfdLedBlockPackets(
  before: KeyboardSettings,
  next: KeyboardSettings,
  colorBlocks: Record<string, number[]> | undefined,
): KeyboardWrite[] | null {
  const blocks = new Set(
    next.keys.filter((key, i) => key.color !== before.keys[i].color).map((key) => `${key.row}:${key.col - (key.col % 6)}`),
  );
  if (!blocks.size) return [];
  if (!colorBlocks || [...blocks].some((block) => colorBlocks[block]?.length !== 24)) return null;
  const frame = (bytes: number[]) => {
    const f = new Uint8Array(32);
    f.set(bytes);
    return f;
  };
  const packets: KeyboardWrite[] = [...blocks].map((block) => {
    const [row, col] = block.split(":").map(Number);
    const slots = [...colorBlocks[block]];
    for (const key of next.keys.filter((k) => k.row === row && k.col >= col && k.col < col + 6))
      slots.splice((key.col - col) * 4 + 1, 3, ...key.color.slice(1).match(/../g)!.map((v) => parseInt(v, 16)));
    const read = frame([8, 69, row, col, 6]);
    for (let i = 0; i < 6; i++) read[5 + 4 * i] = slots[4 * i];
    return { label: `Colours row ${row}, keys ${col}-${col + 5}`, frame: frame([7, 69, row, col, 6, ...slots]), read, start: 5, end: 29 };
  });
  packets[packets.length - 1].commit = frame([3, 150, 18]);
  return packets;
}

/** [7, 69, row, 6n, 6, six [row * columns + 6n + i, r, g, b]] with a zero tail. */
export function validHfdLedBlock(frame: Uint8Array, matrix: { rows: number; columns: number }) {
  return (
    frame[0] === 7 &&
    frame[1] === 69 &&
    frame[2] < matrix.rows &&
    frame[3] % 6 === 0 &&
    frame[3] < matrix.columns &&
    frame[4] === 6 &&
    [0, 1, 2, 3, 4, 5].every((i) => frame[5 + 4 * i] === ((frame[2] * matrix.columns + frame[3] + i) & 255)) &&
    frame.slice(29).every((b) => b === 0)
  );
}
