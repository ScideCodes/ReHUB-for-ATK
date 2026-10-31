import { expect, it } from "vitest";
import { createKeyboardSettings } from "../../devices/keyboardSettings";
import { rowsForLayout } from "../../devices/keyboardLayouts";
import type { KeyboardSnapshot } from "../../hid/keyboardClient";
import { adoptRead } from "./adoptRead";

const rows = rowsForLayout("atk68_v2");
function snapshot(partial: Partial<KeyboardSnapshot>): KeyboardSnapshot {
  const settings = createKeyboardSettings(rows);
  settings.pollingRate = 125;
  settings.deadZone = { top: 0.2, bottom: 0.3 };
  for (const key of settings.keys) {
    key.actuation = 2;
    key.rt = { on: true, press: 0.3, release: 0.15 };
    key.color = "#123456";
    key.layers[0] = [0, 99];
  }
  return { settings, firmware: "1.00", warnings: [], unreadFields: [], ...partial };
}

it("copies only verified fields and key parts", () => {
  const map = createKeyboardSettings(rows);
  const next = adoptRead(
    map,
    snapshot({ unreadFields: ["options", "light", "keys"], unreadKeyLayers: true, unreadKeyTrigger: false, unreadKeyColors: false }),
  );
  expect(next.pollingRate).toBe(125);
  expect(next.deadZone).toEqual({ top: 0.2, bottom: 0.3 });
  expect(next.options).toEqual(map.options);
  expect(next.light).toEqual(map.light);
  for (const [i, key] of next.keys.entries()) {
    expect(key.actuation).toBe(2);
    expect(key.rt).toEqual({ on: true, press: 0.3, release: 0.15 });
    expect(key.color).toBe("#123456");
    expect(key.layers).toEqual(map.keys[i].layers);
  }
});

it("leaves everything when nothing was read, and matches keys by position", () => {
  const map = createKeyboardSettings(rows);
  expect(adoptRead(map, snapshot({ unreadFields: ["pollingRate", "options", "deadZone", "light", "keys"] }))).toEqual(map);
  const read = snapshot({ unreadKeyLayers: false });
  read.settings.keys.reverse();
  read.settings.keys[0].layers[0] = [0, 4];
  const last = map.keys.length - 1;
  expect(adoptRead(map, read).keys[last].layers[0]).toEqual([0, 4]);
});
