import { describe, expect, it } from "vitest";
import { DeviceDefinitionSchema } from "../types/schema";
import {
  DEVICE_REGISTRY,
  ATK68,
  controlsFor,
  findByVidPid,
  requestDeviceFilters,
} from "./registry";
import {
  createKeyboardSettings,
  KeyboardSettingsSchema,
} from "./keyboardSettings";
import { KeyboardMock } from "../mock/keyboardDevice";
import { keyboardRead, validateKeyboardFrame } from "../protocol/keyboard";
import sourceCatalog from "./sourceCatalog.json";
import keyboardIdentities from "./keyboardIdentities.json";

describe("keyboard registry", () => {
  it("keeps compact keyboard identities identical to the cached source", () => {
    for (const entry of sourceCatalog.entries) {
      expect(
        (keyboardIdentities as Record<string, unknown>)[
          `${entry.vendorId}:${entry.productId}`
        ],
      ).toEqual({
        name: entry.custom.title ?? entry.custom.name,
        protocolFamily: entry.protocolFamily,
      });
    }
  });
  it("opens a capability-aware mock for every keyboard model", () => {
    for (const device of DEVICE_REGISTRY.filter((d) => d.kind === "keyboard")) {
      const mock = new KeyboardMock(device);
      const draft = mock.read();
      if (device.capabilities?.includes("pollingRate"))
        draft.pollingRate = 4000;
      expect(mock.apply(draft).pollingRate, device.name).toBe(
        draft.pollingRate,
      );
    }
  });
  it("uses the source model and protocol for RS6 Cube endpoints", () => {
    expect(findByVidPid(0x373b, 0x1259)).toMatchObject({
      name: "ATK RS6 Cube",
      protocolFamily: "BITYUAN",
    });
  });
  it("isolates unsupported fields from maps shared with another keyboard mock", () => {
    const mock = new KeyboardMock({
      ...ATK68,
      id: "different-keyboard",
      capabilities: ["pollingRate"],
    });
    const draft = createKeyboardSettings();
    draft.pollingRate = 4000;
    draft.keys[0].actuation = 0.5;
    draft.options.winLock = true;
    const observed = mock.apply(draft, { supportedOnly: true });
    expect(observed.pollingRate).toBe(4000);
    expect(observed.keys[0].actuation).toBe(
      createKeyboardSettings().keys[0].actuation,
    );
    expect(observed.options.winLock).toBe(false);
    expect(draft.keys[0].actuation).toBe(0.5);
  });
  it("validates every device and uniquely identifies each entry", () => {
    for (const device of DEVICE_REGISTRY)
      expect(DeviceDefinitionSchema.safeParse(device).success).toBe(true);
    expect(new Set(DEVICE_REGISTRY.map((d) => d.id)).size).toBe(
      DEVICE_REGISTRY.length,
    );
    expect(ATK68.colorways).toHaveLength(3);
    expect(ATK68.reportId).toBe(0);
  });

  it("contains at least 150 mice and over 100 keyboards with valid VID/PID/usagePage/usage and NO 0xFF02 filters", () => {
    const mice = DEVICE_REGISTRY.filter((d) => d.kind === "mouse");
    const keyboards = DEVICE_REGISTRY.filter((d) => d.kind === "keyboard");
    expect(mice.length).toBeGreaterThanOrEqual(150);
    expect(keyboards.length).toBeGreaterThanOrEqual(100);

    const filters = requestDeviceFilters();
    expect(filters.length).toBe(DEVICE_REGISTRY.length);

    for (const f of filters) {
      expect(f.usagePage).not.toBe(0xff02);
      expect(f.usagePage).not.toBe(65282);
    }

    for (const d of DEVICE_REGISTRY) {
      expect(d.VID).toMatch(/^0x[0-9A-Fa-f]+$/);
      expect(d.PID).toMatch(/^0x[0-9A-Fa-f]+$/);
      expect(d.usagePage).toBeDefined();
      expect(d.usage).toBeDefined();
      expect(d.usagePage).not.toBe(0xff02);
      expect(d.usagePage).not.toBe(65282);
    }
  });

  it("exposes keyboard options only when the source feature list includes them", () => {
    for (const device of DEVICE_REGISTRY.filter((d) => d.kind === "keyboard")) {
      expect(device.capabilities?.includes("keyboardOptions") ?? false).toBe(
        device.features?.some((f) => f.toLowerCase() === "keyboard options") ??
          false,
      );
    }
    expect(ATK68.capabilities).toContain("keyboardOptions");
  });
  it("finds devices by VID/PID and builds filters for every entry", () => {
    const mouse = findByVidPid("0x373B", "0x11CC");
    expect(mouse).toBeDefined();
    expect(mouse?.name).toBe("ATK Frost Zero Extreme");

    const kb = findByVidPid("0x373b", "0x1048");
    expect(kb).toBeDefined();
    expect(kb?.name).toBe("ATK 68 V2 Pro");

    const filters = requestDeviceFilters();
    expect(filters.length).toBe(DEVICE_REGISTRY.length);
    expect(filters[0]).toHaveProperty("vendorId");
    expect(filters[0]).toHaveProperty("productId");
  });

  it("maps each keyboard capability to a control and hides unsupported capabilities", () => {
    const controls = controlsFor(ATK68);
    for (const capability of ATK68.capabilities ?? [])
      expect(
        controls.some((c) =>
          (c.capabilities as readonly string[]).includes(capability),
        ),
      ).toBe(true);
    expect(controls.map((c) => c.id)).not.toContain("power");
    expect(controlsFor({ ...ATK68, capabilities: [] })).toEqual([]);
    expect(
      controlsFor({ ...ATK68, capabilities: ["rgb"] }).map((c) => c.id),
    ).toEqual(["lighting"]);
  });
});

