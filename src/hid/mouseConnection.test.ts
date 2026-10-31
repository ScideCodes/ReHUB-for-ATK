import { describe, expect, it, vi, afterEach } from "vitest";
import { buildPacket, isMouseInfoQuery } from "../protocol/codec";
import { HidClient, hidClient } from "./hidClient";
import { MockHidDevice } from "../mock/mockDevice";
import {
  mouseFilters,
  mouseEndpoint,
  verifiedMouseIdentity,
} from "../devices/mouseProtocols";
import mice from "../devices/mice.json";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("source-backed mouse access", () => {
  it("offers every mouse endpoint and never offers a boot collection", () => {
    for (const mouse of mice)
      expect(mouseFilters()).toContainEqual({
        vendorId: Number(mouse.VID),
        productId: Number(mouse.PID),
        usagePage: mouse.usagePage,
        usage: mouse.usage,
      });
    expect(mouseFilters().every((f) => f.usagePage !== 0xff02)).toBe(true);
  });
  it.each([
    [0x11cc, 1, 4, true],
    [0x11d8, 1, 4, true],
    [0x102e, 2, 42, true],
    [0x1084, 2, 63, false],
    [0x102f, 2, 43, false],
  ])(
    "checks endpoint and CID/MID together for PID %i",
    (pid, cid, mid, real) => {
      expect(verifiedMouseIdentity(0x373b, pid, cid, mid)).toBe(real);
    },
  );
  it("does not trust a catalog identity from the wrong wired PID or unknown receiver", () => {
    expect(verifiedMouseIdentity(0x373b, 0x11cc, 2, 42)).toBe(false);
    expect(verifiedMouseIdentity(0x373b, 0xffff, 1, 4)).toBe(false);
    expect(mouseEndpoint(0x373b, 0x1084)?.receiver).toBe(false);
  });
  it("rejects unverified and unknown endpoints before opening or sending anything", async () => {
    vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
    const client = new HidClient();
    // Every source mouse profile is readable now; only endpoints outside the source list are refused.
    for (const pid of [0x0001, 0x7777, 0xffff]) {
      const device = new MockHidDevice();
      device.productId = pid;
      device.productName = "HID test mouse";
      const send = vi.spyOn(device, "sendReport"),
        open = vi.spyOn(device, "open");
      await expect(
        client.connectHardware(device as unknown as HIDDevice),
      ).rejects.toThrow(/373B:.*HID test mouse/);
      expect(open).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
  });
});

it.each([
  [0x11cc, 1, 4],
  [0x11d8, 1, 4],
  [0x102e, 2, 42],
  // X1 Ultra: PAW3950Ultra read tier (DPI LED + bottom button), opened read-only.
  [0x102f, 2, 43],
])(
  "identifies real PID %i without sending settings writes",
  async (pid, cid, mid) => {
    vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
    const client = new HidClient(),
      device = new MockHidDevice(cid, mid);
    device.productId = pid;
    const send = vi.spyOn(device, "sendReport");
    try {
      const info = await client.connectHardware(device as unknown as HIDDevice);
      expect([info.cid, info.mid]).toEqual([cid, mid]);
      expect(info.connectionMode).toBe(
        pid === 0x11d8 ? "wireless_dongle" : "wired",
      );
      expect(
        // Opcode 1 only as the source info query (connect type), never a data download.
        send.mock.calls.every(([, frame]) =>
          [3, 4, 14, 16, 18, 29].includes(frame[0]) || isMouseInfoQuery(frame),
        ),
      ).toBe(true);
      await expect(client.transfer(buildPacket(13))).rejects.toThrow(
        pid === 0x102f ? /Read-only mouse/ : /DFU/,
      );
      if (pid === 0x102f) {
        // Read tier: EEPROM reads pass, every write/reset/pair/config opcode is refused.
        await expect(client.transfer(buildPacket(8, 44, 8))).resolves.toBeDefined();
        for (const opcode of [1, 5, 7, 9, 15, 19, 20, 22, 24])
          await expect(client.transfer(buildPacket(opcode))).rejects.toThrow(/Read-only mouse/);
      }
      if (pid === 0x102e)
        await expect(
          client.transfer(buildPacket(7, 6992, 5, [1, 84, 0, 0, 85])),
        ).rejects.toThrow(/Center point/);
    } finally {
      await client.disconnect();
    }
  },
);
it("reads only identity from a receiver carrying an unknown mouse", async () => {
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const client = new HidClient(),
    device = new MockHidDevice(9, 250); // CID/MID with no source profile
  device.productId = 0x11d8;
  const send = vi.spyOn(device, "sendReport");
  try {
    const info = await client.connectHardware(device as unknown as HIDDevice);
    expect([info.cid, info.mid]).toEqual([9, 250]);
    expect(send.mock.calls.map(([, frame]) => frame[0])).toEqual([16]);
    for (const opcode of [7, 8, 9, 15, 20, 22, 24])
      await expect(client.transfer(buildPacket(opcode))).rejects.toThrow(
        /unverified/,
      );
    expect(send).toHaveBeenCalledOnce();
  } finally {
    await client.disconnect();
  }
});
import {
  connectDevice,
  disconnectDevice,
  applySettingsToDevice,
} from "../features/device/deviceSession";
import { useConfigStore } from "../store/configStore";

it("applies a source-compatible mouse with readback while keeping center point local", async () => {
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const device = new MockHidDevice(2, 42);
  device.productId = 0x102e;
  const send = vi.spyOn(device, "sendReport");
  try {
    await connectDevice(
      false,
      2,
      42,
      undefined,
      device as unknown as HIDDevice,
    );
    send.mockClear();
    const settings = structuredClone(useConfigStore.getState().activeSettings);
    settings.pollingRate = 2000;
    settings.sensorCenterPoint = { enable: true, x: 20, y: 0 };
    const skipped = await applySettingsToDevice(settings);
    const frames = send.mock.calls.map(([, frame]) => frame);
    expect(
      frames.some(
        (frame) => frame[0] === 7 && frame[2] === 0 && frame[3] === 0,
      ),
    ).toBe(true);
    expect(
      frames.some(
        (frame) => frame[0] === 8 && frame[2] === 0 && frame[3] === 0,
      ),
    ).toBe(true);
    expect(
      frames.some(
        (frame) => frame[0] === 7 && ((frame[2] << 8) | frame[3]) === 6992,
      ),
    ).toBe(false);
    expect(skipped).toContain(
      "Center point needs packet verification for this mouse",
    );
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(2000);
    expect(
      useConfigStore.getState().activeSettings.sensorCenterPoint.enable,
    ).toBe(false);
    const original = MockHidDevice.prototype.sendReport.bind(device);
    send.mockImplementation(async (report, frame) => {
      if (frame[0] === 7) {
        queueMicrotask(() =>
          device.oninputreport?.({
            reportId: report,
            data: new DataView(frame.slice().buffer),
          }),
        );
        return;
      }
      return original(report, frame);
    });
    const failed = structuredClone(useConfigStore.getState().activeSettings);
    failed.pollingRate = 4000;
    await expect(applySettingsToDevice(failed)).rejects.toThrow(
      /readback mismatch/i,
    );
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(2000);
    expect(
      hidClient.diagnostics
        .getSnapshot()
        .errors.some((error) => error.code === "readback-mismatch"),
    ).toBe(true);
  } finally {
    await disconnectDevice();
  }
});

it("maps a receiver to its paired model via runtime CID/MID query or keeps unknown demo", async () => {
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const client = new HidClient();

  // 1. Receiver paired with ATK ZERO EX (1, 4)
  const pairedDongle = new MockHidDevice(1, 4);
  pairedDongle.productId = 0x11d8;
  const infoPaired = await client.connectHardware(pairedDongle as unknown as HIDDevice);
  expect(infoPaired.connectionMode).toBe("wireless_dongle");
  expect(infoPaired.name).toBe("ATK ZERO EX");
  expect(verifiedMouseIdentity(0x373b, 0x11d8, 1, 4)).toBe(true);
  await client.disconnect();

  // 2. Receiver with unknown/unlinked mouse (0, 0)
  const unpairedDongle = new MockHidDevice(0, 0);
  unpairedDongle.productId = 0x11d8;
  const infoUnpaired = await client.connectHardware(unpairedDongle as unknown as HIDDevice);
  expect(infoUnpaired.connectionMode).toBe("wireless_dongle");
  expect(verifiedMouseIdentity(0x373b, 0x11d8, 0, 0)).toBe(false);
  await client.disconnect();
});

it("applies sensor rotation write with exact two's-complement encoding and readback", async () => {
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const device = new MockHidDevice(1, 4);
  device.productId = 0x11cc;
  const send = vi.spyOn(device, "sendReport");
  try {
    await connectDevice(
      false,
      1,
      4,
      undefined,
      device as unknown as HIDDevice,
    );
    send.mockClear();
    const settings = structuredClone(useConfigStore.getState().activeSettings);
    settings.sensorAngle = -10;
    settings.sensorAngleEnabled = true;
    const skipped = await applySettingsToDevice(settings);
    expect(skipped).not.toContain("Sensor rotation needs packet verification");
    const frames = send.mock.calls.map(([, frame]) => frame);
    // Opcode 7 (SetEEPROM), Address 189 (0x00BD), Length 4
    const angleWrite = frames.find(
      (frame) => frame[0] === 7 && ((frame[2] << 8) | frame[3]) === 189,
    );
    expect(angleWrite).toBeDefined();
    expect(angleWrite![4]).toBe(4);
    expect(angleWrite![5]).toBe(246); // -10 & 0xff
    expect(angleWrite![6]).toBe((0x55 - 246) & 0xff);
    expect(angleWrite![7]).toBe(1); // enabled
    expect(angleWrite![8]).toBe((0x55 - 1) & 0xff);

    // Readback verification via Opcode 8 (GetEEPROM), Address 189
    const angleRead = frames.find(
      (frame) => frame[0] === 8 && ((frame[2] << 8) | frame[3]) === 189,
    );
    expect(angleRead).toBeDefined();
    expect(useConfigStore.getState().activeSettings.sensorAngle).toBe(-10);
    expect(useConfigStore.getState().activeSettings.sensorAngleEnabled).toBe(true);
  } finally {
    await disconnectDevice();
  }
});
