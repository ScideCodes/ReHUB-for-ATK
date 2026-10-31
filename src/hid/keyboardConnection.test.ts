import { afterEach, expect, it, vi } from "vitest";
import { KeyboardClient } from "./keyboardClient";
import { ATK68, DEVICE_REGISTRY } from "../devices/registry";
import { keyboardRead, keyboardKeyRead, validateKeyboardFrame } from "../protocol/keyboard";
import { validateKeyboardWrite } from "../protocol/keyboardWrites";
import { verifiedKeyboardProfile } from "../devices/keyboardProtocols";
import sourceCatalog from "../devices/sourceCatalog.json";
import { createKeyboardSettings, KeyboardSettingsSchema } from "../devices/keyboardSettings";

const rs7 = DEVICE_REGISTRY.find(
  (device) => device.kind === "keyboard" && Number(device.PID) === 0x1044,
)!;
afterEach(() => vi.unstubAllGlobals());

it("matches source xP/AP endpoints, geometry and DUCKBREAD controller without admitting other families", () => {
  // demoMode.store-CXKd1LXo.js: xP/AP instantiate bP with their source endpoint data.
  const source = sourceCatalog.entries.filter(
    (entry) => entry.protocolFamily === "DUCKBREAD",
  );
  expect(source).toHaveLength(2);
  for (const entry of source) {
    expect(entry.controller).toBe("bP");
    const device = DEVICE_REGISTRY.find(
      (definition) =>
        definition.kind === "keyboard" &&
        Number(definition.VID) === entry.vendorId &&
        Number(definition.PID) === entry.productId,
    )!;
    const profile = verifiedKeyboardProfile(device)!;
    expect(profile).toMatchObject({
      vendorId: entry.vendorId,
      productId: entry.productId,
      rows: entry.custom.row,
      columns: entry.custom.col,
    });
    expect([device.usagePage, device.usage, device.reportId]).toEqual([
      entry.usagePage,
      entry.usage,
      0,
    ]);
  }
});

it("reads only RS7's own 6x16 matrix and never writes an RS7 snapshot without a connection and consent", async () => {
  const definition = structuredClone(rs7),
    client = new KeyboardClient(definition);
  Object.assign(definition, ATK68);
  const read = vi.spyOn(client, "read").mockImplementation(async (frame) => {
    const reply = frame.slice();
    if (frame[0] === 2 && frame[2] === 34) reply[3] = 1;
    if (frame[0] === 2 && frame[2] === 13)
      for (let i = 0; i < 12; i++) reply.set([0, 200], 8 + 2 * i);
    if (frame[0] === 2 && frame[2] === 14)
      for (let i = 0; i < 4; i++) reply.set([0, 0, 10, 0, 10], 8 + 5 * i);
    if (frame[0] === 8 && frame[1] === 65) {
      reply[2] = 2;
      reply[4] = 128;
      reply[8] = 60;
    }
    return reply;
  });
  const snapshot = await client.snapshot(() => {});
  expect(snapshot.unreadFields).toEqual([]);
  expect(snapshot.settings.keys).toHaveLength(80);
  const frames = read.mock.calls.map(([frame]) => frame);
  // No ATK68 single-key reads; bulk offsets stay inside 6x16 (96 cells, 768 keymap bytes).
  expect(frames.some((f) => f[0] === 4 || (f[0] === 2 && [3, 7].includes(f[2])))).toBe(false);
  for (const f of frames) {
    const offset = f[0] === 18 ? f[1] * 256 + f[2] : f[5] * 256 + f[6];
    if (f[0] === 18) expect(offset).toBeLessThan(768);
    if (f[0] === 2 && [13, 14].includes(f[2])) expect(offset).toBeLessThan(96);
  }
  await expect(client.apply(snapshot.settings, () => {})).rejects.toThrow();
});
function fakeDevice(definition = ATK68) {
  return {
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    opened: false,
    collections: [
      {
        usagePage: definition.usagePage,
        usage: definition.usage,
        outputReports: [{ reportId: definition.reportId }],
      },
    ],
    open: vi.fn(async function (this: { opened: boolean }) {
      this.opened = true;
    }),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    sendReport: vi.fn(),
  };
}
it.each([ATK68, rs7])(
  "connects the source-verified $name definition through registry filters",
  async (definition) => {
    const device = fakeDevice(definition),
      requestDevice = vi
        .fn<
          (options: HIDDeviceRequestOptions) => Promise<Array<typeof device>>
        >()
        .mockResolvedValue([device]);
    vi.stubGlobal("navigator", {
      hid: {
        getDevices: async () => [],
        requestDevice,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const client = new KeyboardClient(definition);
    await client.connect();
    expect(client.connected).toBe(true);
    const filters = requestDevice.mock.calls[0]?.[0]?.filters;
    expect(filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendorId: 0x373b,
          productId: 0x1044,
          usagePage: 0xff60,
          usage: 0x61,
        }),
        expect.objectContaining({ productId: 0x1048 }),
      ]),
    );
    expect(filters.every((filter) => filter.usagePage !== 0xff02)).toBe(true);
    await client.close();
  },
);
it("bounds RS7's opt-in bP writes by its own layout and 3.4mm travel", () => {
  expect(() =>
    validateKeyboardFrame(keyboardRead("version"), rs7),
  ).not.toThrow();
  // Reads are bounded by RS7's own 6x16 matrix.
  expect(() => validateKeyboardFrame(keyboardRead("actuation", 5, 15), rs7)).not.toThrow();
  expect(() => validateKeyboardFrame(keyboardRead("actuation", 6, 0), rs7)).toThrow();
  expect(() => validateKeyboardFrame(keyboardRead("actuation", 0, 16), rs7)).toThrow();
  const frame = (bytes: number[]) => {
    const f = new Uint8Array(32);
    f.set(bytes);
    return f;
  };
  // Same bP setters as the ATK68 writer (opt-in untested tier).
  expect(() => validateKeyboardWrite(frame([3, 150, 34, 1]), rs7)).not.toThrow();
  // IL travel chunk (11 cells, erase op) with the first cell at 3.4mm / 3.41mm.
  expect(() => validateKeyboardWrite(frame([3, 150, 13, 0, 0, 0, 0, 11, 1, 1, 84]), rs7)).not.toThrow();
  expect(() => validateKeyboardWrite(frame([3, 150, 13, 0, 0, 0, 0, 11, 1, 1, 85]), rs7)).toThrow();
  expect(() => validateKeyboardWrite(frame([3, 150, 3, 0, 0, 1, 84]), rs7)).toThrow(); // single-key setter: never sent by the source
  expect(() => validateKeyboardWrite(frame([5, 0, 6, 0, 0, 4]), rs7)).toThrow(); // outside the matrix
  expect(() => validateKeyboardWrite(frame([11]), rs7)).toThrow(); // bootloader
});
it("names the selected model when the picker returns another verified keyboard", async () => {
  const wrong = fakeDevice();
  vi.stubGlobal("navigator", {
    hid: { getDevices: async () => [], requestDevice: async () => [wrong] },
  });
  await expect(new KeyboardClient(rs7).connect()).rejects.toThrow(rs7.name);
  expect(wrong.open).not.toHaveBeenCalled();
});
it("never offers or sends a frame for an unverified family or boot endpoint", async () => {
  const getDevices = vi.fn(),
    requestDevice = vi.fn();
  vi.stubGlobal("navigator", { hid: { getDevices, requestDevice } });
  for (const definition of [
    { ...ATK68, protocolFamily: "BITYUAN" },
    { ...ATK68, usagePage: 0xff02 },
    { ...rs7, PID: "0x1045" },
  ]) {
    await expect(new KeyboardClient(definition).connect()).rejects.toThrow();
  }
  expect(getDevices).not.toHaveBeenCalled();
  expect(requestDevice).not.toHaveBeenCalled();
});

