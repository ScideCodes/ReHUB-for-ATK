import {
  CompxOpcode,
  CompxAddress,
  ReportRateMap,
} from "../protocol/constants";
import { calcChecksum, REPORT_ID, encodePaw3950Dpi } from "../protocol/codec";
import type { DeviceDefinition } from "../types/schema";

export class MockHidDevice {
  opened = true;
  vendorId = 0x373b;
  productId = 0x11d8;
  productName = "ATK ZERO EX (Virtual Mock)";
  serialNumber = "5420E4DB5AEF";
  model?: DeviceDefinition;
  collections = [
    {
      usagePage: 0xff04,
      usage: 0x0002,
      inputReports: [{ reportId: 0x08, reportSize: 128 }],
      outputReports: [{ reportId: 0x08, reportSize: 128 }],
    },
  ];

  oninputreport:
    ((event: { reportId: number; data: DataView }) => void) | null = null;

  // Mock State
  battery = 94;
  charging = false;
  voltage = 4050;
  rfOnline = true;
  firmwareMouse = "3.01";
  firmwareDongle = "3.01";
  onboardSlot = 0;
  dongleRgbMode = 1;
  longDistanceMode = false;
  cid = 1;
  mid = 4;
  /** Source connect type (wired8K = 3) reported by the info query. */
  connectType = 3;

  // Virtual EEPROM Memory (8KB)
  eeprom = new Uint8Array(8192);

  constructor(cid = 1, mid = 4, model?: DeviceDefinition) {
    this.cid = cid;
    this.mid = mid;
    this.model = model;
    if (model) {
      this.productName = `${model.name} (Virtual Mock)`;
      this.vendorId = parseInt(model.VID, 16);
      this.productId = parseInt(model.PID, 16);
      if (model.usagePage && model.usage) {
        this.collections = [
          {
            usagePage: model.usagePage,
            usage: model.usage,
            inputReports: [{ reportId: model.reportId ?? 0, reportSize: 64 }],
            outputReports: [{ reportId: model.reportId ?? 0, reportSize: 64 }],
          },
        ];
      }
    }
    this.initDefaultEeprom();
  }

