import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  CircleDot,
  Command,
  Crosshair,
  LayoutGrid,
  Mouse,
  Plus,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { FEATURES, type FeatureId } from "../../app/navigation";
import { useHubShortcuts } from "../../app/shortcuts";
import { useConfigStore } from "../../store/configStore";
import { useDeviceSession } from "../../features/device/deviceSession";
import { travelHistory, useMapSession } from "../../features/maps/mapSession";
import { Button, CommandPalette, Dialog, type PaletteCommand } from "../index";
import { setMouseFinish } from "../finishTheme";
import { LiveApplyBridge } from "./LiveControls";
import { CompactDeviceBar, ConsoleHeader, DevicePanel } from "./Chrome";
import { ConsoleShell } from "../console/ConsoleShell";
import { AppearanceLayer } from "../console/Appearance";
import { isDeviceFeatureSupported } from "../../features/device/deviceFeatures";
import { DEVICES } from "../../protocol/constants";
import {
  BackupDialog,
  DeviceTools,
  DiffDialog,
  MapTools,
  NewMapDialog,
  SystemTools,
} from "./Utilities";
import { ProfileToolbar } from "./ProfileToolbar";
import { DpiTab } from "./tabs/DpiTab";
import { ButtonsTab } from "./tabs/ButtonsTab";
import { PerformanceTab } from "./tabs/PerformanceTab";
import { LightingTab } from "./tabs/LightingTab";
import { DebounceTab } from "./tabs/DebounceTab";
import { PowerTab } from "./tabs/PowerTab";
import { MacroTab } from "./tabs/MacroTab";

// Section names and order follow the original driver's "Mouse Configuration" sidebar.
const tabs = [
  { id: "buttons", label: "Key Change Settings", icon: Mouse },
  { id: "macro", label: "Macro Settings", icon: Command },
  { id: "sensitivity", label: "DPI Settings", icon: Crosshair },
  { id: "performance", label: "Performance Settings", icon: Activity },
  { id: "clicks", label: "Parameter Settings", icon: SlidersHorizontal },
  { id: "lighting", label: "Lighting Settings", icon: Sparkles },
  { id: "maps", label: "Configuration Management", icon: LayoutGrid },
  { id: "device", label: "Other settings", icon: Settings2 },
] as const;
function ParameterScreen() {
  return (
    <>
      <DebounceTab />
      <PowerTab />
    </>
  );
}
const screens = {
  sensitivity: DpiTab,
  buttons: ButtonsTab,
  performance: PerformanceTab,
  lighting: LightingTab,
  clicks: ParameterScreen,
  power: PowerTab,
  macro: MacroTab,
  device: DeviceTools,
  maps: MapTools,
  system: SystemTools,
};
const descriptions: Record<string, string> = {
  sensitivity: "DPI stages and axis settings.",
  buttons: "Five buttons. Individual assignments.",
  performance: "Report rate and sensor behavior.",
  lighting: "Receiver indicator and model capabilities.",
  clicks: "Click timing, sleep, and sensor standby.",
  power: "Battery, sleep, and sensor standby.",
  macro: "Record and assign keyboard sequences.",
  device: "Connection, firmware, and onboard memory.",
  maps: "Config files on this computer: names, notes, and comparisons.",
  system: "Appearance, safety, and diagnostics.",
};

