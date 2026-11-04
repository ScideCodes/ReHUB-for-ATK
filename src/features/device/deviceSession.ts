import {
  mouseModelFeatures,
  readableMouseIdentity,
  untestedMouseIdentity,
  writableMouseIdentity,
} from "../../devices/mouseProtocols";
import { validateDeviceSnapshot, type DeviceReadIssue } from "./deviceRead";
import { settingLabel } from "../shared/settingLabels";
import { create } from "zustand";
import { hidClient } from "../../hid/hidClient";
import { useConfigStore } from "../../store/configStore";
import {
  DeviceSettingsSchema,
  type DeviceSettings,
  type DeviceDefinition,
} from "../../types/schema";
import { findDeviceSpec } from "./deviceCatalog";
import type { MouseFinish } from "../../ui/finishTheme";
import {
  CompxAddress as Address,
  CompxOpcode as Opcode,
  ReportRateReverseMap,
} from "../../protocol/constants";
import {
  REPORT_ID,
  buildPacket,
  calcChecksum,
  createGetEepromPacket,
  createSetFastTriggerPacket,
  createSetLodPacket,
  createSetSensorAnglePacket,
  createSetReportRateDpiPacket,
  createSetRollingDelayPacket,
  createSetSensorCenterPointPacket,
  createSetStabilizationPacket,
  decodeSensorDpi,
  encodeSensorDpi,
  encodePaw3955Dpi,
  encodeLod,
  decodeLod,
  isMouseInfoQuery,
} from "../../protocol/codec";
import { clone } from "../maps/mapSession";

export interface HidLog {
  id: number;
  time: number;
  direction: "in" | "out" | "warning" | "error";
  hex: string;
  message: string;
}
interface DeviceSessionState {
  demoReason?: string;
  applyError?: string;
  appliedAt?: number;
  safeMode: boolean;
  busy: boolean;
  progress: number;
  success: boolean;
  logs: HidLog[];
  skipped: string[];
  skin: MouseFinish;
  readIssues: DeviceReadIssue[];
}
export const useDeviceSession = create<DeviceSessionState>(() => ({
  safeMode: true,
  busy: false,
  progress: 0,
  success: false,
  logs: [],
  skipped: [],
  readIssues: [],
  skin: "ice",
}));
const allowed = new Set([
  1, 2, 3, 4, 6, 7, 8, 9, 14, 15, 16, 18, 20, 21, 22, 23, 24, 25, 29,
]);
let logId = 0;
/** Source sensorModel codes (keyboard.assets enum p): Base 0, Athletics 1, AthleticsMax 2. */
export const SENSOR_MODES = ["LP", "HP", "MAX"] as const;
/** Last EEPROM 0 block read (source je): bhop and unmodelled button-mode bits are rewritten as read. */
let readReportBlock: number[] | undefined;
let installed = false;
let mockSettings = DeviceSettingsSchema.parse({});
let pushRefresh: ReturnType<typeof setTimeout> | undefined;
let pushFlags = 0;
let initialization: Promise<void> | undefined;
const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const pair = (value: number) => [value & 255, (0x55 - value) & 255];
const different = (a: unknown, b: unknown) =>
  JSON.stringify(a) !== JSON.stringify(b);
export const isKnownDevice = () => {
  const info = useConfigStore.getState().deviceInfo;
  return (
    info.connected &&
    ((info.cid === 1 && info.mid === 4) ||
      Boolean(findDeviceSpec(info.cid, info.mid)) ||
      // Source-readable identities are known even without a catalog entry.
      (!info.isMock && readableMouseIdentity(info.vendorId, info.productId, info.cid, info.mid)))
  );
};

export function isMouseSessionVerified() {
  const info = useConfigStore.getState().deviceInfo;
  return (
    info.isMock ||
    writableMouseIdentity(info.vendorId, info.productId, info.cid, info.mid)
  );
}

/** Connected mouse is in the untested write tier (writes only after the user opts in for this connection). */
export function isMouseSessionUntested() {
  const info = useConfigStore.getState().deviceInfo;
  return !info.isMock && untestedMouseIdentity(info.vendorId, info.productId, info.cid, info.mid);
}

/**
 * Untested tier: keep settings the original hides for this model (source custom flags, catalog limits) at their read
 * values. Returns the adjusted target and one message per held change.
 */
// Source polling choices by connect type (demoMode.store L @3069190): 125-1000 always; 2K/4K/8K on wired8K (3),
// dongle8K (5) and nearlink (8); 2K/4K on dongle4K (1); 2K on dongle2K (4).
export function sourcePollingMax(connectType: number | undefined) {
  if (connectType === undefined) return 1000;
  if ([3, 5, 8].includes(connectType)) return 8000;
  if (connectType === 1) return 4000;
  if (connectType === 4) return 2000;
  return 1000;
}

export function holdUnsupportedForModel(
  target: DeviceSettings,
  previous: DeviceSettings,
  cid: number,
  mid: number,
  connectType?: number,
) {
  const features = mouseModelFeatures(cid, mid);
  const spec = findDeviceSpec(cid, mid);
  const next = clone(target);
  const held: string[] = [];
  const hold = <K extends keyof DeviceSettings>(key: K, when: boolean, message: string) => {
    if (!when || !different(next[key], previous[key])) return;
    next[key] = clone(previous[key]);
    held.push(message);
  };
  hold("longDistanceMode", !features.farDistance, "Long distance mode is not offered for this model");
  hold("keyDebounce", !features.zeroDebounce && next.keyDebounce === 0, "0 ms debounce is not offered for this model");
  // Source WUe: dongle RGB on dongle8K / nearlink unless the model opts out.
  hold("dongleRgbMode", !features.dongleRgb || ![5, 8].includes(connectType ?? -1), "Dongle lighting is not offered for this connection");
  hold("pollingRate", next.pollingRate > sourcePollingMax(connectType), "Polling rate is above what this connection offers");
  // Source sensor-angle gate: CID 1 always; CID 2 needs a server firmware threshold we do not have offline.
  const angle = cid === 1 || !!spec?.hasSensorAngle;
  hold("sensorAngle", !angle, "Sensor rotation is not offered for this model");
  // Source performance UI: Competitive MAX always on CID 1; CID 2 needs a server firmware threshold (not offline).
  hold("sensorPowerMode", next.sensorPowerMode === "MAX" && cid !== 1, "Competitive MAX is not offered for this model");
  hold("sensorAngleEnabled", !angle, "Sensor rotation is not offered for this model");
  if (!features.fastTrigger && different(next.fastTrigger, previous.fastTrigger)) {
    next.fastTrigger = clone(previous.fastTrigger);
    held.push("Fast trigger is not offered for this model");
  }
  return { target: next, held: [...new Set(held)] };
}

