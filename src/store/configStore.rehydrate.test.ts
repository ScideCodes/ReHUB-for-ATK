// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { useConfigStore } from "./configStore";

describe("saved map rehydration", () => {
  it("keeps defaults and backs up corrupt saved maps instead of loading them", async () => {
    const defaults = useConfigStore.getState().maps;
    const corrupt = JSON.stringify({ state: { maps: [{ id: "x", name: "broken" }], activeMapId: "x" }, version: 0 });
    localStorage.setItem("atk-webhid-config-storage", corrupt);
    await useConfigStore.persist.rehydrate();
    expect(useConfigStore.getState().maps).toEqual(defaults);
    expect(localStorage.getItem("atk-webhid-config-storage.invalid")).toBe(corrupt);
  });
  it("loads valid saved maps and repairs a missing active map", async () => {
    const maps = useConfigStore.getState().maps.slice(0, 1);
    localStorage.setItem("atk-webhid-config-storage", JSON.stringify({ state: { maps, activeMapId: "gone" }, version: 0 }));
    await useConfigStore.persist.rehydrate();
    expect(useConfigStore.getState().maps).toHaveLength(1);
    expect(useConfigStore.getState().activeMapId).toBe(maps[0].id);
  });
});
