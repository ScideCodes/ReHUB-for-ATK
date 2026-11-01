import { afterEach, expect, it, vi } from "vitest";
import { DEVICE_REGISTRY } from "../devices/registry";
import type { DeviceDefinition } from "../types/schema";
import { KeyboardClient } from "./keyboardClient";
import { validateKeyboardWrite } from "../protocol/keyboardWrites";
import { layoutFor } from "../devices/keyboardLayouts";

afterEach(() => vi.unstubAllGlobals());

const bykb = DEVICE_REGISTRY.filter((d) => d.protocolFamily === "13");

// Replies echo the request header like the source SDK expects; payload from byte 6, length in byte 5.
function fakeBykb(definition: DeviceDefinition, reportId = 6, polling = 4) {
  const events = new EventTarget();
  const device = {
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    opened: false,
    collections: [{ usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId }], inputReports: [{ reportId }] }],
    open: vi.fn(async () => void (device.opened = true)),
    close: vi.fn(async () => void (device.opened = false)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    sendReport: vi.fn(async (id: number, frame: Uint8Array) => {
      const reply = frame.slice();
      if (frame[0] === 0x82 && frame[1] === 2) reply.set([2, 0x01, 0x02], 5);
      if (frame[0] === 0x84 && frame[1] === 0x17) reply.set([1, polling], 5);
      // Keymap: one [id u16 BE, keycode u32 BE] entry per requested ID; keycode = HID 4 + (id + 7 * layer code) % 26.
      if (frame[0] === 0x83) {
        const n = frame[5] / 2;
        reply.fill(0, 6, 62);
        for (let i = 0; i < n; i++) {
          const id = (frame[6 + 2 * i] << 8) | frame[7 + 2 * i];
          reply.set([id >> 8, id & 255, 0, 0, 0, 4 + ((id + 7 * frame[1]) % 26)], 6 + 6 * i);
        }
        reply[5] = 6 * n;
      }
      queueMicrotask(() =>
        events.dispatchEvent(Object.assign(new Event("inputreport"), { device, reportId: id, data: new DataView(reply.buffer) })),
      );
    }),
  };
  vi.stubGlobal("navigator", {
    hid: { getDevices: async () => [device], requestDevice: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  return device;
}

it("covers the 8 source BYKB endpoints", () => {
  expect(bykb.map((d) => Number(d.PID))).toEqual(
    expect.arrayContaining([0x1241, 0x1242, 0x1243, 0x1244, 0x1247, 0x124b, 0x1254, 0x1255]),
  );
  expect(bykb).toHaveLength(8);
});

it.each(bykb)("reads BYKB firmware, polling and keymaps on the descriptor report ID for $name ($PID)", async (definition) => {
  const device = fakeBykb(definition),
    client = new KeyboardClient(definition);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "all" });
    expect(snapshot.firmware).toBe("2.01");
    expect(snapshot.settings.pollingRate).toBe(8000);
    // Layers are read; travel/RT are not, so "keys" stays unread for writes.
    expect(snapshot.unreadFields).toEqual(["options", "deadZone", "light", "keys"]);
    expect(snapshot.unreadKeyLayers).toBe(false);
    expect(snapshot.unreadKeyTrigger).toBe(true);
    const layout = layoutFor(definition).rows.flat();
    const ids = new Map(layout.map((k) => [`${k.index[0]}:${k.index[1]}`, k.keyId!]));
    for (const key of snapshot.settings.keys)
      expect(key.layers).toEqual(
        [0, 1, 4, 5].map((code) => [0, 4 + ((ids.get(`${key.row}:${key.col}`)! + 7 * code) % 26)]),
      );
    const calls = device.sendReport.mock.calls;
    const keymapFrames = 4 * Math.ceil(new Set(ids.values()).size / 9);
    // Version, polling, then the first option getter (this fake replies with no payload, so options stay unread).
    expect(calls).toHaveLength(3 + keymapFrames);
    for (const [id, frame] of calls) {
      expect(id).toBe(6);
      expect(frame).toHaveLength(63);
      // Source checksum: 0xFF - (reportId + bytes 0..61).
      expect((frame.slice(0, 62).reduce((a: number, b: number) => a + b, id) + frame[62]) & 0xff).toBe(0xff);
    }
    expect([...calls[0][1].slice(0, 6)]).toEqual([0x82, 2, 0, 1, 0, 2]);
    expect([...calls[1][1].slice(0, 6)]).toEqual([0x84, 0x15, 0, 1, 0, 0]); // getWinKeyLock
    expect([...calls[2][1].slice(0, 6)]).toEqual([0x84, 0x17, 0, 1, 0, 0]); // getPollingRate
    const other = new Uint8Array(63);
    other.set([0x84, 0x30, 0, 1, 0, 0]); // getter outside the traced set
    expect(() => client.read(other)).toThrow(/blocked/);
    client.confirmWrites();
    // Opt-in untested tier: an unchanged map plans no writes.
    expect((await client.apply(snapshot.settings, () => {})).packets).toEqual([]);
    expect(() => validateKeyboardWrite(other, definition)).toThrow();
    expect(calls).toHaveLength(3 + keymapFrames);
  } finally {
    await client.close();
  }
});

