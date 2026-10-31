// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeviceSettingsSchema, type SettingsMap } from "../../types/schema";
import { useConfigStore } from "../../store/configStore";
import {
  useDeviceSession,
  connectDevice,
  disconnectDevice,
} from "../../features/device/deviceSession";
import {
  editSetting,
  getEditorMap,
  replaceMaps,
  flushMaps,
  useMapSession,
} from "../../features/maps/mapSession";
import { MockHidDevice } from "../../mock/mockDevice";
import { dismissApplyBanner, startLiveApply, useLiveApply } from "./liveApply";
const initial = useConfigStore.getState();
const session = useMapSession.getState();
let stop: () => void;
function map(): SettingsMap {
  return {
    id: "live-test",
    name: "Test",
    color: "#FF6A1A",
    icon: "Bookmark",
    note: "",
    createdAt: 1,
    updatedAt: 1,
    settings: DeviceSettingsSchema.parse({}),
  };
}
const writes = () =>
  useDeviceSession
    .getState()
    .logs.filter(
      (log) => log.direction === "out" && /^(07|14|16) /.test(log.hex),
    );
beforeEach(async () => {
  await connectDevice(true);
  useDeviceSession.setState({ safeMode: false, logs: [] });
  replaceMaps([map()]);
  vi.useFakeTimers();
  stop = startLiveApply();
});
afterEach(async () => {
  stop();
  vi.restoreAllMocks();
  flushMaps();
  vi.useRealTimers();
  await disconnectDevice();
  useConfigStore.setState(initial);
  useMapSession.setState(session);
});
it("coalesces rapid commits into one batch and leaves unchanged values unwritten", async () => {
  editSetting("pollingRate", 2000);
  await vi.advanceTimersByTimeAsync(200);
  editSetting("pollingRate", 4000);
  await vi.advanceTimersByTimeAsync(299);
  expect(writes()).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(250);
  expect(writes()).toHaveLength(1);
  expect(useConfigStore.getState().activeSettings.pollingRate).toBe(4000);
  editSetting("pollingRate", 4000);
  await vi.advanceTimersByTimeAsync(500);
  expect(writes()).toHaveLength(1);
});
it.each(["unknown", "disconnected", "busy"])(
  "keeps %s edits local without replaying them later",
  async (mode) => {
    if (mode === "busy") useDeviceSession.setState({ busy: true });
    if (mode === "unknown" || mode === "disconnected")
      useConfigStore.setState((s) => ({
        deviceInfo: {
          ...s.deviceInfo,
          connected: mode !== "disconnected",
          cid: 99,
        },
      }));
    editSetting("pollingRate", 4000);
    await vi.advanceTimersByTimeAsync(500);
    expect(writes()).toHaveLength(0);
    expect(getEditorMap()?.settings.pollingRate).toBe(4000);
    useDeviceSession.setState({ safeMode: false, busy: false });
    useConfigStore.setState((s) => ({
      deviceInfo: { ...s.deviceInfo, connected: true, cid: 1 },
    }));
    await vi.advanceTimersByTimeAsync(500);
    expect(writes()).toHaveLength(0);
  },
);
it("does not include button edits or pre-existing offline differences in live saves", async () => {
  useDeviceSession.setState({ busy: true });
  editSetting("pollingRate", 8000);
  useDeviceSession.setState({ busy: false });
  editSetting(
    "buttons",
    getEditorMap()!.settings.buttons.map((b) =>
      b.id === "left" ? { ...b, keyValue1: 2 } : b,
    ),
  );
  editSetting("motionSync", false);
  await vi.advanceTimersByTimeAsync(600);
  expect(useConfigStore.getState().activeSettings.motionSync).toBe(false);
  expect(useConfigStore.getState().activeSettings.pollingRate).toBe(1000);
  expect(getEditorMap()?.settings.pollingRate).toBe(8000);
  expect(useConfigStore.getState().activeSettings.buttons[0].keyValue1).toBe(1);
  expect(writes().every((log) => !/07 00 00 60/.test(log.hex))).toBe(true);
});