/** Source et codec record [r, g, b, 0x55 - (r + g + b)] -> "#RRGGBB", or null on a bad checksum. */
export function decodeDpiColor([r, g, b, check]: readonly number[] | Uint8Array) {
  if (((0x55 - ((r + g + b) & 255)) & 255) !== check) return null;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Source Qe codec: [xLo, xHi, yLo, yHi, ex, crc]; value (lo | hi << 8) + 1, doubled by ex bit 0 (X) / bit 4 (Y). */
export function decodePaw3955Dpi(bytes: readonly number[] | Uint8Array) {
  const [xl, xh, yl, yh, ex, crc] = bytes;
  if (((0x55 - ((xl + xh + yl + yh + ex) & 255)) & 255) !== crc) return null;
  return {
    xDpi: ((xl | (xh << 8)) + 1) * (ex & 1 ? 2 : 1),
    yDpi: ((yl | (yh << 8)) + 1) * (ex & 16 ? 2 : 1),
  };
}

/** Reads allowed (connect + EEPROM/status reads); writes still need isMouseSessionVerified. */
export function isMouseSessionReadable() {
  const info = useConfigStore.getState().deviceInfo;
  return (
    info.isMock ||
    readableMouseIdentity(info.vendorId, info.productId, info.cid, info.mid)
  );
}

export function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0").toUpperCase(),
  ).join(" ");
}
export function parseHexFrame(text: string) {
  const parts = text.trim().split(/[\s,]+/);
  if (
    parts.length !== 16 ||
    parts.some((part) => !/^(?:0x)?[0-9a-f]{2}$/i.test(part))
  )
    throw new Error(
      "Enter exactly 16 hexadecimal bytes, excluding report ID 08.",
    );
  return new Uint8Array(
    parts.map((part) => parseInt(part.replace(/^0x/i, ""), 16)),
  );
}
function appendLog(
  direction: HidLog["direction"],
  bytes: Uint8Array | undefined,
  message: string,
) {
  useDeviceSession.setState((state) => ({
    logs: [
      ...state.logs,
      {
        id: ++logId,
        time: Date.now(),
        direction,
        hex: bytes ? hex(bytes) : "",
        message,
      },
    ].slice(-500),
  }));
}

export interface SendOptions {
  factoryConfirmed?: boolean;
  timeout?: number;
}
export function validateOutgoing(
  packet: Uint8Array,
  safe: boolean,
  hardware: boolean,
  options: SendOptions = {},
) {
  if (packet.length !== 16)
    throw new Error("A HID frame must contain 16 bytes.");
  if (packet[4] > 10 || (packet[0] === Opcode.SetEEPROM && packet[4] < 1))
    throw new Error("Invalid payload length.");
  if (packet[15] !== calcChecksum(REPORT_ID, packet.subarray(0, 15)))
    throw new Error("The outgoing checksum is invalid.");
  if ([5, 10, 13, 19, 90, 91].includes(packet[0]))
    throw new Error("Pairing, firmware, and device-event opcodes are blocked.");
  if (safe && !allowed.has(packet[0]))
    throw new Error("Safe mode blocks this opcode.");
  if (packet[0] === Opcode.RestoreFactory && !options.factoryConfirmed)
    throw new Error("Factory reset requires confirmation.");
  if (packet[0] === Opcode.SetDongleLightMode)
    throw new Error("This model does not support dongle RGB effects.");
  if (hardware && packet[0] === Opcode.DownLoadData && !isMouseInfoQuery(packet))
    throw new Error("DownLoadData needs packet verification.");
  if (packet[0] === Opcode.SetEEPROM) {
    const start = (packet[2] << 8) | packet[3];
    const end = start + packet[4] - 1;
    if (start <= 166 && end >= 160)
      throw new Error("Strip lighting is unsupported.");
    // EEPROM 185-186 (sensorModel) follows source st.create now; macro/profile storage stays blocked.
    if (hardware && start <= 6528 && end >= 256)
      throw new Error("This EEPROM write needs packet verification.");
  }
}

