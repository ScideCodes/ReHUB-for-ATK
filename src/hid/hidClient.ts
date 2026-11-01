import { DeviceDiagnostics } from "./diagnostics";
import {
  mouseEndpoint,
  mouseFilters,
  mouseEndpointSupportsReal,
  readableMouseIdentity,
  clearUntestedMouseWrites,
  untestedMouseIdentity,
  writableMouseIdentity,
  findPairedMouseModel,
  mouseHidLabel,
} from "../devices/mouseProtocols";
import {
  CompxOpcode,
  CompxAddress,
  ReportRateReverseMap,
} from "../protocol/constants";
import {
  REPORT_ID,
  buildPacket,
  createMouseInfoQuery,
  decodeLod,
  encodeLod,
  isMouseInfoQuery,
  createGetEepromPacket,
  createSetReportRateDpiPacket,
  createSetStabilizationPacket,
  createSetLodPacket,
  createSetSensorAnglePacket,
  createSetFastTriggerPacket,
  createSetSensorCenterPointPacket,
  createSetRollingDelayPacket,
  decodePaw3950Dpi,
} from "../protocol/codec";
import {
  DeviceInfo,
  DeviceSettings,
  PollingRate,
  DpiStage,
  DeviceDefinition,
} from "../types/schema";
import { MockHidDevice } from "../mock/mockDevice";

const UNTESTED_WRITE_OPCODES = new Set<number>([
  CompxOpcode.SetEEPROM,
  CompxOpcode.SetFarDistanceMode,
  CompxOpcode.Set4KRGBMode,
]);
// Read tier (readableMouseIdentity without write verification): status and EEPROM reads only.
const READ_ONLY_OPCODES = new Set<number>([
  CompxOpcode.GetWirelessMouseOnline,
  CompxOpcode.GetBatteryLevel,
  CompxOpcode.GetEEPROM,
  CompxOpcode.GetCurrentConfig,
  CompxOpcode.GetMouseCIDMID,
  CompxOpcode.GetMouseVersion,
  CompxOpcode.Get4KRGBMode,
  CompxOpcode.GetFarDistanceMode,
  CompxOpcode.GetDongleLightMode,
  CompxOpcode.GetDongleVersion,
]);
import { findDeviceSpec, resolveDeviceName } from "../features/device/deviceCatalog";

export interface IHidDevice {
  opened: boolean;
  vendorId: number;
  productId: number;
  productName?: string;
  serialNumber?: string;
  collections: HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  oninputreport: ((event: { reportId: number; data: DataView }) => void) | null;
}

export class HidClient {
  readonly diagnostics = new DeviceDiagnostics("mouse");
  private device: IHidDevice | HIDDevice | null = null;
  private isMock = false;
  private generation = 0;
  private reconnecting = false;
  private connecting = 0;
  private pendingTransfers: Array<{
    commandId: number;
    eepromAddress?: number;
    resolve: (data: DataView) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = [];

  public onStatusChange?: (info: DeviceInfo) => void;
  public onPushReport?: (opcode: number, data: Uint8Array) => void;

  private deviceInfo: DeviceInfo = {
    connected: false,
    isMock: false,
    name: "Disconnected",
    vendorId: 0,
    productId: 0,
    connectionMode: "disconnected",
    serial: "",
    cid: 0,
    mid: 0,
    firmwareMouse: "",
    firmwareDongle: "",
    batteryLevel: 0,
    isCharging: false,
    voltageMv: 0,
    rfOnline: false,
    onboardSlot: 0,
  };

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    if (typeof navigator !== "undefined" && "hid" in navigator) {
      navigator.hid.addEventListener("connect", (e) => {
        if (
          mouseEndpointSupportsReal(e.device.vendorId, e.device.productId) &&
          e.device.collections.some(
            (collection: HIDCollectionInfo) =>
              collection.usagePage === 0xff04 && collection.usage === 0x0002,
          )
        ) {
          this.autoReconnect();
        }
      });
      navigator.hid.addEventListener("disconnect", (e) => {
        if (this.device && this.device === e.device) {
          this.disconnect();
        }
      });
    }
  }

  public getDeviceInfo(): DeviceInfo {
    return { ...this.deviceInfo };
  }
  public get sessionGeneration(): number {
    return this.generation;
  }

