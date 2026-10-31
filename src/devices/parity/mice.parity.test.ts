import { afterEach, expect, it, vi } from "vitest";
import fixtures from "./mice.json";
import images from "./mouse-images.json";
import { MockHidDevice } from "../../mock/mockDevice";
import { allowUntestedMouseWrites, findPairedMouseModel, verifiedMouseIdentity } from "../mouseProtocols";
import { findDeviceSpec } from "../../features/device/deviceCatalog";
import { applySettingsToDevice, connectDevice, disconnectDevice } from "../../features/device/deviceSession";
import { useConfigStore } from "../../store/configStore";
import type { DeviceSettings } from "../../types/schema";

// Parity with the original driver: scripts/parity/mice.mjs ran the original Wt controller on these EEPROM images, one
// UI action per scenario, and recorded the bytes it changed and its non-EEPROM commands. The same action is replayed
// here through this app's real apply path (consent, planner, readback) on a mock holding the same image.
const ultimate = (s: string) => s === "PAW3950Ultra" || s === "PAW3955MASTER";
const actions: Record<string, (s: DeviceSettings, sensor: string) => void> = {
  polling2000: (s) => void (s.pollingRate = 2000),
  dpiStage2to1200: (s) => void (s.dpiStages[1] = { ...s.dpiStages[1], xDpi: 1200, yDpi: 1200 }),
  debounce4: (s) => void (s.keyDebounce = 4),
  sleep120: (s) => void (s.sleepTime = 120),
  motionSyncOff: (s) => void (s.motionSync = false),
  lod: (s, sensor) => void (s.lod = ultimate(sensor) ? 1.5 : 2),
  dpiButtonOff: (s) => void (s.dpiButtonEnabled = false),
  farDistanceOn: (s) => void (s.longDistanceMode = true),
  angle10: (s) => void ((s.sensorAngle = 10), (s.sensorAngleEnabled = true)),
  sensorCompetitive: (s) => void (s.sensorPowerMode = "HP"),
  sensorCompetitiveMax: (s) => void (s.sensorPowerMode = "MAX"),
};

async function replay(f: (typeof fixtures)[number]) {
  const image = images.find((m) => m.name === f.model)!;
  vi.stubGlobal("navigator", { hid: { addEventListener: vi.fn() } });
  const device = new MockHidDevice(image.cid, image.mid);
  device.vendorId = image.vid;
  device.productId = image.pid;
  device.eeprom.fill(0);
  device.eeprom.set(image.eeprom);
  const send = vi.spyOn(device, "sendReport");
  await connectDevice(false, image.cid, image.mid, undefined, device as unknown as HIDDevice);
  const identity = [image.vid, image.pid, image.cid, image.mid] as const;
  if (!verifiedMouseIdentity(...identity)) allowUntestedMouseWrites(...identity);
  const before = Uint8Array.from(device.eeprom);
  send.mockClear();
  const draft = structuredClone(useConfigStore.getState().activeSettings);
  actions[f.scenario](draft, f.sensor);
  const skipped = await applySettingsToDevice(draft);
  const changes: number[][] = [];
  for (let a = 0; a < 8192; a++) if (device.eeprom[a] !== before[a]) changes.push([a, device.eeprom[a]]);
  const commands = send.mock.calls.map(([, frame]) => [...frame.slice(0, 15)]).filter((frame) => [20, 22, 24].includes(frame[0]));
  await disconnectDevice();
  return { changes, commands, skipped };
}

afterEach(async () => {
  await disconnectDevice();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Documented exceptions; everything else must match byte for byte.
// 1. Controls the original does not show for this model offline: far distance on noFarDistance models, and rotation
//    on CID 2 mice (needs a firmware threshold from ATK's server) unless our catalog marks rotation. We hold those.
//    Competitive MAX is likewise shown only on CID 1 mice offline (same server threshold).
// 2. bhop on CID 2 mice: without that server data the original's config has no bhop, so je.create writes 00 00 at
//    EEPROM 6-7. We rewrite the bytes we read instead (identical to the original whenever it knows the mouse's bhop).
function expected(f: (typeof fixtures)[number]) {
  const image = images.find((m) => m.name === f.model)!;
  const model = findPairedMouseModel(image.cid, image.mid)!;
  const spec = findDeviceSpec(image.cid, image.mid);
  const offered =
    (f.scenario !== "farDistanceOn" || !model.noFarDistance) &&
    (f.scenario !== "angle10" || image.cid === 1 || !!spec?.hasSensorAngle) &&
    (f.scenario !== "sensorCompetitiveMax" || image.cid === 1);
  if (!offered) return { changes: [], commands: [] };
  const changes = image.cid === 1 ? f.changes : f.changes.filter(([address]) => address !== 6 && address !== 7);
  return { changes, commands: f.commands };
}

it.each(fixtures.map((f) => [`${f.model} (${f.sensor}) ${f.scenario}`, f] as const))("%s matches the original", async (_, f) => {
  const ours = await replay(f);
  expect({ changes: ours.changes, commands: ours.commands }, JSON.stringify(ours.skipped)).toEqual(expected(f));
});
