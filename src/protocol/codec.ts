import paw3395seTable from "../devices/paw3395seDpiTable.json";
import paw3315Table from "../devices/paw3315DpiTable.json";
import {
  CompxOpcode,
  CompxAddress,
  ReportRateMap,
} from "./constants";
import { DeviceSettings, Lod } from "../types/schema";

export const REPORT_ID = 0x08;

export function calcChecksum(reportId: number, data15: Uint8Array): number {
  let sum = reportId;
  for (let i = 0; i < 15; i++) {
    sum += data15[i] ?? 0;
  }
  return (0x55 - (sum & 0xff)) & 0xff;
}

export function buildPacket(
  commandId: number,
  eepromAddress = 0,
  validLen = 0,
  data: number[] = [],
): Uint8Array {
  const buf = new Uint8Array(16);
  buf[0] = commandId;
  buf[1] = 0x00;
  buf[2] = (eepromAddress >> 8) & 0xff;
  buf[3] = eepromAddress & 0xff;
  buf[4] = validLen;
  for (let i = 0; i < data.length && i < 10; i++) {
    buf[5 + i] = data[i];
  }
  buf[15] = calcChecksum(REPORT_ID, buf.subarray(0, 15));
  return buf;
}

// PAW3950 Ultra Non-Linear DPI calculation
const CE = 10000;
const HE = 30000;
const ME = 10050;
const FE = 3;

function pe(dpi: number, isHigh: boolean): number {
  if (isHigh) {
    return dpi <= HE
      ? Math.floor((dpi - ME) / 50)
      : Math.floor((dpi / 2 - ME) / 50);
  }
  return Math.floor(dpi / 10) - 1;
}

export function encodePaw3950Dpi(
  xDpi: number,
  yDpi: number,
): { xDpi: number; yDpi: number; dpiEx: number } {
  const isXHigh = xDpi > CE;
  const isYHigh = yDpi > CE;
  const rawX = pe(xDpi, isXHigh);
  const rawY = pe(yDpi, isYHigh);

  let dpiEx = (((rawY >> 8) & FE) << 6) | (((rawX >> 8) & FE) << 2);
  if (isXHigh) {
    dpiEx |= 2;
    if (xDpi > HE) dpiEx |= 1;
  }
  if (isYHigh) {
    dpiEx |= 32;
    if (yDpi > HE) dpiEx |= 16;
  }

  return {
    xDpi: rawX & 0xff,
    yDpi: rawY & 0xff,
    dpiEx,
  };
}

export function decodePaw3950Dpi(
  xByte: number,
  yByte: number,
  dpiEx: number,
): { xDpi: number; yDpi: number } {
  const rawX = xByte | (((12 & dpiEx) >> 2) << 8);
  const rawY = yByte | (((192 & dpiEx) >> 6) << 8);

  let xDpi = 2 & dpiEx ? 50 * rawX + ME : 10 * (rawX + 1);
  let yDpi = 32 & dpiEx ? 50 * rawY + ME : 10 * (rawY + 1);

  if (1 & dpiEx) xDpi *= 2;
  if (16 & dpiEx) yDpi *= 2;

  return { xDpi, yDpi };
}

// Packets for EEPROM read & write
export function createGetEepromPacket(
  address: number,
  length: number,
): Uint8Array {
  return buildPacket(CompxOpcode.GetEEPROM, address, length);
}

export function createSetReportRateDpiPacket(
  settings: DeviceSettings,
  /**
   * The 10 bytes read from EEPROM 0. Source je.create rewrites bhop and buttonOperationMode from the device config,
   * so their bytes (and the mode bits this app does not model) are kept as read.
   */
  read?: ArrayLike<number>,
): Uint8Array {
  const rateVal = ReportRateMap[settings.pollingRate] ?? 1;
  const maxDpi = settings.dpiStages.length;
  const currentDpi = settings.activeDpiStage;
  const bhop = 0;

  let btnOpMode = (read ? read[8] : 0) & ~0x83 & 0xff;
  if (settings.dpiButtonEnabled) btnOpMode |= 0x80;
  if (settings.fastTrigger.leftEnabled) btnOpMode |= 0x01;
  if (settings.fastTrigger.rightEnabled) btnOpMode |= 0x02;

  const data = [
    rateVal,
    (0x55 - rateVal) & 0xff,
    maxDpi,
    (0x55 - maxDpi) & 0xff,
    currentDpi,
    (0x55 - currentDpi) & 0xff,
    ...(read ? [read[6], read[7]] : [bhop, (0x55 - bhop) & 0xff]),
    btnOpMode,
    (0x55 - btnOpMode) & 0xff,
  ];

  return buildPacket(CompxOpcode.SetEEPROM, CompxAddress.reportRate, 10, data);
}