  public async connectMock(
    cid = 1,
    mid = 4,
    model?: DeviceDefinition,
  ): Promise<DeviceInfo> {
    const generation = this.generation + 1;
    await this.disconnect();
    if (generation !== this.generation) throw new Error("Mouse connection cancelled");
    this.isMock = true;
    const mock = new MockHidDevice(cid, mid, model);
    await mock.open();
    if (generation !== this.generation) {
      await mock.close();
      throw new Error("Mouse connection cancelled");
    }
    this.device = mock;
    this.diagnostics.attach(mock, "mock");
    this.device.oninputreport = this.handleInputReport.bind(this);

    await this.identifyDevice();
    return this.deviceInfo;
  }

  public async connectHardware(selected?: HIDDevice): Promise<DeviceInfo> {
    const requestedGeneration = this.generation;
    this.connecting++;
    try {
      if (typeof navigator === "undefined" || !navigator.hid) {
        throw new Error(
          "WebHID not supported in this browser. Please use Chrome, Edge, or Brave.",
        );
      }

      const devices = selected
        ? [selected]
        : await navigator.hid.requestDevice({ filters: mouseFilters() });
      if (requestedGeneration !== this.generation) throw new Error("Mouse connection cancelled");
      if (!devices || devices.length === 0) {
        throw new Error("No device selected");
      }

      const dev = devices[0];
      if (
        !mouseEndpointSupportsReal(dev.vendorId, dev.productId) ||
        !dev.collections.some((c) => c.usagePage === 0xff04 && c.usage === 2)
      )
        throw new Error(
          `Select a supported mouse HID collection: ${mouseHidLabel(dev)}. Protocol unverified; use the local demo.`,
        );
      const generation = this.generation + 1;
      await this.disconnect();
      if (generation !== this.generation) throw new Error("Mouse connection cancelled");
      this.isMock = false;
      if (!dev.opened) await dev.open();
      if (generation !== this.generation) {
        if (this.device !== dev && dev.opened) await dev.close();
        throw new Error("Mouse connection cancelled");
      }
      this.device = dev;
      this.diagnostics.attach(dev, "hardware");
      this.device!.oninputreport = this.handleInputReport.bind(this);

      await this.identifyDevice();
      return this.deviceInfo;
    } catch (error) {
      this.diagnostics.error(error);
      throw error;
    } finally {
      this.connecting--;
    }
  }

