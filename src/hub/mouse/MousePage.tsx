import { useState } from "react";
import { motion } from "framer-motion";
import {
  BatteryFull,
  Cable,
  Gauge,
  LayoutGrid,
  Mouse,
  ScanLine,
  Settings,
  SlidersHorizontal,
  SquareTerminal,
  Wifi,
} from "lucide-react";
import { HubProvider, useHub } from "../../app/HubProvider";
import { useConfigStore } from "../../store/configStore";
import { isMouseSessionUntested, isMouseSessionVerified } from "../../features/device/deviceSession";
import { allowUntestedMouseWrites } from "../../devices/mouseProtocols";
import { LiveApplyBridge } from "../../ui/liquid/LiveControls";
import { NewMapDialog } from "../../ui/liquid/Utilities";
import type { NavItem } from "../Sidebar";
import { Dropdown, Tip } from "../controls";
import {
  ConfigSection,
  DpiSection,
  KeyChangeSection,
  MacroSection,
  MouseImage,
  OtherSection,
  ParameterSection,
  PerformanceSection,
} from "./MouseSections";

// Section order and names of the original "Mouse Configuration" menu, shown as a dock.
const SECTIONS: NavItem[] = [
  { id: "keys", label: "Key Change Settings", icon: Mouse },
  { id: "macro", label: "Macro Settings", icon: SquareTerminal },
  { id: "dpi", label: "DPI Settings", icon: ScanLine },
  { id: "performance", label: "Performance Settings", icon: Gauge },
  { id: "parameter", label: "Parameter Settings", icon: SlidersHorizontal },
  { id: "config", label: "Configuration Management", icon: LayoutGrid },
  { id: "other", label: "Other settings", icon: Settings },
];
// Sections whose content needs two columns to fit without scrolling.
const WIDE = new Set(["macro", "dpi", "parameter", "config"]);
const TITLES: Record<string, string> = {
  keys: "Key Change Settings",
  macro: "Macro Settings",
  dpi: "DPI Settings",
  performance: "Performance Settings",
  parameter: "Parameter Settings",
  config: "Configuration Management",
  other: "Other settings",
};

/** Floating Dock layout: the mouse on a stage, a device panel, the open section in a floating panel, sections in a bottom dock. */
function MouseView({ name }: { name: string }) {
  const hub = useHub();
  const info = useConfigStore((s) => s.deviceInfo);
  const maps = useConfigStore((s) => s.maps);
  const activeMapId = useConfigStore((s) => s.activeMapId);
  const [section, setSection] = useState("keys");
  const [askUntested, setAskUntested] = useState(false);
  // Opt-in lives outside React (cleared on disconnect); bump to re-render after it changes.
  const [, setOptIn] = useState(0);
  const writable = isMouseSessionVerified();
  const untested = info.connected && isMouseSessionUntested();
  const battery = info.batteryLevel || (info.isMock ? 100 : 0);
  const wireless = info.connectionMode === "wireless_dongle";
  return (
    <div className="hub-body fd" data-testid="mouse-view">
      <LiveApplyBridge />
      {/* One stage for every section so the mouse keeps its size and glides between positions. */}
      <div className={`fd-stage${section === "keys" ? " keys" : ""}`}>
        {section === "keys" ? <KeyChangeSection /> : <MouseImage height={440} />}
      </div>
      <aside className="fd-pop fd-device" aria-label="Device">
        <span className="cap">Device</span>
        <strong>{name}</strong>
        <span className="fd-meta">
          {battery > 0 && (
            <>
              <BatteryFull size={15} /> {battery}%
            </>
          )}
          {wireless ? <Wifi size={14} /> : <Cable size={14} />}
          {wireless ? "2.4G receiver" : "Wired"}
          {info.firmwareMouse && <> · FW {info.firmwareMouse}</>}
        </span>
        {info.connected && !info.isMock && !writable && !untested && (
          <span className="fd-badge" title="Settings are read from the mouse. Writes for this model are not verified yet, so edits stay on this computer.">
            Read-only · edits stay local
          </span>
        )}
        {untested && !writable && (
          <button type="button" className="fd-badge" onClick={() => setAskUntested(true)} title="Writes for this model follow the original driver's source but were never tested on real hardware.">
            Read-only · enable untested writes
          </button>
        )}
        {untested && writable && (
          <span className="fd-badge" title="Untested writes are on until this mouse disconnects. Every write is read back and must match.">
            Untested writes on
          </span>
        )}
        <div className="fd-config">
          <span className="cap">Config File</span>
          <Dropdown
            tone="hero"
            label="Config File"
            value={activeMapId ?? ""}
            options={maps.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(id) => void hub.selectMap(id, true)}
          />
        </div>
      </aside>
      {section !== "keys" && (
        <section className="fd-pop fd-panel" aria-label={TITLES[section]} data-wide={WIDE.has(section) || undefined}>
          <h2 key={`title-${section}`}>{TITLES[section]}</h2>
          <div className="fd-panel-body" key={section}>
            {section === "macro" && <MacroSection />}
            {section === "dpi" && <DpiSection />}
            {section === "performance" && <PerformanceSection />}
            {section === "parameter" && <ParameterSection />}
            {section === "config" && <ConfigSection onImport={hub.openImport} onNew={() => hub.setNewMapOpen(true)} onExport={hub.exportMaps} />}
            {section === "other" && <OtherSection />}
          </div>
        </section>
      )}
      <nav className="fd-dock" aria-label="Mouse Configuration">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={item.id === section ? "page" : undefined}
            onClick={() => setSection(item.id)}
          >
            {item.id === section && <motion.span className="fd-dock-pill" layoutId="mouse-dock-pill" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
            <item.icon size={17} strokeWidth={1.7} />
            {item.label}
          </button>
        ))}
      </nav>
      <NewMapDialog />
      {askUntested && (
        <Tip
          title="Enable untested writes?"
          message={
            <>
              This model's settings writes follow the original ATK driver's source code, but they have never been tested on a real
              {" "}{name}. A wrong write could change or corrupt settings stored on the mouse. Every write is read back and must
              match; settings the original hides for this model are skipped. This lasts until the mouse disconnects.
            </>
          }
          confirm="Enable for this connection"
          cancel="Cancel"
          onCancel={() => setAskUntested(false)}
          onConfirm={() => {
            allowUntestedMouseWrites(info.vendorId, info.productId, info.cid, info.mid);
            setAskUntested(false);
            setOptIn((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

export default function MousePage({ name }: { name: string }) {
  return (
    <HubProvider>
      <MouseView name={name} />
    </HubProvider>
  );
}