export function createPacketQueue(
  send: (packet: Uint8Array, timeout: number) => Promise<DataView>,
  options: {
    safe: () => boolean;
    hardware: () => boolean;
    canWrite?: () => boolean;
    connectionKey?: () => string;
    wait?: typeof wait;
    log?: (
      direction: HidLog["direction"],
      bytes: Uint8Array | undefined,
      message: string,
    ) => void;
  },
) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastWrite = 0;
  return (input: Uint8Array, context: SendOptions = {}) => {
    const packet = new Uint8Array(input);
    const connection = options.connectionKey?.();
    const run = async () => {
      if (options.connectionKey && connection !== options.connectionKey())
        throw new Error("The device connection changed during this command.");
      validateOutgoing(packet, options.safe(), options.hardware(), context);
      if (
        options.canWrite &&
        !options.canWrite() &&
        [1, 2, 7, 9, 15, 20, 22, 24].includes(packet[0]) &&
        !isMouseInfoQuery(packet)
      )
        throw new Error("Generic mode: settings writes are disabled.");
      for (let attempt = 0; attempt <= 3; attempt += 1) {
        await (options.wait ?? wait)(
          Math.max(0, 20 - (Date.now() - lastWrite)),
        );
        if (options.connectionKey && connection !== options.connectionKey())
          throw new Error("The device connection changed during this command.");
        lastWrite = Date.now();
        options.log?.(
          "out",
          packet,
          `Report 08${attempt ? ` · retry ${attempt}` : ""}`,
        );
        let response: DataView;
        try {
          response = await send(packet, context.timeout ?? 1000);
        } catch (error) {
          options.log?.(
            "error",
            undefined,
            error instanceof Error ? error.message : "Transfer failed.",
          );
          if (
            attempt === 3 ||
            !(error instanceof Error) ||
            !/timeout/i.test(error.message)
          )
            throw error;
          continue;
        }
        const bytes = new Uint8Array(
          response.buffer,
          response.byteOffset,
          response.byteLength,
        );
        options.log?.("in", bytes, "Report 08");
        if (bytes.length < 16)
          throw new Error("The response frame is shorter than 16 bytes.");
        if (bytes[15] !== calcChecksum(REPORT_ID, bytes.subarray(0, 15)))
          options.log?.(
            "warning",
            bytes,
            "Incoming checksum mismatch; response accepted.",
          );
        if (bytes[0] !== packet[0])
          throw new Error(
            "The mouse replied to a different command. Read the device again.",
          );
        if (bytes[1] !== 0)
          throw new Error(`Device returned status ${bytes[1]}.`);
        if (
          packet[0] === Opcode.GetEEPROM &&
          (bytes[4] < packet[4] || bytes[4] > 10)
        )
          throw new Error(
            "The mouse returned an incomplete EEPROM response. Read the device again.",
          );
        if (
          packet[0] === Opcode.GetEEPROM &&
          (bytes[2] !== packet[2] || bytes[3] !== packet[3])
        )
          throw new Error(
            "The mouse replied with a different EEPROM address. Read the device again.",
          );
        return response;
      }
      throw new Error("Transfer retries exhausted.");
    };
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    return result;
  };
}

let queuedSend: ReturnType<typeof createPacketQueue>;
export function installDeviceBridge() {
  if (installed) return;
  installed = true;
  const original = hidClient.transfer.bind(hidClient);
  queuedSend = createPacketQueue(original, {
    safe: () => useDeviceSession.getState().safeMode,
    hardware: () => !hidClient.getDeviceInfo().isMock,
    canWrite: () => isKnownDevice() && isMouseSessionVerified(),
    connectionKey: () => {
      const info = hidClient.getDeviceInfo();
      return `${hidClient.sessionGeneration}:${info.connected}:${info.vendorId}:${info.productId}:${info.serial}`;
    },
    log: appendLog,
  });
  hidClient.transfer = (packet, timeout) => queuedSend(packet, { timeout });
  const previousStatus = hidClient.onStatusChange;
  hidClient.onStatusChange = (info) => {
    const wasConnected = useConfigStore.getState().deviceInfo.connected;
    previousStatus?.(info);
    if (!previousStatus) useConfigStore.setState({ deviceInfo: info });
    if (!info.connected)
      useDeviceSession.setState({ readIssues: [], demoReason: undefined });
    if (info.connected && !wasConnected && !useDeviceSession.getState().busy)
      void deviceOperation(() => refreshDevice()).catch((error) =>
        appendLog("error", undefined, String(error)),
      );
  };
  const previousPush = hidClient.onPushReport;
  hidClient.onPushReport = (opcode, data) => {
    previousPush?.(opcode, data);
    if (opcode !== Opcode.ReportMouseStatus) return;
    appendLog("in", data, "Device settings changed");
    if (
      data.length >= 16 &&
      data[15] !== calcChecksum(REPORT_ID, data.subarray(0, 15))
    )
      appendLog("warning", data, "Incoming checksum mismatch; push accepted.");
    pushFlags |= data[5] ?? 0;
    if (pushRefresh) clearTimeout(pushRefresh);
    pushRefresh = setTimeout(() => {
      const flags = pushFlags;
      pushFlags = 0;
      if (useConfigStore.getState().deviceInfo.connected)
        void refreshDevice(flags).catch((error) =>
          appendLog("error", undefined, String(error)),
        );
    }, 80);
  };
}
export async function sendPacket(packet: Uint8Array, options?: SendOptions) {
  installDeviceBridge();
  const connection = hidClient.getDeviceInfo();
  const response = await queuedSend(packet, options);
  if (!connection.isMock) {
    const readOpcode =
      packet[0] === Opcode.SetEEPROM
        ? Opcode.GetEEPROM
        : packet[0] === Opcode.SetCurrentConfig
          ? Opcode.GetCurrentConfig
          : packet[0] === Opcode.Set4KRGBMode
            ? Opcode.Get4KRGBMode
            : packet[0] === Opcode.SetFarDistanceMode
              ? Opcode.GetFarDistanceMode
              : undefined;
    if (readOpcode !== undefined) {
      const eeprom = packet[0] === Opcode.SetEEPROM;
      const address = eeprom ? (packet[2] << 8) | packet[3] : 0;
      const length = eeprom ? packet[4] : 1;
      const readback = await queuedSend(
        buildPacket(readOpcode, address, length),
      );
      const current = hidClient.getDeviceInfo();
      if (
        !current.connected ||
        current.isMock ||
        current.serial !== connection.serial ||
        current.vendorId !== connection.vendorId ||
        current.productId !== connection.productId
      )
        throw new Error("The device connection changed during readback.");
      for (let index = 0; index < length; index++)
        if (readback.getUint8(5 + index) !== packet[5 + index]) {
          hidClient.diagnostics.error(new Error("readback mismatch"));
          throw new Error(
            `Mouse readback mismatch for ${eeprom ? `EEPROM 0x${address.toString(16)}` : `opcode 0x${packet[0].toString(16)}`}. Settings were not confirmed.`,
          );
        }
    }
  }
  if (hidClient.getDeviceInfo().isMock) {
    if (packet[0] === Opcode.SetFarDistanceMode)
      mockSettings.longDistanceMode = packet[5] === 1;
    if (packet[0] === Opcode.Set4KRGBMode)
      mockSettings.dongleRgbMode = packet[5];
    if (packet[0] === Opcode.SetEEPROM) {
      const address = (packet[2] << 8) | packet[3];
      if (address === Address.sensorEnable && packet[4] >= 4) {
        mockSettings.sensorSleepEnabled = packet[5] === 1;
        mockSettings.sensorSleepTime = packet[7] * 10;
        if (packet[4] >= 6) mockSettings.sensorPowerMode = SENSOR_MODES[packet[9]] ?? mockSettings.sensorPowerMode;
      }
      if (address === Address.rollingDelay && packet[4] >= 2)
        mockSettings.rollingDelay = packet[5];
      if (
        address >= Address.key0 &&
        address <= Address.key4 &&
        (address - Address.key0) % 4 === 0 &&
        packet[4] >= 4
      ) {
        const index = (address - Address.key0) / 4;
        if (mockSettings.buttons[index])
          mockSettings.buttons[index] = {
            ...mockSettings.buttons[index],
            keyClass: packet[5],
            keyValue1: packet[6],
            keyValue2: packet[7],
          };
      }
    }
  }
  return response;
}
async function readBytes(address: number, length: number) {
  const response = await sendPacket(createGetEepromPacket(address, length));
  return new Uint8Array(
    response.buffer,
    response.byteOffset + 5,
    length,
  ).slice();
}