  private initDefaultEeprom() {
    // 0x00: Polling Rate (1000Hz = 1), maxDpi (4), currentDpi (1)
    this.eeprom[CompxAddress.reportRate] = ReportRateMap[1000];
    this.eeprom[CompxAddress.reportRate + 1] =
      (0x55 - ReportRateMap[1000]) & 0xff;
    this.eeprom[CompxAddress.maxDpi] = 4;
    this.eeprom[CompxAddress.maxDpi + 1] = (0x55 - 4) & 0xff;
    this.eeprom[CompxAddress.currentDpi] = 1;
    this.eeprom[CompxAddress.currentDpi + 1] = (0x55 - 1) & 0xff;
    this.eeprom[8] = 0x80; // DPI button enabled
    this.eeprom[9] = (0x55 - 0x80) & 0xff; // its crc (the source drops the mode byte when this is invalid)

    // LOD (addr 10): 1.0mm = 4 on the ZERO EX's PAW3950Ultra (source SilenceHeightUltimate codes)
    this.eeprom[CompxAddress.silentHeight] = 4;
    this.eeprom[CompxAddress.silentHeight + 1] = (0x55 - 4) & 0xff;

    // Sensor sleep (addr 181, source st): enabled, 60s, sensor model 0
    this.eeprom.set([1, 0x55 - 1, 6, 0x55 - 6, 0, 0x55], CompxAddress.sensorEnable);

    // Sensor Angle (addr 189): 0 deg, disabled
    this.eeprom[CompxAddress.angle] = 0;
    this.eeprom[CompxAddress.angle + 1] = 0x55;
    this.eeprom[CompxAddress.angle + 2] = 0;
    this.eeprom[CompxAddress.angle + 3] = 0x55;

    // Stabilization (addr 169): Debounce=1ms, MotionSync=1, Sleep=6 (60s), AngleSnap=0, Ripple=0
    this.eeprom[CompxAddress.stabilizationTime] = 1;
    this.eeprom[CompxAddress.stabilizationTime + 1] = (0x55 - 1) & 0xff;
    this.eeprom[CompxAddress.motionSync] = 1;
    this.eeprom[CompxAddress.motionSync + 1] = (0x55 - 1) & 0xff;
    this.eeprom[CompxAddress.closeLedTime] = 6;
    this.eeprom[CompxAddress.closeLedTime + 1] = (0x55 - 6) & 0xff;
    this.eeprom[CompxAddress.linearCorrection] = 0;
    this.eeprom[CompxAddress.linearCorrection + 1] = 0x55;
    this.eeprom[CompxAddress.rippleControl] = 0;
    this.eeprom[CompxAddress.rippleControl + 1] = 0x55;

    // Fast Trigger (addr 6988)
    this.eeprom[CompxAddress.fastTriggerDebounce] = 1;
    this.eeprom[CompxAddress.fastTriggerDebounce + 1] = (0x55 - 1) & 0xff;
    this.eeprom[CompxAddress.fastTriggerDebounce + 2] = 1;
    this.eeprom[CompxAddress.fastTriggerDebounce + 3] = (0x55 - 1) & 0xff;

    // DPI Stages 400, 800, 1600, 3200
    const stages = [400, 800, 1600, 3200];
    const addrs = [CompxAddress.dpi1, CompxAddress.dpi3];
    for (let i = 0; i < 2; i++) {
      const s1 = stages[i * 2];
      const s2 = stages[i * 2 + 1];
      const e1 = encodePaw3950Dpi(s1, s1);
      const e2 = encodePaw3950Dpi(s2, s2);
      const base = addrs[i];
      this.eeprom[base] = e1.xDpi;
      this.eeprom[base + 1] = e1.yDpi;
      this.eeprom[base + 2] = e1.dpiEx;
      this.eeprom[base + 3] = (0x55 - (e1.xDpi + e1.yDpi + e1.dpiEx)) & 0xff;
      this.eeprom[base + 4] = e2.xDpi;
      this.eeprom[base + 5] = e2.yDpi;
      this.eeprom[base + 6] = e2.dpiEx;
      this.eeprom[base + 7] = (0x55 - (e2.xDpi + e2.yDpi + e2.dpiEx)) & 0xff;
    }
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  async sendReport(reportId: number, data: Uint8Array): Promise<void> {
    if (!this.opened) throw new Error("Mock device not open");
    const opcode = data[0];
    const eepromAddr = (data[2] << 8) | data[3];
    const validLen = data[4];

    // Response frame
    const resp = new Uint8Array(16);
    resp[0] = opcode;
    resp[1] = 0x00; // Success
    resp[2] = data[2];
    resp[3] = data[3];
    resp[4] = validLen;

    switch (opcode) {
      case CompxOpcode.GetMouseCIDMID:
        resp[4] = 8;
        resp[5] = this.cid;
        resp[6] = this.mid;
        // Serial: 54.20.E4.DB
        resp[11] = 0x54;
        resp[12] = 0x20;
        resp[13] = 0xe4;
        resp[14] = 0xdb;
        break;

      case CompxOpcode.GetBatteryLevel:
        resp[4] = 4;
        resp[5] = this.battery;
        resp[6] = this.charging ? 1 : 0;
        resp[7] = (this.voltage >> 8) & 0xff;
        resp[8] = this.voltage & 0xff;
        break;

      case CompxOpcode.GetMouseVersion:
        resp[4] = 2;
        resp[5] = 0x03;
        resp[6] = 0x01;
        break;

      case CompxOpcode.GetDongleVersion:
        resp[4] = 2;
        resp[5] = 0x03;
        resp[6] = 0x01;
        break;

      case CompxOpcode.GetWirelessMouseOnline:
        resp[4] = 4;
        resp[5] = this.rfOnline ? 1 : 0;
        resp[6] = 0xaa;
        resp[7] = 0xbb;
        resp[8] = 0xcc;
        break;

      case CompxOpcode.Get4KRGBMode:
        resp[4] = 10;
        resp[5] = this.dongleRgbMode;
        break;

      case CompxOpcode.Set4KRGBMode:
        this.dongleRgbMode = data[5];
        resp[4] = 10;
        resp[5] = this.dongleRgbMode;
        break;

      case CompxOpcode.GetFarDistanceMode:
        resp[4] = 10;
        resp[5] = this.longDistanceMode ? 1 : 0;
        break;

      case CompxOpcode.SetFarDistanceMode:
        this.longDistanceMode = data[5] === 1;
        resp[4] = 10;
        resp[5] = data[5];
        break;

      case CompxOpcode.GetEEPROM:
        for (let i = 0; i < validLen && i < 10; i++) {
          resp[5 + i] = this.eeprom[eepromAddr + i] ?? 0;
        }
        break;

      case CompxOpcode.SetEEPROM:
        for (let i = 0; i < validLen && i < 10; i++) {
          this.eeprom[eepromAddr + i] = data[5 + i];
        }
        break;

      case CompxOpcode.DownLoadData:
        // Source ze.get info query: echo the challenge, then CID, MID and connect type.
        if (eepromAddr === 0 && validLen === 8) {
          resp.set(data.slice(5, 9), 5);
          resp.set([this.cid, this.mid, this.connectType], 9);
        }
        break;

      case CompxOpcode.GetCurrentConfig:
        resp[4] = 1;
        resp[5] = this.onboardSlot;
        break;

      case CompxOpcode.SetCurrentConfig:
        this.onboardSlot = data[5];
        break;

      case CompxOpcode.RestoreFactory:
        this.initDefaultEeprom();
        break;
    }

    resp[15] = calcChecksum(REPORT_ID, resp.subarray(0, 15));

    // Simulate async device roundtrip delay (8ms)
    setTimeout(() => {
      if (this.oninputreport && this.opened) {
        this.oninputreport({
          reportId: REPORT_ID,
          data: new DataView(resp.buffer),
        });
      }
    }, 8);
  }
}
