import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HidClient } from "./hidClient";
import { MockHidDevice } from "../mock/mockDevice";
import { buildPacket, REPORT_ID } from "../protocol/codec";

let client: HidClient;
let device: MockHidDevice;
beforeEach(() => {
  device = new MockHidDevice();
  vi.stubGlobal("navigator", {
    hid: { getDevices: vi.fn(async () => [device]), addEventListener: vi.fn() },
  });
  client = new HidClient();
  vi.spyOn(client, "identifyDevice").mockImplementation(async () => {
    Object.assign((client as unknown as { deviceInfo: object }).deviceInfo, {
      cid: 1,
      mid: 4,
    });
    return client.getDeviceInfo();
  });
});
afterEach(async () => {
  await client.disconnect();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HID report routing", () => {
  it("changes the connection generation even when reconnecting the same mouse", async () => {
    await client.connectHardware(device as unknown as HIDDevice);
    const generation = client.sessionGeneration;
    await client.disconnect();
    await client.connectHardware(device as unknown as HIDDevice);
    expect(client.sessionGeneration).toBeGreaterThan(generation);
  });
  it("does not replace an active mouse when another supported endpoint connects", async () => {
    await client.connectHardware(device as unknown as HIDDevice);
    const other = new MockHidDevice();
    const open = vi.spyOn(other, "open");
    vi.mocked(navigator.hid.getDevices).mockResolvedValue([other] as unknown as HIDDevice[]);
    expect(await client.autoReconnect()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(device.opened).toBe(true);
    expect(device.oninputreport).toBeTypeOf("function");
  });
  it("coalesces hotplug discovery and cancels discovery on disconnect", async () => {
    device.opened = false;
    let discovered!: (value: HIDDevice[]) => void;
    vi.mocked(navigator.hid.getDevices).mockImplementation(() => new Promise((resolve) => { discovered = resolve; }));
    const reconnect = client.autoReconnect();
    expect(await client.autoReconnect()).toBe(false);
    await client.disconnect();
    discovered([device] as unknown as HIDDevice[]);
    expect(await reconnect).toBe(false);
    expect(device.opened).toBe(false);
    expect(navigator.hid.getDevices).toHaveBeenCalledOnce();
  });
  it("closes an opening device if the connection is cancelled before open resolves", async () => {
    device.opened = false;
    let finishOpen!: () => void;
    vi.spyOn(device, "open").mockImplementation(() => new Promise<void>((resolve) => {
      finishOpen = () => { device.opened = true; resolve(); };
    }));
    const connecting = client.connectHardware(device as unknown as HIDDevice);
    const rejected = expect(connecting).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(device.open).toHaveBeenCalledOnce());
    await client.disconnect();
    finishOpen();
    await rejected;
    expect(device.opened).toBe(false);
    expect(client.getDeviceInfo().connected).toBe(false);
  });
  it("never publishes connected status after disconnect interrupts identification", async () => {
    vi.mocked(client.identifyDevice).mockRestore();
    vi.spyOn(device, "sendReport").mockResolvedValue();
    const connecting = client.connectHardware(device as unknown as HIDDevice);
    const rejected = expect(connecting).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(device.sendReport).toHaveBeenCalledOnce());
    await client.disconnect();
    await rejected;
    expect(client.getDeviceInfo().connected).toBe(false);
    expect(device.opened).toBe(false);
  });
  it("identifies the selected mouse collection without opening a second picker", async () => {
    await client.connectHardware(device as unknown as HIDDevice);
    expect(device.opened).toBe(true);
    expect(client.identifyDevice).toHaveBeenCalledOnce();
  });
  it("rejects an unrelated collection before closing the current mouse", async () => {
    await client.autoReconnect();
    const invalid = {
      vendorId: 0x1234,
      productId: 0xffff,
      collections: [],
      open: vi.fn(),
    };
    await expect(
      client.connectHardware(invalid as unknown as HIDDevice),
    ).rejects.toThrow("supported mouse HID collection");
    expect(invalid.open).not.toHaveBeenCalled();
    expect(device.opened).toBe(true);
  });
  it("ignores other report IDs and short frames while waiting for the real reply", async () => {
    await client.autoReconnect();
    const result = client.transfer(buildPacket(4));
    device.oninputreport?.({
      reportId: 1,
      data: new DataView(buildPacket(4, 0, 4, [99]).buffer),
    });
    device.oninputreport?.({
      reportId: REPORT_ID,
      data: new DataView(new Uint8Array([4]).buffer),
    });
    await expect(result.then((reply) => reply.getUint8(5))).resolves.toBe(94);
  });
  it("ignores late replies for a different EEPROM address", async () => {
    await client.autoReconnect();
    const result = client.transfer(buildPacket(8, 169, 2));
    device.oninputreport?.({
      reportId: REPORT_ID,
      data: new DataView(buildPacket(8, 181, 2, [99, 99]).buffer),
    });
    const reply = await result;
    expect(reply.getUint16(2, false)).toBe(169);
    expect(reply.getUint8(5)).toBe(1);
  });

  it("preserves DataView boundaries for push reports", async () => {
    await client.autoReconnect();
    const push = vi.fn();
    client.onPushReport = push;
    const buffer = new Uint8Array(32);
    const packet = buildPacket(10, 0, 1, [64]);
    buffer.set(packet, 7);
    device.oninputreport?.({
      reportId: REPORT_ID,
      data: new DataView(buffer.buffer, 7, 16),
    });
    expect(push).toHaveBeenCalledWith(10, packet);
  });
  it("rejects pending requests immediately when disconnected", async () => {
    vi.useFakeTimers();
    await client.autoReconnect();
    vi.spyOn(device, "sendReport").mockResolvedValue();
    const rejected = vi.fn();
    const request = client.transfer(buildPacket(4));
    request.catch(rejected);
    await client.disconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/disconnect/i),
      }),
    );
  });
  it("only reopens the supported vendor collection with usage 2", async () => {
    const wrong = new MockHidDevice();
    wrong.collections[0].usage = 1;
    vi.mocked(navigator.hid.getDevices).mockResolvedValue([
      wrong,
      device,
    ] as unknown as HIDDevice[]);
    const wrongOpen = vi.spyOn(wrong, "open");
    await client.autoReconnect();
    expect(wrongOpen).not.toHaveBeenCalled();
    expect(device.oninputreport).toBeTypeOf("function");
  });
});
