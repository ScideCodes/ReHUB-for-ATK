// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KeyboardView } from "./KeyboardView";
import { useKeyboardStore } from "../../store/keyboardStore";
import { ATK68 } from "../../devices/registry";
import { createKeyboardSettings } from "../../devices/keyboardSettings";

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
function Probe() {
  const store = useKeyboardStore();
  return <KeyboardView device={{ ...ATK68, capabilities: ["macros"] }} color={0} setColor={() => {}}
    settings={store.maps.find((map) => map.id === store.activeId)!.settings}
    edit={() => {}} mode="mock" busy={false} firmware="" history={() => {}}
    exportMaps={() => {}} importMaps={() => {}} resetMap={() => {}}
    calibrating={false} onCalibrate={() => {}} layer={0} setLayer={() => {}} onSection={() => {}} />;
}
function button(name: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === name)!;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  MotionGlobalConfig.skipAnimations = true;
  const a = createKeyboardSettings(), b = createKeyboardSettings();
  a.macros[0].name = "First macro";
  b.macros[0].name = "Second macro";
  useKeyboardStore.setState({ maps: [
    { id: "a", name: "First", layout: "atk68", settings: a },
    { id: "b", name: "Second", layout: "atk68", settings: b },
  ], activeId: "a", past: [], future: [], saveError: "" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  MotionGlobalConfig.skipAnimations = false;
  vi.unstubAllGlobals();
});
it("drops unsaved macro recorder state when changing keyboard maps", async () => {
  await act(async () => button("First macro").click());
  await act(async () => button("Start Recording").click());
  const recorder = host.querySelector(".hk-recorder")!;
  await act(async () => recorder.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX", bubbles: true })));
  expect(host.querySelectorAll(".hm-steps li")).toHaveLength(1);
  await act(async () => useKeyboardStore.getState().select("b"));
  expect(host.textContent).toContain("Please select a shortcut to edit");
  expect(host.querySelector(".hk-recorder")).toBeNull();
  await act(async () => button("Second macro").click());
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Macro name"]')!.value).toBe("Second macro");
  expect(host.querySelectorAll(".hm-steps li")).toHaveLength(0);
  expect(button("Start Recording")).toBeDefined();
});
