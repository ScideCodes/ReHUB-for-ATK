import { expect, it, afterEach, vi } from "vitest";
import { ATK68 } from "../devices/registry";
import {
  createKeyboardSettings,
  type KeyboardSettings,
} from "../devices/keyboardSettings";
import { keyboardWritePlan } from "../protocol/keyboardWrites";
import { KeyboardClient } from "./keyboardClient";
const edits: Record<string, (s: KeyboardSettings) => void> = {
  polling: (s) => {
    s.pollingRate = 4000;
  },
  options: (s) => {
    s.options.winLock = true;
  },
  bottom: (s) => {
    s.options.bottomTrigger = true;
  },
  performance: (s) => {
    s.options.performanceMode = true;
  },
  deadZone: (s) => {
    s.deadZone = { top: 0.12, bottom: 0.23 };
  },
  remap: (s) => {
    s.keys[0].layers[0] = [0, 4];
  },
  remapMedia: (s) => {
    s.keys[0].layers[0] = [124, 128];
  },
  remapLight: (s) => {
    s.keys[0].layers[0] = [120, 1];
  },
  remapLayer: (s) => {
    s.keys[0].layers[0] = [82, 1];
  },
  lighting: (s) => {
    s.light = { mode: 2, speed: 50, brightness: 50, color: "#123456" };
  },
};
// Travel, rapid trigger and per-key colours are whole-matrix flash buffers / 8-key blocks verified after the batch;
// they are covered with a stateful device in src/devices/keyboards.matrix.ts and src/devices/parity/*.parity.test.ts.
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(Object.entries(edits))(
  "verifies %s with a distinct read, refuses mismatch, and never writes before consent",
  async (_name, edit) => {
    vi.useFakeTimers();
    const settings = createKeyboardSettings(),
      next = structuredClone(settings);
    edit(next);
    const plan = keyboardWritePlan(settings, next, []),
      frames: Uint8Array[] = [],
      listeners = new Set<(e: unknown) => void>();
    let mismatch = false;
    const device = {
      vendorId: 0x373b,
      productId: 0x1048,
      productName: "fake",
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
      addEventListener: (_type: string, fn: (e: unknown) => void) =>
        listeners.add(fn),
      removeEventListener: (_type: string, fn: (e: unknown) => void) =>
        listeners.delete(fn),
      sendReport: async (reportId: number, frame: Uint8Array) => {
        frames.push(frame.slice());
        const response = frame.slice();
        const packet = plan.packets.find(
          (p) => !!p.read && [...p.read].join() === [...frame].join(),
        );
        if (packet) {
          response.set(
            packet.frame.slice(packet.start, packet.end),
            packet.start,
          );
          if (mismatch) response[packet.start] ^= 1;
        }
        queueMicrotask(() => {
          for (const listener of [...listeners])
            listener({ reportId, data: new DataView(response.buffer) });
        });
      },
    };
    vi.stubGlobal("navigator", {
      hid: {
        getDevices: async () => [device],
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    const client = new KeyboardClient(ATK68);
    await client.connect();
    const baseline = () => ({
      settings: structuredClone(settings),
      firmware: "1",
      unreadFields: [],
      warnings: [],
      unreadKeyColors: false,
    });
    client.lastSnapshot = baseline();
    await expect(client.apply(next, () => {})).rejects.toThrow(
      "Confirm keyboard writes",
    );
    expect(frames).toHaveLength(0);
    client.confirmWrites();
    const write = client.apply(next, () => {});
    await vi.runAllTimersAsync();
    await write;
    expect(
      frames.some(
        (frame) => [...frame].join() === [...plan.packets[0].read!].join(),
      ),
    ).toBe(true);
    if (plan.packets[0].commit)
      expect(frames.some((frame) => frame[0] === 3 && frame[2] === 18)).toBe(
        true,
      );
    mismatch = true;
    client.lastSnapshot = baseline();
    const failed = client.apply(next, () => {}),
      rejects = expect(failed).rejects.toThrow("readback mismatch");
    await vi.runAllTimersAsync();
    await rejects;
    expect(client.lastSnapshot).toBeNull();
    await client.close();
    expect(client.writesConfirmed).toBe(false);
  },
);

it("never commits old RGB work or invalidates a new session baseline after reconnect", async () => {
  vi.useFakeTimers();
  const frames: number[][] = [],
    listeners = new Set<(event: unknown) => void>();
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
    addEventListener: (_type: string, listener: (event: unknown) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: unknown) => void) =>
      listeners.delete(listener),
    sendReport: async (reportId: number, frame: Uint8Array) => {
      frames.push([...frame]);
      for (const listener of [...listeners])
        listener({ reportId, data: new DataView(frame.slice().buffer) });
    },
  };
  vi.stubGlobal("navigator", {
    hid: {
      getDevices: async () => [device],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  const client = new KeyboardClient(ATK68);
  await client.connect();
  client.confirmWrites();
  const settings = createKeyboardSettings(),
    baseline = {
      settings,
      firmware: "1",
      unreadFields: [],
      warnings: [],
      unreadKeyColors: false,
      matrix: { rows: 5, columns: 15 },
      colorBlocks: { "0:0": Array(24).fill(0) },
    };
  client.lastSnapshot = baseline;
  const draft = structuredClone(settings);
  draft.keys[0].color = "#123456";
  const writing = client.apply(draft, () => {}),
    rejects = expect(writing).rejects.toThrow("disconnected during apply");
  await vi.advanceTimersByTimeAsync(21);
  await client.close();
  await client.connect();
  client.confirmWrites();
  client.lastSnapshot = baseline;
  await vi.runAllTimersAsync();
  await rejects;
  expect(frames).toHaveLength(1);
  expect(client.lastSnapshot).toBe(baseline);
  await client.close();
});
