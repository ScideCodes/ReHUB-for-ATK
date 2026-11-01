// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vitest";
import { useKeyboardStore } from "./keyboardStore";
import { createKeyboardSettings } from "../devices/keyboardSettings";
import { rowsForLayout } from "../devices/keyboardLayouts";
beforeEach(() => {
  const a = createKeyboardSettings(),
    b = createKeyboardSettings();
  b.pollingRate = 8000;
  useKeyboardStore.setState({
    maps: [
      { id: "a", name: "First", layout: "atk68", settings: a },
      { id: "b", name: "Second", layout: "atk68", settings: b },
    ],
    activeId: "a",
    past: [structuredClone(a)],
    future: [],
    saveError: "",
  });
});
it("renames an inactive map without changing selection or undo history", () => {
  const history = useKeyboardStore.getState().past;
  useKeyboardStore.getState().rename("  Travel  ", "b");
  const state = useKeyboardStore.getState();
  expect(state.maps[1].name).toBe("Travel");
  expect(state.activeId).toBe("a");
  expect(state.past).toBe(history);
  expect(() => state.rename(" ", "b")).toThrow();
});
it("duplicates the requested source, selects the copy, and isolates its settings", () => {
  useKeyboardStore.getState().add(true, "b");
  const state = useKeyboardStore.getState(),
    copy = state.maps[2];
  expect(copy.name).toBe("Second copy");
  expect(copy.settings.pollingRate).toBe(8000);
  expect(state.activeId).toBe(copy.id);
  expect(copy.settings).not.toBe(state.maps[1].settings);
});
it("deletes inactive maps without erasing the active history", () => {
  const history = useKeyboardStore.getState().past;
  useKeyboardStore.getState().remove("b");
  expect(useKeyboardStore.getState().activeId).toBe("a");
  expect(useKeyboardStore.getState().past).toBe(history);
  expect(() => useKeyboardStore.getState().remove("a")).toThrow(
    "Keep at least one map for this keyboard",
  );
});
it("keeps existing active-map actions and unknown-ID guards", () => {
  const state = useKeyboardStore.getState();
  for (const fn of [
    () => state.rename("Oops", "missing"),
    () => state.remove("missing"),
    () => state.add(true, "missing"),
  ])
    expect(fn).toThrow("Map not found");
  expect(useKeyboardStore.getState().maps).toHaveLength(2);
  state.rename("Renamed");
  expect(useKeyboardStore.getState().maps[0].name).toBe("Renamed");
  state.remove();
  expect(useKeyboardStore.getState().activeId).toBe("b");
  expect(useKeyboardStore.getState().past).toEqual([]);
});
it("imports mixed-layout backups with the current keyboard selected", () => {
  useKeyboardStore.getState().importMaps({
    kind: "atk-keyboard-maps", version: 1,
    maps: [
      { id: "other", name: "Other", layout: "kb_60", settings: createKeyboardSettings(rowsForLayout("kb_60")) },
      { id: "current", name: "Current", layout: "atk68", settings: createKeyboardSettings() },
    ],
  }, "atk68");
  expect(useKeyboardStore.getState().activeId).toBe("current");
});
it("rejects backups without the current keyboard before replacing maps", () => {
  const maps = useKeyboardStore.getState().maps;
  expect(() => useKeyboardStore.getState().importMaps({
    kind: "atk-keyboard-maps", version: 1, maps,
  }, "kb_60")).toThrow("no maps for this keyboard layout");
  expect(useKeyboardStore.getState().maps).toBe(maps);
  expect(useKeyboardStore.getState().activeId).toBe("a");
});
it("rejects incomplete or mismatched non-ATK68 map matrices before replacement", () => {
  const maps = useKeyboardStore.getState().maps;
  const reordered = createKeyboardSettings(rowsForLayout("kb_60"));
  [reordered.keys[0], reordered.keys[1]] = [reordered.keys[1], reordered.keys[0]];
  for (const settings of [createKeyboardSettings(), reordered, { ...createKeyboardSettings(rowsForLayout("kb_60")), keys: [] }]) {
    expect(() => useKeyboardStore.getState().importMaps({
      kind: "atk-keyboard-maps", version: 1,
      maps: [{ id: "wrong", name: "Edge", layout: "kb_60", settings }],
    }, "kb_60")).toThrow();
    expect(useKeyboardStore.getState().maps).toBe(maps);
  }
});
