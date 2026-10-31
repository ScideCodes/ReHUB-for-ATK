import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  CheckCircle2,
  CloudUpload,
  Eye,
  FileText,
  Gauge,
  Keyboard as KeyboardIcon,
  LayoutGrid,
  Lightbulb,
  Plus,
  Redo2,
  Settings,
  SlidersHorizontal,
  SquareTerminal,
  Trash2,
  Undo2,
  X,
  XSquare,
  Zap,
} from "lucide-react";
import type { DeviceDefinition } from "../../types/schema";
import { supports } from "../../devices/registry";
import { LIGHT_MODES, type AdvancedAction, type KeyboardSettings } from "../../devices/keyboardSettings";
import { useKeyboardStore } from "../../store/keyboardStore";
import { DevicePreview } from "../../ui/DevicePreview";
import { AppearancePicker } from "../AppearancePicker";
import { SlotChip, type NavItem } from "../Sidebar";
import { Dropdown, NumBox, OptionRow, Seg, Slider, Switch } from "../controls";
import { Board, caption, wasdKeys } from "./Board";
import { layoutFor, layoutIndexes, type BoardLayout } from "../../devices/keyboardLayouts";
import { ColorWheel } from "./ColorWheel";

export type KeyboardViewProps = {
  device: DeviceDefinition;
  color: number;
  setColor: (color: number) => void;
  settings: KeyboardSettings;
  edit: (update: (draft: KeyboardSettings) => void) => void;
  mode: "offline" | "mock" | "hardware";
  busy: boolean;
  firmware: string;
  notice?: string;
  history: (direction: "undo" | "redo") => void;
  exportMaps: () => void;
  importMaps: () => void;
  resetMap: () => void;
  calibrating: boolean;
  onCalibrate: () => void;
  layer: number;
  setLayer: (layer: number) => void;
  /** Lets the session lazily read the data behind the visible section. */
  onSection: (id: string) => void;
  /** Set by KeyboardView from the device's source layout. */
  layout?: BoardLayout;
};
type SectionProps = KeyboardViewProps & { layout: BoardLayout };

// Source rate tables: HFD wm 125-1000Hz, BYKB SDK 125-8000Hz, every other family 1000-8000Hz.
function pollingRates(device: DeviceDefinition): KeyboardSettings["pollingRate"][] {
  if (device.protocolFamily === "HFD") return [125, 250, 500, 1000];
  if (device.protocolFamily === "13") return [125, 250, 500, 1000, 2000, 4000, 8000];
  return [1000, 2000, 4000, 8000];
}

// Keyboard lighting modes, titles and icons as the original lists them (demoMode.store, values 0-39).
const MODES: [id: number, name: string, icon: string][] = [
  [0, "Off", "flow"], [1, "Customization", "wind"], [2, "Single Color Constant", "neon"], [3, "Focus", "breath"],
  [4, "Up-Down Rainbow", "normal"], [5, "Left-Right Rainbow (Static)", "snow"], [6, "Monochrome Breath", "key"],
  [7, "Fluttering Ribbons", "run"], [8, "Laser", "dot"], [9, "Pinwheel", "flowers"], [11, "Vortex", "flowers"],
  [13, "Spectral Cycle", "flowers"], [14, "Streamer", "wave"], [19, "Colorful Swirls", "wave"], [23, "Double Vortex", "flower"],
  [25, "Christmas", "stream"], [26, "Spectrum Breathing", "rain"], [28, "Spectrum Float", "scan"], [30, "Digital Rain", "together"],
  [31, "Single Light Up", "flash"], [36, "Crucifix", "self"], [39, "指尖涟漪", "music"],
];
const MODE_ICONS = import.meta.glob<string>("./light-icons/*.svg", { eager: true, query: "?url", import: "default" });

function sections(device: DeviceDefinition): NavItem[] {
  const has = (...caps: string[]) => caps.some((cap) => supports(device, cap));
  return [
    has("rgb", "perKeyRgb") && { id: "light", label: "Light Setting", icon: Lightbulb },
    has("actuation", "rapidTrigger", "deadZones") && { id: "trigger", label: "Trigger Settings", icon: ArrowDownToLine },
    has("keyRemap", "layers") && { id: "keys", label: "Key Change Settings", icon: KeyboardIcon },
    has("mt", "tgl", "dks", "rs", "socd", "oks") && { id: "advanced", label: "Advanced Key Settings", icon: Zap },
    has("calibration") && { id: "axial", label: "Axial Alignment", icon: AlignVerticalSpaceAround },
    has("macros") && { id: "macro", label: "Macro Settings", icon: SquareTerminal },
    has("pollingRate", "keyboardOptions") && { id: "performance", label: "Performance Settings", icon: SlidersHorizontal },
    { id: "config", label: "Configuration Management", icon: LayoutGrid },
    { id: "other", label: "Other settings", icon: Settings },
  ].filter(Boolean) as NavItem[];
}

