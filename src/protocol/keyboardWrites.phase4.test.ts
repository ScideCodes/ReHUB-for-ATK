import { expect, it } from "vitest";
import { ATK68 } from "../devices/registry";
import { createKeyboardSettings } from "../devices/keyboardSettings";
import { keyboardWritePlan, validateKeyboardWrite } from "./keyboardWrites";
it("encodes EL dead-zone writes with readback, without enabling firmware or bulk writes", () => {
  expect(ATK68.capabilities).toContain("deadZones");
  const before = createKeyboardSettings(),
    next = structuredClone(before);
  next.deadZone = { top: 0.12, bottom: 0.23 };
  const plan = keyboardWritePlan(before, next);
  expect(plan.packets).toHaveLength(1);
  expect([...plan.packets[0].frame.slice(0, 7)]).toEqual([
    3, 150, 11, 0, 12, 0, 23,
  ]);
  expect(() =>
    validateKeyboardWrite(plan.packets[0].frame, ATK68),
  ).not.toThrow();
  for (const opcode of [13, 15, 19, 254]) {
    const f = new Uint8Array(32);
    f[0] = opcode;
    expect(() => validateKeyboardWrite(f, ATK68)).toThrow();
  }
});
it("paints the changed key's 8-key block like source qL.create and commits once", () => {
  const before = createKeyboardSettings(),
    next = structuredClone(before);
  next.keys[0].color = "#123456";
  // Block 0 of row 0 as read: positions without a key keep these bytes.
  const read = Array.from({ length: 24 }, (_, i) => i);
  const plan = keyboardWritePlan(before, next, [], { matrix: { rows: 5, columns: 15 }, colorBlocks: { "0:0": read } });
  expect(plan.packets).toHaveLength(1);
  const packet = plan.packets[0];
  const rgb = [...read];
  for (const key of before.keys.filter((k) => k.row === 0 && k.col < 8))
    rgb.splice(key.col * 3, 3, ...(key === before.keys[0] ? [18, 52, 86] : key.color.slice(1).match(/../g)!.map((v) => parseInt(v, 16))));
  expect([...packet.frame.slice(0, 5 + 24)]).toEqual([7, 66, 0, 0, 8, ...rgb]);
  expect([...packet.read!.slice(0, 5)]).toEqual([8, 69, 0, 0, 8]);
  expect([...packet.commit!.slice(0, 3)]).toEqual([3, 150, 18]);
  expect(() => validateKeyboardWrite(packet.frame, ATK68)).not.toThrow();
  expect(() => validateKeyboardWrite(packet.commit!, ATK68)).not.toThrow();
  // Never a single-key write: the source only sends blocks.
  const single = new Uint8Array(32);
  single.set([7, 66, 0, 0, 1, 18, 52, 86]);
  expect(() => validateKeyboardWrite(single, ATK68)).toThrow();
  expect(keyboardWritePlan(before, next, ["keys"]).packets).toHaveLength(0);
});