export async function readEepromRange(start: number, length: number) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(length) ||
    start < 0 ||
    length < 1 ||
    start + length > 65536
  )
    throw new Error(
      "Use an address and length within the 16-bit EEPROM range.",
    );
  const result = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 10)
    result.set(
      await readBytes(start + offset, Math.min(10, length - offset)),
      offset,
    );
  return result;
}

async function readSettings(flags = 0xff) {
  const previous = useConfigStore.getState().activeSettings;
  const current = clone(previous);
  const invalidReads: DeviceReadIssue[] = [];
  const invalid = (
    key: keyof DeviceSettings,
    received: unknown,
    message: string,
  ) => {
    invalidReads.push({
      key,
      path: key,
      label: settingLabel(key),
      received,
      message,
    });
  };
  const boolean = (
    key: keyof DeviceSettings,
    value: number,
    fallback: boolean,
  ) => {
    if (value === 0 || value === 1) return value === 1;
    invalid(key, value, "Expected an on/off value of 0 or 1.");
    return fallback;
  };
  const info = useConfigStore.getState().deviceInfo;
  const features = mouseModelFeatures(info.cid, info.mid);
  const all = flags === 0xff || Boolean(flags & 4);
  if (all || flags & 3) {
    const base = await readBytes(Address.reportRate, 10);
    // Source je.create rewrites bhop / buttonOperationMode from the config it read; keep them so writes never reset them.
    readReportBlock = [...base];
    if (ReportRateReverseMap[base[0]])
      current.pollingRate = ReportRateReverseMap[
        base[0]
      ] as DeviceSettings["pollingRate"];
    else invalid("pollingRate", base[0], "Unknown polling-rate code.");
    const validCount = base[2] >= 1 && base[2] <= 8;
    const count = validCount ? base[2] : previous.dpiStages.length;
    if (!validCount)
      invalid("dpiStages", base[2], "The stage count must be between 1 and 8.");
    current.activeDpiStage = base[4];
    current.dpiButtonEnabled = Boolean(base[8] & 128);
    current.fastTrigger.leftEnabled = Boolean(base[8] & 1);
    current.fastTrigger.rightEnabled = Boolean(base[8] & 2);
    if (
      validCount &&
      (all || flags & 1 || count !== current.dpiStages.length)
    ) {
      const stages: DeviceSettings["dpiStages"] = [];
      if (features.paw3955 && !info.isMock)
        for (let index = 0; index < count; index += 1) {
          const dpi = decodePaw3955Dpi(await readBytes(Address.paw3955Dpi1 + index * 6, 6));
          if (!dpi) invalid("dpiStages", index, "PAW3955 DPI record checksum mismatch.");
          stages.push({
            stage: index,
            ...(dpi ?? { xDpi: previous.dpiStages[index]?.xDpi ?? 800, yDpi: previous.dpiStages[index]?.yDpi ?? 800 }),
            color: current.dpiStages[index]?.color ?? "#FF6A1A",
            enabled: true,
          });
        }
      else for (let index = 0; index < count; index += 2) {
        const bytes = await readBytes(Address.dpi1 + index * 4, 8);
        for (let item = 0; item < 2 && index + item < count; item += 1) {
          const offset = item * 4;
          // ZERO EX (and mock) keep the PAW3950Ultra codec; other models decode per source sensor.
          const sensor = info.isMock || !features.sensor ? "PAW3950Ultra" : features.sensor;
          const dpi = decodeSensorDpi(sensor, bytes[offset], bytes[offset + 1], bytes[offset + 2]);
          if (!dpi) invalid("dpiStages", bytes[offset], `Unknown ${sensor} DPI code.`);
          stages.push({
            stage: index + item,
            ...(dpi ?? { xDpi: previous.dpiStages[index + item]?.xDpi ?? 800, yDpi: previous.dpiStages[index + item]?.yDpi ?? 800 }),
            color: current.dpiStages[index + item]?.color ?? "#FF6A1A",
            enabled: true,
          });
        }
      }
      if (features.dpiRgb && !info.isMock)
        for (let index = 0; index < stages.length; index += 2) {
          // Source et codec: two stages per 8 bytes, [r, g, b, 0x55 - (r + g + b)].
          const bytes = await readBytes(Address.dpi1Color + index * 4, 8);
          for (let item = 0; item < 2 && stages[index + item]; item += 1) {
            const color = decodeDpiColor(bytes.slice(item * 4, item * 4 + 4));
            if (color) stages[index + item].color = color;
            else invalid("dpiStages", bytes[item * 4 + 3], "DPI colour checksum mismatch.");
          }
        }
      current.dpiStages = stages;
    }
  }
  if (all) {
    const stable = await readBytes(Address.stabilizationTime, 10);
    current.keyDebounce = stable[0];
    current.motionSync = boolean("motionSync", stable[2], previous.motionSync);
    current.sleepTime = stable[4] * 10;
    current.angleSnapping = boolean(
      "angleSnapping",
      stable[6],
      previous.angleSnapping,
    );
    current.rippleControl = boolean(
      "rippleControl",
      stable[8],
      previous.rippleControl,
    );
    const lod = await readBytes(Address.silentHeight, 2);
    const lodMm = decodeLod(info.isMock ? "PAW3950Ultra" : features.sensor, lod[0]);
    if (lodMm !== null) current.lod = lodMm;
    else invalid("lod", lod[0], "Unknown lift-off-distance code.");
    const delays = await readBytes(Address.fastTriggerDebounce, 4);
    current.fastTrigger.leftDelay = delays[0];
    current.fastTrigger.rightDelay = delays[2];
    if (info.isMock || (info.cid === 1 && info.mid === 4) || features.centerPoint) {
      const center = await readBytes(Address.sensorCenterPointV2, 5);
      current.sensorCenterPoint = {
        enable: boolean(
          "sensorCenterPoint",
          center[0],
          previous.sensorCenterPoint.enable,
        ),
        x: center[2] > 127 ? center[2] - 256 : center[2],
        y: center[3] > 127 ? center[3] - 256 : center[3],
      };
    }
    if (info.isMock) {
      for (const key of [
        "sensorPowerMode",
        "sensorAngle",
        "sensorAngleEnabled",
        "sensorSleepEnabled",
        "sensorSleepTime",
        "rollingDelay",
        "longDistanceMode",
        "dongleRgbMode",
        "buttons",
      ] as const)
        Object.assign(current, { [key]: clone(mockSettings[key]) });
    } else if (isKnownDevice()) {
      // Source st block: sleep enabled, sleep time / 10, sensorModel, each with its 0x55 crc.
      const standby = await readBytes(Address.sensorEnable, 6);
      current.sensorSleepEnabled = boolean(
        "sensorSleepEnabled",
        standby[0],
        previous.sensorSleepEnabled,
      );
      current.sensorSleepTime = standby[2] * 10;
      const sensorMode = SENSOR_MODES[standby[4]];
      if (sensorMode && ((0x55 - standby[4]) & 255) === standby[5]) current.sensorPowerMode = sensorMode;
      else invalid("sensorPowerMode", standby[4], "Unknown sensor performance mode.");
      const wheel = await readBytes(Address.rollingDelay, 2);
      current.rollingDelay = wheel[0];
      const angleBytes = await readBytes(Address.angle, 4);
      const rawAngle = angleBytes[0];
      current.sensorAngle = rawAngle > 128 ? rawAngle - 256 : rawAngle;
      current.sensorAngleEnabled = boolean(
        "sensorAngleEnabled",
        angleBytes[2],
        previous.sensorAngleEnabled,
      );
      // key5 (bottom button) exists only on models whose source profile lacks noBottomButton.
      const keyCount = features.bottomButton ? 6 : 5;
      for (let index = 0; index < keyCount; index += 2) {
        const bytes = await readBytes(
          Address.key0 + index * 4,
          index + 1 < keyCount ? 8 : 4,
        );
        for (let item = 0; item < 2 && index + item < keyCount; item += 1) {
          const offset = item * 4;
          const previous = current.buttons[index + item];
          if (previous)
            current.buttons[index + item] = {
              ...previous,
              keyClass: bytes[offset],
              keyValue1: bytes[offset + 1],
              keyValue2: bytes[offset + 2],
            };
        }
      }
      current.longDistanceMode = boolean(
        "longDistanceMode",
        (await sendPacket(buildPacket(Opcode.GetFarDistanceMode))).getUint8(5),
        previous.longDistanceMode,
      );
      if (info.connectionMode === "wireless_dongle" || info.isMock)
        try {
          current.dongleRgbMode = (
            await sendPacket(buildPacket(Opcode.Get4KRGBMode))
          ).getUint8(5);
        } catch {
          // Some dongle variants do not support the RGB mode query.
        }
    }
  }
  const keys = all
    ? (Object.keys(current) as (keyof DeviceSettings)[])
    : [
        ...(flags & 3
          ? ([
              "pollingRate",
              "activeDpiStage",
              "dpiButtonEnabled",
              "fastTrigger",
            ] as const)
          : []),
        ...(flags & 3 ? (["dpiStages"] as const) : []),
      ];
  const result = validateDeviceSnapshot(current, previous, keys);
  result.issues.push(...invalidReads);
  useDeviceSession.setState((state) => ({
    readIssues: [
      ...state.readIssues.filter((issue) => !keys.includes(issue.key)),
      ...result.issues,
    ],
  }));
  result.issues.forEach((issue) =>
    appendLog(
      "warning",
      undefined,
      `${issue.label}: device value ${JSON.stringify(issue.received)} is unsupported. ${issue.message} Previous valid value retained; related hardware writes skipped.`,
    ),
  );
  return result.settings;
}

