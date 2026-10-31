import { expect, it } from "vitest";
import { decodeDpiColor } from "./deviceSession";
import { mouseModelFeatures } from "../../devices/mouseProtocols";

it("decodes source DPI colour records and rejects bad checksums", () => {
  // red: 0x55 - 0xFF = 0x56
  expect(decodeDpiColor([0xff, 0, 0, 0x56])).toBe("#FF0000");
  expect(decodeDpiColor([0x10, 0x20, 0x30, (0x55 - 0x60) & 255])).toBe("#102030");
  expect(decodeDpiColor([0xff, 0, 0, 0x00])).toBeNull();
});

it("reads model features from the source profile", () => {
  expect(mouseModelFeatures(2, 43)).toMatchObject({ dpiRgb: true, bottomButton: true }); // ATK X1 Ultra
  expect(mouseModelFeatures(1, 4)).toMatchObject({ dpiRgb: false, bottomButton: false }); // ZERO EX
  expect(mouseModelFeatures(0, 0)).toMatchObject({ dpiRgb: false, bottomButton: false });
});

it("decodes source PAW3955 DPI records", async () => {
  const { decodePaw3955Dpi } = await import("./deviceSession");
  const rec = (x: number, y: number, ex: number) => {
    const b = [(x - 1) & 255, (x - 1) >> 8, (y - 1) & 255, (y - 1) >> 8, ex];
    return [...b, (0x55 - (b.reduce((a, v) => a + v, 0) & 255)) & 255];
  };
  expect(decodePaw3955Dpi(rec(1600, 800, 0))).toEqual({ xDpi: 1600, yDpi: 800 });
  expect(decodePaw3955Dpi(rec(20000, 20000, 0x11))).toEqual({ xDpi: 40000, yDpi: 40000 });
  const bad = rec(800, 800, 0); bad[5] ^= 1;
  expect(decodePaw3955Dpi(bad)).toBeNull();
  expect(mouseModelFeatures(1, 4).paw3955).toBe(false);
});

it("decodes classic DPI records per source sensor (ue)", async () => {
  const { decodeSensorDpi, decodePaw3950Dpi } = await import("../../protocol/codec");
  // PAW3395: 50 * (1 + raw); raw 31 -> 1600; ex bit0 doubles X
  expect(decodeSensorDpi("PAW3395", 31, 15, 0)).toEqual({ xDpi: 1600, yDpi: 800 });
  expect(decodeSensorDpi("PAW3395Ultra", 31, 31, 1)).toEqual({ xDpi: 3200, yDpi: 1600 });
  // high bits from ex: raw = 0x00 | (ex&12>>2)<<8 = 256 -> 12850
  expect(decodeSensorDpi("PAW3395", 0, 0, 4)).toEqual({ xDpi: 12850, yDpi: 50 });
  // PAW3395SE table: hex 1 -> 50, hex 9 -> 400
  expect(decodeSensorDpi("PAW3395SE", 1, 9, 0)).toEqual({ xDpi: 50, yDpi: 400 });
  expect(decodeSensorDpi("PAW3395SE", 7, 9, 0)).toBeNull(); // 7 is not in the source table
  expect(decodeSensorDpi("PAW3950Ultra", 79, 79, 0)).toEqual(decodePaw3950Dpi(79, 79, 0));
  expect(decodeSensorDpi("UNKNOWN", 1, 1, 0)).toBeNull();
  // PAW3950 and PAW3950DM use the PAW3395 branch.
  // PAW3311 uses the le table (oe default branch), PAW3315 the ge table, CORE26K its own formula.
  expect(decodeSensorDpi("PAW3311", 1, 9, 0)).toEqual(decodeSensorDpi("PAW3395SE", 1, 9, 0));
  expect(decodeSensorDpi("PAW3315", 1, 2, 0)).toEqual({ xDpi: 50, yDpi: 100 });
  expect(decodeSensorDpi("CORE26K", 15, 15, 2)).toEqual({ xDpi: 1600, yDpi: 800 });
  for (const sensor of ["PAW3950", "PAW3950DM"])
    expect(decodeSensorDpi(sensor, 31, 15, 16)).toEqual({ xDpi: 1600, yDpi: 1600 });
});
