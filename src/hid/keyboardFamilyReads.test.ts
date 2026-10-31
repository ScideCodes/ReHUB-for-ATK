import { afterEach, expect, it, vi } from "vitest";
import { DEVICE_REGISTRY } from "../devices/registry";
import type { DeviceDefinition } from "../types/schema";
import { KeyboardClient } from "./keyboardClient";
import { validateKeyboardWrite } from "../protocol/keyboardWrites";
import legacyCatalog from "../devices/sourceCatalog.json";
import keyboardMatrix from "../devices/keyboardMatrix.json";
import { layoutFor } from "../devices/keyboardLayouts";

afterEach(() => vi.unstubAllGlobals());

function fakeHid(definition: DeviceDefinition, rate = 0, version = [1, 0x23]) {
  const events = new EventTarget();
  const device = {
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    opened: false,
    collections: [
      { usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId: 0 }] },
    ],
    open: vi.fn(async () => {
      device.opened = true;
    }),
    close: vi.fn(async () => {
      device.opened = false;
    }),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    sendReport: vi.fn(async (reportId: number, frame: Uint8Array) => {
      const reply = frame.slice();
      if (frame[0] === 2 && [0, 38].includes(frame[2])) reply.set(version, 5);
      const view = new DataView(reply.buffer);
      // CL: keyId 4 + (global matrix index % 26); IL: 2.000mm; RL: on, release 0.3mm, press 0.15mm.
      if (frame[0] === 18)
        for (let i = 0; i < 14; i++) reply.set([0, 4 + ((view.getUint16(1) / 2 + i) % 26)], 4 + 2 * i);
      if (frame[0] === 2 && frame[2] === 13)
        for (let i = 0; i < 12; i++) view.setUint16(8 + 2 * i, 2000);
      if (frame[0] === 2 && frame[2] === 14)
        for (let i = 0; i < 4; i++) reply.set([1, 1, 44, 0, 150], 8 + 5 * i);
      // BITYUAN bp flags at 3..7; HFD wm report-rate code at 8 (1 = 1000Hz).
      if (frame[0] === 2 && frame[2] === 17) reply.set([0, 1, 0, 1, 1, 1], 3);
      if (frame[0] === 2 && frame[2] === 70) reply[3] = rate;
      if (frame[0] === 2 && frame[2] === 11) reply.set([0, 125, 1, 244], 3);
      // HFD Tm blocks of 6 [index, r, g, b]; DUCKBREAD/BITYUAN blocks of 8 [r, g, b].
      if (frame[0] === 8 && frame[1] === 69 && frame[4] === 6)
        for (let i = 0; i < 6; i++) reply.set([frame[5 + 4 * i], frame[2], frame[3] + i, 7], 5 + 4 * i);
      else if (frame[0] === 8 && frame[1] === 69)
        for (let i = 0; i < 8; i++) reply.set([frame[2], frame[3] + i, 7], 5 + 3 * i);
      else if (frame[0] === 8) {
        reply[2] = 2;
        reply[4] = 128;
        reply[8] = 60;
      }
      queueMicrotask(() =>
        events.dispatchEvent(
          Object.assign(new Event("inputreport"), {
            device,
            reportId,
            data: new DataView(reply.buffer),
          }),
        ),
      );
    }),
  };
  vi.stubGlobal("navigator", {
    hid: {
      getDevices: async () => [device],
      requestDevice: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  return device;
}

it.each([
  [0, 8000],
  [1, 4000],
  [2, 2000],
  [3, 1000],
])(
  "reads BITYUAN wire polling %i as %i Hz with its own units",
  async (code, expected) => {
    const definition = DEVICE_REGISTRY.find(
      (d) => d.protocolFamily === "BITYUAN",
    )!;
    const device = fakeHid(definition, code),
      client = new KeyboardClient(definition);
    try {
      await client.connect(true);
      const snapshot = await client.snapshot(() => {}, { scope: "all" });
      expect(snapshot.firmware).toBe("1.23");
      expect(snapshot.settings.pollingRate).toBe(expected);
      expect(snapshot.settings.deadZone).toEqual({ top: 0.125, bottom: 0.5 });
      // Firmware 1.23: Tv.getKeyboardFunction inverts the raw 6-key byte (1) before firmware 2.
      expect(snapshot.settings.options.sixKeyNoPunch).toBe(false);
      expect(snapshot.unreadFields).toEqual([]);
      const frames = device.sendReport.mock.calls.map(([, frame]) => [
        ...frame,
      ]);
      expect(frames.map((f) => f.slice(0, 3))).toContainEqual([2, 150, 70]);
      expect(frames.some((f) => f[0] === 2 && f[2] === 34)).toBe(false);
      client.confirmWrites();
      if (definition.protocolFamily === "BITYUAN")
        // Opt-in untested write tier: an unchanged map plans no writes.
        expect((await client.apply(snapshot.settings, () => {})).packets).toEqual([]);
      else await expect(client.apply(snapshot.settings, () => {})).rejects.toThrow(/not verified/);
      expect(device.sendReport.mock.calls.every(([, f]) => [2, 8, 18].includes(f[0]))).toBe(true);
    } finally {
      await client.close();
    }
  },
);

// Source demoMode.store-CXKd1LXo.js normal Tv filters; legacy sourceCatalog omitted these 37 endpoints.
it.each(
  DEVICE_REGISTRY.filter(
    (d) =>
      d.protocolFamily === "BITYUAN" &&
      !legacyCatalog.entries.some(
        (e) => e.vendorId === Number(d.VID) && e.productId === Number(d.PID),
      ),
  ),
)(
  "connects newly source-matched $name ($PID) with source matrix reads",
  async (definition) => {
    const device = fakeHid(definition),
      client = new KeyboardClient(definition);
    try {
      await client.connect(true);
      const snapshot = await client.snapshot(() => {}, { scope: "all" });
      expect(snapshot.settings.pollingRate).toBe(8000);
      expect(snapshot.unreadFields).toEqual([]);
      expect(device.sendReport.mock.calls.some(([, f]) => f[0] === 18)).toBe(true);
      client.confirmWrites();
      if (definition.protocolFamily === "BITYUAN")
        // Opt-in untested write tier: an unchanged map plans no writes.
        expect((await client.apply(snapshot.settings, () => {})).packets).toEqual([]);
      else await expect(client.apply(snapshot.settings, () => {})).rejects.toThrow(/not verified/);
      expect(
        device.sendReport.mock.calls.every(([, f]) => [2, 8, 18].includes(f[0])),
      ).toBe(true);
    } finally {
      await client.close();
    }
  },
);

it("leaves an unknown BITYUAN polling code unread instead of guessing", async () => {
  const definition = DEVICE_REGISTRY.find(
    (d) => d.protocolFamily === "BITYUAN",
  )!;
  const device = fakeHid(definition, 4),
    client = new KeyboardClient(definition);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "base" });
    expect(snapshot.unreadFields).toContain("pollingRate");
    expect(
      snapshot.warnings.some((message) =>
        message.includes("Unknown polling code 4"),
      ),
    ).toBe(true);
    expect(
      device.sendReport.mock.calls.some(([, frame]) => frame[2] === 70),
    ).toBe(true);
  } finally {
    await client.close();
  }
});

