// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vitest";
import { useKeyboardStore } from "./keyboardStore";
import { createKeyboardSettings } from "../devices/keyboardSettings";
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
