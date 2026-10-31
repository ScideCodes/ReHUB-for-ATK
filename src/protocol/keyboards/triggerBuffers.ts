import type { KeyboardSettings } from "../../devices/keyboardSettings";
import { keyboardBulkRead } from "../keyboardBulk";
import type { KeyboardWrite } from "../keyboardWrites";

// Whole-matrix travel / rapid-trigger writes as the original sends them (DUCKBREAD bP.setAllKeysTravel/Rt IL/RL @773200,
// BITYUAN Tv.setAllKeysTravel/Rt pp/vp @102955; checked by running bP in scripts/parity): one chunk per 11 cells
// (travel, u16 BE each) or 4 cells (RT: on, release u16, press u16), [3, 150, 13|14, 0, 0, offset u16, size, op, data],
// flash op 1 (erase) on the first chunk, 2 (write) on the last, 0 between, 200ms after the first and the last.
// Matrix positions without a key keep the raw values read from the device.
export type TriggerRaw = { travel: number[]; rt: number[][] };
type Matrix = { rows: number; columns: number };
const TRAVEL = { selector: 13, size: 11, bytes: 2 } as const;
const RT = { selector: 14, size: 4, bytes: 5 } as const;

const u16 = (value: number) => [(value >> 8) & 255, value & 255];
/** Source setters store mm * unit through DataView.setUint16, which truncates. */
const raw = (mm: number, unit: number) => Math.trunc(mm * unit) & 0xffff;

function chunks(kind: typeof TRAVEL | typeof RT, cells: number[][], label: string, readSize: number): KeyboardWrite[] {
  const count = Math.ceil(cells.length / kind.size);
  const packets: KeyboardWrite[] = [];
  for (let n = 0; n < count; n++) {
    const frame = new Uint8Array(32);
    const offset = n * kind.size;
    frame.set([3, 150, kind.selector, 0, 0, ...u16(offset), kind.size, n === count - 1 ? 2 : n === 0 ? 1 : 0]);
    frame.set(cells.slice(offset, offset + kind.size).flat(), 9);
    packets.push({ label: `${label} ${n + 1}/${count}`, frame, start: 0, end: 0, pauseAfter: n === 0 || n === count - 1 ? 200 : 0 });
  }
  // Deferred readback after the flash write: the bulk reads covering the whole matrix.
  const reads: NonNullable<KeyboardWrite["deferredReads"]> = [];
  for (let offset = 0; offset < cells.length; offset += readSize) {
    const expected = cells.slice(offset, offset + readSize).flat();
    reads.push({ read: keyboardBulkRead(kind === TRAVEL ? "travel" : "rt", offset), at: 8, expected });
  }
  packets[count - 1].deferredReads = reads;
  return packets;
}

export function triggerBufferPlan(
  before: KeyboardSettings,
  next: KeyboardSettings,
  matrix: Matrix,
  triggerRaw: TriggerRaw,
  unit: number,
): KeyboardWrite[] {
  const cellOf = (key: { row: number; col: number }) => key.row * matrix.columns + key.col;
  const travelChanged = next.keys.some((key, i) => key.actuation !== before.keys[i].actuation);
  const rtChanged = next.keys.some((key, i) => JSON.stringify(key.rt) !== JSON.stringify(before.keys[i].rt));
  const packets: KeyboardWrite[] = [];
  if (travelChanged) {
    const travel = triggerRaw.travel.map((value) => u16(value));
    for (const key of next.keys) travel[cellOf(key)] = u16(raw(key.actuation, unit));
    packets.push(...chunks(TRAVEL, travel, "Travel", 12));
  }
  if (rtChanged) {
    const rt = triggerRaw.rt.map((cell) => [...cell]);
    for (const key of next.keys) rt[cellOf(key)] = [+key.rt.on, ...u16(raw(key.rt.release, unit)), ...u16(raw(key.rt.press, unit))];
    packets.push(...chunks(RT, rt, "Rapid trigger", 4));
  }
  return packets;
}

/** Validates one buffer chunk: matrix-aligned offset, source size, op 0-2, per-cell bounds, zero tail. */
export function validTriggerChunk(frame: Uint8Array, matrix: Matrix, max: number) {
  if (frame[0] !== 3 || frame[1] !== 150 || ![13, 14].includes(frame[2]) || frame[3] !== 0 || frame[4] !== 0) return false;
  const kind = frame[2] === 13 ? TRAVEL : RT;
  const offset = (frame[5] << 8) | frame[6];
  const cells = matrix.rows * matrix.columns;
  if (frame[7] !== kind.size || frame[8] > 2 || offset % kind.size !== 0 || offset >= cells) return false;
  const used = Math.min(kind.size, cells - offset);
  for (let i = 0; i < used; i++) {
    const at = 9 + i * kind.bytes;
    const word = (n: number) => frame[n] * 256 + frame[n + 1];
    if (kind === TRAVEL ? word(at) > max : frame[at] > 1 || word(at + 1) > max || word(at + 3) > max) return false;
  }
  return frame.slice(9 + used * kind.bytes).every((b) => b === 0);
}