export async function refreshDevice(flags = 0xff) {
  if (!isMouseSessionReadable()) return;
  const store = useConfigStore.getState();
  if (!store.deviceInfo.connected) return;
  if (flags === 0xff || flags & 4) {
    const info = await hidClient.identifyDevice();
    useConfigStore.setState({ deviceInfo: info });
  } else if (flags & 64) {
    const response = await sendPacket(buildPacket(Opcode.GetBatteryLevel));
    useConfigStore.setState((state) => ({
      deviceInfo: {
        ...state.deviceInfo,
        batteryLevel: response.getUint8(5),
        isCharging: response.getUint8(6) === 1,
        voltageMv: response.getUint16(7, false),
      },
    }));
  }
  if ((flags === 0xff || flags & 7) && isKnownDevice())
    useConfigStore.setState({ activeSettings: await readSettings(flags) });
}

export function buildApplyPlan(
  target: DeviceSettings,
  previous: DeviceSettings,
  mock: boolean,
  unavailable: readonly (keyof DeviceSettings)[] = [],
  sensor: string | null = "PAW3950Ultra",
) {
  const effective = DeviceSettingsSchema.parse(target);
  const buttonOrder = ["left", "right", "middle", "side1", "side2", "bottom"];
  effective.buttons.sort(
    (a, b) => buttonOrder.indexOf(a.id) - buttonOrder.indexOf(b.id),
  );
  const skipped: string[] = [];
  if (!mock && unavailable.length) {
    const groups: (keyof DeviceSettings)[][] = [
      [
        "pollingRate",
        "activeDpiStage",
        "dpiButtonEnabled",
        "dpiStages",
        "fastTrigger",
      ],
      ["lod"],
      [
        "keyDebounce",
        "motionSync",
        "sleepTime",
        "angleSnapping",
        "rippleControl",
      ],
      ["sensorCenterPoint"],
      ["rollingDelay"],
      ["sensorSleepEnabled", "sensorSleepTime", "sensorPowerMode"],
      ["longDistanceMode"],
      ["dongleRgbMode"],
      ["buttons"],
    ];
    for (const group of groups) {
      const invalid = group.filter((key) => unavailable.includes(key));
      if (!invalid.length) continue;
      if (group.some((key) => different(target[key], previous[key])))
        skipped.push(
          `${invalid.map(settingLabel).join(", ")} could not be read; related settings were skipped`,
        );
      for (const key of group)
        Object.assign(effective, { [key]: clone(previous[key]) });
    }
  }
  const packets: Uint8Array[] = [];
  if (!mock) {
    // Source: filter-B6RHekbD.js:59520 (ct), VelotaSkinPreviewTransition-BnQjDZKg.js:404927 (angle sign encoding).
    // Sensor rotation write is proven (two's complement uint8 at EEPROM 189 with readback).
    effective.buttons = effective.buttons.map((button) => {
      const previousButton = previous.buttons.find(
        (item) => item.id === button.id,
      );
      if ([5, 6].includes(button.keyClass)) {
        if (different(button, previousButton))
          skipped.push(`${button.label}: sequence needs packet verification`);
        return clone(
          previousButton ??
            DeviceSettingsSchema.parse({}).buttons.find(
              (item) => item.id === button.id,
            )!,
        );
      }
      return button;
    });
  }
  effective.buttons = effective.buttons.map((button) => {
    const previousButton = previous.buttons.find(
      (item) => item.id === button.id,
    );
    if (button.id === "bottom" || button.keyClass === 8) {
      if (different(button, previousButton))
        skipped.push(
          button.id === "bottom"
            ? "Bottom button is unsupported"
            : "Chandeliers is unsupported",
        );
      return clone(
        previousButton ??
          DeviceSettingsSchema.parse({}).buttons.find(
            (item) => item.id === button.id,
          )!,
      );
    }
    return button;
  });
  // PAW3955MASTER (source _setMouseDpiValuesBy3955): one 6-byte Qe record per stage at paw3955Dpi1 + 6 * stage.
  if (sensor === "PAW3955MASTER")
    effective.dpiStages.forEach((stage, index) => {
      const old = previous.dpiStages[index];
      if (old && old.xDpi === stage.xDpi && old.yDpi === stage.yDpi) return;
      const bytes = encodePaw3955Dpi(stage.xDpi, stage.yDpi);
      const back = decodePaw3955Dpi(bytes);
      if (back?.xDpi !== stage.xDpi || back.yDpi !== stage.yDpi) {
        skipped.push(`DPI ${index + 1}: a value this sensor cannot store exactly was skipped`);
        if (old) effective.dpiStages[index] = clone(old);
        return;
      }
      packets.push(buildPacket(Opcode.SetEEPROM, Address.paw3955Dpi1 + index * 6, 6, bytes));
    });
  else for (let index = 0; index < effective.dpiStages.length; index += 2) {
    if (
      !different(
        effective.dpiStages
          .slice(index, index + 2)
          .map(({ xDpi, yDpi }) => [xDpi, yDpi]),
        previous.dpiStages
          .slice(index, index + 2)
          .map(({ xDpi, yDpi }) => [xDpi, yDpi]),
      )
    )
      continue;
    const data: number[] = [];
    const encodedPair = [0, 1].map((item) => {
      const stage = effective.dpiStages[index + item] ?? effective.dpiStages[index];
      return encodeSensorDpi(sensor, stage.xDpi, stage.yDpi);
    });
    if (encodedPair.some((encoded) => !encoded)) {
      skipped.push(`DPI ${index + 1}-${index + 2}: a value this sensor cannot store exactly was skipped`);
      for (let item = index; item < index + 2; item += 1)
        if (previous.dpiStages[item] && effective.dpiStages[item])
          effective.dpiStages[item] = clone(previous.dpiStages[item]);
      continue;
    }
    for (const encoded of encodedPair as NonNullable<(typeof encodedPair)[number]>[]) {
      data.push(
        encoded.xDpi,
        encoded.yDpi,
        encoded.dpiEx,
        (0x55 - encoded.xDpi - encoded.yDpi - encoded.dpiEx) & 255,
      );
    }
    packets.push(
      buildPacket(Opcode.SetEEPROM, Address.dpi1 + index * 4, 8, data),
    );
  }
  // Source setMouseSleepTime also writes the st block with sensor sleep on and the same time (sensorSleepTime = sleepTime).
  if (effective.sleepTime !== previous.sleepTime && !unavailable.includes("sensorSleepTime")) {
    if (DeviceSettingsSchema.shape.sensorSleepTime.safeParse(effective.sleepTime).success) {
      effective.sensorSleepEnabled = true;
      effective.sensorSleepTime = effective.sleepTime;
    } else skipped.push("Deep sleep was updated; the standby timer keeps its independently supported value.");
  }
  const changed = (keys: (keyof DeviceSettings)[]) =>
    keys.some((key) => different(effective[key], previous[key]));
  if (
    changed(["pollingRate", "activeDpiStage", "dpiButtonEnabled"]) ||
    effective.dpiStages.length !== previous.dpiStages.length ||
    effective.fastTrigger.leftEnabled !== previous.fastTrigger.leftEnabled ||
    effective.fastTrigger.rightEnabled !== previous.fastTrigger.rightEnabled
  )
    packets.push(createSetReportRateDpiPacket(effective, mock ? undefined : readReportBlock));
  if (changed(["lod"])) {
    if (encodeLod(sensor, effective.lod) === null) {
      skipped.push("LOD: this value is not offered for this sensor");
      effective.lod = previous.lod;
    } else packets.push(createSetLodPacket(sensor, effective.lod));
  }
  if (
    changed([
      "keyDebounce",
      "motionSync",
      "sleepTime",
      "angleSnapping",
      "rippleControl",
    ])
  )
    packets.push(createSetStabilizationPacket(effective));
  if (
    effective.fastTrigger.leftDelay !== previous.fastTrigger.leftDelay ||
    effective.fastTrigger.rightDelay !== previous.fastTrigger.rightDelay
  )
    packets.push(createSetFastTriggerPacket(effective));
  if (changed(["sensorCenterPoint"]))
    packets.push(createSetSensorCenterPointPacket(effective.sensorCenterPoint));
  if (changed(["rollingDelay"]))
    packets.push(createSetRollingDelayPacket(effective.rollingDelay));
  // Source setMousePerformance st.create: the whole 6-byte block (sleep on, sleep time / 10, sensorModel).
  if (changed(["sensorSleepEnabled", "sensorSleepTime", "sensorPowerMode"]))
    packets.push(
      buildPacket(Opcode.SetEEPROM, Address.sensorEnable, 6, [
        ...pair(Number(effective.sensorSleepEnabled)),
        ...pair(effective.sensorSleepTime / 10),
        ...pair(SENSOR_MODES.indexOf(effective.sensorPowerMode)),
      ]),
    );
  if (changed(["sensorAngle", "sensorAngleEnabled"]))
    packets.push(
      createSetSensorAnglePacket(
        effective.sensorAngle,
        effective.sensorAngleEnabled,
      ),
    );
  if (changed(["longDistanceMode"]))
    packets.push(
      // Source Ge.create: SetFarDistanceMode with data length 10, mode in the first byte.
      buildPacket(Opcode.SetFarDistanceMode, 0, 10, [
        Number(effective.longDistanceMode),
      ]),
    );
  if (changed(["dongleRgbMode"]))
    packets.push(
      buildPacket(Opcode.Set4KRGBMode, 0, 10, [effective.dongleRgbMode]),
    );
  effective.buttons
    .filter((button) => button.id !== "bottom")
    .forEach((button) => {
      const index = buttonOrder.indexOf(button.id);
      const old = previous.buttons.find((item) => item.id === button.id);
      if (
        !different(
          [button.keyClass, button.keyValue1, button.keyValue2],
          old && [old.keyClass, old.keyValue1, old.keyValue2],
        )
      )
        return;
      packets.push(
        buildPacket(Opcode.SetEEPROM, Address.key0 + index * 4, 4, [
          button.keyClass,
          button.keyValue1,
          button.keyValue2,
          (0x55 - button.keyClass - button.keyValue1 - button.keyValue2) & 255,
        ]),
      );
    });
  return {
    packets,
    effectiveSettings: effective,
    skipped: [...new Set(skipped)],
  };
}

