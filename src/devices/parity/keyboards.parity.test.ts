import { afterEach, expect, it, vi } from "vitest";
import fixtures from "./keyboards.json";
import { keyboardReply, type KeyboardState } from "./viaFake";
import { ATK68, DEVICE_REGISTRY } from "../registry";
import keyboardMatrix from "../keyboardMatrix.json";
import { KeyboardClient } from "../../hid/keyboardClient";
import type { KeyboardSettings } from "../keyboardSettings";

// Parity with the original driver: scripts/parity/keyboards.mjs ran the original BITYUAN Tv and DUCKBREAD bP (ATK68)
// controllers on the fake in
// viaFake.ts (same start state), one UI action per scenario, and recorded the device state it ended with. The same
// action is replayed here through this app's KeyboardClient (read, consent, plan, readback) on the same fake.
const definitions = {
  BITYUAN: DEVICE_REGISTRY.find(
    (d) => d.protocolFamily === "BITYUAN" && JSON.stringify((keyboardMatrix as Record<string, number[]>)[d.id!]) === "[5,15]",
  )!,
  DUCKBREAD: ATK68,
};
const actions: Record<string, (s: KeyboardSettings) => void> = {
  winLockOn: (s) => void (s.options.winLock = true),
  wasdSwapOn: (s) => void (s.options.exchangeWasd = true),
  macOn: (s) => void (s.options.macSwitch = true),
  sixKeyToggle: (s) => void (s.options.sixKeyNoPunch = !s.options.sixKeyNoPunch),
  bottomOn: (s) => void (s.options.bottomTrigger = true),
  gameModeOn: (s) => void (s.options.performanceMode = true),
  deadZone: (s) => void (s.deadZone = { top: 0.2, bottom: 0.35 }),
  lightBrightness: (s) => void (s.light.brightness = 25),
  lightMode: (s) => void ((s.light.mode = 6), (s.light.color = "#0080ff")),
  keyAssign: (s) => {
    const key = s.keys.find((k) => k.row === 0 && k.col === 1)!;
    key.layers[1] = [0, 20];
  },
  keyColor: (s) => void (s.keys.find((k) => k.row === 1 && k.col === 9)!.color = "#ff0000"),
  travel: (s) => void (s.keys.find((k) => k.row === 0 && k.col === 1)!.actuation = 2),
  rapidTrigger: (s) => void (s.keys.find((k) => k.row === 2 && k.col === 3)!.rt = { on: true, release: 0.4, press: 0.25 }),
  polling2000: (s) => void (s.pollingRate = 2000),
  polling500: (s) => void (s.pollingRate = 500),
};

afterEach(() => vi.unstubAllGlobals());

it.each(fixtures.map((f) => [`${f.family} ${f.productId.toString(16)} firmware ${f.firmware}, colorful ${f.colorful}: ${f.scenario}`, f] as const))(
  "%s ends in the original's device state",
  async (_, f) => {
    const state = structuredClone(f.start) as KeyboardState;
    const definition =
      f.family === "HFD"
        ? DEVICE_REGISTRY.find((d) => d.protocolFamily === "HFD" && Number(d.PID) === f.productId)!
        : definitions[f.family as keyof typeof definitions];
    const events = new EventTarget();
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
        const reply = new Uint8Array(keyboardReply(state, frame));
        queueMicrotask(() =>
          events.dispatchEvent(Object.assign(new Event("inputreport"), { device, reportId, data: new DataView(reply.buffer) })),
        );
      }),
    };
    vi.stubGlobal("navigator", {
      hid: { getDevices: async () => [device], requestDevice: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    const client = new KeyboardClient(definition);
    try {
      await client.connect(true);
      const snapshot = await client.snapshot(() => {}, { scope: "all" });
      const draft = structuredClone(snapshot.settings);
      actions[f.scenario](draft);
      client.confirmWrites();
      const plan = await client.apply(draft, () => {});
      expect(state, JSON.stringify(plan.skipped)).toEqual(f.end);
    } finally {
      await client.close();
    }
  },
);