it("reverts failed controls to the last acknowledged state and exposes retry", async () => {
  const original = MockHidDevice.prototype.sendReport;
  vi.spyOn(MockHidDevice.prototype, "sendReport").mockImplementation(function (
    this: MockHidDevice,
    report,
    data,
  ) {
    if (data[0] === 7) return Promise.reject(new Error("Write rejected"));
    return original.call(this, report, data);
  });
  editSetting("pollingRate", 4000);
  await vi.advanceTimersByTimeAsync(1500);
  expect(getEditorMap()?.settings.pollingRate).toBe(
    useConfigStore.getState().activeSettings.pollingRate,
  );
  expect(getEditorMap()?.settings.pollingRate).toBe(1000);
  expect(useLiveApply.getState().status).toBe("error");
  expect(useLiveApply.getState().reason).toContain("Write rejected");
  vi.restoreAllMocks();
  useLiveApply.getState().retry?.();
  await vi.advanceTimersByTimeAsync(600);
  expect(useConfigStore.getState().activeSettings.pollingRate).toBe(4000);
});
it("serializes a single follow-up batch for commits arriving mid-save", async () => {
  const original = MockHidDevice.prototype.sendReport;
  vi.spyOn(MockHidDevice.prototype, "sendReport").mockImplementation(
    async function (this: MockHidDevice, report, data) {
      if (data[0] === 7)
        await new Promise((resolve) => setTimeout(resolve, 200));
      return original.call(this, report, data);
    },
  );
  editSetting("pollingRate", 2000);
  await vi.advanceTimersByTimeAsync(330);
  expect(useConfigStore.getState().isApplying).toBe(true);
  editSetting("pollingRate", 4000);
  editSetting("pollingRate", 8000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(writes()).toHaveLength(2);
  expect(useConfigStore.getState().activeSettings.pollingRate).toBe(8000);
});
it("writes undo and redo as committed edits", async () => {
  editSetting("pollingRate", 4000);
  await vi.advanceTimersByTimeAsync(600);
  const { travelHistory } = await import("../../features/maps/mapSession");
  travelHistory("undo");
  await vi.advanceTimersByTimeAsync(600);
  expect(useConfigStore.getState().activeSettings.pollingRate).toBe(1000);
  travelHistory("redo");
  await vi.advanceTimersByTimeAsync(600);
  expect(useConfigStore.getState().activeSettings.pollingRate).toBe(4000);
});

it("never writes DPI when only a stage color changes", async () => {
  useDeviceSession.setState({ busy: true });
  editSetting(
    "dpiStages",
    getEditorMap()!.settings.dpiStages.map((stage) => ({
      ...stage,
      xDpi: 4000,
      yDpi: 4000,
    })),
  );
  useDeviceSession.setState({ busy: false });
  editSetting(
    "dpiStages",
    getEditorMap()!.settings.dpiStages.map((stage) => ({
      ...stage,
      color: "#FFFFFF",
    })),
  );
  await vi.advanceTimersByTimeAsync(600);
  expect(writes()).toHaveLength(0);
});

it("writes committed DPI with Safe Mode on into the known mock device", async () => {
  useDeviceSession.setState({ safeMode: true });
  editSetting(
    "dpiStages",
    getEditorMap()!.settings.dpiStages.map((stage, index) =>
      index === 0 ? { ...stage, xDpi: 2400, yDpi: 2400 } : stage,
    ),
  );
  await vi.advanceTimersByTimeAsync(700);
  expect(writes()).toHaveLength(1);
  expect(useConfigStore.getState().deviceInfo.isMock).toBe(true);
  expect(useConfigStore.getState().activeSettings.dpiStages[0].xDpi).toBe(2400);
  const { refreshDevice } = await import("../../features/device/deviceSession");
  const read = refreshDevice();
  await vi.advanceTimersByTimeAsync(1000);
  await read;
  expect(useConfigStore.getState().activeSettings.dpiStages[0].xDpi).toBe(2400);
});

it("does not re-arm reconnect banner when switching models in mock mode, and respects dismissal", async () => {
  dismissApplyBanner();
  expect(useLiveApply.getState().reconnect).toBe(false);

  // Switch to another mock device model
  useConfigStore.setState((s) => ({
    deviceInfo: {
      ...s.deviceInfo,
      productId: 43,
      mid: 43,
    },
  }));
  await vi.advanceTimersByTimeAsync(100);
  expect(useLiveApply.getState().reconnect).toBe(false);
});