it("reads BYKB 125Hz polling now that the schema covers 125-8000Hz", async () => {
  fakeBykb(bykb[0], 6, 3);
  const client = new KeyboardClient(bykb[0]);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "base" });
    expect(snapshot.settings.pollingRate).toBe(125);
    expect(snapshot.unreadFields).not.toContain("pollingRate");
  } finally {
    await client.close();
  }
});

it("rejects a BYKB collection that only exposes report ID 0, as the source SDK does", async () => {
  const device = fakeBykb(bykb[0], 0);
  await expect(new KeyboardClient(bykb[0]).connect(true)).rejects.toThrow();
  expect(device.open).not.toHaveBeenCalled();
});

it("selects the nonzero BYKB output report when report 0 appears first", async () => {
  const device = fakeBykb(bykb[0]);
  device.collections[0].outputReports.unshift({ reportId: 0 });
  const client = new KeyboardClient(bykb[0]);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "base" });
    expect(snapshot.settings.pollingRate).toBe(8000);
    expect(device.sendReport.mock.calls.every(([reportId]) => reportId === 6)).toBe(true);
  } finally {
    await client.close();
  }
});

// Frames captured from the source BYKB SDK driving a recording fake device (report ID 6), incl. their checksums.
it("plans BYKB writes byte-identical to the source SDK trace", async () => {
  const { bykbWritePlan, sealBykbFrame } = await import("../protocol/keyboards/bykb");
  const { createKeyboardSettings } = await import("../devices/keyboardSettings");
  const hex = (s: string) => s.split(" ").map((b) => parseInt(b, 16));
  const sdk = {
    win: hex("04 15 00 01 00 01 01"), // setWinKeyLock(true), checksum dd
    wasd: hex("04 21 00 01 00 01 01"), // setWasdArrowKeysSwapped(true), checksum d1
    mac: hex("04 11 00 01 00 01 01"), // changeOsMode(MacOS), checksum e1
    key: hex("03 05 00 01 00 06 01 2c 0a 00 00 00"), // setKeymap({ layer: 1, system: 1, id: 300, keycode: 0x0a000000 })
  };
  const before = createKeyboardSettings();
  const draft = structuredClone(before);
  draft.options.winLock = draft.options.exchangeWasd = draft.options.macSwitch = true;
  const key = draft.keys[0];
  key.layers[3] = [0, 0x0a000000]; // UI layer 3 = layer code 5 (sdkLayer 1, system 1)
  const plan = bykbWritePlan(before, draft, { fields: [], keyLayers: false }, new Map([[`${key.row}:${key.col}`, 300]]));
  const frames = plan.packets.map((p) => [...p.frame.slice(0, 12)]);
  expect(frames).toContainEqual([...sdk.win, 0, 0, 0, 0, 0]);
  expect(frames).toContainEqual([...sdk.wasd, 0, 0, 0, 0, 0]);
  expect(frames).toContainEqual([...sdk.mac, 0, 0, 0, 0, 0]);
  expect(frames).toContainEqual(sdk.key);
  const sealed = (bytes: number[]) => {
    const f = new Uint8Array(63);
    f.set(bytes);
    return sealBykbFrame(f, 6)[62];
  };
  expect([sealed(sdk.win), sealed(sdk.wasd), sealed(sdk.mac)]).toEqual([0xdd, 0xd1, 0xe1]);
});
