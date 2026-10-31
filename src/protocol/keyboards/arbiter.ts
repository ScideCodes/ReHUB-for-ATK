import type { KeyboardRead } from "../keyboard";

// ARBITER (demoMode.store Nm @229859 over Km @227677, packet base Fm @226587):
// 64-byte frames on report 0, [0x55, command, key, checksum, len, addr u16 LE, 0, data from 8];
// checksum = sum of bytes 3..63 (byte 3 zero while summing). Commands from keyboard-info.util enum @57931.
export const ARBITER_FRAME_LENGTH = 64;
const reads: Partial<Record<KeyboardRead, { command: number; len: number; addr: number }>> = {
  version: { command: 3, len: 0, addr: 0 }, // ly.get (GetInfo): version bytes 9.8 in hex
  polling: { command: 5, len: 56, addr: 0 }, // ry.get (GetFunc), configIndex 0
  deadZone: { command: 241, len: 56, addr: 500 }, // yy.get (GetAppDefine): global trigger record at 24
};

function frameFor(command: number, len: number, addr: number) {
  const frame = new Uint8Array(ARBITER_FRAME_LENGTH);
  frame.set([0x55, command, 0, 0, len, addr & 0xff, addr >> 8]);
  frame[3] = frame.slice(3).reduce((sum, b) => sum + b, 0) & 0xff;
  return frame;
}

export function arbiterReadFrame(kind: KeyboardRead) {
  const read = reads[kind];
  if (!read) throw new Error(`Unverified ARBITER ${kind} read; settings stay local`);
  return frameFor(read.command, read.len, read.addr);
}

// Nm._getKeyTriggerConfig: GetKeyTriggerTravel 160 over 1024 bytes in 56-byte steps (128 keys x 8 bytes).
// Nm.getAllKeysCustomLed: GetLedDefine 10 over 384 bytes in 55-byte steps (128 keys x RGB). configIndex 0.
// Nm.getCurrentKeyMatrix: GetUseKeyMatrix 8 at 512 * layer, 384 bytes (128 keys x [class, code, code1]) in 55-byte steps.
const BLOCKS = {
  trigger: { command: 160, size: 1024, step: 56 },
  colors: { command: 10, size: 384, step: 55 },
  keymap: { command: 8, size: 384, step: 55 },
};
export function arbiterBlockFrames(kind: keyof typeof BLOCKS, layer = 0) {
  const { command, size, step } = BLOCKS[kind];
  const base = kind === "keymap" ? 512 * layer : 0;
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset < size; offset += step)
    frames.push(frameFor(command, Math.min(step, size - offset), base + offset));
  return frames;
}
const blockFrames = [
  ...arbiterBlockFrames("trigger"),
  ...arbiterBlockFrames("colors"),
  ...[0, 1, 2, 3].flatMap((layer) => arbiterBlockFrames("keymap", layer)),
];

export function validateArbiterFrame(frame: Uint8Array) {
  if (frame.length !== ARBITER_FRAME_LENGTH)
    throw new Error("ARBITER frames must contain 64 bytes");
  const ok = [...(Object.keys(reads) as KeyboardRead[]).map(arbiterReadFrame), ...blockFrames].some((known) =>
    known.every((b, i) => frame[i] === b),
  );
  // Blocks SetFunc (including ry.enterBootMode), every Set*/calibration/reset command and unlisted reads.
  if (!ok) throw new Error("ARBITER command blocked: only source-verified reads are allowed");
}

// Km.handleInputReport resolves the pending transfer whose command equals reply byte 1 (non-zero);
// block readers then slice data by the reply's own len byte, so that must echo too.
export function matchesArbiterReply(request: Uint8Array, response: Uint8Array) {
  return response[1] !== 0 && response[1] === request[1] && response[4] === request[4];
}

/** ry.reportRateMap: 1=8000, 2=4000, 3=2000, 4=1000Hz in the low nibble of data byte 4. */
export function arbiterPolling(reply: Uint8Array) {
  return ({ 1: 8000, 2: 4000, 3: 2000, 4: 1000 } as Record<number, number>)[reply[12] & 15];
}

/** Nm.getDeadZone: global sy record, press/release dead zones in the top 7 bits of u16 LE at +4/+6, in 0.01mm. */
export function arbiterDeadZone(reply: Uint8Array) {
  const view = new DataView(reply.buffer, reply.byteOffset, reply.byteLength);
  return {
    top: (view.getUint16(28, true) >> 9) / 100,
    bottom: (view.getUint16(30, true) >> 9) / 100,
  };
}

/** sy record (8 bytes): triggerType low nibble of +1 (RT on when > 0), point/pressRt/releaseRt = (u16 LE & 511) + 1, in 0.01mm. */
export function arbiterTrigger(record: Uint8Array) {
  const view = new DataView(record.buffer, record.byteOffset, 8);
  const mm = (offset: number) => ((view.getUint16(offset, true) & 511) + 1) / 100;
  return { actuation: mm(2), rt: { on: (record[1] & 15) > 0, press: mm(4), release: mm(6) } };
}

export function arbiterFirmware(reply: Uint8Array) {
  return `${reply[9].toString(16)}.${reply[8].toString(16).padStart(2, "0")}`;
}
