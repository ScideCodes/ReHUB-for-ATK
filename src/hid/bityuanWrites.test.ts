import { afterEach, expect, it, vi } from "vitest";
import { DEVICE_REGISTRY } from "../devices/registry";
import keyboardMatrix from "../devices/keyboardMatrix.json";
import type { DeviceDefinition } from "../types/schema";
import { KeyboardClient } from "./keyboardClient";
import { validateKeyboardWrite } from "../protocol/keyboardWrites";

afterEach(() => vi.unstubAllGlobals());

const matrixed = DEVICE_REGISTRY.find(
  (d) => d.protocolFamily === "BITYUAN" && (d.id ?? "") in keyboardMatrix,
)!;
const [ROWS, COLS] = (keyboardMatrix as Record<string, number[]>)[matrixed.id!];

/** Stateful BITYUAN fake: setters change state, getters and bulk/block reads return it. */
function statefulHid(definition: DeviceDefinition) {
  const events = new EventTarget();
  const state = {
    travel: Array(ROWS * COLS).fill(2000),
    options: [0, 1, 0, 1, 1, 0],
    bottom: 0,
    performance: 0,
    dead: [0, 125, 1, 244],
    keymap: new Uint8Array(4 * ROWS * COLS * 2).map((_, i) => (i % 2 ? 4 + ((i >> 1) % 26) : 0)),
    colors: new Uint8Array(ROWS * COLS * 3).fill(7),
    light: [2, 0, 128, 255, 255, 255, 60],
    polling: 3,
    restart: 0,
  };
  const device = {
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    opened: false,
    collections: [{ usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId: 0 }] }],
    open: vi.fn(async () => void (device.opened = true)),
    close: vi.fn(async () => void (device.opened = false)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    sendReport: vi.fn(async (reportId: number, frame: Uint8Array) => {
      const reply = frame.slice(),
        view = new DataView(reply.buffer);
      if (frame[0] === 3 && frame[1] === 150) {
        if (frame[2] === 17) state.options = [...frame.slice(3, 9)];
        if (frame[2] === 29) state.bottom = frame[3];
        if (frame[2] === 30) state.performance = frame[3];
        if (frame[2] === 11) state.dead = [...frame.slice(3, 7)];
        if (frame[2] === 70) state.polling = frame[3];
        if (frame[2] === 78) state.restart = frame[3];
      }
      if (frame[0] === 5) state.keymap.set(frame.slice(4, 6), ((frame[1] * ROWS + frame[2]) * COLS + frame[3]) * 2);
      if (frame[0] === 7 && frame[1] === 65) state.light = [...frame.slice(2, 9)];
      if (frame[0] === 7 && frame[1] === 66) state.colors.set(frame.slice(5, 5 + 3 * frame[4]), (frame[2] * COLS + frame[3]) * 3);
      if (frame[0] === 2 && frame[2] === 0) reply.set([1, 0x23], 5);
      if (frame[0] === 2 && frame[2] === 17) reply.set(state.options, 3);
      if (frame[0] === 2 && frame[2] === 29) reply[3] = state.bottom;
      if (frame[0] === 2 && frame[2] === 30) reply[3] = state.performance;
      if (frame[0] === 2 && frame[2] === 70) reply[3] = state.polling;
      if (frame[0] === 2 && frame[2] === 78) reply[3] = state.restart;
      if (frame[0] === 2 && frame[2] === 11) reply.set(state.dead, 3);
      if (frame[0] === 18) reply.set(state.keymap.slice(view.getUint16(1), view.getUint16(1) + 28), 4);
      if (frame[0] === 3 && frame[1] === 150 && frame[2] === 13)
        for (let i = 0; i < frame[7]; i++) state.travel[view.getUint16(5) + i] = view.getUint16(9 + 2 * i);
      if (frame[0] === 2 && frame[2] === 13) for (let i = 0; i < 12; i++) view.setUint16(8 + 2 * i, state.travel[view.getUint16(5) + i] ?? 0);
      if (frame[0] === 2 && frame[2] === 14) for (let i = 0; i < 4; i++) reply.set([1, 1, 44, 0, 150], 8 + 5 * i);
      if (frame[0] === 8 && frame[1] === 69)
        for (let i = 0; i < 8 && frame[3] + i < COLS; i++)
          reply.set(state.colors.slice((frame[2] * COLS + frame[3] + i) * 3, (frame[2] * COLS + frame[3] + i) * 3 + 3), 5 + 3 * i);
      if (frame[0] === 8 && frame[1] === 65) reply.set(state.light, 2);
      queueMicrotask(() =>
        events.dispatchEvent(Object.assign(new Event("inputreport"), { device, reportId, data: new DataView(reply.buffer) })),
      );
    }),
  };
  vi.stubGlobal("navigator", {
    hid: { getDevices: async () => [device], requestDevice: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  return { device, state };
}

it("admits only the BITYUAN untested-tier frames", () => {
  const f = (bytes: number[]) => {
    const frame = new Uint8Array(32);
    frame.set(bytes);
    return frame;
  };
  for (const ok of [[3, 150, 17, 0, 1, 0, 1, 1], [3, 150, 29, 1], [3, 150, 11, 0, 125, 12, 228], [3, 150, 18], [3, 150, 70, 3], [3, 150, 78, 1], [5, 1, 0, 0, 0, 4], [7, 66, 0, 0, Math.min(8, COLS), ...Array(3 * Math.min(8, COLS)).fill(9)]])
    expect(() => validateKeyboardWrite(f(ok), matrixed)).not.toThrow();
  for (const blocked of [
    [3, 150, 70, 4], // polling code outside the source enum
    [3, 150, 78, 0], // the source only ever sets auto-restart
    [7, 65, 14, 0, 128, 255, 255, 255, 60], // Streamer: not in LIGHT_MODES
    [7, 66, 0, 3, 1, 255, 0, 0], // single key: the source only writes 8-key blocks
    [7, 65, 2, 0, 128, 255, 255, 255, 101], // brightness above 100
    [3, 150, 3, 0, 0, 7, 208], // single-key travel setter: never sent by the source (it writes pp buffers)
    [3, 150, 11, 13, 173, 0, 0], // dead zone above 3.3mm
    [5, 0, ROWS, 0, 0, 4], // outside the matrix
    [5, 0, 0, 0, 87, 1], // tap dance: unverified key class
    [11], // bootloader jump
  ])
    expect(() => validateKeyboardWrite(f(blocked), matrixed)).toThrow();
});

it("writes a consented BITYUAN keyboard with readback and holds untested fields", async () => {
  const { device, state } = statefulHid(matrixed),
    client = new KeyboardClient(matrixed);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "all" });
    expect(snapshot.unreadFields).toEqual([]);
    const draft = structuredClone(snapshot.settings);
    draft.options.winLock = !draft.options.winLock;
    draft.options.bottomTrigger = true;
    draft.deadZone = { top: 0.2, bottom: 0.45 };
    draft.keys[0].layers[1] = [0, 20];
    draft.keys[0].color = "#ff0000";
    draft.pollingRate = 8000;
    draft.light.brightness = 10;
    draft.keys[1].actuation = 1;
    await expect(client.apply(draft, () => {})).rejects.toThrow(/Confirm keyboard writes/);
    expect(device.sendReport.mock.calls.some(([, f]) => [3, 5, 7].includes(f[0]))).toBe(false);

    client.confirmWrites();
    const plan = await client.apply(draft, () => {});
    expect(plan.skipped).toEqual(
      expect.arrayContaining([
      ]),
    );
    expect(state.options).toEqual([0, 1, 0, 0, 1, 0]);
    // Tv.setReportRate: auto-restart flag, then the 8000Hz code 0.
    expect([state.restart, state.polling]).toEqual([1, 0]);
    // Travel went out as the pp flash buffer (0.001mm) and was read back across the matrix.
    expect(state.travel[draft.keys[1].row * COLS + draft.keys[1].col]).toBe(1000);
    expect(state.bottom).toBe(1);
    expect(state.dead).toEqual([0, 200, 1, 194]);
    const k = draft.keys[0];
    expect([...state.keymap.slice(((1 * ROWS + k.row) * COLS + k.col) * 2, ((1 * ROWS + k.row) * COLS + k.col) * 2 + 2)]).toEqual([0, 20]);
    expect([...state.colors.slice((k.row * COLS + k.col) * 3, (k.row * COLS + k.col) * 3 + 3)]).toEqual([255, 0, 0]);
    const sent = device.sendReport.mock.calls.map(([, f]) => [...f.slice(0, 3)]);
    expect(sent).toContainEqual([3, 150, 18]);
    expect(state.light).toEqual([2, 0, 128, 255, 255, 255, 10]);

  } finally {
    await client.close();
  }
});

