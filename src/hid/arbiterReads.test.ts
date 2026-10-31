import { afterEach, expect, it, vi } from "vitest";
import { DEVICE_REGISTRY } from "../devices/registry";
import type { DeviceDefinition } from "../types/schema";
import { KeyboardClient } from "./keyboardClient";
import { validateKeyboardWrite } from "../protocol/keyboardWrites";

afterEach(() => vi.unstubAllGlobals());

const arbiter = DEVICE_REGISTRY.filter((d) => d.protocolFamily === "ARBITER");

// Replies keep the command at byte 1 (Km matches on it) and put data from byte 8 (Fm.baseOffset).
function fakeArbiter(definition: DeviceDefinition, polling = 1) {
  const events = new EventTarget();
  const device = {
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    opened: false,
    collections: [{ usagePage: 1, usage: 0, outputReports: [{ reportId: 0 }], inputReports: [{ reportId: 0 }] }],
    open: vi.fn(async () => void (device.opened = true)),
    close: vi.fn(async () => void (device.opened = false)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    sendReport: vi.fn(async (id: number, frame: Uint8Array) => {
      const reply = frame.slice();
      reply[0] = 0xaa; // ReplyId; the source ignores byte 0
      if (frame[1] === 3) reply.set([0x05, 0x01], 8);
      if (frame[1] === 5) reply[12] = 0x30 | polling; // tick rate nibble above the rate code
      // Global trigger record at 24: press dead zone 12 (0.12mm), release 30 (0.30mm) in bits 9..15.
      if (frame[1] === 241) reply.set([0, 0, 0, 0, 0, 12 << 1, 0, 30 << 1], 24);
      // Trigger records (8 bytes/key): RT on, point 199 (2.00mm), press 29 (0.30mm), release 14 (0.15mm).
      if (frame[1] === 160) for (let i = 0; i < frame[4] / 8; i++) reply.set([0, 1, 199, 0, 29, 0, 14, 0], 8 + 8 * i);
      // LED blocks: byte at absolute offset n = n % 251, so each key's RGB is recoverable from its index.
      // Keymap blocks: key k of layer n = [16 general, no modifiers, (n * 16 + k) & 255].
      if (frame[1] === 8) {
        const addr = frame[5] | (frame[6] << 8),
          layer = Math.floor(addr / 512);
        for (let i = 0; i < frame[4]; i++) {
          const offset = (addr % 512) + i;
          reply[8 + i] = [16, 0, (layer * 16 + Math.floor(offset / 3)) & 255][offset % 3];
        }
      }
      if (frame[1] === 10) {
        const addr = frame[5] | (frame[6] << 8);
        for (let i = 0; i < frame[4]; i++) reply[8 + i] = (addr + i) % 251;
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

it("uses the source Nm filters for both ARBITER endpoints", () => {
  expect(arbiter.map((d) => [Number(d.PID), d.usagePage, d.usage])).toEqual([
    [0x105e, 1, 0],
    [0x10c2, 1, 0],
  ]);
});

it.each(arbiter)("reads ARBITER firmware, polling, dead zones, keymap, per-key trigger and colours on $name ($PID)", async (definition) => {
  const device = fakeArbiter(definition),
    client = new KeyboardClient(definition);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "all" });
    expect(snapshot.firmware).toBe("1.05");
    expect(snapshot.settings.pollingRate).toBe(8000);
    expect(snapshot.settings.deadZone).toEqual({ top: 0.12, bottom: 0.3 });
    expect(snapshot.unreadFields).toEqual(["options", "light"]);
    expect(snapshot.unreadKeyLayers).toBe(false);
    expect(snapshot.unreadKeyTrigger).toBe(false);
    expect(snapshot.unreadKeyColors).toBe(false);
    for (const key of snapshot.settings.keys) {
      expect(key.actuation).toBe(2);
      expect(key.layers).toEqual([0, 1, 2, 3].map((n) => [16, 0, (n * 16 + key.row * 16 + key.col) & 255]));
      expect(key.rt).toEqual({ on: true, press: 0.3, release: 0.15 });
      const k = 3 * (key.row * 16 + key.col);
      expect(key.color).toBe(`#${[k, k + 1, k + 2].map((n) => (n % 251).toString(16).padStart(2, "0")).join("")}`);
    }
    const frames = device.sendReport.mock.calls.map(([id, f]) => (expect(id).toBe(0), [...f]));
    // 3 base reads + 19 trigger blocks (1024 / 56) + 4 layers x 7 keymap blocks + 7 LED blocks (384 / 55).
    expect(frames).toHaveLength(57);
    for (const f of frames) {
      expect(f).toHaveLength(64);
      expect(f[0]).toBe(0x55);
      // Fm.toUint8Array: byte 3 = sum of bytes 4..63.
      expect(f[3]).toBe(f.slice(4).reduce((a, b) => a + b, 0) & 0xff);
    }
    expect(frames.slice(0, 3).map((f) => f.slice(0, 7))).toEqual([
      [0x55, 3, 0, 0, 0, 0, 0],
      [0x55, 5, 0, 56, 56, 0, 0],
      [0x55, 241, 0, 0x2d, 56, 0xf4, 0x01],
    ]);
    // ry.enterBootMode (SetFunc 0x51/0xAA/0xBB) and any other command stay blocked.
    const boot = new Uint8Array(64);
    boot.set([0x55, 6, 0, 0, 56, 0, 0, 0, 0x51, 0, 0xaa, 0xbb]);
    expect(() => client.read(boot)).toThrow(/blocked/);
    expect(() => validateKeyboardWrite(boot, definition)).toThrow();
    client.confirmWrites();
    await expect(client.apply(snapshot.settings, () => {})).rejects.toThrow(/not verified/);
    expect(device.sendReport).toHaveBeenCalledTimes(57);
  } finally {
    await client.close();
  }
});

it("leaves an unknown ARBITER polling code unread", async () => {
  fakeArbiter(arbiter[0], 7);
  const client = new KeyboardClient(arbiter[0]);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "base" });
    expect(snapshot.unreadFields).toContain("pollingRate");
  } finally {
    await client.close();
  }
});