function packetSettingDescription(packet: Uint8Array): string {
  const opcode = packet[0];
  if (opcode === Opcode.Set4KRGBMode) return "dongle lighting";
  if (opcode === Opcode.SetEEPROM) {
    const addr = (packet[2] << 8) | packet[3];
    if (addr === Address.reportRate) return "polling rate or DPI";
    if (addr === Address.silentHeight) return "LOD";
    if (addr === Address.angle) return "sensor rotation";
    if (addr === Address.stabilizationTime) return "debounce or sleep settings";
    if (
      (addr >= Address.dpi1 && addr <= Address.dpi7Color + 8) ||
      (addr >= Address.paw3955Dpi1 && addr < Address.paw3955Dpi1 + 48)
    )
      return "DPI stages";
    if (addr >= Address.key0 && addr <= Address.key5 + 4)
      return "button mapping";
    if (addr === Address.fastTriggerDebounce) return "fast trigger delay";
    if (
      addr === Address.sensorCenterPointV2 ||
      addr === Address.sensorCenterPoint
    )
      return "sensor center point";
    if (addr === Address.rollingDelay) return "rolling delay";
  }
  return "device settings";
}

export async function applySettingsToDevice(
  settings: DeviceSettings,
  undo = false,
) {
  const store = useConfigStore.getState();
  if (!store.deviceInfo.connected)
    throw new Error("Connect a device to apply this map.");
  if (!isKnownDevice() || !isMouseSessionVerified())
    throw new Error(
      "Generic mode: settings writes are unavailable for this model.",
    );
  if (store.isApplying || useDeviceSession.getState().busy)
    throw new Error("Wait for the current device operation.");
  const info = store.deviceInfo;
  const untested = isMouseSessionUntested();
  const held = untested
    ? holdUnsupportedForModel(DeviceSettingsSchema.parse(settings), store.activeSettings, info.cid, info.mid, info.connectType)
    : { target: DeviceSettingsSchema.parse(settings), held: [] };
  const target = held.target;
  if (!target.dpiStages.length || target.activeDpiStage >= target.dpiStages.length)
    throw new Error("Choose an active DPI stage from the available stages before applying.");
  // Competitive MAX is offered by the source only on CID 1 mice (CID 2 needs a server firmware threshold).
  if (!info.isMock && !untested && target.sensorPowerMode === "MAX" && info.cid !== 1 && store.activeSettings.sensorPowerMode !== "MAX") {
    target.sensorPowerMode = store.activeSettings.sensorPowerMode;
    held.held.push("Competitive MAX is not offered for this model");
  }
  const plan = buildApplyPlan(
    target,
    store.activeSettings,
    info.isMock,
    useDeviceSession.getState().readIssues.map((issue) => issue.key),
    info.isMock ? "PAW3950Ultra" : mouseModelFeatures(info.cid, info.mid).sensor,
  );
  plan.skipped.unshift(...held.held);
  if (
    !store.deviceInfo.isMock &&
    !(store.deviceInfo.cid === 1 && store.deviceInfo.mid === 4)
  ) {
    plan.packets = plan.packets.filter(
      (packet) =>
        !(
          packet[0] === Opcode.SetEEPROM &&
          ((packet[2] << 8) | packet[3]) === Address.sensorCenterPointV2
        ),
    );
    if (
      different(
        target.sensorCenterPoint,
        store.activeSettings.sensorCenterPoint,
      )
    )
      plan.skipped.push(
        "Center point needs packet verification for this mouse",
      );
    plan.effectiveSettings.sensorCenterPoint = clone(
      store.activeSettings.sensorCenterPoint,
    );
  }
  if (
    store.deviceInfo.connectionMode !== "wireless_dongle" &&
    !store.deviceInfo.isMock
  ) {
    plan.packets = plan.packets.filter(
      (packet) => packet[0] !== Opcode.Set4KRGBMode,
    );
    if (target.dongleRgbMode !== store.activeSettings.dongleRgbMode)
      plan.skipped.push("Dongle LED mode requires the 8K Dongle-H");
    plan.effectiveSettings.dongleRgbMode = store.activeSettings.dongleRgbMode;
  }
  if (
    !plan.packets.length &&
    (!store.deviceInfo.isMock ||
      !different(plan.effectiveSettings, store.activeSettings))
  ) {
    useDeviceSession.setState({ skipped: plan.skipped, success: false });
    return plan.skipped;
  }
  useConfigStore.setState({ isApplying: true });
  useDeviceSession.setState({
    busy: true,
    progress: 0,
    success: false,
    skipped: plan.skipped,
    applyError: undefined,
  });
  try {
    for (let index = 0; index < plan.packets.length; index += 1) {
      const packet = plan.packets[index];
      const current = useConfigStore.getState().deviceInfo;
      if (
        !current.connected ||
        current.serial !== store.deviceInfo.serial ||
        current.productId !== store.deviceInfo.productId
      )
        throw new Error("The device connection changed during apply.");
      try {
        await sendPacket(packet);
      } catch (err) {
        if (
          err instanceof Error &&
          /Device returned status (\d+)/i.test(err.message)
        ) {
          const code = err.message.match(/Device returned status (\d+)/i)![1];
          const desc = packetSettingDescription(packet);
          throw new Error(
            `Device returned status ${code} while applying ${desc}.`,
            { cause: err },
          );
        }
        throw err;
      }
      useDeviceSession.setState({
        progress: (index + 1) / plan.packets.length,
      });
    }
    if (store.deviceInfo.isMock) mockSettings = clone(plan.effectiveSettings);
    useConfigStore.setState({
      activeSettings: clone(plan.effectiveSettings),
      previousSettings: undo ? null : clone(store.activeSettings),
    });
    useDeviceSession.setState({
      progress: 1,
      success: true,
      appliedAt: Date.now(),
    });
    return plan.skipped;
  } catch (error) {
    useDeviceSession.setState({
      applyError:
        error instanceof Error ? error.message : "Device save failed.",
    });
    // Successful packets may have changed hardware before a later packet failed.
    await refreshDevice().catch((failure) =>
      appendLog("error", undefined, `Readback failed: ${String(failure)}`),
    );
    throw error;
  } finally {
    useConfigStore.setState({ isApplying: false });
    useDeviceSession.setState({ busy: false });
  }
}

