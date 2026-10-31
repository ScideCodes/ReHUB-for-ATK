import { afterEach, expect, it, vi } from "vitest";
import { buildPacket, encodeSensorDpi } from "../protocol/codec";
import { hidClient } from "./hidClient";
import { MockHidDevice } from "../mock/mockDevice";
import {
  allowUntestedMouseWrites,
  untestedMouseIdentity,
  verifiedMouseIdentity,
  writableMouseIdentity,
} from "../devices/mouseProtocols";
import { applySettingsToDevice, connectDevice, disconnectDevice } from "../features/device/deviceSession";
import { useConfigStore } from "../store/configStore";

// ATK X1 Lite: 373B:113E, CID/MID 2,89, PAW3395, catalog max 1000Hz, source noFarDistance.
const X1_LITE = [0x373b, 0x113e, 2, 89] as const;

afterEach(async () => {
  await disconnectDevice();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("puts every readable non-verified model in the untested tier", () => {
  expect(untestedMouseIdentity(...X1_LITE)).toBe(true);
  expect(verifiedMouseIdentity(...X1_LITE)).toBe(false);
  expect(untestedMouseIdentity(0x373b, 0x11cc, 1, 4)).toBe(false); // ZERO EX: already verified
  expect(untestedMouseIdentity(0x373b, 0x1269, 1, 31)).toBe(true); // A9 Mini +: PAW3955MASTER (Qe records)
  expect(untestedMouseIdentity(0x3554, 0xf502, 2, 1)).toBe(true); // Dragonfly F1 PRO: no catalog entry
  expect(untestedMouseIdentity(0x373b, 0x113e, 9, 250)).toBe(false); // unknown CID/MID
  expect(writableMouseIdentity(...X1_LITE)).toBe(false);
  expect(() => allowUntestedMouseWrites(0x373b, 0x11cc, 1, 4)).toThrow(/no untested write tier/);
});

it("writes an opted-in untested mouse with its own DPI codec, holds hidden settings and forgets consent on disconnect", async () => {
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const device = new MockHidDevice(2, 89);
  device.productId = 0x113e;
  device.connectType = 2; // wired1K: source offers 125-1000Hz only
  // The mock seeds PAW3950Ultra DPI bytes; store this sensor's own records instead (EEPROM 12.., 4 bytes each).
  [400, 800, 1600, 3200].forEach((dpi, i) => {
    const e = encodeSensorDpi("PAW3395", dpi, dpi)!;
    device.eeprom.set([e.xDpi, e.yDpi, e.dpiEx, (0x55 - e.xDpi - e.yDpi - e.dpiEx) & 255], 12 + i * 4);
    device.eeprom.set([255, 0, 0, (0x55 - 255) & 255], 44 + i * 4); // valid DPI colour records (this model has DPI RGB)
  });
  const send = vi.spyOn(device, "sendReport");
  await connectDevice(false, 2, 89, undefined, device as unknown as HIDDevice);
  const settings = structuredClone(useConfigStore.getState().activeSettings);
  expect(settings.dpiStages[0].xDpi).toBe(400);
  settings.dpiStages[0] = { ...settings.dpiStages[0], xDpi: 1600, yDpi: 1600 };
  await expect(applySettingsToDevice(settings)).rejects.toThrow(/settings writes are unavailable/);

  allowUntestedMouseWrites(...X1_LITE);
  send.mockClear();
  settings.pollingRate = 2000;
  settings.longDistanceMode = !settings.longDistanceMode;
  const skipped = await applySettingsToDevice(settings);
  const frames = send.mock.calls.map(([, frame]) => frame);
  // DPI 1 record at EEPROM 12: PAW3395 raw 31 (1600 = 50 * 32), no ex bits, crc 0x55 - 62.
  expect(frames.some((f) => f[0] === 7 && f[3] === 12 && f[5] === 31 && f[6] === 31 && f[7] === 0 && f[8] === ((0x55 - 62) & 255))).toBe(true);
  expect(frames.some((f) => f[0] === 22)).toBe(false);
  expect(skipped).toEqual(expect.arrayContaining(["Polling rate is above what this connection offers", "Long distance mode is not offered for this model"]));
  expect(useConfigStore.getState().activeSettings.dpiStages[0].xDpi).toBe(1600);

  await expect(hidClient.transfer(buildPacket(15, 0, 1, [1]))).rejects.toThrow(/not part of the untested write tier/);
  await disconnectDevice();
  expect(writableMouseIdentity(...X1_LITE)).toBe(false);
});

it("rewrites bhop and button-mode bits it read, like source je.create, when polling changes", async () => {
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const device = new MockHidDevice(1, 4);
  device.productId = 0x11cc; // ZERO EX wired (verified writer)
  device.eeprom.set([3, 0x55 - 3, 0x10, 0x55 - 0x10], 6); // bhop 30ms + crc, button mode with an unmodelled bit 0x10
  await connectDevice(false, 1, 4, undefined, device as unknown as HIDDevice);
  const settings = structuredClone(useConfigStore.getState().activeSettings);
  settings.pollingRate = settings.pollingRate === 2000 ? 1000 : 2000;
  await applySettingsToDevice(settings);
  expect([...device.eeprom.slice(6, 8)]).toEqual([3, 0x55 - 3]);
  expect(device.eeprom[8] & 0x10).toBe(0x10);
});