it("rejects a BITYUAN write whose readback differs", async () => {
  const { device, state } = statefulHid(matrixed),
    client = new KeyboardClient(matrixed);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "all" });
    client.confirmWrites();
    const original = device.sendReport.getMockImplementation()!;
    // Firmware ignores the dead-zone setter: the readback keeps the old bytes.
    device.sendReport.mockImplementation(async (id: number, frame: Uint8Array) =>
      original(id, frame[0] === 3 && frame[2] === 11 ? Uint8Array.from(frame, (b, i) => (i >= 3 && i < 7 ? state.dead[i - 3] : b)) : frame),
    );
    const draft = structuredClone(snapshot.settings);
    draft.deadZone = { top: 0.3, bottom: 0.3 };
    await expect(client.apply(draft, () => {})).rejects.toThrow(/readback mismatch/);
  } finally {
    await client.close();
  }
});

it("writes HFD options, polling, colours and keys like the source Pm, with [250] on the A87 Ultra", async () => {
  const hfd = DEVICE_REGISTRY.find((d) => d.protocolFamily === "HFD" && Number(d.PID) === 0x1231)!;
  const [rows, cols] = [8, 16];
  const keymap = new Uint8Array(4 * rows * cols * 2).map((_, i) => (i % 2 ? 4 + ((i >> 1) % 26) : 0));
  // wm payload: rgbArea 0, wasd 1, mac 0, winLock 1, 6-key 0 (on), report 1 (1000Hz), sleep u16 30, lowLatency 1.
  let feature = [0, 1, 0, 1, 0, 1, 0, 30, 1];
  const colors = new Uint8Array(rows * cols * 3).fill(5);
  const events = new EventTarget();
  const device = {
    vendorId: Number(hfd.VID),
    productId: Number(hfd.PID),
    opened: false,
    collections: [{ usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId: 0 }] }],
    open: vi.fn(async () => void (device.opened = true)),
    close: vi.fn(async () => void (device.opened = false)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    sendReport: vi.fn(async (reportId: number, frame: Uint8Array) => {
      const reply = frame.slice(),
        view = new DataView(reply.buffer);
      if (frame[0] === 5) keymap.set(frame.slice(4, 6), ((frame[1] * rows + frame[2]) * cols + frame[3]) * 2);
      if (frame[0] === 3 && frame[2] === 17) feature = [...frame.slice(3, 12)];
      if (frame[0] === 7 && frame[1] === 69)
        for (let i = 0; i < 6 && frame[3] + i < cols; i++) colors.set(frame.slice(6 + 4 * i, 9 + 4 * i), (frame[2] * cols + frame[3] + i) * 3);
      if (frame[0] === 2 && frame[2] === 38) reply.set([1, 0x23], 5);
      if (frame[0] === 2 && frame[2] === 17) reply.set(feature, 3);
      if (frame[0] === 18) reply.set(keymap.slice(view.getUint16(1), view.getUint16(1) + 28), 4);
      if (frame[0] === 8 && frame[1] === 69)
        for (let i = 0; i < 6; i++) {
          const cell = frame[2] * cols + frame[3] + i;
          reply.set([frame[5 + 4 * i], ...(frame[3] + i < cols ? colors.slice(cell * 3, cell * 3 + 3) : [0, 0, 0])], 5 + 4 * i);
        }
      queueMicrotask(() =>
        events.dispatchEvent(Object.assign(new Event("inputreport"), { device, reportId, data: new DataView(reply.buffer) })),
      );
    }),
  };
  vi.stubGlobal("navigator", {
    hid: { getDevices: async () => [device], requestDevice: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  const client = new KeyboardClient(hfd);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "all" });
    expect(snapshot.settings.options.sixKeyNoPunch).toBe(true); // wm 6-key byte 0 = on
    client.confirmWrites();
    const draft = structuredClone(snapshot.settings);
    const k = draft.keys[0];
    k.layers[0] = [0, 41];
    k.color = "#00ff00";
    draft.options.winLock = false;
    draft.pollingRate = 500;
    await client.apply(draft, () => {});
    // wm.create: RGB area and Mac 0, wasd kept, winLock off, 6-key byte 0, report 2 (500Hz), sleep and low latency as read.
    expect(feature).toEqual([0, 1, 0, 0, 0, 2, 0, 30, 1]);
    expect([...colors.slice((k.row * cols + k.col) * 3, (k.row * cols + k.col) * 3 + 3)]).toEqual([0, 255, 0]);
    expect([...keymap.slice((k.row * cols + k.col) * 2, (k.row * cols + k.col) * 2 + 2)]).toEqual([0, 41]);
    const sent = device.sendReport.mock.calls.map(([, f]) => f[0]);
    expect(sent.indexOf(250)).toBe(sent.indexOf(5) + 1);
    expect(device.sendReport.mock.calls.some(([, f]) => f[0] === 3 && f[2] === 18)).toBe(true);
  } finally {
    await client.close();
  }
});
