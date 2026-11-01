import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hidClient } from "../../hid/hidClient";
import { useConfigStore } from "../../store/configStore";
import { DeviceSettingsSchema, type SettingsMap } from "../../types/schema";
import { mapHref, resolveMapHash } from "../../app/navigation";
import { settingsDiff } from "./MapDiff";
import { parseMapFile, serializeMaps } from "./mapFiles";
import {
  deleteEditorMap,
  editMetadata,
  editSetting,
  editSettings,
  flushMaps,
  getEditorMap,
  reorderMaps,
  replaceMaps,
  selectEditorMap,
  travelHistory,
  useMapSession,
} from "./mapSession";

const initialStore = useConfigStore.getState();
const initialSession = useMapSession.getState();
function makeMap(id: string): SettingsMap {
  return {
    id,
    name: `Map ${id}`,
    color: "#FF6A1A",
    icon: "Bookmark",
    note: "",
    createdAt: 1,
    updatedAt: 1,
    settings: DeviceSettingsSchema.parse({}),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  replaceMaps([makeMap("a"), makeMap("b")]);
});
afterEach(() => {
  flushMaps();
  useConfigStore.setState(initialStore);
  useMapSession.setState(initialSession);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("offline map editor", () => {
  it("autosaves after the debounce and never sends a device command while editing", () => {
    const transfer = vi.spyOn(hidClient, "transfer");
    const snapshot = structuredClone(useConfigStore.getState().activeSettings);
    editSetting("pollingRate", 4000);
    expect(getEditorMap()?.settings.pollingRate).toBe(4000);
    expect(useConfigStore.getState().maps[0].settings.pollingRate).toBe(1000);
    vi.advanceTimersByTime(499);
    expect(useConfigStore.getState().maps[0].settings.pollingRate).toBe(1000);
    vi.advanceTimersByTime(1);
    expect(useConfigStore.getState().maps[0].settings.pollingRate).toBe(4000);
    expect(useMapSession.getState().saveStatus.a).toBe("saved");
    expect(useConfigStore.getState().activeSettings).toEqual(snapshot);
    expect(transfer).not.toHaveBeenCalled();
  });
  it("keeps undo and redo histories independent across maps", () => {
    editSetting("pollingRate", 2000);
    vi.advanceTimersByTime(500);
    editSetting("pollingRate", 4000);
    selectEditorMap("b");
    editSetting("motionSync", false);
    travelHistory("undo");
    expect(getEditorMap()?.settings.motionSync).toBe(true);
    selectEditorMap("a");
    travelHistory("undo");
    expect(getEditorMap()?.settings.pollingRate).toBe(2000);
    travelHistory("redo");
    expect(getEditorMap()?.settings.pollingRate).toBe(4000);
    selectEditorMap("b");
    travelHistory("redo");
    expect(getEditorMap()?.settings.motionSync).toBe(false);
  });
  it("coalesces continuous edits and restores atomic stage-count changes", () => {
    editSetting("pollingRate", 2000);
    editSetting("pollingRate", 4000);
    editSetting("pollingRate", 8000);
    travelHistory("undo");
    expect(getEditorMap()?.settings.pollingRate).toBe(1000);
    const map = getEditorMap()!;
    editSettings(
      { dpiStages: map.settings.dpiStages.slice(0, 1), activeDpiStage: 0 },
      "dpiStages",
    );
    travelHistory("undo");
    expect(getEditorMap()?.settings.dpiStages).toHaveLength(4);
    expect(getEditorMap()?.settings.activeDpiStage).toBe(1);
  });
  it("restores deleted maps at their original position and preserves their history", () => {
    editMetadata({ note: "Saved before deletion" });
    const undo = deleteEditorMap("a");
    expect(useConfigStore.getState().maps.map((map) => map.id)).toEqual(["b"]);
    undo();
    expect(useConfigStore.getState().maps.map((map) => map.id)).toEqual([
      "a",
      "b",
    ]);
    expect(getEditorMap()?.note).toBe("Saved before deletion");
    travelHistory("undo");
    expect(getEditorMap()?.note).toBe("");
  });
  it("reorders maps without changing the selected snapshot", () => {
    editSetting("pollingRate", 4000);
    reorderMaps(["b", "a"]);
    expect(useConfigStore.getState().maps.map((map) => map.id)).toEqual([
      "b",
      "a",
    ]);
    expect(getEditorMap()?.id).toBe("a");
    expect(getEditorMap()?.settings.pollingRate).toBe(4000);
    expect(() => reorderMaps(["b", "b"])).toThrow(/order/);
  });
});

describe("versioned map files", () => {
  it("rejects duplicate button and stage identities before imported maps can be applied", () => {
    const duplicateButtons = makeMap("a");
    duplicateButtons.settings.buttons[1] = structuredClone(duplicateButtons.settings.buttons[0]);
    expect(() => parseMapFile(JSON.stringify([duplicateButtons]))).toThrow(/invalid settings/);
    const duplicateStages = makeMap("a");
    duplicateStages.settings.dpiStages[1].stage = 0;
    expect(() => parseMapFile(JSON.stringify([duplicateStages]))).toThrow(/invalid settings/);
    const missingButtons = makeMap("a");
    missingButtons.settings.buttons = [];
    expect(() => parseMapFile(JSON.stringify([missingButtons]))).toThrow(/invalid settings/);
    const impreciseTimer = makeMap("a");
    impreciseTimer.settings.sleepTime = 61;
    expect(() => parseMapFile(JSON.stringify([impreciseTimer]))).toThrow(/invalid settings/);
  });
  it("roundtrips all settings and migrates existing array exports", () => {
    const maps = [makeMap("a"), makeMap("b")];
    maps[0].settings.sensorPowerMode = "LP";
    maps[0].note = "Offline configuration";
    expect(parseMapFile(serializeMaps(maps))).toEqual(maps);
    expect(parseMapFile(JSON.stringify(maps))).toEqual(maps);
  });
  it("gives every parse its own default objects", () => {
    const a = DeviceSettingsSchema.parse({}),
      b = DeviceSettingsSchema.parse({});
    expect(a.dpiStages[0]).not.toBe(b.dpiStages[0]);
    expect(a.buttons[0]).not.toBe(b.buttons[0]);
    expect(a.fastTrigger).not.toBe(b.fastTrigger);
    expect(a.sensorCenterPoint).not.toBe(b.sensorCenterPoint);
  });
  it("rejects oversized files before parsing them", () => {
    expect(() => parseMapFile(" ".repeat(4_000_001))).toThrow(/4 MB/);
  });
  it("rejects invalid settings, duplicate IDs, and future versions before replacing data", () => {
    const before = structuredClone(useConfigStore.getState().maps);
    expect(() => parseMapFile("{")).toThrow(/JSON/);
    expect(() =>
      parseMapFile(JSON.stringify({ schemaVersion: 2, maps: before })),
    ).toThrow(/version/);
    expect(() =>
      parseMapFile(JSON.stringify([makeMap("a"), makeMap("a")])),
    ).toThrow(/unique/);
    const invalid = makeMap("invalid");
    invalid.settings.pollingRate = 999 as never;
    expect(() => parseMapFile(JSON.stringify([invalid]))).toThrow(/settings/);
    const stages = makeMap("stages");
    stages.settings.activeDpiStage = 7;
    expect(() => parseMapFile(JSON.stringify([stages]))).toThrow(/stages/);
    expect(useConfigStore.getState().maps).toEqual(before);
  });
  it("resolves renamed and duplicate-name map deep links by ID", () => {
    const first = makeMap("a");
    const second = { ...makeMap("b"), name: first.name };
    expect(resolveMapHash(mapHref(second), [first, second])?.id).toBe("b");
    expect(resolveMapHash("#/map/%", [first])).toBeUndefined();
  });
  it("excludes legacy DPI colors and the unsupported bottom button from hardware differences", () => {
    const a = DeviceSettingsSchema.parse({});
    const b = structuredClone(a);
    b.dpiStages[0].color = "#000000";
    b.buttons[5].keyValue1 = 2;
    expect(settingsDiff(a, b)).toEqual([]);
    b.motionSync = false;
    expect(settingsDiff(a, b).map((difference) => difference.path)).toEqual([
      "motionSync",
    ]);
  });
});
