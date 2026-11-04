// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ATK68, DEVICE_REGISTRY } from "./devices/registry";
import { useConfigStore } from "./store/configStore";

const calls = vi.hoisted(() => ({
  disconnect: vi.fn(),
  connect: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("./features/device/deviceSession", () => ({
  disconnectDevice: calls.disconnect,
  connectDevice: calls.connect,
  refreshDevice: calls.refresh,
  deviceOperation: (run: () => Promise<void>) => run(),
  useDeviceSession: { getState: () => ({ busy: false }) },
}));
vi.mock("./ui/finishTheme", () => ({
  useFinishTheme: () => {},
  setMouseFinish: vi.fn(),
}));
vi.mock("./ui", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
  ToastProvider: ({ children }: { children: ReactNode }) => children,
  useToast: () => ({ toast: () => undefined }),
  Dialog: () => null,
}));
vi.mock("./hub/mouse/MousePage", () => ({ default: () => null }));
vi.mock("./ui/keyboard/KeyboardWorkspace", () => ({ KeyboardWorkspace: () => null }));
vi.mock("./hub/Home", () => ({
  Home: ({ onOpen }: { onOpen: (item: { device: DeviceDefinition; color: number }, mock: boolean) => Promise<void> }) => (
    <>
      <button onClick={() => void onOpen({ device: ATK68, color: 0 }, false)}>Keyboard</button>
      <button
        onClick={() =>
          void onOpen(
            {
              device: DEVICE_REGISTRY.find(
                (d) => d.kind === "mouse" && d.cid === 1 && d.mid === 4,
              )!,
              color: 0,
            },
            false,
          )
        }
      >
        Mouse
      </button>
    </>
  ),
}));
import type { DeviceDefinition } from "./types/schema";
import { App } from "./App";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("keeps the mouse connected through keyboard selection and both home routes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const mouse = DEVICE_REGISTRY.find(
    (d) => d.kind === "mouse" && d.cid === 1 && d.mid === 4,
  )!;
  const previous = useConfigStore.getState().deviceInfo;
  useConfigStore.setState({
    deviceInfo: {
      ...previous,
      connected: true,
      isMock: false,
      vendorId: Number(mouse.VID),
      productId: Number(mouse.PID),
      cid: 1,
      mid: 4,
    },
  });
  const host = document.createElement("div"),
    root = createRoot(host);
  document.body.append(host);
  const click = async (label: string) => {
    await act(async () => {
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === label)!
        .click();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  };
  try {
    await Promise.all([import("./hub/mouse/MousePage"), import("./ui/keyboard/KeyboardWorkspace")]);
    await act(async () => { root.render(<App />); await new Promise(resolve => setTimeout(resolve, 20)); });
    await click("Keyboard");
    await click("Home");
    await click("Mouse");
    await click("Home");
    await click("Mouse");
    expect(calls.disconnect).not.toHaveBeenCalled();
    expect(calls.connect).not.toHaveBeenCalled();
    expect(calls.refresh).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.colorwayHex).toBe(
      mouse.colorways![0].hex.toUpperCase(),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    useConfigStore.setState({ deviceInfo: previous });
  }
});
it("connects a supported mouse that is not already connected", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("navigator", { hid: { getDevices: vi.fn().mockResolvedValue([]) } });
  const previous = useConfigStore.getState().deviceInfo;
  useConfigStore.setState({ deviceInfo: { ...previous, connected: false } });
  const host = document.createElement("div"),
    root = createRoot(host);
  document.body.append(host);
  try {
    await import("./hub/mouse/MousePage");
    await act(async () => { root.render(<App />); await new Promise(resolve => setTimeout(resolve, 20)); });
    await act(async () => {
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Mouse")!.click();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(calls.connect).toHaveBeenCalledTimes(1);
    expect(calls.refresh).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    useConfigStore.setState({ deviceInfo: previous });
  }
});