export function createSetStabilizationPacket(
  settings: DeviceSettings,
): Uint8Array {
  const debounce = Math.max(0, Math.min(20, settings.keyDebounce));
  const motionSync = settings.motionSync ? 1 : 0;
  const sleepTime = Math.floor(settings.sleepTime / 10);
  const angleSnap = settings.angleSnapping ? 1 : 0;
  const ripple = settings.rippleControl ? 1 : 0;

  const data = [
    debounce,
    (0x55 - debounce) & 0xff,
    motionSync,
    (0x55 - motionSync) & 0xff,
    sleepTime,
    (0x55 - sleepTime) & 0xff,
    angleSnap,
    (0x55 - angleSnap) & 0xff,
    ripple,
    (0x55 - ripple) & 0xff,
  ];

  return buildPacket(
    CompxOpcode.SetEEPROM,
    CompxAddress.stabilizationTime,
    10,
    data,
  );
}

/**
 * Source LOD (demoMode.store SilenceHeight @3155623 / SilenceHeightUltimate @3157575; sensor lists UUe/NUe):
 * PAW3950Ultra and PAW3955MASTER use 0.7-1.7mm in 0.1mm steps as codes 1-11; PAW3395/SE/Ultra and CORE26K offer
 * 1mm = 1 and 2mm = 2, PAW3950/DM add 0.7mm = 3; other sensors (PAW3311, PAW3315) have no LOD.
 */
export function lodOptions(sensor: string | null | undefined): number[] {
  if (sensor === "PAW3950Ultra" || sensor === "PAW3955MASTER")
    return Array.from({ length: 11 }, (_, i) => Math.round((0.7 + i / 10) * 10) / 10);
  if (sensor === "PAW3950" || sensor === "PAW3950DM") return [0.7, 1, 2];
  if (["PAW3395", "PAW3395SE", "PAW3395Ultra", "CORE26K"].includes(sensor ?? "")) return [1, 2];
  return [];
}
export function encodeLod(sensor: string | null | undefined, mm: number): number | null {
  if (!lodOptions(sensor).some((option) => Math.abs(option - mm) < 0.001)) return null;
  if (sensor === "PAW3950Ultra" || sensor === "PAW3955MASTER") return Math.round((mm - 0.7) * 10) + 1;
  return mm === 0.7 ? 3 : mm;
}
export function decodeLod(sensor: string | null | undefined, code: number): number | null {
  return lodOptions(sensor).find((mm) => encodeLod(sensor, mm) === code) ?? null;
}
export function createSetLodPacket(sensor: string | null | undefined, lod: Lod): Uint8Array {
  const val = encodeLod(sensor, lod);
  if (val === null) throw new Error(`LOD ${lod}mm is not offered for this sensor`);
  return buildPacket(CompxOpcode.SetEEPROM, CompxAddress.silentHeight, 2, [val, (0x55 - val) & 0xff]);
}

export function createSetSensorAnglePacket(
  angle: number,
  enabled: boolean,
): Uint8Array {
  const encAngle = angle < 0 ? (angle + 256) & 0xff : angle & 0xff;
  const encEnabled = enabled ? 1 : 0;
  const data = [
    encAngle,
    (0x55 - encAngle) & 0xff,
    encEnabled,
    (0x55 - encEnabled) & 0xff,
  ];
  return buildPacket(CompxOpcode.SetEEPROM, CompxAddress.angle, 4, data);
}

