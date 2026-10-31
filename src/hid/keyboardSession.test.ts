import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyboardClient, keyboardSession } from "./keyboardClient";
import { ATK68 } from "../devices/registry";
import { createKeyboardSettings } from "../devices/keyboardSettings";

function deviceStub() {
  const listeners = new Set<(event: unknown) => void>();
  const device = {
    vendorId: 0x373b,
    productId: 0x1048,
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
    addEventListener: vi.fn(
      (_type: string, listener: (event: unknown) => void) =>
        listeners.add(listener),
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: (event: unknown) => void) =>
        listeners.delete(listener),
    ),
    sendReport: vi.fn(async (_id: number, request: Uint8Array) => {
      const response = request.slice();
      if (request[0] === 2 && request[2] === 34) response[3] = 4;
      for (const listener of [...listeners])
        listener({ reportId: 0, data: new DataView(response.buffer) });
    }),
  };
  const hid = {
    getDevices: vi.fn(async () => [device]),
    requestDevice: vi.fn(async () => [device]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("navigator", { hid });
  return { device, hid };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("retained keyboard sessions", () => {
  it("reuses an authorized open device without a second chooser or open", async () => {
    const { device, hid } = deviceStub(),
      client = keyboardSession(ATK68);
    await client.connect();
    client.confirmWrites();
    expect(keyboardSession(ATK68)).toBe(client);
    await keyboardSession(ATK68).connect();
    expect(hid.requestDevice).not.toHaveBeenCalled();
    expect(device.open).toHaveBeenCalledOnce();
    await client.close();
    expect(client.connected).toBe(false);
  });
  it("never prompts during automatic authorized reconnect", async () => {
    const { hid } = deviceStub();
    hid.getDevices.mockResolvedValue([]);
    await expect(new KeyboardClient(ATK68).connect(true)).rejects.toThrow(
      "No matching",
    );
    expect(hid.requestDevice).not.toHaveBeenCalled();
  });
  it("verifies a write with a separate read before reporting success", async () => {
    const { device } = deviceStub(),
      client = new KeyboardClient(ATK68);
    await client.connect();
    client.confirmWrites();
    const settings = createKeyboardSettings();
    client.lastSnapshot = {
      settings,
      firmware: "1",
      unreadFields: [],
      warnings: [],
    };
    const next = structuredClone(settings);
    next.pollingRate = 4000;
    await expect(client.apply(next, () => {})).resolves.toMatchObject({
      skipped: [],
    });
    expect(
      device.sendReport.mock.calls.map((call) => [...call[1].slice(0, 4)]),
    ).toEqual([
      [3, 150, 34, 4],
      [2, 150, 34, 0],
    ]);
    await client.close();
  });
  it("stops on readback mismatch and invalidates the baseline", async () => {
    deviceStub();
    const client = new KeyboardClient(ATK68);
    await client.connect();
    client.confirmWrites();
    const settings = createKeyboardSettings();
    client.lastSnapshot = {
      settings,
      firmware: "1",
      unreadFields: [],
      warnings: [],
    };
    const next = structuredClone(settings);
    next.pollingRate = 8000;
    await expect(client.apply(next, () => {})).rejects.toThrow(
      "readback mismatch",
    );
    expect(client.lastSnapshot).toBeNull();
    await client.close();
  });
});
