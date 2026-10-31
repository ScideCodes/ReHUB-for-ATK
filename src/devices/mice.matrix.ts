import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./sourceMouseProtocols.json";
import { MockHidDevice } from "../mock/mockDevice";
import { encodePaw3955Dpi, encodeSensorDpi } from "../protocol/codec";
import { CompxAddress } from "../protocol/constants";
import { allowUntestedMouseWrites, verifiedMouseIdentity, writableMouseIdentity } from "./mouseProtocols";
import { applySettingsToDevice, connectDevice, disconnectDevice } from "../features/device/deviceSession";
import { useConfigStore } from "../store/configStore";

// Every source FF04 mouse endpoint, each on its own mock: its VID/PID, CID/MID and sensor-encoded EEPROM. A mock proves
// the bytes match the source codecs and gates; it does not prove the firmware accepts them.
const models = source.filter((e) => !e.receiver && e.cidMid);
const receivers = source.filter((e) => e.receiver);
const STAGES = [400, 1600, 3200, 6400];

function mock(endpoint: { vendorId: number; productId: number }, model: (typeof models)[number], connectType = 3) {
  const [cid, mid] = model.cidMid!.split(",").map(Number);
  const device = new MockHidDevice(cid, mid);
  device.vendorId = endpoint.vendorId;
  device.productId = endpoint.productId;
  device.connectType = connectType;
  STAGES.forEach((dpi, i) => {
    if (model.sensor === "PAW3955MASTER") device.eeprom.set(encodePaw3955Dpi(dpi, dpi), CompxAddress.paw3955Dpi1 + i * 6);
    else {
      const e = encodeSensorDpi(model.sensor, dpi, dpi)!;
      device.eeprom.set([e.xDpi, e.yDpi, e.dpiEx, (0x55 - e.xDpi - e.yDpi - e.dpiEx) & 255], CompxAddress.dpi1 + i * 4);
    }
    device.eeprom.set([255, 105, 0, (0x55 - 255 - 105) & 255], CompxAddress.dpi1Color + i * 4);
  });
  return { device, cid, mid };
}

async function exercise(endpoint: { vendorId: number; productId: number }, model: (typeof models)[number]) {
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const { device, cid, mid } = mock(endpoint, model);
  const send = vi.spyOn(device, "sendReport");
  await connectDevice(false, cid, mid, undefined, device as unknown as HIDDevice);
  const info = useConfigStore.getState().deviceInfo;
  expect([info.connected, info.cid, info.mid, info.connectType]).toEqual([true, cid, mid, 3]);
  const read = useConfigStore.getState().activeSettings;
  expect(read.dpiStages.slice(0, 4).map((s) => s.xDpi)).toEqual(STAGES);

  const identity = [endpoint.vendorId, endpoint.productId, cid, mid] as const;
  if (!verifiedMouseIdentity(...identity)) {
    expect(writableMouseIdentity(...identity)).toBe(false);
    allowUntestedMouseWrites(...identity);
  }
  send.mockClear();
  const draft = structuredClone(read);
  draft.dpiStages[1] = { ...draft.dpiStages[1], xDpi: 800, yDpi: 800 };
  draft.pollingRate = 500;
  draft.keyDebounce = 4;
  const skipped = await applySettingsToDevice(draft);
  const after = useConfigStore.getState().activeSettings;
  expect([after.dpiStages[1].xDpi, after.pollingRate, after.keyDebounce], JSON.stringify(skipped)).toEqual([800, 500, 4]);
  // Every write was followed by a GetEEPROM readback; nothing outside the tier's opcodes was sent.
  const sent = send.mock.calls.map(([, f]) => f[0]);
  expect(sent.filter((op) => op === 7).length).toBeGreaterThan(0);
  expect(sent.every((op) => [7, 8, 20, 21, 22, 23].includes(op))).toBe(true);
  await disconnectDevice();
  expect(writableMouseIdentity(...identity)).toBe(verifiedMouseIdentity(...identity));
}

afterEach(async () => {
  await disconnectDevice();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("every wired source mouse endpoint", () => {
  it.each(models.map((m) => [`${m.name} ${m.vendorId.toString(16)}:${m.productId.toString(16)} (${m.cidMid}, ${m.sensor})`, m] as const))(
    "%s reads and writes through its own codec",
    (_, model) => exercise(model, model),
  );
});

describe("every receiver endpoint, paired round-robin with source models", () => {
  it.each(receivers.map((r, i) => [`${r.name} ${r.vendorId.toString(16)}:${r.productId.toString(16)} + ${models[(i * 7) % models.length].name}`, r, models[(i * 7) % models.length]] as const))(
    "%s reads and writes the paired model",
    (_, receiver, model) => exercise(receiver, model),
  );
});