export function createSetFastTriggerPacket(
  settings: DeviceSettings,
): Uint8Array {
  const left = Math.max(0, Math.min(20, settings.fastTrigger.leftDelay));
  const right = Math.max(0, Math.min(20, settings.fastTrigger.rightDelay));
  const data = [left, (0x55 - left) & 0xff, right, (0x55 - right) & 0xff];
  return buildPacket(
    CompxOpcode.SetEEPROM,
    CompxAddress.fastTriggerDebounce,
    4,
    data,
  );
}

export function createSetSensorCenterPointPacket(center: {
  enable: boolean;
  x: number;
  y: number;
}): Uint8Array {
  const enable = center.enable ? 1 : 0;
  const x = Math.max(-100, Math.min(100, Math.round(center.x)));
  const y = Math.max(-100, Math.min(100, Math.round(center.y)));
  const crc = (0x55 - (x + y)) & 0xff;

  const data = [
    enable,
    (0x55 - enable) & 0xff,
    (x < 0 ? 256 + x : x) & 0xff,
    (y < 0 ? 256 + y : y) & 0xff,
    crc,
  ];
  return buildPacket(
    CompxOpcode.SetEEPROM,
    CompxAddress.sensorCenterPointV2,
    5,
    data,
  );
}

export function createSetRollingDelayPacket(delay: number): Uint8Array {
  const d = Math.max(0, Math.min(50, Math.round(delay)));
  return buildPacket(CompxOpcode.SetEEPROM, CompxAddress.rollingDelay, 2, [
    d,
    (0x55 - d) & 0xff,
  ]);
}
// Source filter-B6RHekbD.js lookup tables (hex -> target / double DPI): `le` (used by `oe`, PAW3395SE and the
// default branch, e.g. PAW3311) and `ge` (PAW3315).
type DpiTable = { hex: number; target: number; double?: number }[];
const SE_TABLE = paw3395seTable as DpiTable;
const PAW3315_TABLE = paw3315Table as DpiTable;
// Bit 1 of ex selects the doubled X value, bit 5 the doubled Y value (source reads binary digits 6 and 2).
function fromTable(table: DpiTable, xByte: number, yByte: number, dpiEx: number) {
  const x = table.find((e) => e.hex === xByte);
  const y = table.find((e) => e.hex === yByte);
  const xDpi = x && (dpiEx & 2 ? x.double : x.target);
  const yDpi = y && (dpiEx & 32 ? y.double : y.target);
  return xDpi && yDpi ? { xDpi, yDpi } : null;
}

/** Source `ue`: classic 4-byte DPI record [x, y, ex, crc] -> DPI for the given sensor, or null when unknown. */
export function decodeSensorDpi(
  sensor: string | null | undefined,
  xByte: number,
  yByte: number,
  dpiEx: number,
): { xDpi: number; yDpi: number } | null {
  const rawX = xByte | (((12 & dpiEx) >> 2) << 8);
  const rawY = yByte | (((192 & dpiEx) >> 6) << 8);
  switch (sensor) {
    case "PAW3950Ultra":
      return decodePaw3950Dpi(xByte, yByte, dpiEx);
    case "PAW3950":
    case "PAW3950DM":
    case "PAW3395Ultra":
    case "PAW3395":
      return {
        xDpi: 50 * (1 + rawX) * (dpiEx & 1 ? 2 : 1),
        yDpi: 50 * (1 + rawY) * (dpiEx & 16 ? 2 : 1),
      };
    case "CORE26K":
      return {
        xDpi: (1 + rawX) * (dpiEx & 2 ? 100 : 50) * (dpiEx & 1 ? 2 : 1),
        yDpi: (1 + rawY) * (dpiEx & 32 ? 100 : 50) * (dpiEx & 16 ? 2 : 1),
      };
    case "PAW3395SE":
    case "PAW3311":
      return fromTable(SE_TABLE, xByte, yByte, dpiEx);
    case "PAW3315":
      return fromTable(PAW3315_TABLE, xByte, yByte, dpiEx);
    default:
      return null;
  }
}

/**
 * Source `de` (filter-B6RHekbD.js): DPI -> classic 4-byte record bytes for the given sensor. Returns null unless
 * decoding the result gives back exactly the requested values, so nothing the device would store differently is
 * ever written. PAW3955MASTER uses 6-byte records at other addresses and is not encoded here.
 */
