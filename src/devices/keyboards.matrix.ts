import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_REGISTRY } from "./registry";
import { verifiedKeyboardProfile } from "./keyboardProtocols";
import type { DeviceDefinition } from "../types/schema";
import { KeyboardClient } from "../hid/keyboardClient";
import { validateKeyboardWrite } from "../protocol/keyboardWrites";
import { KeyboardMock } from "../mock/keyboardDevice";

// Every registry keyboard, each on its own mock. 32-byte VIA-style families (DUCKBREAD, BITYUAN, HFD) get a stateful
// fake that applies setters and answers reads from that state, so a write passes only if its readback matches.
// A mock proves the bytes follow the source setters and gates; firmware acceptance is untested.
const keyboards = DEVICE_REGISTRY.filter((d) => d.kind === "keyboard");
const writable = (d: DeviceDefinition) => {
  const p = verifiedKeyboardProfile(d);
  return !!p && (p.keySettings || ("untestedWrites" in p && !!p.untestedWrites));
};

function statefulKeyboard(definition: DeviceDefinition) {
  const family = definition.protocolFamily;
  const profile = verifiedKeyboardProfile(definition)!;
  const rows = profile.rows ?? 8,
    cols = profile.columns ?? 16,
    cells = rows * cols;
  const unit = family === "BITYUAN" ? 1000 : 100;
  const state = {
    options: [0, 1, 0, 1, family === "BITYUAN" ? 1 : 0, 0],
    bottom: 0,
    performance: 0,
    polling: family === "BITYUAN" ? 3 : 1,
    dead: [0, family === "BITYUAN" ? 100 : 10, 0, family === "BITYUAN" ? 100 : 10],
    light: [2, 0, 128, 255, 255, 255, 60],
    keymap: new Uint8Array(4 * cells * 2).map((_, i) => (i % 2 ? 4 + ((i >> 1) % 26) : 0)),
    travel: new Uint16Array(cells).fill(1.5 * unit),
    rt: Array.from({ length: cells }, () => [0, 0.5 * unit, 0.5 * unit]),
    colors: new Uint8Array(cells * 3).fill(7),
    ends: 0,
  };
  const u16 = (v: number) => [v >> 8, v & 255];
  const events = new EventTarget();
  const device = {
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    opened: false,
    collections: [{ usagePage: definition.usagePage, usage: definition.usage, outputReports: [{ reportId: 0 }] }],
    open: vi.fn(async () => void (device.opened = true)),
    close: vi.fn(async () => void (device.opened = false)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    sendReport: vi.fn(async (reportId: number, frame: Uint8Array) => {
      const r = frame.slice(),
        view = new DataView(r.buffer),
        cell = (row: number, col: number) => row * cols + col;
      // Setters
      if (frame[0] === 3 && frame[1] === 150) {
        const sel = frame[2];
        if (sel === 17) state.options = [...frame.slice(3, 9)];
        if (sel === 29) state.bottom = frame[3];
        if (sel === 30) state.performance = frame[3];
        if (sel === 11) state.dead = [...frame.slice(3, 7)];
        if (sel === 34) state.polling = frame[3];
        // IL/RL (pp/vp) flash buffer chunks: [3, 150, 13|14, 0, 0, offset u16, size, op, data from byte 9].
        const offset = view.getUint16(5);
        if (sel === 13) for (let i = 0; i < frame[7] && offset + i < cells; i++) state.travel[offset + i] = view.getUint16(9 + 2 * i);
        if (sel === 14)
          for (let i = 0; i < frame[7] && offset + i < cells; i++)
            state.rt[offset + i] = [frame[9 + 5 * i], view.getUint16(10 + 5 * i), view.getUint16(12 + 5 * i)];
      }
      if (frame[0] === 5) state.keymap.set(frame.slice(4, 6), (frame[1] * cells + cell(frame[2], frame[3])) * 2);
      if (frame[0] === 7 && frame[1] === 65) state.light = [...frame.slice(2, 9)];
      if (frame[0] === 7 && frame[1] === 66) state.colors.set(frame.slice(5, 5 + 3 * frame[4]), cell(frame[2], frame[3]) * 3);
      if (frame[0] === 250) state.ends++;
      // Getters
      if (frame[0] === 2 && frame[1] === 150) {
        const sel = frame[2];
        if (sel === 0 || sel === 38) r.set([1, 0x23], 5);
        if (sel === 17 && family === "HFD") r[8] = 1;
        else if (sel === 17) r.set(state.options, 3);
        if (sel === 29) r[3] = state.bottom;
        if (sel === 30) r[3] = state.performance;
        if (sel === 11) r.set(state.dead, 3);
        if (sel === 34 || sel === 70) r[3] = state.polling;
        if (sel === 3) r.set(u16(state.travel[cell(frame[3], frame[4])]), 5);
        if (sel === 7) {
          const [on, rel, press] = state.rt[cell(frame[3], frame[4])];
          r.set([on, ...u16(rel), ...u16(press)], 5);
        }
        if (sel === 13) for (let i = 0; i < 12; i++) r.set(u16(state.travel[view.getUint16(5) + i] ?? 0), 8 + 2 * i);
        if (sel === 14)
          for (let i = 0; i < 4; i++) {
            const [on, rel, press] = state.rt[view.getUint16(5) + i] ?? [0, 0, 0];
            r.set([on, ...u16(rel), ...u16(press)], 8 + 5 * i);
          }
      }
      if (frame[0] === 4) r.set(state.keymap.slice((frame[1] * cells + cell(frame[2], frame[3])) * 2, (frame[1] * cells + cell(frame[2], frame[3])) * 2 + 2), 4);
      if (frame[0] === 18) r.set(state.keymap.slice(view.getUint16(1), view.getUint16(1) + 28), 4);
      if (frame[0] === 8 && frame[1] === 65) r.set(state.light, 2);
      if (frame[0] === 8 && frame[1] === 69) {
        const base = cell(frame[2], frame[3]);
        if (frame[4] === 6) for (let i = 0; i < 6; i++) r.set([frame[5 + 4 * i], ...state.colors.slice((base + i) * 3, (base + i) * 3 + 3)], 5 + 4 * i);
        else for (let i = 0; i < frame[4] && frame[3] + i < cols; i++) r.set(state.colors.slice((base + i) * 3, (base + i) * 3 + 3), 5 + 3 * i);
      }
      queueMicrotask(() =>
        events.dispatchEvent(Object.assign(new Event("inputreport"), { device, reportId, data: new DataView(r.buffer) })),
      );
    }),
  };
  vi.stubGlobal("navigator", {
    hid: { getDevices: async () => [device], requestDevice: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  return { device, state, cells, cols };
}

/** BYKB (63-byte frames, report ID 6): setters change state; getters echo the header with [len, value...] at 5. */
function statefulBykb(definition: DeviceDefinition) {
  const state = { options: new Map<number, number>([[0x15, 0], [0x21, 0], [0x11, 0]]), polling: 4, keymap: new Map<string, number>() };
  const events = new EventTarget();
  const device = {
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    opened: false,
    collections: [{ usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId: 6 }], inputReports: [{ reportId: 6 }] }],
    open: vi.fn(async () => void (device.opened = true)),
    close: vi.fn(async () => void (device.opened = false)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    sendReport: vi.fn(async (id: number, frame: Uint8Array) => {
      const r = frame.slice();
      if (frame[0] === 0x04 && frame[1] === 0x17) state.polling = frame[6];
      else if (frame[0] === 0x04) state.options.set(frame[1], frame[6]);
      if (frame[0] === 0x03)
        state.keymap.set(`${frame[1]}:${(frame[6] << 8) | frame[7]}`, new DataView(frame.buffer).getUint32(8));
      if (frame[0] === 0x82 && frame[1] === 2) r.set([2, 0x01, 0x02], 5);
      if (frame[0] === 0x84) r.set([1, frame[1] === 0x17 ? state.polling : state.options.get(frame[1]) ?? 0], 5);
      if (frame[0] === 0x83) {
        const n = frame[5] / 2;
        r.fill(0, 6, 62);
        for (let i = 0; i < n; i++) {
          const kid = (frame[6 + 2 * i] << 8) | frame[7 + 2 * i];
          const code = state.keymap.get(`${frame[1]}:${kid}`) ?? 4 + (kid % 26);
          r.set([kid >> 8, kid & 255, code >>> 24, (code >> 16) & 255, (code >> 8) & 255, code & 255], 6 + 6 * i);
        }
        r[5] = 6 * n;
      }
      queueMicrotask(() =>
        events.dispatchEvent(Object.assign(new Event("inputreport"), { device, reportId: id, data: new DataView(r.buffer) })),
      );
    }),
  };
  vi.stubGlobal("navigator", {
    hid: { getDevices: async () => [device], requestDevice: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  return { device, state };
}

afterEach(() => vi.unstubAllGlobals());

describe("every BYKB keyboard: SDK-traced writes with readback", () => {
  it.each(keyboards.filter((d) => d.protocolFamily === "13").map((d) => [`${d.name} ${d.PID}`, d] as const))("%s", async (_, definition) => {
    const { device, state } = statefulBykb(definition);
    const client = new KeyboardClient(definition);
    try {
      await client.connect(true);
      const snapshot = await client.snapshot(() => {}, { scope: "all" });
      expect(snapshot.unreadKeyLayers).toBe(false);
      expect(snapshot.unreadFields).not.toContain("options");
      const draft = structuredClone(snapshot.settings);
      draft.options.winLock = true;
      draft.options.macSwitch = true;
      draft.pollingRate = 1000;
      const key = draft.keys.find((k) => k.layers[1][0] === 0)!;
      const code = key.layers[1][1] === 5 ? 6 : 5;
      key.layers[1] = [0, code];
      await expect(client.apply(draft, () => {})).rejects.toThrow(/Confirm keyboard writes/);
      client.confirmWrites();
      const plan = await client.apply(draft, () => {});
      expect(plan.packets.length).toBe(4);
      expect([state.options.get(0x15), state.options.get(0x11), state.polling]).toEqual([1, 1, 0]);
      expect([...state.keymap.values()]).toEqual([code]);
      expect(device.sendReport.mock.calls.every(([, f]) => [0x82, 0x83, 0x84, 0x03, 0x04].includes(f[0]))).toBe(true);
    } finally {
      await client.close();
    }
  });
});

describe("every writable keyboard: read, consent, write, readback", () => {
  it.each(keyboards.filter((d) => writable(d) && d.protocolFamily !== "13").map((d) => [`${d.name} ${d.PID} (${d.protocolFamily})`, d] as const))("%s", async (_, definition) => {
    const { device, state, cells, cols } = statefulKeyboard(definition);
    const client = new KeyboardClient(definition);
    try {
      await client.connect(true);
      const snapshot = await client.snapshot(() => {}, { scope: "all" });
      const family = definition.protocolFamily;
      // HFD dead zones and lighting have no verified read (KEYBOARD_PROTOCOL.md).
      expect(snapshot.unreadFields).toEqual(family === "HFD" ? ["deadZone", "light"] : []);
      const draft = structuredClone(snapshot.settings);
      const key = draft.keys[0];
      key.layers[1] = [0, 20];
      if (family !== "HFD") {
        draft.options.winLock = !draft.options.winLock;
        draft.deadZone = { top: 0.2, bottom: 0.3 };
        draft.light.brightness = 25;
        key.color = "#ff0000";
      }
      if (family === "DUCKBREAD") {
        draft.pollingRate = 2000;
        key.actuation = 2;
      }
      await expect(client.apply(draft, () => {})).rejects.toThrow(/Confirm keyboard writes/);
      client.confirmWrites();
      const plan = await client.apply(draft, () => {});
      expect(plan.packets.length).toBeGreaterThan(0);
      const at = (cells + key.row * cols + key.col) * 2;
      expect([...state.keymap.slice(at, at + 2)]).toEqual([0, 20]);
      if (family !== "HFD") {
        expect(state.light[6]).toBe(25);
        expect([...state.colors.slice((key.row * cols + key.col) * 3, (key.row * cols + key.col) * 3 + 3)]).toEqual([255, 0, 0]);
        expect(state.options[3]).toBe(+draft.options.winLock);
      }
      if (family === "DUCKBREAD") {
        expect(state.polling).toBe(2);
        expect(state.travel[key.row * cols + key.col]).toBe(200);
      }
      if (Number(definition.PID) === 0x1231) expect(state.ends).toBeGreaterThan(0);
      // Only setters of the tier and their readbacks were sent; never bootloader, EEPROM reset or macro frames.
      expect(device.sendReport.mock.calls.every(([, f]) => [2, 3, 4, 5, 7, 8, 18, 250].includes(f[0]))).toBe(true);
    } finally {
      await client.close();
    }
  });
});

describe("read-only families refuse every write frame", () => {
  it.each(
    keyboards
      .filter((d) => verifiedKeyboardProfile(d) && !writable(d))
      .map((d) => [`${d.name} ${d.PID} (${d.protocolFamily})`, d] as const),
  )("%s", (_, definition) => {
    for (const bytes of [[3, 150, 17, 0, 1], [5, 0, 0, 0, 0, 4], [7, 65, 2, 0, 1, 255, 0, 0, 50], [11]]) {
      const frame = new Uint8Array(definition.protocolFamily === "13" ? 63 : definition.protocolFamily === "ARBITER" ? 64 : 32);
      frame.set(bytes);
      expect(() => validateKeyboardWrite(frame, definition)).toThrow();
    }
  });
});

describe("unverified entries stay demo-only and never touch WebHID", () => {
  it.each(keyboards.filter((d) => !verifiedKeyboardProfile(d)).map((d) => [`${d.name} ${d.PID} (${d.protocolFamily})`, d] as const))(
    "%s",
    async (_, definition) => {
      const getDevices = vi.fn(),
        requestDevice = vi.fn();
      vi.stubGlobal("navigator", { hid: { getDevices, requestDevice } });
      await expect(new KeyboardClient(definition).connect()).rejects.toThrow();
      expect(getDevices).not.toHaveBeenCalled();
      expect(requestDevice).not.toHaveBeenCalled();
      // The local demo still edits this model's own layout.
      const mock = new KeyboardMock(definition);
      expect(mock.read().keys.length).toBeGreaterThan(0);
    },
  );
});
