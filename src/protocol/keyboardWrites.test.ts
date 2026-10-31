import { describe, expect, it } from "vitest";
import { createKeyboardSettings } from "../devices/keyboardSettings";
import { ATK68 } from "../devices/registry";
import { keyboardWritePlan, validateKeyboardWrite } from "./keyboardWrites";

describe("source-verified keyboard writes", () => {
  it("writes trigger values as the source IL/RL flash buffers and remaps with setKey", () => {
    const before = createKeyboardSettings(),
      next = structuredClone(before);
    next.keys[0].actuation = 0.42;
    next.keys[0].rt = { on: true, press: 0.12, release: 0.24 };
    next.keys[0].layers[0] = [0, 4];
    // Raw buffers as read: 1.5mm travel and RT off everywhere, incl. matrix positions without a key.
    const triggerRaw = { travel: Array(75).fill(150), rt: Array.from({ length: 75 }, () => [0, 0, 50, 0, 50]) };
    const { packets } = keyboardWritePlan(before, next, [], { matrix: { rows: 5, columns: 15 }, triggerRaw });
    const remap = packets.find((p) => p.frame[0] === 5)!;
    expect([...remap.frame.slice(0, 6)]).toEqual([5, 0, before.keys[0].row, before.keys[0].col, 0, 4]);
    const travel = packets.filter((p) => p.frame[2] === 13);
    const rt = packets.filter((p) => p.frame[2] === 14);
    // bP.setAllKeysTravel: 11 cells per chunk; setAllKeysRt: 4 cells per chunk; ops erase 1, normal 0, write 2.
    expect(travel).toHaveLength(7);
    expect(rt).toHaveLength(19);
    expect(travel.map((p) => p.frame[8])).toEqual([1, 0, 0, 0, 0, 0, 2]);
    const cell = before.keys[0].row * 15 + before.keys[0].col;
    const chunk = travel[Math.floor(cell / 11)].frame;
    expect([...chunk.slice(9 + 2 * (cell % 11), 11 + 2 * (cell % 11))]).toEqual([0, 42]);
    const rtChunk = rt[Math.floor(cell / 4)].frame;
    expect([...rtChunk.slice(9 + 5 * (cell % 4), 14 + 5 * (cell % 4))]).toEqual([1, 0, 24, 0, 12]);
    expect(travel.at(-1)!.deferredReads!.length).toBe(Math.ceil(75 / 12));
    packets.forEach((p) => expect(() => validateKeyboardWrite(p.frame, ATK68)).not.toThrow());
  });
  it("holds trigger changes without the raw buffers they would rewrite", () => {
    const before = createKeyboardSettings(),
      next = structuredClone(before);
    next.keys[0].actuation = 0.42;
    expect(keyboardWritePlan(before, next).skipped).toContain("Travel and rapid trigger: device values unread");
  });
  it("skips unread fields, unknown option meanings and advanced assignments", () => {
    const before = createKeyboardSettings(),
      next = structuredClone(before);
    next.pollingRate = 8000;
    next.options.rgbArea = 42;
    next.keys[0].layers[0] = [119, 2];
    const plan = keyboardWritePlan(before, next, ["pollingRate"]);
    expect(plan.packets).toEqual([]);
    expect(plan.skipped).toHaveLength(3);
  });
  it("preserves RGB area while changing source-proven flags", () => {
    const before = createKeyboardSettings(),
      next = structuredClone(before);
    next.options.rgbArea = 42;
    next.options.winLock = true;
    const { packets } = keyboardWritePlan(before, next);
    expect([...packets[0].frame.slice(3, 8)]).toEqual([
      before.options.rgbArea,
      0,
      0,
      1,
      1,
    ]);
  });
  it.each([0, 9, 10, 11, 13, 15, 19, 254, 255])(
    "blocks unverified opcode %i",
    (opcode) => {
      const frame = new Uint8Array(32);
      frame[0] = opcode;
      expect(() => validateKeyboardWrite(frame, ATK68)).toThrow();
    },
  );
  it("rejects another identity and trailing payload bytes", () => {
    const before = createKeyboardSettings(),
      next = structuredClone(before);
    next.pollingRate = 4000;
    const frame = keyboardWritePlan(before, next).packets[0].frame;
    expect(() =>
      validateKeyboardWrite(frame, { ...ATK68, PID: "0x1049" }),
    ).toThrow("identity");
    frame[31] = 1;
    expect(() => validateKeyboardWrite(frame, ATK68)).toThrow("blocked");
  });
  it.each([
    ["system/media", [124, 128] as [number, number]],
    ["lighting", [120, 1] as [number, number]],
    ["layer switch", [82, 1] as [number, number]],
    ["layer-tap lt0", [64, 5] as [number, number]],
    ["swap", [86, 0] as [number, number]],
  ])("encodes verified non-basic key assignment %s with exact readback", (_name, code) => {
    const before = createKeyboardSettings(),
      next = structuredClone(before);
    next.keys[0].layers[0] = code;
    const { packets, skipped } = keyboardWritePlan(before, next);
    expect(skipped).toEqual([]);
    expect(packets).toHaveLength(1);
    expect([...packets[0].frame.slice(0, 6)]).toEqual([
      5,
      0,
      before.keys[0].row,
      before.keys[0].col,
      code[0],
      code[1],
    ]);
    expect([...packets[0].read!.slice(0, 4)]).toEqual([
      4,
      0,
      before.keys[0].row,
      before.keys[0].col,
    ]);
    expect(() => validateKeyboardWrite(packets[0].frame, ATK68)).not.toThrow();
  });
  it.each([87, 112, 113, 114, 116, 119, 126, 255])(
    "blocks unverified key class %i in validateKeyboardWrite",
    (keyClass) => {
      const frame = new Uint8Array(32);
      frame.set([5, 0, 0, 0, keyClass, 1]);
      expect(() => validateKeyboardWrite(frame, ATK68)).toThrow("blocked");
    },
  );
  it("keeps unverified key assignments, macros and advanced actions local-only", () => {
    const before = createKeyboardSettings(),
      next = structuredClone(before);
    next.keys[0].layers[0] = [87, 1]; // tapDance / MT
    next.keys[1].layers[0] = [126, 5]; // kbAndUser / DKS
    next.macros[0] = { ...next.macros[0], name: "M1_edited" };
    next.advanced.push({
      kind: "mt",
      key: 0,
      otherKey: 1,
      layer: 0,
      tap: [0, 4],
      hold: [0, 5],
      delay: 200,
      point: 1.5,
      rt: false,
      priority: "last",
      dks: Array.from({ length: 4 }, () => ({
        code: [0, 0],
        events: Array(10).fill(false),
      })),
    });
    const { packets, skipped } = keyboardWritePlan(before, next);
    expect(packets).toEqual([]);
    expect(skipped).toContain(
      "Advanced assignments: packet verification required",
    );
    expect(skipped).toContain("macros: packet verification required");
    expect(skipped).toContain("advanced: packet verification required");
  });
});