export function Workbench({ onDevices }: { onDevices?: () => void } = {}) {
  const demoReason = useDeviceSession((state) => state.demoReason);
  const hub = useHub();
  const reduced = useReducedMotion();
  const maps = useConfigStore((state) => state.maps);
  const activeMapId = useConfigStore((state) => state.activeMapId);
  const info = useConfigStore((state) => state.deviceInfo);
  const selectedDevice = useConfigStore((state) => state.selectedDevice);
  const busy = useDeviceSession((state) => state.busy);
  const saveError = useMapSession((state) => state.saveError);
  const [editLocal, setEditLocal] = useState(false);
  const [macro, setMacro] = useState(false);
  const [macroVisited, setMacroVisited] = useState(false);
  const [macroDirty, setMacroDirty] = useState(false);
  const [backup, setBackup] = useState(false);
  const [diff, setDiff] = useState(false);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);

  const activeDevice = useMemo(() => {
    if (selectedDevice) return selectedDevice;
    return DEVICES.find((d) => d.name === info.name) ?? null;
  }, [selectedDevice, info.name]);

  const availableTabs = useMemo(() => {
    return tabs.filter((tab: (typeof tabs)[number]) =>
      isDeviceFeatureSupported(tab.id, activeDevice),
    );
  }, [activeDevice]);
  const active = macro ? "macro" : hub.feature;
  useHubShortcuts(maps, activeMapId, hub.selectMap, busy);
  useEffect(() => setMacro(false), [hub.feature]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [active]);
  useEffect(() => {
    if (
      availableTabs.length > 0 &&
      !availableTabs.some((tab) => tab.id === active) &&
      tabs.some((tab) => tab.id === active)
    ) {
      navigate(availableTabs[0].id);
    }
  }, [availableTabs, active]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const update = () => {
      element.dataset.more = String(
        element.scrollHeight - element.clientHeight - element.scrollTop > 2,
      );
    };
    const observer = new ResizeObserver(update);
    const observeContent = () => {
      observer.disconnect();
      observer.observe(element);
      for (const child of element.children) observer.observe(child);
      update();
    };
    const childrenObserver = new MutationObserver(observeContent);
    childrenObserver.observe(element, { childList: true });
    observeContent();
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      childrenObserver.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [active, hub.map?.id, macroVisited]);
  function navigate(id: FeatureId | "macro") {
    if (id === "macro") {
      setMacroVisited(true);
      setMacro(true);
    } else {
      setMacro(false);
      hub.setFeature(id);
    }
  }
  function navKey(event: KeyboardEvent<HTMLDivElement>) {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled)',
      ),
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current +
              (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
              buttons.length) %
            buttons.length;
    buttons[next]?.focus();
    buttons[next]?.click();
  }
  const commands: PaletteCommand[] = [
    ...availableTabs.map((tab) => ({
      id: tab.id,
      title: tab.label,
      group: "Settings",
      icon: <tab.icon size={16} />,
      disabled: hub.generic && !editLocal,
      onSelect: () => navigate(tab.id),
    })),
    ...(["device", "maps", "system"] as const).map((id) => ({
      id,
      title: FEATURES.find((feature) => feature.id === id)!.label,
      group: "Tools",
      onSelect: () => navigate(id),
    })),
    {
      id: "finish-ice",
      title: "Mouse finish: Ice translucent",
      group: "Appearance",
      onSelect: () => setMouseFinish("ice"),
    },
    {
      id: "finish-black",
      title: "Mouse finish: Black",
      group: "Appearance",
      onSelect: () => setMouseFinish("black"),
    },
    {
      id: "finish-orange",
      title: "Mouse finish: Orange",
      group: "Appearance",
      onSelect: () => setMouseFinish("orange"),
    },
    ...maps.map((map, index) => ({
      id: map.id,
      title: map.name,
      group: "Maps",
      keywords: [map.note],
      shortcut: index < 9 ? String(index + 1) : undefined,
      disabled: busy,
      onSelect: () => hub.selectMap(map.id),
    })),
    {
      id: "new-map",
      title: "New map",
      group: "Actions",
      onSelect: () => hub.setNewMapOpen(true),
    },
    {
      id: "backup",
      title: "Backup maps",
      group: "Actions",
      onSelect: () => setBackup(true),
    },
    {
      id: "read",
      title: "Read from device",
      group: "Actions",
      disabled: !info.connected || busy,
      onSelect: hub.readDevice,
    },
    {
      id: "undo",
      title: "Undo map edit",
      group: "Actions",
      onSelect: () => travelHistory("undo"),
    },
    {
      id: "redo",
      title: "Redo map edit",
      group: "Actions",
      onSelect: () => travelHistory("redo"),
    },
  ];
  const Screen = screens[active];
  const title = macro
    ? "Macro Settings"
    : (tabs.find((tab) => tab.id === hub.feature)?.label ??
      FEATURES.find((feature) => feature.id === hub.feature)!.label);
  return (
    <div
      className="liquid-app cx"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          depth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDragging(false);
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void hub.importFile(file);
      }}
    >
      <AppearanceLayer />
      <LiveApplyBridge />
      <ConsoleShell
        top={<ConsoleHeader onDevices={onDevices} />}
        rail={
          <ProfileToolbar
            onBackup={() => setBackup(true)}
            onUtility={navigate}
            nav={
              <nav className="cx-section-nav" aria-label="Mouse Configuration">
                <p className="cx-section-nav-title">Mouse Configuration</p>
                <div
                  className="lg-tabs glass-clear"
                  role="tablist"
                  aria-label="Mouse Configuration"
                  aria-orientation="vertical"
                  onKeyDown={navKey}
                >
                  {availableTabs.map((tab) => (
                    <motion.button
                      id={`tab-${tab.id}`}
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active === tab.id}
                      aria-current={active === tab.id ? "page" : undefined}
                      aria-controls="settings-panel"
                      data-feature={tab.id}
                      tabIndex={
                        active === tab.id ||
                        (!availableTabs.some((item) => item.id === active) &&
                          tab.id === (availableTabs[0]?.id ?? "sensitivity"))
                          ? 0
                          : -1
                      }
                      disabled={hub.generic && !editLocal}
                      title={
                        hub.generic
                          ? "Protocol unverified: hardware settings unavailable"
                          : tab.label
                      }
                      onClick={() => navigate(tab.id)}
                      whileTap={
                        reduced || hub.generic ? undefined : { scale: 0.96 }
                      }
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                    >
                      {active === tab.id && (
                        <motion.span
                          className="lg-tab-pill"
                          // No sliding pill in the vertical section list: it crossed neighbouring labels mid-animation.
                          transition={
                            reduced
                              ? { duration: 0 }
                              : {
                                  type: "spring",
                                  stiffness: 420,
                                  damping: 32,
                                  mass: 0.9,
                                }
                          }
                          aria-hidden="true"
                        />
                      )}
                      <tab.icon size={16} aria-hidden="true" />
                      <span>{tab.label}</span>
                    </motion.button>
                  ))}
                </div>
              </nav>
            }
          />
        }
        aside={
          <div className="lg-desktop-device cx-hero">
            <DevicePanel
              onDiff={() => setDiff(true)}
              onDetails={() => navigate("device")}
            />
          </div>
        }
      >
        <main className="lg-center" aria-label="Mouse workspace">
          <section
            id="settings-editor"
            tabIndex={-1}
            className="lg-editor glass-sheet"
            aria-label="Map settings editor"
          >
            <div className="lg-editor-heading">
              <div>
                <h1>{title}</h1>
                <p>{descriptions[active]}</p>
              </div>
              {macro && macroDirty && (
                <span className="lg-save-state">Recording not saved</span>
              )}
            </div>
            {saveError && (
              <p role="alert" className="lg-inline-notice">
                {saveError}
              </p>
            )}
            {demoReason && (
              <p role="status" className="lg-inline-notice">
                {demoReason}
              </p>
            )}
            {hub.generic && (
              <p className="lg-inline-notice">
                Protocol unverified. Safe, read-only access; verified hardware
                settings are unavailable.
              </p>
            )}
            <div
              id="settings-panel"
              className="lg-editor-scroll workspace-scroll"
              tabIndex={0}
              role={
                availableTabs.some((tab) => tab.id === active)
                  ? "tabpanel"
                  : undefined
              }
              aria-labelledby={
                availableTabs.some((tab) => tab.id === active)
                  ? `tab-${active}`
                  : undefined
              }
              ref={scroll}
            >
              <motion.div
                className="lg-screen"
                key={active}
                initial={reduced ? false : { opacity: 0.85, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                {hub.generic &&
                !editLocal &&
                availableTabs.some((tab) => tab.id === active) ? (
                  <div className="lg-empty">
                    <Mouse size={28} aria-hidden="true" />
                    <h2>Model not verified</h2>
                    <p>
                      Connect a supported mouse or use Mock Device to edit these
                      settings.
                    </p>
                    <Button onClick={() => setEditLocal(true)}>
                      Edit map locally
                    </Button>
                    <Button onClick={() => navigate("device")}>
                      Device details
                    </Button>
                  </div>
                ) : active === "macro" && hub.map ? null : hub.map ||
                  ["device", "maps", "system"].includes(active) ? (
                  <Screen key={hub.map?.id} onDiff={() => setDiff(true)} />
                ) : (
                  <div className="lg-empty">
                    <CircleDot size={28} />
                    <h2>No map selected</h2>
                    <p>Create a map to edit settings offline.</p>
                    <Button
                      variant="primary"
                      icon={<Plus size={15} />}
                      onClick={() => hub.setNewMapOpen(true)}
                    >
                      Create map
                    </Button>
                  </div>
                )}
              </motion.div>
              {macroVisited && hub.map && (!hub.generic || editLocal) && (
                <motion.div
                  className="lg-screen"
                  hidden={!macro}
                  initial={false}
                  animate={{ opacity: macro ? 1 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.12 }}
                >
                  <MacroTab
                    key={hub.map.id}
                    active={macro}
                    onDraftChange={setMacroDirty}
                    onDiff={() => setDiff(true)}
                  />
                </motion.div>
              )}
            </div>
          </section>
        </main>
      </ConsoleShell>
      <CompactDeviceBar onDiff={() => setDiff(true)} />
      <Dialog
        open={hub.sheetOpen}
        onClose={() => hub.setSheetOpen(false)}
        title="Review & device"
        className="lg-review-sheet"
        footer={<Button onClick={() => hub.setSheetOpen(false)}>Done</Button>}
      >
        <DevicePanel
          sheet
          onDiff={() => setDiff(true)}
          onDetails={() => {
            navigate("device");
            hub.setSheetOpen(false);
          }}
        />
      </Dialog>
      <NewMapDialog />
      <BackupDialog open={backup} onClose={() => setBackup(false)} />
      <DiffDialog open={diff} onClose={() => setDiff(false)} />
      <CommandPalette
        open={hub.paletteOpen}
        onOpenChange={hub.setPaletteOpen}
        commands={commands}
      />
      {dragging && (
        <div className="lg-drop-overlay" aria-hidden="true">
          Drop maps JSON to import
        </div>
      )}
    </div>
  );
}
