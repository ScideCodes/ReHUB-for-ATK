import { DesktopDeviceChooser } from './desktop/DesktopControls';
import { mouseEndpointSupportsReal } from "./devices/mouseProtocols";

import { ErrorBoundary, ToastProvider } from "./ui";

import { lazy, Suspense, useState } from "react";
import type { DeviceDefinition } from "./types/schema";
import { Header } from "./hub/Header";
import { Home } from "./hub/Home";
import { SettingsPage, WallpaperPage, Wallpaper } from "./hub/Pages";
import { notifyError } from "./hub/notifications";
import "./hub/hub.css";

import {
  connectDevice,
  useDeviceSession,
  deviceOperation,
  refreshDevice,
  disconnectDevice,
} from "./features/device/deviceSession";
import { DEVICE_REGISTRY } from "./devices/registry";
import { ATK_DEVICE_CATALOG } from "./features/device/deviceCatalog";
import { selectedColorIndex, useMouseColorway } from "./ui/mouseColorway";
import { useConfigStore } from "./store/configStore";
import { useKeyboardStore } from "./store/keyboardStore";
import { layoutFor } from "./devices/keyboardLayouts";

const MousePage = lazy(() => import("./hub/mouse/MousePage"));
const KeyboardWorkspace = lazy(() =>
  import("./ui/keyboard/KeyboardWorkspace").then((module) => ({
    default: module.KeyboardWorkspace,
  })),
);

