// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MousePage from "./MousePage";
import { ToastProvider } from "../../ui/Toast";
import { connectDevice, disconnectDevice, useDeviceSession } from "../../features/device/deviceSession";
import { useConfigStore } from "../../store/configStore";
import { editSetting, getEditorMap, useMapSession } from "../../features/maps/mapSession";

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const initialStore = useConfigStore.getState();
const initialSession = useMapSession.getState();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  MotionGlobalConfig.skipAnimations = true;
  await connectDevice(true);
  useDeviceSession.setState({ safeMode: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ToastProvider><MousePage name="Mock mouse" /></ToastProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await disconnectDevice();
  host.remove();
  useConfigStore.setState(initialStore);
  useMapSession.setState(initialSession);
  MotionGlobalConfig.skipAnimations = false;
  vi.unstubAllGlobals();
});
it("lets the current mouse screen explicitly save pending button assignments", async () => {
  const buttons = getEditorMap()!.settings.buttons.map((button) =>
    button.id === "side1" ? { ...button, keyValue1: 5 } : button,
  );
  await act(async () => editSetting("buttons", buttons));
  const save = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === "Save to device")!;
  expect(save).toBeDefined();
  expect(save.disabled).toBe(false);
  expect(useConfigStore.getState().activeSettings.buttons.find((button) => button.id === "side1")!.keyValue1).not.toBe(5);
  await act(async () => save.click());
  await act(async () => {
    await vi.waitFor(() => expect(useConfigStore.getState().activeSettings.buttons.find((button) => button.id === "side1")!.keyValue1).toBe(5));
  });
  expect(useConfigStore.getState().deviceInfo.isMock).toBe(true);
  expect(host.textContent).not.toContain("Unsaved button changes");
});
