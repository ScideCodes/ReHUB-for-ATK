import { describe, it, expect } from "vitest";
import {
  encodeSensorDpi,
  decodeSensorDpi,
  lodOptions,
  encodeLod,
  decodeLod,
  calcChecksum,
  buildPacket,
  encodePaw3950Dpi,
  decodePaw3950Dpi,
  createSetReportRateDpiPacket,
  createSetStabilizationPacket,
  createSetLodPacket,
  REPORT_ID,
} from "./codec";
import { CompxOpcode, CompxAddress } from "./constants";
import { DeviceSettingsSchema } from "../types/schema";

describe("Protocol Codec & Checksum Verification", () => {
  it("computes checksum satisfying the Compx identity (sum == 0x55)", () => {
    const data15 = new Uint8Array([
      0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const chk = calcChecksum(REPORT_ID, data15);
    let total = REPORT_ID;
    for (let i = 0; i < 15; i++) total += data15[i];
    total += chk;
    expect(total & 0xff).toBe(0x55);
  });

  it("buildPacket constructs a 16-byte frame with valid checksum at byte 15", () => {
    const packet = buildPacket(CompxOpcode.GetBatteryLevel);
    expect(packet.length).toBe(16);
    expect(packet[0]).toBe(CompxOpcode.GetBatteryLevel);

    let sum = REPORT_ID;
    for (let i = 0; i < 16; i++) sum += packet[i];
    expect(sum & 0xff).toBe(0x55);
  });

  it("correctly roundtrips PAW3950 Ultra standard DPI values (<10000)", () => {
    const testCases = [400, 800, 1600, 3200, 6400, 9600];
    for (const dpi of testCases) {
      const encoded = encodePaw3950Dpi(dpi, dpi);
      const decoded = decodePaw3950Dpi(
        encoded.xDpi,
        encoded.yDpi,
        encoded.dpiEx,
      );
      expect(decoded.xDpi).toBe(dpi);
      expect(decoded.yDpi).toBe(dpi);
    }
  });

  it("correctly roundtrips PAW3950 Ultra high DPI values (>10000)", () => {
    const testCases = [12000, 16000, 24000, 32000, 36000];
    for (const dpi of testCases) {
      const encoded = encodePaw3950Dpi(dpi, dpi);
      const decoded = decodePaw3950Dpi(
        encoded.xDpi,
        encoded.yDpi,
        encoded.dpiEx,
      );
      // Tolerance within 50 DPI due to step quantization
      expect(Math.abs(decoded.xDpi - dpi)).toBeLessThanOrEqual(50);
      expect(Math.abs(decoded.yDpi - dpi)).toBeLessThanOrEqual(50);
    }
  });

  it("builds polling rate packet with expected 8000Hz and 4000Hz flags", () => {
    const defaultSettings = DeviceSettingsSchema.parse({});
    const packet8k = createSetReportRateDpiPacket({
      ...defaultSettings,
      pollingRate: 8000,
    });
    // Byte 5 is rate value: 8000Hz -> 64 (0x40)
    expect(packet8k[5]).toBe(64);
    // Byte 6 is inverse CRC: 0x55 - 64 = 21 (0x15)
    expect(packet8k[6]).toBe((0x55 - 64) & 0xff);

    const packet4k = createSetReportRateDpiPacket({
      ...defaultSettings,
      pollingRate: 4000,
    });
    expect(packet4k[5]).toBe(32);
    expect(packet4k[6]).toBe((0x55 - 32) & 0xff);
  });

  it("builds stabilization packet with motionSync and debounce flags", () => {
    const defaultSettings = DeviceSettingsSchema.parse({});
    const packet = createSetStabilizationPacket({
      ...defaultSettings,
      keyDebounce: 3,
      motionSync: true,
      rippleControl: true,
      angleSnapping: false,
    });
    expect(packet[2]).toBe((CompxAddress.stabilizationTime >> 8) & 0xff);
    expect(packet[3]).toBe(CompxAddress.stabilizationTime & 0xff);
    expect(packet[5]).toBe(3); // debounce
    expect(packet[7]).toBe(1); // motionSync ON
    expect(packet[13]).toBe(1); // ripple ON
    expect(packet[11]).toBe(0); // angleSnap OFF
  });

  it("builds LOD packets with the source per-sensor codes", () => {
    // SilenceHeightUltimate: 0.7-1.7mm -> 1-11 (PAW3950Ultra, PAW3955MASTER).
    expect(createSetLodPacket("PAW3950Ultra", 0.7)[5]).toBe(1);
    expect(createSetLodPacket("PAW3950Ultra", 1.0)[5]).toBe(4);
    expect(createSetLodPacket("PAW3955MASTER", 1.7)[5]).toBe(11);
    // SilenceHeight: 1mm = 1, 2mm = 2; PAW3950/DM add 0.7mm = 3.
    expect(createSetLodPacket("PAW3395", 2)[5]).toBe(2);
    expect(createSetLodPacket("PAW3950", 0.7)[5]).toBe(3);
    expect(() => createSetLodPacket("PAW3395", 0.7)).toThrow();
    expect(() => createSetLodPacket("PAW3950Ultra", 2)).toThrow();
    expect(() => createSetLodPacket("PAW3311", 1)).toThrow(); // no LOD on this sensor
    for (const sensor of ["PAW3950Ultra", "PAW3950", "PAW3395"])
      for (const mm of lodOptions(sensor)) expect(decodeLod(sensor, encodeLod(sensor, mm)!)).toBe(mm);
  });
});

describe("encodeSensorDpi (source de)", () => {
  const sensors = ["PAW3950Ultra", "PAW3950", "PAW3950DM", "PAW3395", "PAW3395Ultra", "CORE26K", "PAW3395SE", "PAW3311", "PAW3315"];
  it.each(sensors)("round-trips its own decoded values for %s", (sensor) => {
    for (const dpi of [50, 400, 800, 1600, 3200, 10000, 26000, 30100, 42000]) {
      const encoded = encodeSensorDpi(sensor, dpi, dpi);
      if (!encoded) continue;
      expect(decodeSensorDpi(sensor, encoded.xDpi, encoded.yDpi, encoded.dpiEx)).toEqual({ xDpi: dpi, yDpi: dpi });
    }
  });
  it("matches the source byte layout for PAW3395 and CORE26K", () => {
    // 1600 = 50 * (1 + 31); 30100 > 30000 -> raw 300 (0x12C), bit0 doubles X.
    expect(encodeSensorDpi("PAW3395", 1600, 30100)).toEqual({ xDpi: 31, yDpi: 0x2c, dpiEx: (1 << 6) | 16 });
    expect(encodeSensorDpi("CORE26K", 26000, 800)).toEqual({ xDpi: 519 & 255, yDpi: 15, dpiEx: 2 << 2 });
    expect(encodeSensorDpi("PAW3395SE", 1600, 1600)).toEqual({ xDpi: 37, yDpi: 37, dpiEx: 0 });
  });
  it("refuses values the sensor cannot store exactly", () => {
    expect(encodeSensorDpi("PAW3395", 1625, 1600)).toBeNull();
    expect(encodeSensorDpi("PAW3395SE", 12000, 1600)).toBeNull();
    expect(encodeSensorDpi("PAW3955MASTER", 1600, 1600)).toBeNull();
    expect(encodeSensorDpi(null, 1600, 1600)).toBeNull();
  });
});
