import { fillKeyboardBulkReply } from "./testing/keyboardReply";
import { ATK68 } from "../devices/registry";
import { afterEach, expect, it, vi } from "vitest";
import { KeyboardClient } from "./keyboardClient";
import { createKeyboardSettings } from "../devices/keyboardSettings";

function fakeKeyboard() {
  const defaults = createKeyboardSettings(),
    listeners = new Set<(event: unknown) => void>(),
    frames: number[][] = [];
  let inFlight = 0,
    maxInFlight = 0;
  const device = {
    vendorId: 0x373b,
    productId: 0x1048,
    opened: false,
    collections: [
      { usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId: 0 }] },
    ],
    open: async () => {
      device.opened = true;
    },
    close: async () => {
      device.opened = false;
    },
    addEventListener: (_type: string, fn: (event: unknown) => void) =>
      listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: unknown) => void) =>
      listeners.delete(fn),
    sendReport: async (_id: number, frame: Uint8Array) => {
      frames.push([...frame]);
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      const reply = frame.slice();
      fillKeyboardBulkReply(frame, reply, defaults);
      if (frame[0] === 2) {
        if (frame[2] === 34) reply[3] = 1;
        if (frame[2] === 3) reply[6] = 150;
        if (frame[2] === 7) {
          reply[7] = 10;
          reply[9] = 10;
        }
      }
      if (frame[0] === 8 && frame[1] === 65) {
        reply[2] = 2;
        reply[4] = 128;
        reply[8] = 60;
      }
      if (frame[0] === 4) {
        const key = defaults.keys.find(
          (k) => k.row === frame[2] && k.col === frame[3],
        )!;
        reply.set(key.layers[frame[1]], 4);
      }
      setTimeout(() => {
        inFlight--;
        for (const listener of [...listeners])
          listener({ reportId: 0, data: new DataView(reply.buffer) });
      }, 5);
    },
  };
  vi.stubGlobal("navigator", {
    hid: {
      getDevices: async () => [device],
      requestDevice: async () => [device],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  return { device, frames, max: () => maxInFlight };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("profiles a full serial read with a 5ms fake HID response", async () => {
  vi.useFakeTimers();
  const fake = fakeKeyboard(),
    client = new KeyboardClient(ATK68);
  await client.connect();
  const start = performance.now(),
    reading = client.snapshot(() => {});
  await vi.runAllTimersAsync();
  const snapshot = await reading;
  const elapsed = performance.now() - start;
  expect(snapshot.unreadFields).toEqual([]);
  expect(fake.frames).toHaveLength(65);
  expect(fake.max()).toBe(1);
  expect(fake.frames.slice(0, 7).map((f) => [f[0], f[2]])).toEqual([
    [2, 0],
    [2, 17],
    [2, 29],
    [2, 30],
    [2, 34],
    [2, 11],
    [8, 0],
  ]);
  expect(fake.frames.slice(7, 10).map((f) => [f[0], f[2], f[6], f[7]])).toEqual(
    [
      [2, 13, 0, 12],
      [2, 13, 12, 12],
      [2, 13, 24, 12],
    ],
  );
  expect(elapsed).toBeLessThan(400);
  expect(client.lastReadProfile.frames).toHaveLength(65);
  expect(
    client.lastReadProfile.frames.every(
      (frame) => frame.waitMs === 0 && frame.roundTripMs === 5,
    ),
  ).toBe(true);
  console.info(
    `Keyboard 5ms fake: ${fake.frames.length} frames; ${elapsed}ms; max in flight ${fake.max()}`,
  );
  await client.close();
});

it("reads base and selected layer lazily, reuses cache, and blocks unverified key writes", async () => {
  vi.useFakeTimers();
  const fake = fakeKeyboard(),
    client = new KeyboardClient(ATK68);
  await client.connect();
  let read = client.snapshot(() => {}, { scope: "base" });
  await vi.runAllTimersAsync();
  const base = await read;
  expect(fake.frames).toHaveLength(6);
  expect(base.unreadFields).toEqual(["light", "keys"]);
  expect(client.lastReadProfile.elapsedMs).toBe(30);
  read = client.snapshot(() => {}, { scope: "keys", layer: 0, fresh: false });
  await vi.runAllTimersAsync();
  const keys = await read;
  expect(fake.frames).toHaveLength(12);
  expect(keys.unreadFields).toContain("keys");
  expect(client.lastReadProfile.elapsedMs).toBeLessThan(300);
  read = client.snapshot(() => {}, { scope: "keys", layer: 0, fresh: false });
  await vi.runAllTimersAsync();
  await read;
  expect(fake.frames).toHaveLength(12);
  const draft = structuredClone(keys.settings);
  draft.keys[0].actuation = 2;
  const plan = await client.apply(draft, () => {});
  expect(plan.packets).toHaveLength(0);
  expect(plan.skipped).toContain("Travel and rapid trigger: device values unread");
  read = client.snapshot(() => {}, { fresh: false });
  await vi.runAllTimersAsync();
  expect((await read).unreadFields).toEqual([]);
  expect(fake.frames).toHaveLength(65);
  await client.close();
  await client.connect();
  expect(client.lastSnapshot).toBeNull();
  expect(client.cachedSnapshot?.settings.pollingRate).toBe(1000);
  read = client.snapshot(() => {}, { scope: "base" });
  await vi.runAllTimersAsync();
  await read;
  expect(fake.frames).toHaveLength(71);
  await client.close();
});
it("does not publish a stale baseline after disconnect during a read", async () => {
  vi.useFakeTimers();
  fakeKeyboard();
  const client = new KeyboardClient(ATK68);
  await client.connect();
  const read = client.snapshot(() => {}, { scope: "base" });
  const rejected = expect(read).rejects.toThrow("cancelled");
  await Promise.resolve();
  await client.close();
  await vi.runAllTimersAsync();
  await rejected;
  expect(client.lastSnapshot).toBeNull();
});
