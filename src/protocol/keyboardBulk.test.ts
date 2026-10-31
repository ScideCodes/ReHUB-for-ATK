import { describe, expect, it } from "vitest";
import { ATK68, DEVICE_REGISTRY } from "../devices/registry";
import { keyboardBulkRead } from "./keyboardBulk";
import { validateKeyboardFrame } from "./keyboard";
import { validateKeyboardWrite } from "./keyboardWrites";
import { duckbreadAdapter } from "./keyboards/duckbread";

describe("source-proven DUCKBREAD bulk reads", () => {
  // demoMode.store-CXKd1LXo.js: IL.get/RL.get and bP.getAllKeysTravel/getAllKeysRt; CL.get/getCurrentKeyMatrix.
  it("encodes IL travel, RL RT and CL key buffer headers at source offsets", () => {
    expect([...keyboardBulkRead("travel", 12).slice(0, 9)]).toEqual([
      2, 150, 13, 0, 0, 0, 12, 12, 0,
    ]);
    expect([...keyboardBulkRead("rt", 4).slice(0, 9)]).toEqual([
      2, 150, 14, 0, 0, 0, 4, 4, 0,
    ]);
    expect([...keyboardBulkRead("keys", 280).slice(0, 5)]).toEqual([
      18, 1, 24, 28, 0,
    ]);
    for (const kind of ["travel", "rt", "keys"] as const) {
      const frame = keyboardBulkRead(kind, 0);
      expect(() => validateKeyboardFrame(frame, ATK68)).not.toThrow();
      expect(() => validateKeyboardWrite(frame, ATK68)).toThrow();
      frame[31] = 1;
      expect(() => validateKeyboardFrame(frame, ATK68)).toThrow();
    }
  });
  it("rejects reads outside each endpoint's source matrix, and never enables command 0x0D", () => {
    const rs7 = DEVICE_REGISTRY.find((d) => Number(d.PID) === 0x1044)!;
    for (const [kind, offset] of [
      ["travel", 84],
      ["rt", 76],
      ["keys", 616],
    ] as const)
      expect(() =>
        validateKeyboardFrame(keyboardBulkRead(kind, offset), ATK68),
      ).toThrow();
    expect(() => validateKeyboardFrame(keyboardBulkRead("travel", 0), rs7)).not.toThrow();
    for (const [kind, offset] of [
      ["travel", 96],
      ["rt", 96],
      ["keys", 784],
    ] as const)
      expect(() => validateKeyboardFrame(keyboardBulkRead(kind, offset), rs7)).toThrow();
    const frame = new Uint8Array(32);
    frame[0] = 13;
    expect(() => validateKeyboardFrame(frame, ATK68)).toThrow();
  });
  it("correlates bulk offsets/counts and individual row/column, ignoring unsolicited reports", () => {
    for (const frame of [
      keyboardBulkRead("travel", 12),
      keyboardBulkRead("rt", 4),
      keyboardBulkRead("keys", 28),
      Uint8Array.from([2, 150, 3, 2, 4, ...Array(27).fill(0)]),
    ]) {
      const response = frame.slice();
      expect(duckbreadAdapter.matchesReply(frame, response)).toBe(true);
      response[frame[0] === 18 ? 2 : frame[2] === 3 ? 4 : 6]++;
      expect(duckbreadAdapter.matchesReply(frame, response)).toBe(false);
      response[0] = 0;
      expect(duckbreadAdapter.matchesReply(frame, response)).toBe(false);
    }
  });
});
