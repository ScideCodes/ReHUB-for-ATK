import type { DeviceDefinition } from "../types/schema";
import { verifiedKeyboardProfile } from "../devices/keyboardProtocols";
import { duckbreadAdapter } from "./keyboards/duckbread";
import { validateKeyboardFrame, type KeyboardRead } from "./keyboard";
import { readOnlyKeyboardFrame } from "./keyboards/readOnly";
import { BYKB_FRAME_LENGTH, bykbReadFrame, matchesBykbReply, sealBykbFrame } from "./keyboards/bykb";
import { ARBITER_FRAME_LENGTH, arbiterReadFrame, matchesArbiterReply } from "./keyboards/arbiter";

// Source: demoMode.store-CXKd1LXo.js: Tv controller extends vv; yp.get() / Hh base class.
// 32-byte frame, report ID 0, usagePage 0xff60, usage 0x61. Writes: opt-in untested tier (keyboards/bityuanWrites.ts).
export const bityuanAdapter = {
  family: "BITYUAN",
  reportId: 0,
  frameLength: 32,
  readFrame: (kind: KeyboardRead) => readOnlyKeyboardFrame("BITYUAN", kind),
  validateRead: validateKeyboardFrame,
  matchesReply(request: Uint8Array, response: Uint8Array) {
    if (response[0] !== request[0]) return false;
    // cp/pp/vp/af replies are decoded after their echoed offset, size and row/col fields.
    const echoes = (from: number, to: number) =>
      response.slice(from, to).every((value, index) => value === request[from + index]);
    if (request[0] === 18) return echoes(1, 4);
    if (request[0] === 2) {
      if (response[1] !== request[1] || response[2] !== request[2]) return false;
      return [13, 14].includes(request[2]) ? echoes(3, 8) : true;
    }
    if (request[0] === 8) {
      return request[1] === 69 ? echoes(1, 5) : response[1] === request[1];
    }
    // Untested-tier setters, matched as vv.isReplyFor (demoMode.store @86131): 3 echoes command/customId/selector,
    // keymap (5) and custom LED (7) replies only the command byte.
    if (request[0] === 3) return echoes(1, 3);
    return [5, 7].includes(request[0]);
  },
};

// HFD bm/pm/Lm: report 0, 32 bytes; firmware selector 38, Pm keymap/key-colour reads; opt-in untested keymap writes.
const hfdAdapter = {
  family: "HFD",
  reportId: 0,
  frameLength: 32,
  readFrame: (kind: KeyboardRead) => readOnlyKeyboardFrame("HFD", kind),
  validateRead: validateKeyboardFrame,
  matchesReply(request: Uint8Array, response: Uint8Array) {
    const echoes = (from: number, to: number) =>
      response.slice(from, to).every((value, index) => value === request[from + index]);
    // vm/Tm replies are decoded after their echoed offset/size and row/col/count fields.
    if (request[0] === 18) return response[0] === 18 && echoes(1, 4);
    if (request[0] === 8 && request[1] === 69) return echoes(0, 5);
    // Untested-tier keymap set (fm, 5) and end-transmission (Sm, 250): Lm matches replies on byte 0 only.
    if ([3, 5, 7, 250].includes(request[0])) return response[0] === request[0];
    return (
      request[0] === 2 &&
      request[1] === 150 &&
      [38, 17].includes(request[2]) &&
      response[0] === 2 &&
      response[1] === 150 &&
      response[2] === request[2]
    );
  },
};
// BYKB (provider 13): 63-byte frames on the descriptor's own non-zero report ID (reportId undefined here).
const bykbAdapter = {
  family: "13",
  reportId: undefined as number | undefined,
  frameLength: BYKB_FRAME_LENGTH,
  readFrame: bykbReadFrame,
  validateRead: validateKeyboardFrame,
  matchesReply: matchesBykbReply,
  seal: sealBykbFrame,
};
// ARBITER (Nm/Km): 64-byte frames on report 0, replies matched by command byte 1.
const arbiterAdapter = {
  family: "ARBITER",
  reportId: 0,
  frameLength: ARBITER_FRAME_LENGTH,
  readFrame: arbiterReadFrame,
  validateRead: validateKeyboardFrame,
  matchesReply: matchesArbiterReply,
};
const adapters = [duckbreadAdapter, bityuanAdapter, hfdAdapter, bykbAdapter, arbiterAdapter];
export function keyboardAdapter(definition: DeviceDefinition) {
  if (!verifiedKeyboardProfile(definition)) return undefined;
  return adapters.find(
    (adapter) => adapter.family === definition.protocolFamily,
  );
}
