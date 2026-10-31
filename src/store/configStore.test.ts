import { describe, it, expect, beforeEach } from "vitest";
import { useConfigStore } from "./configStore";

describe("Map Switcher & Store Actions", () => {
  beforeEach(async () => {
    // Reset to mock device
    const store = useConfigStore.getState();
    await store.connectMock();
  });

  it("selects and applies map to device", async () => {
    const store = useConfigStore.getState();
    await store.applyMap("map-comp-8k");

    const updated = useConfigStore.getState();
    expect(updated.activeMapId).toBe("map-comp-8k");
    expect(updated.activeSettings.pollingRate).toBe(8000);
    expect(updated.activeSettings.keyDebounce).toBe(1);
    expect(updated.activeSettings.motionSync).toBe(true);
  });

  it("allows modifying draft settings and reverting to map defaults", () => {
    const store = useConfigStore.getState();
    store.updateDraft("pollingRate", 250);
    expect(useConfigStore.getState().draftSettings.pollingRate).toBe(250);

    store.revertToActiveMap();
    expect(useConfigStore.getState().draftSettings.pollingRate).toBe(8000);
  });

  it("saves current draft as a new custom map", () => {
    const store = useConfigStore.getState();
    store.updateDraft("keyDebounce", 5);
    const newId = store.saveCurrentAsMap("Test Custom Map");

    const updated = useConfigStore.getState();
    const created = updated.maps.find((m) => m.id === newId);
    expect(created).toBeDefined();
    expect(created?.name).toBe("Test Custom Map");
    expect(created?.settings.keyDebounce).toBe(5);
  });

  it("duplicates and deletes maps cleanly", () => {
    const store = useConfigStore.getState();
    const dupId = store.duplicateMap("map-comp-8k");
    expect(useConfigStore.getState().maps.some((m) => m.id === dupId)).toBe(
      true,
    );

    store.deleteMap(dupId);
    expect(useConfigStore.getState().maps.some((m) => m.id === dupId)).toBe(
      false,
    );
  });

  it("correctly undos the previous applied settings", async () => {
    const store = useConfigStore.getState();
    await store.applyMap("map-battery-1k");
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(1000);

    await store.applyMap("map-comp-8k");
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(8000);

    await store.undoApply();
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(1000);
  });
});