const rs6 = DEVICE_REGISTRY.find(
  (device) => device.kind === "keyboard" && device.protocolFamily === "BITYUAN",
)!;

it("promotes BITYUAN family to verified read-only and blocks all writes", async () => {
  expect(rs6).toBeDefined();
  const profile = verifiedKeyboardProfile(rs6)!;
  expect(profile).toMatchObject({
    vendorId: Number(rs6.VID),
    productId: Number(rs6.PID),
    keySettings: false,
  });

  // Allowed read frames
  expect(() =>
    validateKeyboardFrame(keyboardRead("version"), rs6),
  ).not.toThrow();
  expect(() =>
    validateKeyboardFrame(keyboardRead("options"), rs6),
  ).not.toThrow();

  // Blocked key-matrix reads
  expect(() =>
    validateKeyboardFrame(keyboardRead("actuation", 0, 0), rs6),
  ).toThrow(/key matrix is not verified/);
  expect(() =>
    validateKeyboardFrame(keyboardKeyRead(0, 0, 0), rs6),
  ).toThrow(/key matrix is not verified/);

  // Blocked writes
  const write = new Uint8Array(32);
  write.set([3, 150, 34, 1]);
  // Selector 34 (DUCKBREAD polling) is outside BITYUAN's untested write tier.
  expect(() => validateKeyboardWrite(write, rs6)).toThrow(/blocked/);

  // Fake-HID connection and version read
  const device = fakeDevice(rs6);
  vi.stubGlobal("navigator", {
    hid: {
      getDevices: async () => [device],
      requestDevice: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  const client = new KeyboardClient(rs6);
  vi.spyOn(client, "read").mockImplementation(async (frame) => {
    const reply = frame.slice();
    if (frame[0] === 2 && frame[2] === 0) {
      reply[5] = 1;
      reply[6] = 2; // version 1.02
    }
    return reply;
  });
  await client.connect(true);
  expect(client.connected).toBe(true);
  const snapshot = await client.snapshot(() => {}, { scope: "base" });
  expect(snapshot.firmware).toBe("1.02");
  expect(snapshot.unreadFields).toContain("keys");
  await client.close();
});

it("accepts RS7's 3.4mm source travel on read but keeps ATK68 writes at 3.3mm", () => {
  const key = createKeyboardSettings().keys[0];
  expect(KeyboardSettingsSchema.shape.keys.element.safeParse({ ...key, actuation: 3.4 }).success).toBe(true);
  const write = (value: number) => {
    const frame = new Uint8Array(32);
    frame.set([3, 150, 13, 0, 0, 0, 0, 11, 1, value >> 8, value & 255]);
    return frame;
  };
  expect(() => validateKeyboardWrite(write(330), ATK68)).not.toThrow();
  expect(() => validateKeyboardWrite(write(340), ATK68)).toThrow();
});