export function KeyboardView(viewProps: KeyboardViewProps) {
  const { device } = viewProps;
  const layout = useMemo(() => layoutFor(device), [device]);
  const props: SectionProps = { ...viewProps, layout };

  const store = useKeyboardStore();
  const items = useMemo(() => sections(device), [device]);
  const [section, setSectionState] = useState(items[0].id);
  const setSection = (id: string) => {
    setSectionState(id);
    props.onSection(id);
  };
  // Tell the session which data the first visible section needs, once.
  const initial = useRef(props.onSection);
  const first = items[0].id;
  useEffect(() => initial.current(first), [first]);
  return (
    <div className="hub-body fd fdk" data-testid="keyboard-view" aria-busy={props.busy}>
      <aside className="fd-pop fd-device" aria-label="Device">
        <span className="cap">Device</span>
        <strong>{device.name}</strong>
        <span className="fd-meta">
          {props.mode === "mock" && <>100% · </>}
          {props.mode === "offline" ? "Not connected" : "Wired"}
          {props.firmware && <> · FW {props.firmware}</>}
        </span>
        <div className="fd-config">
          <span className="cap">Config File</span>
          <Dropdown
            tone="hero"
            label="Config File"
            value={store.activeId}
            disabled={props.busy}
            options={store.maps.filter((m) => m.layout === layout.key).map((m) => ({ value: m.id, label: m.name }))}
            onChange={(id) => store.select(id)}
          />
        </div>
      </aside>
      <nav className="fd-dock" aria-label="Keyboard Configuration">
        {items.map((item) => (
          <button key={item.id} type="button" aria-current={item.id === section ? "page" : undefined} onClick={() => setSection(item.id)}>
            {item.id === section && <motion.span className="fd-dock-pill" layoutId="keyboard-dock-pill" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
            <item.icon size={17} strokeWidth={1.7} />
            {({ config: "Configurations", other: "Device", advanced: "Advanced Keys" } as Record<string, string>)[item.id] ?? item.label.replace(/ Settings?$/i, "")}
          </button>
        ))}
      </nav>
      <div className="fd-section" key={section}>
      {section === "light" && <LightSection {...props} />}
      {section === "trigger" && <TriggerSection {...props} />}
      {section === "keys" && <KeysSection {...props} />}
      {section === "advanced" && <AdvancedSection {...props} />}
      {section === "axial" && <AxialSection {...props} />}
      {section === "macro" && <MacroSection {...props} />}
      {section === "performance" && <PerformanceSection {...props} />}
      {section === "config" && <ConfigSection {...props} />}
      {section === "other" && <OtherSection {...props} />}
      </div>
    </div>
  );
}

// Board gets the room; controls sit in a content-height panel underneath (capped, scrolls if needed).
function Split({ top, bottom, notice }: { top: ReactNode; bottom: ReactNode; notice?: string }) {
  return (
    <main className="hub-main split">
      <section className="hk-stage">
        {notice && <p className="hk-notice" role="status">{notice}</p>}
        {top}
      </section>
      <section className="hk-controls">{bottom}</section>
    </main>
  );
}

/* ---------------- Light Setting ---------------- */
// Original colour picker template colours (demoMode.store), two per row.
const PRESETS = ["#F5222D", "#1677FF", "#FA8C16", "#2F54EB", "#FADB14", "#722ED1", "#8BBB11", "#EB2F96", "#52C41A", "#FF819B", "#13A8A8", "#000000"];

function LightSection({ device, settings, edit, notice, layout }: SectionProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const perKey = supports(device, "perKeyRgb");
  const custom = settings.light.mode === 1 && perKey;
  const currentColor = custom && selected.size ? settings.keys[[...selected][0]].color : settings.light.color;
  const setColor = (hex: string) =>
    edit((s) => {
      if (custom && selected.size) selected.forEach((i) => (s.keys[i].color = hex));
      else s.light.color = hex;
    });
  return (
    <Split
      notice={notice}
      top={
        <>
        <Board
          layout={layout}
          settings={settings}
          selected={selected}
          tint={custom ? (i) => settings.keys[i].color : undefined}
          onSelection={custom ? setSelected : undefined}
        />
        {custom && (
          <div className="hk-side-actions">
            <button type="button" className="h-btn" onClick={() => setSelected(new Set(layoutIndexes(settings, layout).filter((i) => i >= 0)))}><CheckCircle2 size={16} /> Select All Keys</button>
            <button type="button" className="h-btn" onClick={() => setSelected(new Set(layoutIndexes(settings, layout).filter((i) => i >= 0 && !selected.has(i))))}><FileText size={16} /> Invert Selection</button>
            <button type="button" className="h-btn" onClick={() => setSelected(new Set())}><XSquare size={16} /> Clear Selection</button>
          </div>
        )}
        </>
      }
      bottom={
        <div className="hk-light">
          <div>
            <p className="hk-label">Lighting Effect Mode</p>
            <div className="hk-modes">
              {MODES.map(([id, name, icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={settings.light.mode === id}
                  title={id === 14 ? `${name}: not in the verified write set` : name}
                  // Streamer (14) is in the original list but outside LIGHT_MODES, so it cannot be saved here.
                  disabled={(id === 1 && !perKey) || !LIGHT_MODES.some(([known]) => known === id)}
                  onClick={() => edit((s) => void (s.light.mode = id))}
                >
                  <i style={{ maskImage: `url("${MODE_ICONS[`./light-icons/${icon}.svg`]}")` }} /> <span>{name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="hk-divider" />
          <div>
            <h3 className="h-title" style={{ fontWeight: 600, marginBottom: 32 }}>Lamp Effect Setting</h3>
            <div className="hk-lamp">
              <span>Brightness <b>{settings.light.brightness}%</b></span>
              <Slider label="Brightness" value={settings.light.brightness} min={1} max={100} disabled={settings.light.mode === 0} onCommit={(v) => edit((s) => void (s.light.brightness = v))} />
            </div>
            <div className="hk-lamp">
              <span>Speed <b>{Math.round((settings.light.speed / 255) * 100)}%</b></span>
              <Slider label="Speed" value={settings.light.speed} min={1} max={255} disabled={[0, 1, 2, 3, 4, 5, 30].includes(settings.light.mode)} onCommit={(v) => edit((s) => void (s.light.speed = v))} />
            </div>
          </div>
          <div className="hk-divider" />
          <div>
            <h3 className="h-title" style={{ fontWeight: 600, marginBottom: 16 }}>Color setting</h3>
            <div style={{ display: "flex", gap: 24 }}>
              <ColorWheel value={currentColor} onChange={setColor} />
              <div className="hk-presets">
                {PRESETS.map((hex) => (
                  <button key={hex} type="button" aria-label={`Colour ${hex}`} style={{ background: hex }} onClick={() => setColor(hex)} />
                ))}
              </div>
            </div>
            {custom && <p className="h-desc">Click or drag across keys to add them; start on a selected key to remove. Then pick a colour.</p>}
          </div>
        </div>
      }
    />
  );
}

/* ---------------- Trigger Settings ---------------- */
function TriggerSection({ device, settings, edit, notice, layout }: SectionProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set([0]));
  const first = settings.keys[[...selected][0] ?? 0];
  const all = layoutIndexes(settings, layout).filter((i) => i >= 0);
  const each = (update: (key: KeyboardSettings["keys"][number]) => void) =>
    edit((s) => selected.forEach((i) => update(s.keys[i])));
  const none = selected.size === 0;
  return (
    <Split
      notice={notice}
      top={
        <>
          <Board
          layout={layout}
            settings={settings}
            selected={selected}
            unit={84}
            onSelection={setSelected}
            render={(i, label) => (
              <>
                <span className="t">{settings.keys[i].actuation.toFixed(3)}</span>
                {label}
                <span className="b">
                  {settings.keys[i].rt.press.toFixed(3)} · {settings.keys[i].rt.release.toFixed(3)}
                </span>
              </>
            )}
          />
          <div className="hk-side-actions">
            <button type="button" className="h-btn" onClick={() => setSelected(new Set(all))}><CheckCircle2 size={16} /> Select All Keys</button>
            <button type="button" className="h-btn" onClick={() => setSelected(new Set(all.filter((i) => !selected.has(i))))}><FileText size={16} /> Invert Selection</button>
            <button type="button" className="h-btn" onClick={() => setSelected(new Set(wasdKeys(settings, layoutIndexes(settings, layout))))}><KeyboardIcon size={16} /> Select WASD</button>
            <button type="button" className="h-btn" onClick={() => setSelected(new Set())}><XSquare size={16} /> Clear Selection</button>
            <button
              type="button"
              className="h-btn"
              style={{ marginTop: 40 }}
              onClick={() => edit((s) => s.keys.forEach((k) => ((k.actuation = 1.5), (k.rt = { on: false, press: 0.5, release: 0.5 }))))}
            >
              Restore Default
            </button>
          </div>
        </>
      }
      bottom={
        <div className="hk-trigger">
          <div className="hk-demo">
            <span className="hk-label">Trigger Effect Demo</span>
            <div className="hk-travel" aria-hidden="true">
              <div style={{ top: `${(first.actuation / 3.3) * 100}%` }}>{first.actuation.toFixed(3)}mm</div>
            </div>
          </div>
          {supports(device, "actuation") && (
            <div>
              <h3 className="h-title">Trigger Travel <Eye size={14} /></h3>
              <p className="h-desc" style={{ fontSize: 14, lineHeight: "21px" }}>
                Set custom trigger travel. The shorter the trigger travel, the faster the physical response, but the more prone to accidental triggering
              </p>
              <div className="hk-row-ctl">
                <span>Travel</span>
                <NumBox label="Trigger travel" value={first.actuation} min={0.1} max={3.3} step={0.01} digits={3} unit="mm" disabled={none} onCommit={(v) => each((k) => void (k.actuation = v))} />
              </div>
              <Slider label="Trigger travel slider" value={first.actuation} min={0.1} max={3.3} step={0.01} disabled={none} onCommit={(v) => each((k) => void (k.actuation = v))} />
              {supports(device, "deadZones") && (
                <>
                  <h3 className="h-title" style={{ marginTop: 28 }}>Dead Zone Setting</h3>
                  <p className="h-desc" style={{ fontSize: 14 }}>Top dead zone - Reduce false triggers, bottom dead zone - Reduce trigger breakage</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 16 }}>
                    {(["top", "bottom"] as const).map((zone) => (
                      <div key={zone}>
                        <div className="hk-row-ctl">
                          <span>{zone === "top" ? "Press Down (Trigger)" : "Lift Up (Reset)"}</span>
                          <NumBox label={`${zone} dead zone`} value={settings.deadZone[zone]} min={0} max={3.3} step={0.001} digits={3} unit="mm" onCommit={(v) => edit((s) => void (s.deadZone[zone] = v))} />
                        </div>
                        <Slider label={`${zone} dead zone slider`} value={settings.deadZone[zone]} min={0} max={3.3} step={0.001} onCommit={(v) => edit((s) => void (s.deadZone[zone] = v))} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {supports(device, "rapidTrigger") && (
            <div style={{ borderLeft: "1px solid var(--color-border-8)", paddingLeft: 36 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <h3 className="h-title">Rapid Trigger (RT) <Eye size={14} /></h3>
                  <p className="h-desc" style={{ fontSize: 14, lineHeight: "21px" }}>
                    Dynamically adjusts trigger travel and reset travel according to intention to press or release key, improving input speed
                  </p>
                </div>
                <Switch label="Rapid Trigger" checked={first.rt.on} disabled={none} onChange={(on) => each((k) => void (k.rt.on = on))} />
              </div>
              {/* Dimmed only while RT is off, when the whole group is inactive (exempt from text contrast). */}
              <div
                role="group"
                aria-label="Rapid trigger travel"
                aria-disabled={!first.rt.on || undefined}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 20, opacity: first.rt.on ? 1 : 0.5 }}
              >
                {(["press", "release"] as const).map((side) => (
                  <div key={side}>
                    <div className="hk-row-ctl">
                      <span>{side === "press" ? "Press Down (Trigger)" : "Lift Up (Reset)"}</span>
                      <NumBox label={`RT ${side}`} value={first.rt[side]} min={0.02} max={3.3} step={0.01} digits={3} unit="mm" disabled={none || !first.rt.on} onCommit={(v) => each((k) => void (k.rt[side] = v))} />
                    </div>
                    <Slider label={`RT ${side} slider`} value={first.rt[side]} min={0.02} max={3.3} step={0.01} disabled={none || !first.rt.on} onCommit={(v) => each((k) => void (k.rt[side] = v))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}

/* ---------------- Key Change Settings ---------------- */
const LAYERS = ["Win Base", "Win Fn", "Mac Base", "Mac Fn"];
// Full-size picker rows (HID usage ids) like the original "Keyboard Key" panel.
const PICKER: { label: string; code: number; w?: number; gap?: number }[][] = [
  [{ label: "Esc", code: 41 }, ...[1, 2, 3, 4].map((n, i) => ({ label: `F${n}`, code: 57 + n, gap: i === 0 ? 1 : 0 })), ...[5, 6, 7, 8].map((n, i) => ({ label: `F${n}`, code: 57 + n, gap: i === 0 ? 0.5 : 0 })), ...[9, 10, 11, 12].map((n, i) => ({ label: `F${n}`, code: 57 + n, gap: i === 0 ? 0.5 : 0 })), { label: "PRTSC", code: 70, gap: 0.5 }, { label: "LOCK", code: 71 }, { label: "PAUSE", code: 72 }],
  [{ label: "~\n`", code: 53 }, ...["!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0"].map((label, i) => ({ label, code: 30 + i })), { label: "—\n-", code: 45 }, { label: "+\n=", code: 46 }, { label: "Backspace", code: 42, w: 2 }, { label: "INS", code: 73, gap: 0.5 }, { label: "HOME", code: 74 }, { label: "PGUP", code: 75 }, { label: "NUM\nLOCK", code: 83, gap: 0.5 }, { label: "/", code: 84 }, { label: "*", code: 85 }, { label: "-", code: 86 }],
  [{ label: "Tab", code: 43, w: 1.5 }, ..."QWERTYUIOP".split("").map((c) => ({ label: c, code: c.charCodeAt(0) - 61 })), { label: "{\n[", code: 47 }, { label: "}\n]", code: 48 }, { label: "|\n\\", code: 49, w: 1.5 }, { label: "DEL", code: 76, gap: 0.5 }, { label: "END", code: 77 }, { label: "PGDN", code: 78 }, { label: "7", code: 95, gap: 0.5 }, { label: "8", code: 96 }, { label: "9", code: 97 }, { label: "+", code: 87 }],
  [{ label: "Caps Lock", code: 57, w: 1.75 }, ..."ASDFGHJKL".split("").map((c) => ({ label: c, code: c.charCodeAt(0) - 61 })), { label: ":\n;", code: 51 }, { label: "\"\n'", code: 52 }, { label: "Enter", code: 40, w: 2.25 }, { label: "4", code: 92, gap: 4 }, { label: "5", code: 93 }, { label: "6", code: 94 }],
  [{ label: "Shift", code: 225, w: 2.25 }, ..."ZXCVBNM".split("").map((c) => ({ label: c, code: c.charCodeAt(0) - 61 })), { label: "<\n,", code: 54 }, { label: ">\n.", code: 55 }, { label: "?\n/", code: 56 }, { label: "Shift", code: 229, w: 2.75 }, { label: "↑", code: 82, gap: 1.5 }, { label: "1", code: 89, gap: 1.5 }, { label: "2", code: 90 }, { label: "3", code: 91 }, { label: "ENTER", code: 88 }],
  [{ label: "CTRL", code: 224, w: 1.25 }, { label: "WIN", code: 227, w: 1.25 }, { label: "ALT", code: 226, w: 1.25 }, { label: "SPACE", code: 44, w: 6.25 }, { label: "ALT", code: 230, w: 1.25 }, { label: "WIN", code: 231, w: 1.25 }, { label: "MENU", code: 101, w: 1.25 }, { label: "CTRL", code: 228, w: 1.25 }, { label: "←", code: 80, gap: 0.5 }, { label: "↓", code: 81 }, { label: "→", code: 79 }, { label: "0", code: 98, w: 2, gap: 0.5 }, { label: ".", code: 99 }],
];

function KeysSection({ device, settings, edit, history, notice, layer, setLayer, layout }: SectionProps) {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"key" | "extra">("key");
  const layers = supports(device, "layers") ? LAYERS : LAYERS.slice(0, 1);
  const assign = (code: [number, number]) => edit((s) => void (s.keys[selected].layers[layer] = code));
  const extra: { label: string; code: [number, number] }[] = [
    { label: "Disabled", code: [0, 0] },
    { label: "Transparent", code: [0, 1] },
    ...(supports(device, "macros") ? Array.from({ length: 16 }, (_, i) => ({ label: `M${i + 1}`, code: [119, i] as [number, number] })) : []),
  ];
  return (
    <Split
      notice={notice}
      top={
        <>
          <Board layout={layout} settings={settings} layer={layer} selected={new Set([selected])} onSelect={(i) => setSelected(i)} />
          <div className="hk-side-actions" style={{ width: 120 }}>
            {layers.map((name, i) => (
              <button key={name} type="button" className={`h-btn${layer === i ? " primary" : ""}`} onClick={() => setLayer(i)}>
                {name}
              </button>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="h-btn" style={{ flex: 1 }} aria-label="Undo" onClick={() => history("undo")}><Undo2 size={16} /></button>
              <button type="button" className="h-btn" style={{ flex: 1 }} aria-label="Redo" onClick={() => history("redo")}><Redo2 size={16} /></button>
            </div>
            <button
              type="button"
              className="h-btn"
              onClick={() =>
                edit((s) => {
                  const indexes = layoutIndexes(s, layout);
                  layout.rows.flat().forEach((key, slot) => {
                    const k = s.keys[indexes[slot]];
                    if (k && key.defaultKey) k.layers = [0, 1, 2, 3].map((l) => [...(key.defaultKey![String(l)] ?? [0, 0])]) as typeof k.layers;
                  });
                })
              }
            >
              Restore Default
            </button>
          </div>
        </>
      }
      bottom={
        <div style={{ padding: "16px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Seg label="Key type" value={tab} onChange={setTab} options={[{ value: "key", label: "Keyboard Key" }, { value: "extra", label: "Extra key" }]} />

          </div>
          {tab === "key" ? (
            <div className="hk-picker">
              {PICKER.map((row, r) => (
                <div key={r} className="hk-row">
                  {row.map((key) => (
                    <button
                      key={key.label + key.code}
                      type="button"
                      className="hk-key"
                      style={{ ["--w" as string]: key.w ?? 1, ["--g" as string]: key.gap ?? 0 }}
                      onClick={() => assign([0, key.code])}
                    >
                      {key.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {extra
                .map((e) => (
                  <button key={e.label} type="button" className="h-btn" onClick={() => assign(e.code)}>
                    {e.label}
                  </button>
                ))}
            </div>
          )}
          <p className="h-desc">Selected key: {caption(settings.keys[selected].layers[layer]).replace("\n", " ")} · {layers[layer]}</p>
        </div>
      }
    />
  );
}

/* ---------------- Advanced Key Settings ---------------- */
const ADVANCED: { kind: AdvancedAction["kind"]; title: string; badge: string; desc: string }[] = [
  { kind: "rs", title: "Rapid Switching (RS)", badge: "RS", desc: "When pressing two keys at the same time, trigger the key with deeper press travel" },
  { kind: "socd", title: "Instant Release (SOCD)", badge: "SOCD", desc: "When pressing two buttons simultaneously, quickly triggers the preset specified button" },
  { kind: "oks", title: "OKS", badge: "OKS", desc: "OKS monitors 2 selected keys and triggers the bound key when the key is released" },
  { kind: "dks", title: "Dynamic Keystroke Length (DKS)", badge: "DKS", desc: "Bind 1 to 4 functions to a single key based on press and release intensity" },
  { kind: "mt", title: "Hold/Click (MT)", badge: "MT", desc: "A single key can distinguish between click and long press to trigger different functions" },
  { kind: "tgl", title: "Toggle Switch (TGL)", badge: "TGL", desc: "Single click toggles continuous activation, long press triggers normal function" },
];

function AdvancedSection({ device, settings, edit, notice, layout }: SectionProps) {
  const [selected, setSelected] = useState(0);
  const [adding, setAdding] = useState<AdvancedAction["kind"] | null>(null);
  const available = ADVANCED.filter((a) => supports(device, a.kind));
  const used = settings.advanced.filter((a) => available.some((x) => x.kind === a.kind));
  function add(kind: AdvancedAction["kind"], key: number) {
    if (settings.advanced.filter((a) => a.kind === kind).length >= 20) return;
    edit((s) =>
      void s.advanced.push({
        kind, key, otherKey: (key + 1) % s.keys.length, layer: 0, tap: [0, 4], hold: [0, 225], delay: 200, point: 1.5, rt: false, priority: "last",
        dks: Array.from({ length: 4 }, () => ({ code: [0, 0], events: Array(10).fill(false) })),
      }),
    );
  }
  return (
    <Split
      notice={adding ? `Select a key on the keyboard for ${ADVANCED.find((a) => a.kind === adding)?.title}` : notice}
      top={
        <Board
          layout={layout}
          settings={settings}
          selected={new Set(adding ? [] : used.map((a) => a.key).concat(selected))}
          onSelect={(i) => {
            setSelected(i);
            if (adding) {
              add(adding, i);
              setAdding(null);
            }
          }}
        />
      }
      bottom={
        <div className="hk-adv-wrap">
          <div>
            <h3 className="h-title" style={{ fontWeight: 600, marginBottom: 16 }}>Add Advanced Key</h3>
            <div className="hk-adv-grid">
              {available.map((a) => (
                <button key={a.kind} type="button" className="hk-adv" aria-pressed={adding === a.kind} onClick={() => setAdding(adding === a.kind ? null : a.kind)}>
                  <span className="badge">{a.badge}</span>
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.desc}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="hk-adv-list">
            <h3 className="h-title" style={{ fontWeight: 600, marginBottom: 16 }}>
              Advanced key already configured <small style={{ fontSize: 12, color: "var(--color-text-hint-60)" }}>{used.length} / 20</small>
            </h3>
            {!used.length && <p className="h-desc">Pick a type, then click a key on the keyboard.</p>}
            {used.map((action) => {
              const index = settings.advanced.indexOf(action);
              const meta = ADVANCED.find((a) => a.kind === action.kind)!;
              const set = (change: Partial<AdvancedAction>) => edit((s) => void Object.assign(s.advanced[index], change));
              return (
                <div key={index} className="hk-adv-item">
                  <span className="badge">{meta.badge}</span>
                  <span style={{ flex: 1 }}>
                    {caption(settings.keys[action.key].layers[0]).replace("\n", " ")}
                    {(action.kind === "rs" || action.kind === "socd" || action.kind === "oks") && (
                      <>
                        {" + "}
                        <select className="h-input" style={{ height: 26 }} aria-label="Paired key" value={action.otherKey} onChange={(e) => set({ otherKey: Number(e.currentTarget.value) })}>
                          {settings.keys.map((k, i) => (
                            <option key={i} value={i}>{caption(k.layers[0]).replace("\n", " ")}</option>
                          ))}
                        </select>
                      </>
                    )}
                    {(action.kind === "mt" || action.kind === "tgl") && (
                      <span style={{ marginLeft: 8, display: "inline-flex", gap: 6, alignItems: "center" }}>
                        hold
                        <NumBox label="Hold delay" value={action.delay} min={0} max={65535} step={10} unit="ms" onCommit={(delay) => set({ delay })} />
                      </span>
                    )}
                    {action.kind === "dks" && (
                      <span style={{ marginLeft: 8, display: "inline-flex", gap: 6, alignItems: "center" }}>
                        point
                        <NumBox label="DKS point" value={action.point} min={0.1} max={3.3} step={0.1} digits={1} unit="mm" onCommit={(point) => set({ point })} />
                      </span>
                    )}
                  </span>
                  <button type="button" className="hub-icon-btn" aria-label={`Delete ${meta.title}`} onClick={() => edit((s) => void s.advanced.splice(index, 1))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      }
    />
  );
}

/* ---------------- Axial Alignment ---------------- */
function AxialSection({ settings, mode, calibrating, onCalibrate, notice, layout }: SectionProps) {
  return (
    <main className="hub-main" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
      {notice && <p className="hk-notice" role="status">{notice}</p>}
      <div className="hk-legend">
        Calibration Color Legend
        <span><i /> Manual Calibration</span>
      </div>
      <div style={{ width: "100%", height: 420, display: "flex" }}><Board layout={layout} settings={settings} selected={new Set()} /></div>
      <button type="button" className="h-btn primary" disabled={mode !== "mock"} title={mode !== "mock" ? "Calibration is available in demo/mock mode only; hardware calibration is not verified" : undefined} onClick={onCalibrate}>
        {calibrating ? "Finish Calibration" : "Start Calibration"}
      </button>
      <p style={{ textAlign: "center", lineHeight: "21px", margin: 0, color: "var(--color-text-head-100)" }}>
        Please press each keyboard key one by one, fully press to the bottom (can slightly sway up, down, left and right) and release when the key turns green
        <br />
        Each key is recommended to be repeated 2-3 times, do not use excessive force, to avoid affecting calibration accuracy
      </p>
    </main>
  );
}

/* ---------------- Macro Settings ---------------- */
function MacroSection({ settings, edit }: SectionProps) {
  const [index, setIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const macro = index === null ? null : settings.macros[index];
  return (
    <main className="hub-main" style={{ display: "flex" }}>
      <div style={{ width: 300, padding: 24, borderRight: "1px solid var(--color-border-8)", overflow: "auto" }}>
        <h3 className="h-title" style={{ marginBottom: 16 }}>Macro List</h3>
        {settings.macros.slice(0, 8).map((m, i) => (
          <button key={i} type="button" className="hub-flyout-item" aria-pressed={index === i} onClick={() => setIndex(i)}>
            {m.name === `Macro ${i + 1}` ? `M${i + 1}` : m.name}
            <small style={{ color: "var(--color-text-hint-60)" }}>{m.actions.length ? `${m.actions.length} steps` : ""}</small>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {macro === null || index === null ? (
          <div className="h-empty">Please select a shortcut to edit</div>
        ) : (
          <MacroRecorder
            key={index}
            name={macro.name}
            actions={macro.actions}
            recording={recording}
            setRecording={setRecording}
            onSave={(name, actions) =>
              edit((s) => {
                s.macros[index].name = name;
                s.macros[index].actions = actions;
              })
            }
          />
        )}
      </div>
    </main>
  );
}

type MacroStep = KeyboardSettings["macros"][number]["actions"][number];
function MacroRecorder({ name: initialName, actions, recording, setRecording, onSave }: {
  name: string;
  actions: MacroStep[];
  recording: boolean;
  setRecording: (on: boolean) => void;
  onSave: (name: string, actions: MacroStep[]) => void;
}) {
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState(actions);
  const [last, setLast] = useState(0);
  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input className="h-input" style={{ border: 0, background: "none", fontWeight: 600 }} aria-label="Macro name" maxLength={60} value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <span style={{ flex: 1 }} />
        <button type="button" className="h-btn" aria-pressed={recording} onClick={() => (setRecording(!recording), setLast(performance.now()))}>
          {recording ? "Stop Recording" : "Start Recording"}
        </button>
        <button type="button" className="h-btn" onClick={() => setSteps([])}>Reset</button>
        <button type="button" className="h-btn primary" disabled={!name.trim()} onClick={() => (setRecording(false), onSave(name.trim(), steps))}>Save</button>
      </div>
      <div
        tabIndex={0}
        className="hk-recorder"
        aria-label="Macro recording area"
        onKeyDown={(e) => {
          if (!recording || e.repeat) return;
          e.preventDefault();
          const now = performance.now();
          setSteps((s) => [...s, { code: e.code.slice(0, 40) || "Unidentified", down: true, delay: Math.min(65535, Math.round(now - last)) }].slice(0, 1000));
          setLast(now);
        }}
        onKeyUp={(e) => {
          if (!recording) return;
          e.preventDefault();
          const now = performance.now();
          setSteps((s) => [...s, { code: e.code.slice(0, 40) || "Unidentified", down: false, delay: Math.min(65535, Math.round(now - last)) }].slice(0, 1000));
          setLast(now);
        }}
      >
        {recording && !steps.length && <p className="h-desc">Click here and press keys to record</p>}
        <ol className="hm-steps">
          {steps.map((step, i) => (
            <li key={i}>
              <span className={step.down ? "down" : "up"}>{step.down ? "↓" : "↑"}</span>
              {step.code}
              <NumBox label={`Delay of step ${i + 1}`} value={step.delay} min={0} max={65535} unit="ms" onCommit={(delay) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, delay } : x)))} />
              <button type="button" className="hub-icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/* ---------------- Performance Settings ---------------- */
function PerformanceSection({ device, settings, edit }: SectionProps) {
  const option = (key: keyof KeyboardSettings["options"], title: string, desc: string) => (
    <OptionRow title={title} desc={desc}>
      <Switch label={title} checked={Boolean(settings.options[key])} onChange={(v) => edit((s) => void ((s.options[key] as boolean) = v))} />
    </OptionRow>
  );
  return (
    <main className="hub-main" style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
      <div style={{ width: 620, display: "flex", flexDirection: "column", gap: 12 }}>
        {supports(device, "pollingRate") && (
          <div className="h-card hk-perf">
            <h3 className="h-title" style={{ fontWeight: 600 }}><Gauge size={16} /> Polling Rate</h3>
            <Seg
              label="Polling Rate"
              value={settings.pollingRate}
              onChange={(v) => edit((s) => void (s.pollingRate = v))}
              options={pollingRates(device).map((v) => ({ value: v, label: v < 1000 ? `${v}` : `${v / 1000}K` }))}
            />
          </div>
        )}
        {supports(device, "keyboardOptions") && (
          <>
            <div className="h-card hk-perf">
              <h3 className="h-title" style={{ fontWeight: 600 }}>Key Layout</h3>
              {option("macSwitch", "MAC Mode", "Switch to the keyboard layout adapted for MacOS")}
              {option("exchangeWasd", "Exchange WASD", "When Exchange WASD is on, swap WASD and arrow keys")}
            </div>
            <div className="h-card hk-perf">
              <h3 className="h-title" style={{ fontWeight: 600 }}>Button conflict/errant press</h3>
              {option("winLock", "Win Key Lock", "When enabled, the Win key is locked and cannot be used to prevent accidental presses during games")}
              {option("sixKeyNoPunch", "Switch to 6 Key N-Key Rollover", "When enabled, switches from full-key anti-ghosting to 6-key anti-ghosting to adapt to special scenarios")}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/* ---------------- Configuration Management ---------------- */
function ConfigSection({ busy, exportMaps, importMaps, layout }: SectionProps) {
  const store = useKeyboardStore();
  const [batch, setBatch] = useState(false);
  return (
    <main className="hub-main" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div style={{ padding: "20px 24px", borderRight: "1px solid var(--color-border-8)", overflow: "auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <h2 className="h-title" style={{ fontSize: 18, flex: "1 1 auto" }}>Local configuration</h2>
          <button type="button" className="h-btn" aria-pressed={batch} onClick={() => setBatch(!batch)}>{batch ? "Cancel" : "Batch Operation"}</button>
          <button type="button" className="h-btn" onClick={importMaps}>Import Config</button>
          <button type="button" className="h-btn primary" disabled={busy} onClick={() => store.add(false)}>New Configuration</button>
        </div>
        <p style={{ margin: "20px 0 12px", color: "var(--color-text-head-100)" }}>
          Config File <small style={{ color: "var(--color-text-hint-60)", marginLeft: 6 }}>Stored on device, accessible from any computer</small>
        </p>
        {[0, 1, 2, 3].map((slot) => (
          <div key={slot} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span className="hm-slot-icon"><SlotChip n={slot + 1} /></span>
            <div className="hm-slot" data-active={slot === 0}>
              Config File{slot + 1}
              {slot === 0 && <span className="hm-applying">Applying</span>}
              <span style={{ flex: 1 }} />
              <FileText size={16} />
              <CloudUpload size={16} />
            </div>
          </div>
        ))}
        <p style={{ margin: "20px 0 12px", color: "var(--color-text-head-100)" }}>
          Computer Config <small style={{ color: "var(--color-text-hint-60)", marginLeft: 6 }}>Stored locally on the computer. Temporarily occupies last onboard slot when applied</small>
        </p>
        {store.maps.filter((m) => m.layout === layout.key).map((map) => (
          <div key={map.id} className="hm-slot" data-active={map.id === store.activeId} style={{ marginBottom: 8 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{map.name}</span>
            {map.id === store.activeId && <span className="hm-applying">Applying</span>}
            <span style={{ flex: 1 }} />
            {batch ? (
              <button type="button" className="h-btn danger" style={{ height: 26 }} disabled={store.maps.filter((m) => m.layout === layout.key).length <= 1} onClick={() => store.remove(map.id)}>Delete</button>
            ) : (
              <>
                <button type="button" className="h-btn" style={{ height: 26 }} onClick={() => store.add(true, map.id)}><Plus size={12} /> Duplicate</button>
                {map.id !== store.activeId && (
                  <button type="button" className="h-btn" style={{ height: 26 }} disabled={busy} onClick={() => store.select(map.id)}>Apply</button>
                )}
              </>
            )}
          </div>
        ))}
        {batch && <button type="button" className="h-btn" onClick={exportMaps}>Export</button>}
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 16, borderBottom: "1px solid var(--color-border-8)" }}>
          <h2 className="h-title" style={{ fontSize: 16 }}>Cloud Config</h2>
          <span style={{ color: "var(--color-text-hint-60)" }}>Config Square</span>
        </div>
        <div className="h-grid-bg" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <CloudUpload size={22} />
          Please upload the custom configuration on the left
          <span style={{ color: "var(--color-text-hint-60)" }}>Cloud configs need an ATK account, so they are not available here.</span>
        </div>
        <div style={{ padding: "16px 0 0" }}>
          <h3 className="h-title">Link Game/App</h3>
          <p className="h-desc">Automatic config switching per game needs the desktop client.</p>
        </div>
      </div>
    </main>
  );
}

/* ---------------- Other settings ---------------- */
function OtherSection({ device, color, setColor, mode, firmware, resetMap }: SectionProps) {
  return (
    <main className="hub-main" style={{ display: "grid", gridTemplateColumns: "1fr 640px", padding: "40px 80px 40px 40px", gap: 40, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-hint-60)" }}>
          {mode === "mock" ? "100% · " : ""}{mode === "hardware" ? "Wired Connection" : mode === "mock" ? "Wired Connection" : "Not connected"}
        </span>
        <div className="hk-preview"><DevicePreview device={device} color={color} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="h-card hm-other">
          <strong>Keyboard Firmware Version {firmware ? `V${firmware}` : ""}</strong>
          <span>{firmware ? `Latest Version V${firmware}` : mode === "hardware" ? "Reading firmware…" : "Firmware is read when the keyboard is connected"}</span>
        </div>
        <div className="h-card hm-other row">
          <span>
            <strong>Factory Reset</strong>
            <small>Reset all keyboard settings to factory defaults, please proceed with caution</small>
          </span>
          <button type="button" className="h-btn lg" onClick={resetMap} title="Resets this configuration to defaults; a hardware factory-reset command is not verified">Reset</button>
        </div>
        <AppearancePicker device={device} color={color} setColor={setColor} />
      </div>
    </main>
  );
}
