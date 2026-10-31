// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { KeyboardMaps } from "./KeyboardMaps";
import { useKeyboardStore } from "../../store/keyboardStore";
import { createKeyboardSettings } from "../../devices/keyboardSettings";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const onToggle = vi.fn(),
  onExport = vi.fn(),
  onImport = vi.fn(),
  onError = vi.fn();
function render(collapsed = false) {
  root.render(
    <KeyboardMaps
      collapsed={collapsed}
      onToggle={onToggle}
      onExport={onExport}
      onImport={onImport}
      onError={onError}
    />,
  );
}
function button(name: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) =>
      b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
  )!;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  MotionGlobalConfig.skipAnimations = true;
  const settings = createKeyboardSettings();
  useKeyboardStore.setState({
    maps: [
      { id: "a", name: "Default", layout: "atk68", settings },
      { id: "b", name: "Travel", layout: "atk68", settings: structuredClone(settings) },
    ],
    activeId: "a",
    past: [],
    future: [],
    saveError: "",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  MotionGlobalConfig.skipAnimations = false;
  vi.unstubAllGlobals();
});
it("filters names and offers a clear-search empty state", async () => {
  await act(async () => render());
  const search = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(search, "nomatch");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.textContent).toContain("No matching maps.");
  expect(host.querySelectorAll(".keyboard-map-row")).toHaveLength(0);
  await act(async () => button("Clear search").click());
  expect(host.querySelectorAll(".keyboard-map-row")).toHaveLength(2);
});
it("focuses the name field when a map is renamed", async () => {
  await act(async () => render());
  await act(async () => button("Actions for Travel").click());
  await act(async () => button("Rename").click());
  await act(
    async () =>
      new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      ),
  );
  expect(document.activeElement).toBe(
    document.querySelector('[role="dialog"] input'),
  );
});
it("opens a keyboard-navigable menu and restores focus with Escape", async () => {
  await act(async () => render());
  const trigger = button("Actions for Travel");
  await act(async () => trigger.click());
  const menu = document.querySelector('[role="menu"]')!;
  expect(document.activeElement?.textContent).toBe("Rename");
  await act(async () =>
    menu.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement?.textContent).toBe("Duplicate");
  await act(async () =>
    menu.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("requires confirmation before deleting an inactive map", async () => {
  await act(async () => render());
  await act(async () => button("Actions for Travel").click());
  await act(async () => button("Delete").click());
  expect(useKeyboardStore.getState().maps).toHaveLength(2);
  await act(async () => button("Cancel").click());
  expect(useKeyboardStore.getState().maps).toHaveLength(2);
  await act(async () => button("Actions for Travel").click());
  await act(async () => button("Delete").click());
  await act(async () => button("Delete map").click());
  expect(useKeyboardStore.getState().maps).toHaveLength(1);
  expect(useKeyboardStore.getState().activeId).toBe("a");
});
it("retains names and tooltips when collapsed, plus icon actions", async () => {
  await act(async () => render(true));
  expect(
    host.querySelector<HTMLButtonElement>(
      '.keyboard-map-select[title^="Travel"]',
    )!.title,
  ).toContain("Travel");
  expect(host.textContent).not.toContain("Stored locally");
  expect(host.textContent).not.toContain("New");
  expect(host.querySelector(".keyboard-map-copy")).toBeNull();
  await act(async () => {
    button("Expand maps").click();
    button("Export keyboard maps").click();
    button("Import map backup").click();
  });
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onExport).toHaveBeenCalledTimes(1);
  expect(onImport).toHaveBeenCalledTimes(1);
});
