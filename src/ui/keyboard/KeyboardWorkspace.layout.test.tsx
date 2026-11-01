// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { KeyboardWorkspace } from "./KeyboardWorkspace";
import { ToastProvider } from "../Toast";
import { useKeyboardStore } from "../../store/keyboardStore";
import { DEVICE_REGISTRY } from "../../devices/registry";
import { layoutFor } from "../../devices/keyboardLayouts";
import { createKeyboardSettings } from "../../devices/keyboardSettings";

vi.mock("../../hub/keyboard/KeyboardView", () => ({
  KeyboardView: ({ resetMap }: { resetMap: () => void }) => (
    <button onClick={resetMap}>Reset test map</button>
  ),
}));
const device = DEVICE_REGISTRY.find((item) => item.id === "atk-edge-60-10b0")!;
const layout = layoutFor(device);
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  MotionGlobalConfig.skipAnimations = true;
  const settings = createKeyboardSettings(layout.rows);
  settings.pollingRate = 8000;
  useKeyboardStore.setState({
    maps: [
      { id: "other", name: "ATK68", layout: "atk68", settings: createKeyboardSettings() },
      { id: "edge", name: "Edge", layout: layout.key, settings },
      { id: "edge-copy", name: "Edge copy", layout: layout.key, settings: structuredClone(settings) },
    ],
    activeId: "edge-copy", past: [], future: [], saveError: "",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(
    <ToastProvider><KeyboardWorkspace device={device} initialColor={0} initialMock /></ToastProvider>,
  ));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  MotionGlobalConfig.skipAnimations = false;
  vi.unstubAllGlobals();
});
it("resets a non-ATK68 keyboard using its own matrix and keeps undo", async () => {
  const previous = useKeyboardStore.getState().maps[2].settings;
  await act(async () => host.querySelector("button")!.click());
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .find((button) => button.textContent === "Confirm")!.click());
  const state = useKeyboardStore.getState();
  expect(state.maps[2].settings).toEqual(createKeyboardSettings(layout.rows));
  expect(state.past.at(-1)).toEqual(previous);
});
it("numbers choose only maps for the current keyboard layout", async () => {
  await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true })));
  expect(useKeyboardStore.getState().activeId).toBe("edge");
  await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true })));
  expect(useKeyboardStore.getState().activeId).toBe("edge-copy");
});
it("keeps recorded digits and handled keys from changing maps", async () => {
  const recorder = document.createElement("div");
  recorder.className = "hk-recorder";
  host.append(recorder);
  await act(async () => recorder.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true })));
  expect(useKeyboardStore.getState().activeId).toBe("edge-copy");
  const handled = new KeyboardEvent("keydown", { key: "1", bubbles: true, cancelable: true });
  handled.preventDefault();
  await act(async () => document.body.dispatchEvent(handled));
  expect(useKeyboardStore.getState().activeId).toBe("edge-copy");
});
