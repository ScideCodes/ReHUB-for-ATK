import { validKeyboardBulkRead } from "./keyboardBulk";
import type { DeviceDefinition } from "../types/schema";
import { verifiedKeyboardProfile } from "../devices/keyboardProtocols";
import { validateReadOnlyKeyboardFrame } from "./keyboards/readOnly";
import { validateBykbFrame } from "./keyboards/bykb";
import { validateArbiterFrame } from "./keyboards/arbiter";

// DUCKBREAD: jM/HM/$M in the cached 3.2.28 source. This gate has no write path.
const READ_SUBCOMMANDS = {
  version: 0,
  actuation: 3,
  rt: 7,
  deadZone: 11,
  options: 17,
  layer: 19,
  bottom: 29,
  performance: 30,
  polling: 34,
} as const;
export type KeyboardRead = keyof typeof READ_SUBCOMMANDS;
export function keyboardRead(kind: KeyboardRead, row = 0, col = 0) {
  const frame = new Uint8Array(32);
  frame.set([2, 150, READ_SUBCOMMANDS[kind]]);
  if (kind === "actuation" || kind === "rt") frame.set([row, col], 3);
  return frame;
}
export function keyboardKeyRead(layer: number, row: number, col: number) {
  const frame = new Uint8Array(32);
  frame.set([4, layer, row, col]);
  return frame;
}
export function keyboardLightRead() {
  const frame = new Uint8Array(32);
  frame.set([8, 65]);
  return frame;
}
export function validateKeyboardFrame(
  frame: Uint8Array,
  definition: DeviceDefinition,
) {
  const profile = verifiedKeyboardProfile(definition);
  if (!profile)
    throw new Error(`Protocol not verified for ${definition.name}; demo only`);
  if (definition.protocolFamily === "13") return validateBykbFrame(frame);
  if (definition.protocolFamily === "ARBITER") return validateArbiterFrame(frame);
  if (
    definition.protocolFamily === "BITYUAN" ||
    definition.protocolFamily === "HFD"
  )
    return validateReadOnlyKeyboardFrame(
      frame,
      definition.protocolFamily,
      "keyMatrixRead" in profile && profile.keyMatrixRead ? profile : undefined,
    );
  // DUCKBREAD bP sizes key reads by the endpoint's source matrix (ATK68 5x15, RS7 6x16).
  const matrixRead = profile.keySettings || ("keyMatrixRead" in profile && profile.keyMatrixRead),
    { rows, columns } = profile;
  if (
    !matrixRead &&
    ((frame[0] === 2 && [3, 7, 13, 14].includes(frame[2])) ||
      [4, 18].includes(frame[0]))
  )
    throw new Error(
      "This model’s key matrix is not verified; key settings stay local",
    );
  if (frame.length !== 32)
    throw new Error("Keyboard frames must contain 32 bytes");
  // Read-only IL/RL/CL buffers; write validation is separate and unchanged.
  if (matrixRead && validKeyboardBulkRead(frame, rows, columns)) return;
  const zeroFrom = (start: number) => frame.slice(start).every((b) => b === 0);
  if (
    frame[0] === 2 &&
    frame[1] === 150 &&
    Object.values(READ_SUBCOMMANDS).includes(frame[2] as 0)
  ) {
    if (
      [3, 7].includes(frame[2]) &&
      frame[3] < rows &&
      frame[4] < columns &&
      zeroFrom(5)
    )
      return;
    if (![3, 7].includes(frame[2]) && zeroFrom(3)) return;
  }
  if (
    frame[0] === 4 &&
    frame[1] < 4 &&
    frame[2] < rows &&
    frame[3] < columns &&
    zeroFrom(4)
  )
    return;
  // Source qL.get/getAllKeysCustomLed: read one mapped key or source row blocks of eight.
  if (
    matrixRead &&
    frame[0] === 8 &&
    frame[1] === 69 &&
    frame[2] < rows &&
    ((frame[4] === 8 && frame[3] % 8 === 0 && frame[3] < columns) ||
      (frame[4] === 1 && frame[3] < columns)) &&
    zeroFrom(5)
  )
    return;
  if (frame[0] === 8 && frame[1] === 65 && zeroFrom(2)) return;
  throw new Error(
    "Keyboard command blocked: only verified reads are allowed; writes need packet verification",
  );
}