  public async autoReconnect(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.hid) return false;
    if (this.device || this.reconnecting || this.connecting) return false;
    const generation = this.generation;
    this.reconnecting = true;
    try {
      const devices = await navigator.hid.getDevices();
      if (generation !== this.generation || this.device) return false;
      const match = devices.find(
        (d) =>
          mouseEndpointSupportsReal(d.vendorId, d.productId) &&
          d.collections.some(
            (c) => c.usagePage === 0xff04 && c.usage === 0x0002,
          ),
      );

      if (match) {
        await this.connectHardware(match);
        return true;
      }
    } catch (e) {
      console.warn("Auto-reconnect error:", e);
    } finally {
      this.reconnecting = false;
    }
    return false;
  }

  public async disconnect(): Promise<void> {
    this.generation++;
    const device = this.device;
    this.device = null;
    clearUntestedMouseWrites();
    this.diagnostics.disconnect();
    for (const transfer of this.pendingTransfers.splice(0)) {
      clearTimeout(transfer.timeoutId);
      transfer.reject(
        new Error("Device disconnected before the command completed."),
      );
    }
    if (device) device.oninputreport = null;
    this.isMock = false;
    this.deviceInfo = {
      connected: false,
      isMock: false,
      name: "Disconnected",
      vendorId: 0,
      productId: 0,
      connectionMode: "disconnected",
      serial: "",
      cid: 0,
      mid: 0,
      firmwareMouse: "",
      firmwareDongle: "",
      batteryLevel: 0,
      isCharging: false,
      voltageMv: 0,
      rfOnline: false,
      onboardSlot: 0,
    };
    this.onStatusChange?.(this.deviceInfo);
    if (device) {
      try {
        if (device.opened) await device.close();
      } catch { /* A removed device may already be closed. */ }
    }
  }

  private handleInputReport(e: { reportId: number; data: DataView }) {
    const data = e.data;
    if (e.reportId !== REPORT_ID || data.byteLength < 16) return;
    this.diagnostics.frame(
      "in",
      e.reportId,
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    const opcode = data.getUint8(0);

    // Check pending transfers
    const idx = this.pendingTransfers.findIndex(
      (t) =>
        t.commandId === opcode &&
        (t.eepromAddress === undefined ||
          data.getUint16(2, false) === t.eepromAddress),
    );
    if (idx !== -1) {
      const transfer = this.pendingTransfers.splice(idx, 1)[0];
      clearTimeout(transfer.timeoutId);
      transfer.resolve(data);
      return;
    }

    // Push notification (0x0A)
    if (opcode === CompxOpcode.ReportMouseStatus) {
      this.onPushReport?.(
        opcode,
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
      );
    }
  }

  public async transfer(
    packet: Uint8Array,
    timeoutMs = 1500,
  ): Promise<DataView> {
    if (!this.device || !this.device.opened) {
      throw new Error("Device not connected");
    }

    const commandId = packet[0];
    const identity = [
      this.device.vendorId,
      this.device.productId,
      this.deviceInfo.cid,
      this.deviceInfo.mid,
    ] as const;
    if (
      !this.isMock &&
      !writableMouseIdentity(...identity) &&
      commandId !== CompxOpcode.GetMouseCIDMID &&
      !(readableMouseIdentity(...identity) && (READ_ONLY_OPCODES.has(commandId) || isMouseInfoQuery(packet)))
    )
      throw new Error(
        readableMouseIdentity(...identity)
          ? "Read-only mouse: settings writes are not verified for this model."
          : "Mouse protocol unverified; hardware commands are disabled.",
      );

    // Untested write tier: only the settings planner's own write opcodes, never factory/macro/pairing commands.
    if (
      !this.isMock &&
      untestedMouseIdentity(...identity) &&
      !READ_ONLY_OPCODES.has(commandId) &&
      !isMouseInfoQuery(packet) &&
      !UNTESTED_WRITE_OPCODES.has(commandId)
    )
      throw new Error("This command is not part of the untested write tier.");

    const address = (packet[2] << 8) | packet[3];
    if (
      !this.isMock &&
      commandId === CompxOpcode.SetEEPROM &&
      address <= CompxAddress.sensorCenterPointV2 + 4 &&
      address + packet[4] > CompxAddress.sensorCenterPointV2 &&
      !(this.deviceInfo.cid === 1 && this.deviceInfo.mid === 4)
    )
      throw new Error("Center point needs packet verification for this mouse.");

    // Safe mode: block DFU upgrade
    if (commandId === CompxOpcode.EnterUSBUpgradeMode) {
      throw new Error("Safe Mode: DFU firmware commands are blocked");
    }

    const sentAt = performance.now();
    return new Promise((resolve, reject) => {
      let completed = false;
      const rejectTransfer = (error: Error) => {
        if (completed) return;
        completed = true;
        this.diagnostics.finish(performance.now() - sentAt, error);
        reject(error);
      };
      const timeoutId = setTimeout(() => {
        const i = this.pendingTransfers.findIndex(
          (t) => t.commandId === commandId,
        );
        if (i !== -1) this.pendingTransfers.splice(i, 1);
        rejectTransfer(
          new Error(
            `Timeout waiting for response to opcode 0x${commandId.toString(16)}`,
          ),
        );
      }, timeoutMs);

      this.pendingTransfers.push({
        commandId,
        eepromAddress:
          commandId === CompxOpcode.GetEEPROM
            ? (packet[2] << 8) | packet[3]
            : undefined,
        resolve: (data) => {
          if (completed) return;
          completed = true;
          this.diagnostics.finish(performance.now() - sentAt);
          resolve(data);
        },
        reject: rejectTransfer,
        timeoutId,
      });

      this.diagnostics.frame("out", REPORT_ID, packet);
      this.device!.sendReport(REPORT_ID, new Uint8Array(packet)).catch((err) => {
        const i = this.pendingTransfers.findIndex(
          (t) => t.commandId === commandId,
        );
        if (i !== -1) this.pendingTransfers.splice(i, 1);
        clearTimeout(timeoutId);
        rejectTransfer(err);
      });
    });
  }

  public async identifyDevice(): Promise<DeviceInfo> {
    if (!this.device) throw new Error("Device not connected");
    const device = this.device;
    const generation = this.generation;
    const ensureSession = () => {
      if (this.device !== device || this.generation !== generation)
        throw new Error("Mouse connection cancelled");
    };

    let vid = this.device.vendorId;
    let pid = this.device.productId;
    const isDongle = mouseEndpoint(vid, pid)?.receiver === true;

    // 0/0 means "could not verify". isKnownDevice() then keeps settings writes disabled
    // (read-only mode) instead of assuming this is a ZERO EX.
    let cid = 0;
    let mid = 0;
    let serial = "";
    let fwMouse = "";
    let fwDongle = "";
    let batteryLevel = 100;
    let isCharging = false;
    let voltageMv = 4000;
    let rfOnline = true;
    let onboardSlot = 0;

    try {
      // 1. CID / MID & Serial
      const cidMidResp = await this.transfer(
        buildPacket(CompxOpcode.GetMouseCIDMID),
      );
      cid = cidMidResp.getUint8(5);
      mid = cidMidResp.getUint8(6);
      serial = [
        cidMidResp.getUint8(11).toString(16).padStart(2, "0"),
        cidMidResp.getUint8(12).toString(16).padStart(2, "0"),
        cidMidResp.getUint8(13).toString(16).padStart(2, "0"),
        cidMidResp.getUint8(14).toString(16).padStart(2, "0"),
      ]
        .join(".")
        .toUpperCase();
    } catch (e) {
      ensureSession();
      console.warn("Could not read CID/MID:", e);
    }
    ensureSession();

    // Source: demoMode.store-CXKd1LXo.js: tK; filter-B6RHekbD.js: ra
    // When connected to a receiver, runtime identity maps CID/MID to the paired mouse model.
    const pairedModel = isDongle ? findPairedMouseModel(cid, mid) : undefined;

    if (!this.isMock && !readableMouseIdentity(vid, pid, cid, mid)) {
      this.deviceInfo = {
        ...this.deviceInfo,
        connected: true,
        isMock: false,
        vendorId: vid,
        productId: pid,
        cid,
        mid,
        serial,
        name: pairedModel?.name ?? resolveDeviceName(cid, mid, false),
        connectionMode: isDongle ? "wireless_dongle" : "wired",
      };
      this.onStatusChange?.(this.deviceInfo);
      return this.deviceInfo;
    }
    // Identity must be verified before the remaining reads can run.
    this.deviceInfo = { ...this.deviceInfo, cid, mid };
    try {
      // 2. Battery
      const batResp = await this.transfer(
        buildPacket(CompxOpcode.GetBatteryLevel),
      );
      batteryLevel = batResp.getUint8(5);
      isCharging = batResp.getUint8(6) === 1;
      voltageMv = (batResp.getUint8(7) << 8) | batResp.getUint8(8);
    } catch (e) {
      ensureSession();
      console.warn("Could not read battery:", e);
    }
    ensureSession();

    try {
      // 3. Versions
      const fwMouseResp = await this.transfer(
        buildPacket(CompxOpcode.GetMouseVersion),
      );
      fwMouse = `${fwMouseResp.getUint8(5).toString(16)}.${fwMouseResp.getUint8(6).toString(16).padStart(2, "0")}`;
    } catch { ensureSession(); /* Optional reads retain defaults; transport failures remain in diagnostics. */ }
    ensureSession();

    if (isDongle) {
      try {
        const fwDongleResp = await this.transfer(
          buildPacket(CompxOpcode.GetDongleVersion),
        );
        fwDongle = `${fwDongleResp.getUint8(5).toString(16)}.${fwDongleResp.getUint8(6).toString(16).padStart(2, "0")}`;
      } catch { ensureSession(); /* Optional reads retain defaults; transport failures remain in diagnostics. */ }
      ensureSession();

      try {
        const rfResp = await this.transfer(
          buildPacket(CompxOpcode.GetWirelessMouseOnline),
        );
        rfOnline = rfResp.getUint8(5) === 1;
      } catch { ensureSession(); /* Optional reads retain defaults; transport failures remain in diagnostics. */ }
      ensureSession();
    }

    try {
      // 4. Onboard slot
      const slotResp = await this.transfer(
        buildPacket(CompxOpcode.GetCurrentConfig),
      );
      onboardSlot = slotResp.getUint8(5);
    } catch { ensureSession(); /* Optional reads retain defaults; transport failures remain in diagnostics. */ }
    ensureSession();

    let connectType: number | undefined;
    try {
      // 5. Connect type (source Wt.getMouseInfo); trusted only when the reply repeats this mouse's CID/MID.
      const info = await this.transfer(createMouseInfoQuery(crypto.getRandomValues(new Uint8Array(4))));
      if (info.getUint8(9) === cid && info.getUint8(10) === mid && info.getUint8(11) <= 8) connectType = info.getUint8(11);
    } catch { ensureSession(); /* Optional reads retain defaults; transport failures remain in diagnostics. */ }
    ensureSession();

    // Model name resolution
    let name =
      pairedModel?.name ??
      (this.isMock || findDeviceSpec(cid, mid) ? undefined : findPairedMouseModel(cid, mid)?.name) ??
      resolveDeviceName(cid, mid, this.isMock);
    if (this.isMock && this.device instanceof MockHidDevice && this.device.model) {
      name = this.device.model.name;
      vid = this.device.vendorId;
      pid = this.device.productId;
    }

    this.deviceInfo = {
      connected: true,
      isMock: this.isMock,
      name,
      vendorId: vid,
      productId: pid,
      connectionMode: isDongle ? "wireless_dongle" : "wired",
      serial,
      cid,
      mid,
      firmwareMouse: fwMouse,
      firmwareDongle: fwDongle || (isDongle ? "" : "N/A"),
      batteryLevel,
      isCharging,
      voltageMv,
      rfOnline,
      onboardSlot,
      connectType,
    };

    this.onStatusChange?.(this.deviceInfo);
    return this.deviceInfo;
  }

  public async readDeviceSettings(): Promise<Partial<DeviceSettings>> {
    const settings: Partial<DeviceSettings> = {};

    // 1. Report Rate & Active DPI
    try {
      const resp = await this.transfer(
        createGetEepromPacket(CompxAddress.reportRate, 10),
      );
      const rateByte = resp.getUint8(5);
      settings.pollingRate =
        (ReportRateReverseMap[rateByte] as PollingRate) || 1000;
      settings.activeDpiStage = resp.getUint8(9);
      const btnOp = resp.getUint8(13);
      settings.dpiButtonEnabled = (btnOp & 0x80) !== 0;
      settings.fastTrigger = {
        leftEnabled: (btnOp & 0x01) !== 0,
        leftDelay: 1,
        rightEnabled: (btnOp & 0x02) !== 0,
        rightDelay: 1,
      };
    } catch (e) {
      console.warn("Failed reading reportRate:", e);
    }

    // 2. Stabilization / Debounce
    try {
      const resp = await this.transfer(
        createGetEepromPacket(CompxAddress.stabilizationTime, 10),
      );
      settings.keyDebounce = resp.getUint8(5);
      settings.motionSync = resp.getUint8(7) === 1;
      settings.sleepTime = resp.getUint8(9) * 10;
      settings.angleSnapping = resp.getUint8(11) === 1;
      settings.rippleControl = resp.getUint8(13) === 1;
    } catch (e) {
      console.warn("Failed reading stabilization:", e);
    }

    // 3. LOD / Silent Height
    try {
      const resp = await this.transfer(
        createGetEepromPacket(CompxAddress.silentHeight, 2),
      );
      const sensor = this.isMock ? "PAW3950Ultra" : findPairedMouseModel(this.deviceInfo.cid, this.deviceInfo.mid)?.sensor;
      const lod = decodeLod(sensor, resp.getUint8(5));
      if (lod !== null) settings.lod = lod;
    } catch (e) {
      console.warn("Failed reading LOD:", e);
    }

    // 4. Fast Trigger Delays
    try {
      const resp = await this.transfer(
        createGetEepromPacket(CompxAddress.fastTriggerDebounce, 4),
      );
      if (settings.fastTrigger) {
        settings.fastTrigger.leftDelay = resp.getUint8(5);
        settings.fastTrigger.rightDelay = resp.getUint8(7);
      }
    } catch { /* Optional reads retain defaults; transport failures remain in diagnostics. */ }

    // 5. Sensor Center Point
    try {
      const resp = await this.transfer(
        createGetEepromPacket(CompxAddress.sensorCenterPointV2, 5),
      );
      const enable = resp.getUint8(5) === 1;
      let x = resp.getUint8(7);
      let y = resp.getUint8(8);
      if (x > 127) x -= 256;
      if (y > 127) y -= 256;
      settings.sensorCenterPoint = { enable, x, y };
    } catch { /* Optional reads retain defaults; transport failures remain in diagnostics. */ }

    // 6. DPI Stages
    try {
      const dpiStages: DpiStage[] = [];
      const addrs = [CompxAddress.dpi1, CompxAddress.dpi3];
      const colors = ["#ef4444", "#3b82f6", "#10b981", "#a855f7"];

      for (let i = 0; i < 2; i++) {
        const resp = await this.transfer(createGetEepromPacket(addrs[i], 8));
        const d1 = decodePaw3950Dpi(
          resp.getUint8(5),
          resp.getUint8(6),
          resp.getUint8(7),
        );
        const d2 = decodePaw3950Dpi(
          resp.getUint8(9),
          resp.getUint8(10),
          resp.getUint8(11),
        );

        dpiStages.push({
          stage: i * 2,
          xDpi: d1.xDpi,
          yDpi: d1.yDpi,
          color: colors[i * 2] || "#3b82f6",
          enabled: true,
        });
        dpiStages.push({
          stage: i * 2 + 1,
          xDpi: d2.xDpi,
          yDpi: d2.yDpi,
          color: colors[i * 2 + 1] || "#10b981",
          enabled: true,
        });
      }
      settings.dpiStages = dpiStages;
    } catch { /* Optional reads retain defaults; transport failures remain in diagnostics. */ }

    // 7. Dongle RGB Mode
    if (this.deviceInfo.connectionMode === "wireless_dongle" || this.isMock) {
      try {
        const rgbResp = await this.transfer(
          buildPacket(CompxOpcode.Get4KRGBMode),
        );
        settings.dongleRgbMode = rgbResp.getUint8(5);
      } catch { /* Optional reads retain defaults; transport failures remain in diagnostics. */ }
    }

    // 8. Sensor Angle
    try {
      const angleResp = await this.transfer(
        createGetEepromPacket(CompxAddress.angle, 4),
      );
      const rawAngle = angleResp.getUint8(5);
      settings.sensorAngle = rawAngle > 128 ? rawAngle - 256 : rawAngle;
      settings.sensorAngleEnabled = angleResp.getUint8(7) === 1;
    } catch { /* Optional reads retain defaults; transport failures remain in diagnostics. */ }

    return settings;
  }

  public async applySettings(
    newSettings: DeviceSettings,
    oldSettings?: DeviceSettings,
  ): Promise<void> {
    if (!this.device || !this.device.opened) {
      throw new Error("Device not connected");
    }

    const tasks: Array<() => Promise<DataView>> = [];

    const sensor = this.isMock ? "PAW3950Ultra" : findPairedMouseModel(this.deviceInfo.cid, this.deviceInfo.mid)?.sensor;

    // 1. Report Rate & DPI Stage & Fast Trigger toggles; the bhop pair read back is rewritten unchanged (source je).
    tasks.push(async () => {
      const block = await this.transfer(createGetEepromPacket(CompxAddress.reportRate, 10));
      return this.transfer(createSetReportRateDpiPacket(newSettings, new Uint8Array(block.buffer, block.byteOffset + 5, 10)));
    });

    // 2. Stabilization & Performance
    tasks.push(() => this.transfer(createSetStabilizationPacket(newSettings)));

    // 3. LOD
    if (encodeLod(sensor, newSettings.lod) !== null)
      tasks.push(() => this.transfer(createSetLodPacket(sensor, newSettings.lod)));

    // 4. Fast Trigger Delays
    tasks.push(() => this.transfer(createSetFastTriggerPacket(newSettings)));

    // 5. Sensor Center Point
    tasks.push(() =>
      this.transfer(
        createSetSensorCenterPointPacket(newSettings.sensorCenterPoint),
      ),
    );

    // 6. Rolling Delay
    tasks.push(() =>
      this.transfer(createSetRollingDelayPacket(newSettings.rollingDelay)),
    );

    // 7. Sensor Angle
    tasks.push(() =>
      this.transfer(
        createSetSensorAnglePacket(
          newSettings.sensorAngle,
          newSettings.sensorAngleEnabled,
        ),
      ),
    );

    // 8. Dongle RGB Mode
    if (
      newSettings.dongleRgbMode !== undefined &&
      (!oldSettings || newSettings.dongleRgbMode !== oldSettings.dongleRgbMode)
    ) {
      tasks.push(() =>
        this.transfer(
          buildPacket(CompxOpcode.Set4KRGBMode, 0, 10, [
            newSettings.dongleRgbMode,
          ]),
        ),
      );
    }

    // Run sequentially with 25ms delay between packets
    for (const task of tasks) {
      await task();
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

export const hidClient = new HidClient();
