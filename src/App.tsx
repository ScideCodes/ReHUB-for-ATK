import { mouseEndpointSupportsReal } from "./devices/mouseProtocols";

import { ErrorBoundary, ToastProvider } from "./ui";

import { lazy, Suspense, useState } from "react";
import type { DeviceDefinition } from "./types/schema";
import { Header } from "./hub/Header";
import { Home } from "./hub/Home";
import { SettingsPage, WallpaperPage, Wallpaper } from "./hub/Pages";
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
  const [demo, setDemo] = useState(false);

  async function selectDevice(
    device: DeviceDefinition,
    color: number,
    mock: boolean,
  ) {
    if (useDeviceSession.getState().busy)
      throw new Error("Wait for the current mouse operation.");
    if (device.kind === "keyboard") {
      // Configs are per keyboard model: switch to (or create) a map for this keyboard's key layout.
      useKeyboardStore.getState().useLayout(layoutFor(device).key);
      setScreen({ kind: "keyboard", device, color, mock });
    } else {
      const demo =
        !mock &&
        !mouseEndpointSupportsReal(Number(device.VID), Number(device.PID));
      if (mock || demo) {
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
        )
          // Already connected: open the page now and re-read in the background (deviceOperation keeps it serialized).
          void deviceOperation(async () => {
            await refreshDevice();
          }).catch((error) =>
            useConfigStore.getState().setToast({
              message: error instanceof Error ? error.message : String(error),
              type: "error",
            }),
          );
        else {
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

  function closeTab(id: string) {
    if (id === "device") {
      setScreen({ kind: "home" });
      if (!useDeviceSession.getState().busy) void disconnectDevice();
    } else setPages((list) => list.filter((page) => page !== id));
    if (current === id) setActive("home");
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="hub hub-toastfix">
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
              setActive(id);
            }}
            // Same help document the original header button opens.
            onSleepHelp={() => window.open("https://www.yuque.com/yunyanyingraorenjian/atk/fo0btr419puekrzt", "_blank", "noopener")}
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
            {current === "settings" && <SettingsPage onBack={() => setActive("home")} />}
            {current === "wallpaper" && <WallpaperPage onBack={() => setActive("home")} />}
          </Suspense>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
