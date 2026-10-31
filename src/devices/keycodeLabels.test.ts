import { expect, it } from "vitest";
import { keyLabel } from "./keyboardSettings";

it("labels BYKB 32-bit SDK keycodes by type", () => {
  expect(keyLabel([0, 0x00010052])).toBe("Ctrl + Up"); // source ht/K: Ctrl + UP
  expect(keyLabel([0, 0x0001002c])).toBe("Ctrl + Space");
  expect(keyLabel([0, 0x020000e9])).toBe("Volume +");
  expect(keyLabel([0, 0x02000192])).toBe("Calculator"); // source ht 33554834: 计算器
  expect(keyLabel([0, 0x0d000000])).toBe("Fn");
  expect(keyLabel([0, 0x08000002])).toBe("Lighting 0x8000002");
  expect(keyLabel([0, 0x07000004])).toBe("Key 0x7000004");
  expect(keyLabel([0, 41])).toBe("Esc");
});

it("labels ARBITER [class, code, code1] assignments as the source zc() does", () => {
  expect(keyLabel([16, 0, 4])).toBe("A");
  expect(keyLabel([16, 0, 41])).toBe("Esc");
  expect(keyLabel([16, 4, 0])).toBe("Alt"); // zc: Left Alt
  expect(keyLabel([16, 1, 0])).toBe("Ctrl"); // zc: Left Ctrl
  expect(keyLabel([16, 3, 4])).toBe("Ctrl + Shift + A");
  expect(keyLabel([48, 0xe9, 0])).toBe("Volume +"); // zc: specialKeys.volumeUp
  expect(keyLabel([112, 0, 0])).toBe("M1"); // zc: M1
  expect(keyLabel([144, 1, 0])).toBe("DKS");
  expect(keyLabel([0, 0, 0])).toBe("Disabled"); // zc: Null
});