export function encodeSensorDpi(
  sensor: string | null | undefined,
  xDpi: number,
  yDpi: number,
): { xDpi: number; yDpi: number; dpiEx: number } | null {
  const low = (raw: number) => raw & 0xff;
  const high = (rawX: number, rawY: number) => (((rawY >> 8) & 3) << 6) | (((rawX >> 8) & 3) << 2);
  const table = (rows: DpiTable, x: number, y: number) => {
    const find = (v: number) => rows.find((e) => e.target === v);
    const rx = find(x), ry = find(y);
    return rx && ry ? { xDpi: rx.hex, yDpi: ry.hex, dpiEx: 0 } : null;
  };
  let encoded: { xDpi: number; yDpi: number; dpiEx: number } | null;
  switch (sensor) {
    case "PAW3950Ultra":
      encoded = encodePaw3950Dpi(xDpi, yDpi);
      break;
    case "CORE26K": {
      const rx = xDpi / 50 - 1, ry = yDpi / 50 - 1;
      encoded = { xDpi: low(rx), yDpi: low(ry), dpiEx: high(rx, ry) };
      break;
    }
    case "PAW3950":
    case "PAW3950DM":
    case "PAW3395Ultra":
    case "PAW3395": {
      const rx = xDpi / (xDpi <= HE ? 50 : 100) - 1, ry = yDpi / (yDpi <= HE ? 50 : 100) - 1;
      encoded = { xDpi: low(rx), yDpi: low(ry), dpiEx: high(rx, ry) | (xDpi > HE ? 1 : 0) | (yDpi > HE ? 16 : 0) };
      break;
    }
    case "PAW3315":
      encoded = table(PAW3315_TABLE, xDpi, yDpi);
      break;
    case "PAW3395SE":
    case "PAW3311":
      encoded = table(SE_TABLE, xDpi, yDpi);
      break;
    default:
      return null;
  }
  if (!encoded) return null;
  const back = decodeSensorDpi(sensor, encoded.xDpi, encoded.yDpi, encoded.dpiEx);
  return back?.xDpi === xDpi && back.yDpi === yDpi ? encoded : null;
}

/**
 * Source Wt.getMouseInfo: ze.get = DownLoadData at address 0, length 8, four random challenge bytes. The reply carries
 * CID (byte 9), MID (10) and the connect type (11; dongle1K=0, dongle4K=1, wired1K=2, wired8K=3, dongle2K=4,
 * dongle8K=5, wired2K=6, wired4K=7, nearlink=8). This exact shape is a read; every other DownLoadData stays blocked.
 */
export function createMouseInfoQuery(challenge: ArrayLike<number>) {
  return buildPacket(CompxOpcode.DownLoadData, 0, 8, [...Array.from(challenge).slice(0, 4), 0, 0, 0, 0]);
}
export function isMouseInfoQuery(packet: Uint8Array) {
  return (
    packet[0] === CompxOpcode.DownLoadData &&
    packet[2] === 0 &&
    packet[3] === 0 &&
    packet[4] === 8 &&
    packet.slice(9, 15).every((b) => b === 0)
  );
}

/** Source Qe.create / Ct (filter-B6RHekbD.js): PAW3955MASTER 6-byte record [xLo, xHi, yLo, yHi, ex, crc]. */
export function encodePaw3955Dpi(xDpi: number, yDpi: number) {
  const raw = (dpi: number) => {
    const t = Math.max(1, Math.floor(dpi));
    if (t < 40000) return { base: t - 1, mult: false };
    return { base: Math.min((t % 2 === 0 ? t : t - 1) / 2 - 1, 65535), mult: true };
  };
  const x = raw(xDpi), y = raw(yDpi);
  const bytes = [x.base & 255, (x.base >> 8) & 255, y.base & 255, (y.base >> 8) & 255, (x.mult ? 1 : 0) | (y.mult ? 16 : 0)];
  return [...bytes, (0x55 - (bytes.reduce((a, b) => a + b, 0) & 255)) & 255];
}