export async function connectDevice(
  mock: boolean,
  cid = 1,
  mid = 4,
  model?: DeviceDefinition,
  selected?: HIDDevice,
) {
  installDeviceBridge();
  if (useDeviceSession.getState().busy) return;
  useDeviceSession.setState({
    busy: true,
    skipped: [],
    readIssues: [],
    success: false,
    applyError: undefined,
  });
  try {
    useDeviceSession.setState({ demoReason: undefined });
    mockSettings = DeviceSettingsSchema.parse({});
    const info = mock
      ? await hidClient.connectMock(cid, mid, model)
      : await hidClient.connectHardware(selected);
    useConfigStore.setState({
      deviceInfo: info,
      previousSettings: null,
      activeSettings: DeviceSettingsSchema.parse({}),
    });
    if (isKnownDevice() && isMouseSessionReadable()) await refreshDevice();
    return info;
  } finally {
    useDeviceSession.setState({ busy: false });
  }
}
export async function disconnectDevice() {
  await hidClient.disconnect();
  useDeviceSession.setState({ readIssues: [] });
  useConfigStore.setState({
    deviceInfo: hidClient.getDeviceInfo(),
    previousSettings: null,
  });
}
export async function deviceOperation(action: () => Promise<void>) {
  if (useDeviceSession.getState().busy)
    throw new Error("Wait for the current device operation.");
  useDeviceSession.setState({ busy: true });
  try {
    await action();
  } finally {
    useDeviceSession.setState({ busy: false });
  }
}
export async function selectProfile(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2)
    throw new Error("Choose profile 1, 2, or 3.");
  await deviceOperation(async () => {
    await sendPacket(buildPacket(Opcode.SetCurrentConfig, 0, 1, [slot]));
    await refreshDevice();
  });
}
export async function restoreFactory() {
  await deviceOperation(async () => {
    await sendPacket(buildPacket(Opcode.RestoreFactory), {
      factoryConfirmed: true,
    });
    mockSettings = DeviceSettingsSchema.parse({});
    useConfigStore.setState({ previousSettings: null });
    await refreshDevice();
  });
}
let autoReconnecting = false;
export function isAutoReconnecting() {
  return autoReconnecting;
}

export function initializeDevice() {
  installDeviceBridge();
  if (!initialization)
    initialization = deviceOperation(async () => {
      autoReconnecting = true;
      try {
        if (
          !hidClient.getDeviceInfo().connected &&
          (await hidClient.autoReconnect())
        )
          await refreshDevice();
      } finally {
        autoReconnecting = false;
      }
    });
  return initialization;
}
