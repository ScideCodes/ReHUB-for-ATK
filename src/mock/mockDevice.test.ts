import { describe, it, expect } from "vitest";
import { MockHidDevice } from "./mockDevice";
import { CompxOpcode, CompxAddress } from "../protocol/constants";
import { buildPacket, createGetEepromPacket } from "../protocol/codec";

describe("Mock WebHID Device Adapter", () => {
  it("correctly simulates GetMouseCIDMID returning ATK Frost Zero Extreme (cid=1, mid=4)", async () => {
    const mock = new MockHidDevice();
    let response: DataView | null = null;

    mock.oninputreport = (e) => {
      response = e.data;
    };

    const req = buildPacket(CompxOpcode.GetMouseCIDMID);
    await mock.sendReport(0x08, req);

    await new Promise((r) => setTimeout(r, 20));
    expect(response).not.toBeNull();
    expect(response!.getUint8(0)).toBe(CompxOpcode.GetMouseCIDMID);
    expect(response!.getUint8(5)).toBe(1); // cid
    expect(response!.getUint8(6)).toBe(4); // mid
    // Serial: 54.20.E4.DB
    expect(response!.getUint8(11)).toBe(0x54);
    expect(response!.getUint8(12)).toBe(0x20);
    expect(response!.getUint8(13)).toBe(0xe4);
    expect(response!.getUint8(14)).toBe(0xdb);
  });

  it("correctly simulates GetBatteryLevel with voltage", async () => {
    const mock = new MockHidDevice();
    let response: DataView | null = null;

    mock.oninputreport = (e) => {
      response = e.data;
    };

    const req = buildPacket(CompxOpcode.GetBatteryLevel);
    await mock.sendReport(0x08, req);

    await new Promise((r) => setTimeout(r, 20));
    expect(response).not.toBeNull();
    expect(response!.getUint8(0)).toBe(CompxOpcode.GetBatteryLevel);
    expect(response!.getUint8(5)).toBe(mock.battery);
  });

  it("correctly updates EEPROM memory on SetEEPROM and returns on GetEEPROM", async () => {
    const mock = new MockHidDevice();
    let response: DataView | null = null;

    mock.oninputreport = (e) => {
      response = e.data;
    };

    // Write debounce = 7ms to EEPROM 169
    const writeReq = buildPacket(
      CompxOpcode.SetEEPROM,
      CompxAddress.stabilizationTime,
      2,
      [7, 0x55 - 7],
    );
    await mock.sendReport(0x08, writeReq);

    await new Promise((r) => setTimeout(r, 20));

    // Read back
    const readReq = createGetEepromPacket(CompxAddress.stabilizationTime, 2);
    await mock.sendReport(0x08, readReq);

    await new Promise((r) => setTimeout(r, 20));
    expect(response).not.toBeNull();
    expect(response!.getUint8(5)).toBe(7);
  });

  it("correctly simulates Get4KRGBMode and Set4KRGBMode for receiver lighting", async () => {
    const mock = new MockHidDevice();
    let response: DataView | null = null;

    mock.oninputreport = (e) => {
      response = e.data;
    };

    // Initial default dongle LED mode is 1 (Connection/polling)
    await mock.sendReport(0x08, buildPacket(CompxOpcode.Get4KRGBMode));
    await new Promise((r) => setTimeout(r, 20));
    expect(response).not.toBeNull();
    expect(response!.getUint8(0)).toBe(CompxOpcode.Get4KRGBMode);
    expect(response!.getUint8(4)).toBe(10);
    expect(response!.getUint8(5)).toBe(1);

    // Set to Mode 2 (Battery)
    await mock.sendReport(
      0x08,
      buildPacket(CompxOpcode.Set4KRGBMode, 0, 10, [2]),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(mock.dongleRgbMode).toBe(2);

    // Read back
    await mock.sendReport(0x08, buildPacket(CompxOpcode.Get4KRGBMode));
    await new Promise((r) => setTimeout(r, 20));
    expect(response!.getUint8(5)).toBe(2);
  });

  it("acts like selected model without touching real hardware", async () => {
    const atk68Model = {
      name: "ATK 68 V2 Pro",
      VID: "0x373B",
      PID: "0x1048",
      features: [
        "Rapid Trigger (RT)",
        "Custom Lighting (Per-Key RGB)",
        "Key Remapping",
      ],
    };
    const mock = new MockHidDevice(1, 4, atk68Model);
    expect(mock.vendorId).toBe(0x373b);
    expect(mock.productId).toBe(0x1048);
    expect(mock.productName).toBe("ATK 68 V2 Pro (Virtual Mock)");
    expect(mock.model?.name).toBe("ATK 68 V2 Pro");
    expect(mock.model?.features).toContain("Rapid Trigger (RT)");
    expect(mock.opened).toBe(true);
  });
});