type Screen =
  | { kind: "home" }
  | { kind: "keyboard"; device: DeviceDefinition; color: number; mock: boolean }
  | { kind: "mouse"; mock: boolean };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [active, setActive] = useState("home");
  const [pages, setPages] = useState<("settings" | "wallpaper")[]>([]);
  // Where each page was opened from, so Back returns there instead of always to Home.
  const [returnTo, setReturnTo] = useState<Record<string, string>>({});
  const [demo, setDemo] = useState(false);

  async function selectDevice(
    device: DeviceDefinition,
    color: number,
    mock: boolean,
  ) {
    if (device.kind === "keyboard") {
      // Configs are per keyboard model: switch to (or create) a map for this keyboard's key layout.
      useKeyboardStore.getState().useLayout(layoutFor(device).key);
      setScreen({ kind: "keyboard", device, color, mock });
    } else {
      const demo =
        !mock &&
        !mouseEndpointSupportsReal(Number(device.VID), Number(device.PID));
      if (mock || demo) {
        // connectDevice ignores calls while busy; refuse instead of showing the wrong device.
        if (useDeviceSession.getState().busy)
          throw new Error("Wait for the current mouse operation.");
        const nameLower = device.name.toLowerCase();
        let matched = ATK_DEVICE_CATALOG.find(
          (s) => s.name.toLowerCase() === nameLower,
        );
        if (!matched) {
          matched = ATK_DEVICE_CATALOG.find(
            (s) =>
              nameLower.includes(s.name.toLowerCase()) ||
              s.name.toLowerCase().includes(nameLower),
          );
        }
        if (!matched) {
          if (nameLower.includes("fierce x"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "fiercex");
          else if (nameLower.includes("mad"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "madr");
          else if (nameLower.includes("z1"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "z1");
          else if (nameLower.includes("f1"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "f1");
          else if (nameLower.includes("x1"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "x1");
          else if (nameLower.includes("a9"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "a9");
          else if (nameLower.includes("u2"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "u2");
          else if (nameLower.includes("r1"))
            matched = ATK_DEVICE_CATALOG.find((s) => s.family === "r1");
        }

        const cid = device.cid ?? matched?.cid ?? 1;
        const mid = device.mid ?? matched?.mid ?? 4;
        await connectDevice(true, cid, mid, device);
        useConfigStore.getState().setSelectedDevice(device);
        useDeviceSession.setState({
          demoReason: demo
            ? "Protocol unverified · Local demo · No hardware writes"
            : undefined,
        });

        useMouseColorway.getState().select(device, selectedColorIndex(device, useMouseColorway.getState().colors, color));
      } else {
        const current = useConfigStore.getState().deviceInfo;
        if (
          current.connected &&
          !current.isMock &&
          current.vendorId === Number(device.VID) &&
          current.productId === Number(device.PID)
        ) {
          // Already connected: open the page now and re-read in the background if not already busy.
          if (!useDeviceSession.getState().busy) {
            void deviceOperation(async () => {
              await refreshDevice();
            }).catch((error) =>
              useConfigStore.getState().setToast({
                message: error instanceof Error ? error.message : String(error),
                type: "error",
              }),
            );
          }
        } else {
          if (useDeviceSession.getState().busy)
            throw new Error("Wait for the current mouse operation.");
          const authorized = (await navigator.hid?.getDevices()) ?? [];
          const selected = authorized.find(
            (d) =>
              d.vendorId === Number(device.VID) &&
              d.productId === Number(device.PID) &&
              d.collections.some(
                (c) =>
                  c.usagePage === device.usagePage && c.usage === device.usage,
              ),
          );
          await connectDevice(false, 1, 4, undefined, selected);
        }
        const info = useConfigStore.getState().deviceInfo;
        useConfigStore
          .getState()
          .setSelectedDevice(
            DEVICE_REGISTRY.find(
              (model) =>
                model.kind === "mouse" &&
                model.cid === info.cid &&
                model.mid === info.mid,
            ) ?? null,
          );
      }
      if (!mock && !demo) {
        const model = useConfigStore.getState().selectedDevice;
        if (model) useMouseColorway.getState().select(model, selectedColorIndex(model, useMouseColorway.getState().colors, color));
      }
      setScreen({ kind: "mouse", mock });
    }
  }

  async function goHome() {
    setActive("home");
  }

  const deviceTab = screen.kind === "home" ? null : { id: "device", label: screen.kind === "keyboard" ? screen.device.name : (useConfigStore.getState().selectedDevice?.name ?? useConfigStore.getState().deviceInfo.name) };
  const tabs = [
    ...(deviceTab ? [deviceTab] : []),
    ...pages.map((id) => ({ id, label: id === "settings" ? "Settings" : "Background Wallpaper" })),
  ];
  const current = active === "device" && !deviceTab ? "home" : active;

  // The screen a page was opened from, if it is still open.
  function back(id: string) {
    const target = returnTo[id] ?? "home";
    return tabs.some((tab) => tab.id === target) ? target : "home";
  }

  function closeTab(id: string) {
    if (id === "device") {
      setScreen({ kind: "home" });
      if (!useDeviceSession.getState().busy) void disconnectDevice();
    } else setPages((list) => list.filter((page) => page !== id));
    if (current === id) setActive("home");
  }

  return (
    <ErrorBoundary>
      <ToastProvider onError={notifyError}>
        <div className="hub hub-toastfix">
          <DesktopDeviceChooser />
          <Wallpaper />
          <Header
            tabs={tabs}
            active={current}
            demo={demo}
            onHome={() => void goHome()}
            onTab={setActive}
            onCloseTab={closeTab}
            onDemo={() => {
              setDemo(!demo);
              if (screen.kind !== "home") closeTab("device");
              setActive("home");
            }}
            onOpenPage={(id) => {
              setPages((list) => (list.includes(id) ? list : [...list, id]));
              if (current !== id) setReturnTo((map) => ({ ...map, [id]: current }));
              setActive(id);
            }}
          />
          <Suspense fallback={<div className="hub-body" />}>
            {current === "home" && (
              <Home
                demo={demo}
                onOpen={async (item, mock) => {
                  await selectDevice(item.device, item.color, mock);
                  setActive("device");
                }}
              />
            )}
            {current === "device" && screen.kind === "keyboard" && (
              <KeyboardWorkspace
                key={`${screen.device.id}:${screen.color}:${screen.mock}`}
                device={screen.device}
                initialColor={screen.color}
                initialMock={screen.mock}
              />
            )}
            {current === "device" && screen.kind === "mouse" && deviceTab && <MousePage name={deviceTab.label} />}
            {current === "settings" && <SettingsPage onBack={() => setActive(back("settings"))} />}
            {current === "wallpaper" && <WallpaperPage onBack={() => setActive(back("wallpaper"))} />}
          </Suspense>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