describe("isolated keyboard mock", () => {
  it("live-applies settings without aliasing caller or returned state", () => {
    const mock = new KeyboardMock(ATK68);
    const settings = createKeyboardSettings();
    settings.pollingRate = 8000;
    settings.keys[0].actuation = 0.5;
    mock.apply(settings);
    settings.pollingRate = 1000;
    const read = mock.read();
    expect(read.pollingRate).toBe(8000);
    expect(read.keys[0].actuation).toBe(0.5);
    read.keys[0].actuation = 2;
    expect(mock.read().keys[0].actuation).toBe(0.5);
  });
  it("rejects invalid settings and features absent from a model", () => {
    const mock = new KeyboardMock({ ...ATK68, capabilities: [] });
    const settings = createKeyboardSettings();
    settings.pollingRate = 8000;
    expect(() => mock.apply(settings)).toThrow(/capability/);
    expect(
      KeyboardSettingsSchema.safeParse({ ...settings, pollingRate: 16000 })
        .success,
    ).toBe(false);
    expect(() => new KeyboardMock(DEVICE_REGISTRY[0])).toThrow(/keyboard/);
  });
  it("rejects reordered matrix keys and mislabeled layouts in imported maps", async () => {
    const { KeyboardBackupSchema } = await import("../store/keyboardStore");
    const settings = createKeyboardSettings();
    [settings.keys[0], settings.keys[1]] = [settings.keys[1], settings.keys[0]];
    // Settings alone may belong to any layout; a map must match its declared layout's matrix order.
    expect(KeyboardSettingsSchema.safeParse(settings).success).toBe(true);
    const backup = (layout?: string) => ({ kind: "atk-keyboard-maps", version: 1, maps: [{ id: "a", name: "A", ...(layout && { layout }), settings }] });
    expect(KeyboardBackupSchema.safeParse(backup()).success).toBe(false);
    expect(KeyboardBackupSchema.safeParse(backup("atk68")).success).toBe(false);
    expect(KeyboardBackupSchema.safeParse(backup("hex80")).success).toBe(false);
  });
  it("rejects duplicate matrix positions", () => {
    const settings = createKeyboardSettings();
    settings.keys[1] = { ...settings.keys[1], row: settings.keys[0].row, col: settings.keys[0].col };
    expect(KeyboardSettingsSchema.safeParse(settings).success).toBe(false);
  });
});

describe("keyboard read-only hardware gate", () => {
  it("accepts source-backed reads, blocks every write and DFU", () => {
    expect([...keyboardRead("polling")].slice(0, 3)).toEqual([2, 150, 34]);
    expect(() =>
      validateKeyboardFrame(keyboardRead("polling"), ATK68),
    ).not.toThrow();
    for (const opcode of [3, 5, 7, 9, 10, 11, 13, 15, 16, 19, 254, 255]) {
      const frame = new Uint8Array(32);
      frame[0] = opcode;
      expect(() => validateKeyboardFrame(frame, ATK68)).toThrow();
    }
  });
  it("rejects another product, unknown subcommands, and malformed frames", () => {
    expect(() =>
      validateKeyboardFrame(keyboardRead("version"), {
        ...ATK68,
        PID: "0x1049",
      }),
    ).toThrow();
    const frame = keyboardRead("version");
    frame[2] = 152;
    expect(() => validateKeyboardFrame(frame, ATK68)).toThrow();
    expect(() => validateKeyboardFrame(new Uint8Array(31), ATK68)).toThrow();
  });
});