it.each(DEVICE_REGISTRY.filter((d) => d.protocolFamily === "HFD"))(
  "reads firmware, keymap and key colours only on $name ($PID)",
  async (definition) => {
    const device = fakeHid(definition),
      client = new KeyboardClient(definition);
    try {
      await client.connect(true);
      const snapshot = await client.snapshot(() => {}, { scope: "all" });
      expect(snapshot.firmware).toBe("1.23");
      // HFD options/polling/lighting do not fit the shared schema; Pm has no travel, RT or dead zones.
      expect(snapshot.unreadFields).toEqual(["deadZone", "light"]);
      expect(snapshot.settings.pollingRate).toBe(1000);
      expect(snapshot.unreadKeyLayers).toBe(false);
      expect(snapshot.unreadKeyTrigger).toBe(true);
      expect(snapshot.unreadKeyColors).toBe(false);
      const layout = layoutFor(definition).rows.flat();
      expect(snapshot.settings.keys.map((k) => [k.row, k.col])).toEqual(layout.map((k) => k.index));
      for (const key of snapshot.settings.keys) {
        expect(key.layers).toEqual([0, 1, 2, 3].map((l) => [0, 4 + ((l * 128 + key.row * 16 + key.col) % 26)]));
        expect(key.color).toBe(`#${[key.row, key.col, 7].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
      }
      const frames = device.sendReport.mock.calls.map(([, f]) => [...f]);
      expect(frames[0]).toEqual([2, 150, 38, ...Array(29).fill(0)]);
      // 1 firmware + 1 wm feature + 37 keymap blocks (4 x 8 x 16 x 2 bytes / 28) + 8 rows x 3 colour blocks.
      expect(frames).toHaveLength(2 + 37 + 24);
      expect(frames.every((f) => f[0] === 18 || f[0] === 8 || (f[0] === 2 && [38, 17].includes(f[2])))).toBe(true);
      const forged = new Uint8Array(32);
      forged.set([8, 69, 0, 0, 6, 9]);
      expect(() => client.read(forged)).toThrow();
      const travel = new Uint8Array(32);
      travel.set([2, 150, 13, 0, 0, 0, 0, 12]);
      expect(() => client.read(travel)).toThrow();
      for (const opcode of [3, 5, 7, 13, 18, 254]) {
        const frame = new Uint8Array(32);
        frame[0] = opcode;
        expect(() => client.read(frame)).toThrow();
        // [5,0,0,0,0,0] is a valid key assignment in the opt-in untested HFD tier.
        if (opcode !== 5) expect(() => validateKeyboardWrite(frame, definition)).toThrow();
      }
      client.confirmWrites();
      if (definition.protocolFamily === "BITYUAN" || definition.protocolFamily === "HFD")
        // Opt-in untested write tier: an unchanged map plans no writes.
        expect((await client.apply(snapshot.settings, () => {})).packets).toEqual([]);
      else await expect(client.apply(snapshot.settings, () => {})).rejects.toThrow(/not verified/);
      expect(device.sendReport).toHaveBeenCalledTimes(63);
    } finally {
      await client.close();
    }
  },
);

const matrixKeyboards = DEVICE_REGISTRY.filter(
  (d) => d.protocolFamily === "BITYUAN" && d.id! in keyboardMatrix,
);
it("gives source key matrix reads to all 92 BITYUAN endpoints with fitting source layouts", () => {
  expect(matrixKeyboards).toHaveLength(92);
  // Source DEVICE_PATHS: RS7 Air 1220 -> rs7_v2, RS7 Turbo 11E0 -> rs7_revi (not the DUCKBREAD rs7 layout).
  const byPid = (pid: number) => DEVICE_REGISTRY.find((d) => d.protocolFamily === "BITYUAN" && Number(d.PID) === pid)!;
  expect(layoutFor(byPid(0x1220)).key).toBe("rs7_v2");
  expect(layoutFor(byPid(0x11e0)).key).toBe("rs7_revi");
  expect(matrixKeyboards).toEqual(expect.arrayContaining([byPid(0x1220), byPid(0x11e0)]));
});

it.each(matrixKeyboards)(
  "reads the source key matrix, travel, RT and v1 key colours on $name ($PID)",
  async (definition) => {
    const [rows, cols] = (keyboardMatrix as Record<string, number[]>)[definition.id!];
    const device = fakeHid(definition),
      client = new KeyboardClient(definition);
    try {
      await client.connect(true);
      const snapshot = await client.snapshot(() => {}, { scope: "all" });
      expect(snapshot.unreadFields).toEqual([]);
      expect(snapshot.unreadKeyColors).toBe(false);
      expect(snapshot.warnings).toEqual([]);
      const layout = layoutFor(definition).rows.flat();
      expect(snapshot.settings.keys.map((k) => [k.row, k.col])).toEqual(layout.map((k) => k.index));
      for (const key of snapshot.settings.keys) {
        expect(key.layers).toEqual(
          [0, 1, 2, 3].map((l) => [0, 4 + ((l * rows * cols + key.row * cols + key.col) % 26)]),
        );
        expect(key.actuation).toBe(2);
        expect(key.rt).toEqual({ on: true, release: 0.3, press: 0.15 });
        expect(key.color).toBe(
          `#${[key.row, key.col, 7].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
        );
      }
      const cells = rows * cols;
      expect(device.sendReport).toHaveBeenCalledTimes(
        7 + Math.ceil(cells / 12) + Math.ceil(cells / 4) + Math.ceil((8 * cells) / 28) + rows * Math.ceil(cols / 8),
      );
      // Out-of-matrix and write frames stay blocked.
      const outside = new Uint8Array(32);
      outside.set([2, 150, 14, 0, 0, 0, cells, 4]);
      expect(() => client.read(outside)).toThrow();
      const led = new Uint8Array(32);
      led.set([8, 69, rows, 0, 8]);
      expect(() => client.read(led)).toThrow();
      client.confirmWrites();
      if (definition.protocolFamily === "BITYUAN")
        // Opt-in untested write tier: an unchanged map plans no writes.
        expect((await client.apply(snapshot.settings, () => {})).packets).toEqual([]);
      else await expect(client.apply(snapshot.settings, () => {})).rejects.toThrow(/not verified/);
    } finally {
      await client.close();
    }
  },
);

it("leaves BITYUAN v2 (firmware 2.1+) key colours unread", async () => {
  const definition = matrixKeyboards[0];
  const device = fakeHid(definition, 0, [2, 0x10]),
    client = new KeyboardClient(definition);
  try {
    await client.connect(true);
    const snapshot = await client.snapshot(() => {}, { scope: "all" });
    expect(snapshot.unreadKeyColors).toBe(true);
    expect(snapshot.unreadFields).toEqual([]);
    expect(device.sendReport.mock.calls.some(([, f]) => f[0] === 8 && f[1] === 69)).toBe(false);
  } finally {
    await client.close();
  }
});
