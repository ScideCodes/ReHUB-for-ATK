import { useEffect, useMemo, useRef, useState } from "react";
import {
  BatteryFull,
  Cable,
  Crosshair,
  Disc,
  FileText,
  Gauge,
  Keyboard,
  Lightbulb,
  Moon,
  MousePointer2,
  MoveHorizontal,
  Play,
  Plus,
  Radio,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  Upload,
  Waves,
  X,
} from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { useConfigStore } from "../../store/configStore";
import { findDeviceSpec, resolveMouseImage } from "../../features/device/deviceCatalog";
import { mouseModelFeatures } from "../../devices/mouseProtocols";
import { editSetting, editSettings } from "../../features/maps/mapSession";
import { DeviceSettingsSchema, type ButtonAction, type PollingRate } from "../../types/schema";
import { lodOptions } from "../../protocol/codec";
import { restoreFactory } from "../../features/device/deviceSession";
import { closeHeldKeys, serializeRecording, readRecording, type RecordedKey } from "../../ui/liquid/macros";
import { useMouseColorway, selectedColorIndex } from "../../ui/mouseColorway";
import { resolveDeviceImage } from "../../devices/presentation";
import { getRememberedDevices, saveRememberedDevices } from "../../ui/keyboard/DeviceSelector";
import { AppearancePicker } from "../AppearancePicker";
import { NumBox, OptionRow, Seg, Slider, Switch, Tip } from "../controls";
import { SlotChip } from "../Sidebar";
import { actionLabel, DEFAULT_LABELS, KEYBOARD_OPTIONS, SYSTEM_GROUPS, type ActionOption } from "./buttonActions";
import { useMouseMacros, type MouseMacro } from "./macroStore";
import { ButtonSave } from "../../ui/liquid/LiveControls";

function useMouseImage() {
  const info = useConfigStore((s) => s.deviceInfo);
  const device = useConfigStore((s) => s.selectedDevice);
  const colors = useMouseColorway((s) => s.colors);
  if (device) {
    const src = resolveDeviceImage(device, selectedColorIndex(device, colors));
    if (src) return src;
  }
  return resolveMouseImage(info.cid, info.mid);
}

export function MouseImage({ height = 440 }: { height?: number }) {
  const src = useMouseImage();
  return <img className="hm-img" src={src} alt="" draggable={false} style={{ height, display: "block", filter: "drop-shadow(0 18px 18px rgba(0,0,0,.18))" }} />;
}

/* ---------------- Key Change Settings ---------------- */
const CALLOUTS: { id: ButtonAction["id"]; name: string; x: number; y: number; side: "left" | "right" }[] = [
  { id: "left", name: "Left Button", x: 32.6, y: 10.5, side: "left" },
  { id: "middle", name: "Middle Key", x: 49, y: 21.5, side: "right" },
  { id: "side2", name: "Advance", x: 8.7, y: 38, side: "left" },
  { id: "right", name: "Right Click", x: 83, y: 37, side: "right" },
  { id: "side1", name: "Back", x: 3.5, y: 52, side: "right" },
];

// Source key5: models whose profile lacks noBottomButton have a sixth (bottom) button.
const BOTTOM_CALLOUT = { id: "bottom" as const, name: "Bottom Button", x: 50, y: 88, side: "right" as const };

export function KeyChangeSection() {
  const { settings } = useHub();
  const info = useConfigStore((s) => s.deviceInfo);
  const bottom = mouseModelFeatures(info.cid, info.mid).bottomButton;
  const macros = useMouseMacros((s) => s.macros);
  const [selected, setSelected] = useState<ButtonAction["id"] | null>(null);
  const [warnLeft, setWarnLeft] = useState(false);
  const defaults = DeviceSettingsSchema.parse({}).buttons;
  const action = (id: string) => settings.buttons.find((b) => b.id === id);
  function assign(id: ButtonAction["id"], value: [number, number, number], label: string, description?: string) {
    const existing = settings.buttons.some((b) => b.id === id);
    const next: ButtonAction = { id, label, keyClass: value[0], keyValue1: value[1], keyValue2: value[2], ...(description && { description }) };
    editSetting("buttons", existing ? settings.buttons.map((b) => (b.id === id ? next : b)) : [...settings.buttons, next]);
  }
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "grid", placeItems: "center", paddingRight: selected ? 290 : 0, transition: "padding .25s" }}>
        <div style={{ position: "relative" }}>
          <MouseImage />
          {[...CALLOUTS, ...(bottom ? [BOTTOM_CALLOUT] : [])].map((c) => {
            const current = action(c.id);
            const macro = current?.keyClass === 6 ? macros.find((m) => serializeRecording(m.events) === current.description)?.name : undefined;
            const active = selected === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className="hm-callout"
                data-side={c.side}
                aria-pressed={active}
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
                onClick={() => (c.id === "left" ? setWarnLeft(true) : setSelected(c.id))}
              >
                <span className="hm-ring" />
                <span className="hm-tag">
                  <small>{c.name}</small>
                  {actionLabel(current, macro) || DEFAULT_LABELS[c.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "0 0 28px", paddingRight: selected ? 290 : 0 }}>
        <button type="button" className="h-btn" onClick={() => editSetting("buttons", defaults)}>
          Restore Default
        </button>
        <ButtonSave />
      </div>
      {selected && (
        <ActionDrawer
          macros={macros}
          onClose={() => setSelected(null)}
          onPick={(option, description) => option.value && assign(selected, option.value, option.label, description)}
        />
      )}
      {warnLeft && (
        <Tip
          message="Only remapping one left button may cause failure"
          onCancel={() => setWarnLeft(false)}
          onConfirm={() => {
            setWarnLeft(false);
            setSelected("left");
          }}
        />
      )}
    </div>
  );
}

function ActionDrawer({
  macros,
  onPick,
  onClose,
}: {
  macros: MouseMacro[];
  onPick: (option: ActionOption, description?: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"system" | "keyboard" | "special" | "macro">("system");
  const [query, setQuery] = useState("");
  const [fire, setFire] = useState({ interval: 10, count: 3 });
  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest(".hm-callout")) onClose();
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [onClose]);
  return (
    <div className="h-drawer" ref={ref} role="dialog" aria-label="Choose button action">
      <div style={{ padding: "12px 16px 8px" }}>
        <Seg
          label="Action type"
          value={tab}
          onChange={setTab}
          options={[
            { value: "system", label: "System" },
            { value: "keyboard", label: "Keyboard" },
            { value: "special", label: "Special" },
            { value: "macro", label: "Shortcut Command" },
          ]}
        />
        <label className="hm-search">
          <Search size={14} />
          <input placeholder="Search" value={query} onChange={(e) => setQuery(e.currentTarget.value)} aria-label="Search actions" />
        </label>
      </div>
      <div className="hm-actions">
        {tab === "system" &&
          SYSTEM_GROUPS.map((group) => {
            const children = group.children.filter((c) => match(c.label));
            if (!children.length) return null;
            return (
              <div key={group.label}>
                <h5>{group.label}</h5>
                {children.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    disabled={!option.value}
                    title={option.value ? undefined : "Not supported by this device protocol"}
                    onClick={() => onPick(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            );
          })}
        {tab === "keyboard" && (
          <div>
            <h5>Keyboard Key</h5>
            {KEYBOARD_OPTIONS.filter((o) => match(o.label)).map((option) => (
              <button key={option.label + option.value?.[1]} type="button" onClick={() => onPick(option)}>
                {option.label}
              </button>
            ))}
          </div>
        )}
        {tab === "special" && (
          <div style={{ padding: "0 16px" }}>
            <h5 style={{ paddingLeft: 0 }}>Fire Key</h5>
            <p className="h-desc">Sends repeated clicks with an interval while the button is pressed.</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
              Interval
              <NumBox label="Fire interval" value={fire.interval} min={1} max={255} unit="ms" onCommit={(interval) => setFire({ ...fire, interval })} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
              Count
              <NumBox label="Fire count" value={fire.count} min={1} max={255} onCommit={(count) => setFire({ ...fire, count })} />
            </div>
            <button type="button" className="h-btn primary" style={{ width: "100%" }} onClick={() => onPick({ label: "Fire Key", value: [4, fire.interval, fire.count] })}>
              Apply
            </button>
          </div>
        )}
        {tab === "macro" && (
          <div>
            <h5>Macro</h5>
            {!macros.length && <p className="h-desc" style={{ padding: "0 16px" }}>No macros configured</p>}
            {macros
              .filter((m) => match(m.name))
              .map((macro, index) => (
                <button key={macro.id} type="button" onClick={() => onPick({ label: macro.name, value: [6, index, 1] }, serializeRecording(macro.events))}>
                  {macro.name}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Macro Settings ---------------- */
const MOUSE_INSERT = ["Left Button", "Right Click", "Middle Key", "Back", "Advance"];

export function MacroSection() {
  const { macros, save, remove } = useMouseMacros();
  const [editing, setEditing] = useState<MouseMacro | null>(null);
  if (!macros.length && !editing)
    return (
      <div className="h-empty">
        No macros configured
        <button type="button" className="h-btn primary" onClick={() => setEditing({ id: crypto.randomUUID(), name: "M1", events: [] })}>
          <Lightbulb size={14} /> Create Macro
        </button>
      </div>
    );
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 350, padding: 24, borderRight: "1px solid var(--color-border-8)", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 className="h-title">Macro List</h3>
          <button type="button" className="h-btn" onClick={() => setEditing({ id: crypto.randomUUID(), name: `M${macros.length + 1}`, events: [] })}>
            <Plus size={14} /> Create Macro
          </button>
        </div>
        {macros.map((macro) => (
          <div key={macro.id} className="hub-flyout-item" aria-pressed={editing?.id === macro.id} onClick={() => setEditing(macro)} role="button" tabIndex={0}>
            {macro.name}
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <small style={{ color: "var(--color-text-hint-60)" }}>{macro.events.length} steps</small>
              <button type="button" className="hub-icon-btn" aria-label={`Delete ${macro.name}`} onClick={(e) => (e.stopPropagation(), remove(macro.id), editing?.id === macro.id && setEditing(null))}>
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <MacroEditor key={editing.id} macro={editing} onClose={() => setEditing(null)} onSave={(m) => (save(m), setEditing(m))} />
        ) : (
          <div className="h-empty">Please select a shortcut to edit</div>
        )}
      </div>
    </div>
  );
}

// Close the <details> insert menu once an item is picked.
const closeMenu = (event: React.MouseEvent<HTMLElement>) => {
  if ((event.target as HTMLElement).closest("button")) (event.currentTarget.parentElement as HTMLDetailsElement).open = false;
};

function MacroEditor({ macro, onSave, onClose }: { macro: MouseMacro; onSave: (m: MouseMacro) => void; onClose: () => void }) {
  const [name, setName] = useState(macro.name);
  const [events, setEvents] = useState<RecordedKey[]>(macro.events);
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    let last = performance.now();
    const held = new Map<string, string>();
    const handle = (type: "down" | "up") => (event: KeyboardEvent) => {
      if (event.repeat) return;
      event.preventDefault();
      const now = performance.now();
      const delay = Math.min(600000, Math.round(now - last));
      last = now;
      if (type === "down") held.set(event.code, event.key);
      else held.delete(event.code);
      setEvents((list) => [...list, { type, key: event.key, code: event.code, delay }].slice(0, 256));
    };
    const down = handle("down"), up = handle("up");
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      setEvents((list) => closeHeldKeys(list, held));
    };
  }, [recording]);
  const insert = (key: string, code: string) =>
    setEvents((list) => [...list, { type: "down" as const, key, code, delay: 10 }, { type: "up" as const, key, code, delay: 50 }].slice(0, 256));
  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="hub-icon-btn" aria-label="Close macro" onClick={onClose}>
          <X size={16} />
        </button>
        <input className="h-input" style={{ border: 0, background: "none", fontWeight: 600 }} value={name} maxLength={60} aria-label="Macro name" onChange={(e) => setName(e.currentTarget.value)} />
        <span style={{ flex: 1 }} />
        <button type="button" className="h-btn" aria-pressed={recording} onClick={() => setRecording(!recording)}>
          <Play size={14} /> {recording ? "Stop Recording" : "Start Recording"}
        </button>
        <button type="button" className="h-btn" onClick={() => setEvents([])}>
          Reset
        </button>
        <button type="button" className="h-btn primary" disabled={!name.trim()} onClick={() => (setRecording(false), onSave({ ...macro, name: name.trim(), events }))}>
          Save
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, margin: "20px 0" }}>
        <details className="hm-insert">
          <summary className="h-btn">
            <MousePointer2 size={14} /> Insert Mouse Button
          </summary>
          <div className="hub-pop" onClick={closeMenu} style={{ left: 0, right: "auto" }}>
            {MOUSE_INSERT.map((label) => (
              <button key={label} type="button" className="hub-menu-item" onClick={() => insert(label, `Mouse${label.replace(/\s/g, "")}`)}>
                {label}
              </button>
            ))}
          </div>
        </details>
        <details className="hm-insert">
          <summary className="h-btn">
            <Keyboard size={14} /> Insert Keyboard Key
          </summary>
          <div className="hub-pop" onClick={closeMenu} style={{ left: 0, right: "auto", maxHeight: 300, overflow: "auto" }}>
            {KEYBOARD_OPTIONS.map((o) => (
              <button key={o.label + o.value?.[1]} type="button" className="hub-menu-item" onClick={() => insert(o.label, o.label)}>
                {o.label}
              </button>
            ))}
          </div>
        </details>
      </div>
      <ol className="hm-steps">
        {events.map((event, index) => (
          <li key={index}>
            <span className={event.type}>{event.type === "down" ? "↓" : "↑"}</span>
            {event.key}
            <NumBox
              label={`Delay of step ${index + 1}`}
              value={event.delay}
              min={0}
              max={600000}
              unit="ms"
              onCommit={(delay) => setEvents((list) => list.map((e, i) => (i === index ? { ...e, delay } : e)))}
            />
            <button type="button" className="hub-icon-btn" aria-label={`Remove step ${index + 1}`} onClick={() => setEvents((list) => list.filter((_, i) => i !== index))}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ol>
      {recording && <p className="h-desc">Recording keyboard input… press keys now.</p>}
    </div>
  );
}

export function readMacroName(description?: string) {
  const events = readRecording(description);
  return events ? `${events.length} steps` : undefined;
}

/* ---------------- DPI Settings ---------------- */
const STAGE_COLORS = ["#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#ffff00", "#00ffff", "#ff8000", "#ffffff"];
function normalizeDpi(value: number, min: number, max: number) {
  const step = value > 10000 ? 50 : 10;
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}

export function DpiSection() {
  const { settings } = useHub();
  const info = useConfigStore((s) => s.deviceInfo);
  const spec = findDeviceSpec(info.cid, info.mid);
  const min = spec?.minDpi ?? 50;
  const max = Math.min(spec?.maxDpi ?? 36000, 36000);
  const [split, setSplit] = useState<Set<number>>(() => new Set(settings.dpiStages.flatMap((s, i) => (s.xDpi !== s.yDpi ? [i] : []))));
  const stages = settings.dpiStages;
  const update = (index: number, patch: Partial<(typeof stages)[number]>) =>
    editSetting("dpiStages", stages.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const ticks = [min, 10000, 30000, max].filter((v, i, a) => v <= max && a.indexOf(v) === i);
  return (
    <div style={{ padding: "24px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 className="h-title" style={{ fontSize: 16 }}>DPI Settings</h2>
        <button
          type="button"
          className="h-btn"
          disabled={stages.length >= 8}
          onClick={() =>
            editSettings(
              { dpiStages: [...stages, { stage: stages.length, xDpi: 800, yDpi: 800, color: STAGE_COLORS[stages.length % 8], enabled: true }] },
              "dpiStages",
            )
          }
        >
          <Plus size={14} /> Add DPI file
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {stages.map((stage, index) => {
          const isSplit = split.has(index);
          const active = settings.activeDpiStage === index;
          const axes = isSplit ? (["xDpi", "yDpi"] as const) : (["xDpi"] as const);
          return (
            <div key={index} className="hm-dpi" data-active={active} onClick={() => !active && editSetting("activeDpiStage", index)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="hm-dpi-pill" onClick={(e) => e.stopPropagation()}>
                  <input type="color" value={stage.color} aria-label={`DPI ${index + 1} colour`} onChange={(e) => update(index, { color: e.currentTarget.value })} />
                  <span style={{ background: stage.color }} />
                  DPI {index + 1}
                </label>
                <span className="hm-dpi-tools" onClick={(e) => e.stopPropagation()}>
                  X/Y Axis Independent Settings
                  <Switch
                    label={`DPI ${index + 1} independent axes`}
                    checked={isSplit}
                    onChange={(on) => {
                      const next = new Set(split);
                      if (on) next.add(index);
                      else {
                        next.delete(index);
                        update(index, { yDpi: stage.xDpi });
                      }
                      setSplit(next);
                    }}
                  />
                  <button
                    type="button"
                    className="hub-icon-btn"
                    aria-label={`Delete DPI ${index + 1}`}
                    disabled={stages.length <= 1}
                    style={{ color: "#f53f3f" }}
                    onClick={() =>
                      editSettings(
                        {
                          dpiStages: stages.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage: i })),
                          activeDpiStage: Math.max(0, Math.min(settings.activeDpiStage, stages.length - 2)),
                        },
                        "dpiStages",
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
              {axes.map((axis) => (
                <div key={axis} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 8px" }}>
                    <span style={{ color: "var(--color-text-head-100)" }}>{isSplit ? (axis === "xDpi" ? "X" : "Y") : "X/Y"}</span>
                    <NumBox
                      label={`DPI ${index + 1} ${axis === "xDpi" ? "X" : "Y"}`}
                      value={stage[axis]}
                      min={min}
                      max={max}
                      step={10}
                      onCommit={(value) => {
                        const dpi = normalizeDpi(value, min, max);
                        update(index, isSplit ? { [axis]: dpi } : { xDpi: dpi, yDpi: dpi });
                      }}
                    />
                  </div>
                  <Slider
                    label={`DPI ${index + 1} ${axis === "xDpi" ? "X" : "Y"} slider`}
                    value={stage[axis]}
                    min={min}
                    max={max}
                    step={10}
                    onCommit={(value) => {
                      const dpi = normalizeDpi(value, min, max);
                      update(index, isSplit ? { [axis]: dpi } : { xDpi: dpi, yDpi: dpi });
                    }}
                  />
                  <div className="hm-ticks">
                    {ticks.map((t) => (
                      <span key={t} style={{ left: `${((t - min) / (max - min)) * 100}%` }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Performance Settings ---------------- */
const RATES: { value: PollingRate; label: string }[] = [
  { value: 125, label: "125" },
  { value: 250, label: "250" },
  { value: 500, label: "500" },
  { value: 1000, label: "1K" },
  { value: 2000, label: "2K" },
  { value: 4000, label: "4K" },
  { value: 8000, label: "8K" },
];
const SAMPLING = [
  { value: "LP", label: "Basic Mode", desc: "In this mode, the mouse sensor is in low performance state, long battery life, suitable for daily office use" },
  { value: "HP", label: "ATK Shard Competitive Firmware", desc: "In this mode, the mouse sensor is in high performance state, suitable for competitive gaming" },
  { value: "MAX", label: "ATK Shard Competitive Firmware MAX", desc: "Highest sensor sampling rate" },
] as const;

export function PerformanceSection() {
  const { settings } = useHub();
  const info = useConfigStore((s) => s.deviceInfo);
  const spec = findDeviceSpec(info.cid, info.mid);
  const maxRate = spec?.maxPollingRate ?? 8000;
  const mode = SAMPLING.find((s) => s.value === settings.sensorPowerMode) ?? SAMPLING[0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 322px", gap: 24, height: "100%", padding: "24px 32px 32px" }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 0 }}>
          <MouseImage height={450} />
        </div>
        <div className="h-card" style={{ background: "rgb(var(--base-background-color))", padding: "24px" }}>
          <h3 className="h-title" style={{ fontSize: 14 }}>
            <Radio size={16} /> Polling Rate
          </h3>
          <Seg
            className="gradient"
            label="Polling Rate"
            value={settings.pollingRate}
            onChange={(v) => editSetting("pollingRate", v)}
            options={RATES.map((r) => ({ ...r, disabled: r.value > maxRate }))}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "var(--color-text-hint-60)" }}>
            <span>Daily Work</span>
            <span>Game Competitive</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 24 }}>
        <div className="h-card" style={{ background: "rgb(var(--base-background-color))", padding: 24 }}>
          <h3 className="h-title" style={{ fontSize: 14, marginBottom: 14 }}>
            <Gauge size={16} /> Sensor Sampling Rate
          </h3>
          <Seg
            className="column"
            label="Sensor Sampling Rate"
            value={mode.value}
            onChange={(v) => editSetting("sensorPowerMode", v)}
            // Source performance UI: MAX only on CID 1 mice offline.
            options={SAMPLING.map((s) => ({ value: s.value, label: s.label, disabled: s.value === "MAX" && !(info.isMock || info.cid === 1) }))}
          />
          <p className="h-desc">{mode.desc}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Parameter Settings ---------------- */
const DEBOUNCE = [0, 1, 2, 4, 8, 15, 20];
const SLEEP = [
  { value: 30, label: "30s" },
  { value: 60, label: "1min" },
  { value: 120, label: "2min" },
  { value: 180, label: "3min" },
  { value: 300, label: "5min" },
  { value: 1200, label: "20min" },
  { value: 1500, label: "25min" },
  { value: 1800, label: "30min" },
];

export function ParameterSection() {
  const { settings } = useHub();
  const info = useConfigStore((s) => s.deviceInfo);
  const spec = findDeviceSpec(info.cid, info.mid);
  // Source LOD choices per sensor (codec lodOptions): 0.7-1.7mm slider, a few fixed heights, or none.
  const lods = lodOptions(mouseModelFeatures(info.cid, info.mid).sensor ?? (info.isMock ? "PAW3950Ultra" : spec?.sensor));
  const continuousLod = lods.length > 3;
  const [angle, setAngle] = useState(settings.sensorAngle);
  useEffect(() => setAngle(settings.sensorAngle), [settings.sensorAngle]);
  const setRotation = (value: number) => editSetting("sensorAngle", Math.max(-30, Math.min(30, value)));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "581px 1fr", gap: 16, padding: "16px 16px 16px 16px", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="h-card" style={{ background: "rgb(var(--base-background-color))", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <OptionRow icon={<Crosshair size={16} />} title="Movement Synchronization" desc="Smooths mouse movement with algorithm correction for accurate trajectories, adding minor latency.">
            <Switch label="Movement Synchronization" checked={settings.motionSync} onChange={(v) => editSetting("motionSync", v)} />
          </OptionRow>
          <OptionRow icon={<MoveHorizontal size={16} />} title="Straight Line Correction" desc="Corrects offset jitter when moving the mouse straight for absolute straight movement, ideal for design and drawing.">
            <Switch label="Straight Line Correction" checked={settings.angleSnapping} onChange={(v) => editSetting("angleSnapping", v)} />
          </OptionRow>
          <OptionRow icon={<Waves size={16} />} title="Ripple Correction" desc="Algorithm correction for high-speed movement to eliminate wave-like jitter.">
            <Switch label="Ripple Correction" checked={settings.rippleControl} onChange={(v) => editSetting("rippleControl", v)} />
          </OptionRow>
          {(spec?.hasLongDistance ?? true) && (
            <OptionRow icon={<Disc size={16} />} title="Ultra Long Range Mode" desc="Improves wireless performance at long distances but increases power consumption">
              <Switch label="Ultra Long Range Mode" checked={settings.longDistanceMode} onChange={(v) => editSetting("longDistanceMode", v)} />
            </OptionRow>
          )}
        </div>
        <div className="h-card" style={{ background: "rgb(var(--base-background-color))" }}>
          <h3 className="h-title">
            <MousePointer2 size={16} /> Key Debounce Delay
          </h3>
          <p className="h-desc" style={{ marginBottom: 16 }}>Prevents repeated or false triggers from rapid button presses or jitter</p>
          <Seg label="Key Debounce Delay" value={settings.keyDebounce} onChange={(v) => editSetting("keyDebounce", v)} options={DEBOUNCE.map((v) => ({ value: v, label: `${v}ms` }))} />
        </div>
        <div className="h-card" style={{ background: "rgb(var(--base-background-color))" }}>
          <h3 className="h-title">
            <Moon size={16} /> Sleep Time Setting
          </h3>
          <p className="h-desc" style={{ marginBottom: 16 }}>
            The mouse will automatically enter secondary sleep after a period of inactivity to reduce power consumption and extend battery life (the receiver indicator light going off is not related to this function)
          </p>
          <Seg
            label="Sleep Time Setting"
            value={settings.sleepTime}
            onChange={(v) => editSetting("sleepTime", v)}
            options={SLEEP.map((s) => ({ ...s, disabled: s.value > 900 }))}
          />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {lods.length > 0 && (
        <div className="h-card" style={{ background: "rgb(var(--base-background-color))", display: "flex", padding: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, padding: "16px 24px" }}>
            <h3 className="h-title" style={{ fontSize: 14 }}>
              <Upload size={16} /> LOD Height Tolerance
            </h3>
            <p className="h-desc">Maximum working distance from mouse bottom to surface</p>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 16 }}>
              {continuousLod ? (
                <>
                  <Slider label="LOD Height Tolerance" value={settings.lod} min={0.7} max={1.7} step={0.1} onCommit={(v) => editSetting("lod", Number(v.toFixed(1)))} />
                  <NumBox label="LOD" value={settings.lod} min={0.7} max={1.7} step={0.1} digits={1} unit="mm" onCommit={(v) => editSetting("lod", Number(v.toFixed(1)))} />
                </>
              ) : (
                <Seg label="LOD Height Tolerance" value={settings.lod} onChange={(v) => editSetting("lod", v)} options={lods.map((mm) => ({ value: mm, label: `${mm}mm` }))} />
              )}
            </div>
          </div>
          <div style={{ width: 180, display: "grid", placeItems: "center", background: "var(--color-card)" }} aria-hidden="true">
            <svg width="140" height="60" viewBox="0 0 140 60">
              <ellipse cx="70" cy={22 - settings.lod * 4} rx="36" ry="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="70" y1={32 - settings.lod * 4} x2="70" y2="44" stroke="currentColor" strokeWidth="2" />
              <line x1="0" y1="46" x2="140" y2="46" stroke="currentColor" strokeDasharray="2 3" />
            </svg>
          </div>
        </div>
        )}
        {(spec?.hasSensorAngle ?? true) && (
          <div className="h-card" style={{ background: "rgb(var(--base-background-color))", padding: "16px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <h3 className="h-title">
                  <RotateCw size={16} /> Sensor Rotation
                </h3>
                <p className="h-desc" style={{ fontSize: 14 }}>Precise horizontal movement regardless of mouse grip style</p>
              </div>
              <Switch label="Sensor Rotation" checked={settings.sensorAngleEnabled} onChange={(v) => editSetting("sensorAngleEnabled", v)} />
            </div>
            <RotationDial value={angle} disabled={!settings.sensorAngleEnabled} onPreview={setAngle} onCommit={setRotation} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-hint-60)" }}>Auto Calibration</div>
                <p className="h-desc" style={{ fontSize: 10, maxWidth: 400 }}>
                  Just slide left-right inside the box — samples are collected heavily and the path is calibrated in real time
                </p>
              </div>
              <button type="button" className="h-btn" disabled title="Auto calibration is not available for this device protocol">
                Start Calibration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RotationDial({ value, disabled, onPreview, onCommit }: { value: number; disabled: boolean; onPreview: (v: number) => void; onCommit: (v: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const toAngle = (event: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return Math.round(Math.max(-30, Math.min(30, deg)));
  };
  const ticks = useMemo(() => Array.from({ length: 61 }, (_, i) => i - 30), []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: disabled ? 0.55 : 1 }}>
      <button type="button" className="hm-dial-btn" aria-label="Rotate left" disabled={disabled} onClick={() => onCommit(value - 1)}>
        <RotateCcw size={18} />
      </button>
      <svg
        ref={ref}
        width="300"
        height="300"
        viewBox="-150 -150 300 300"
        role="slider"
        aria-label="Sensor rotation"
        aria-valuemin={-30}
        aria-valuemax={30}
        aria-valuenow={value}
        tabIndex={disabled ? -1 : 0}
        style={{ touchAction: "none", cursor: disabled ? "default" : "grab" }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowLeft") onCommit(value - 1);
          if (e.key === "ArrowRight") onCommit(value + 1);
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          onPreview(toAngle(e));
        }}
        onPointerMove={(e) => !disabled && e.buttons && onPreview(toAngle(e))}
        onPointerUp={(e) => !disabled && onCommit(toAngle(e))}
      >
        {ticks.map((t) => {
          const r = (t * 3 * Math.PI) / 180;
          const long = t % 15 === 0;
          return <line key={t} x1={Math.sin(r) * 118} y1={-Math.cos(r) * 118} x2={Math.sin(r) * (long ? 106 : 112)} y2={-Math.cos(r) * (long ? 106 : 112)} stroke="currentColor" strokeOpacity=".35" />;
        })}
        {[-30, -15, 0, 15, 30].map((t) => {
          const r = (t * 3 * Math.PI) / 180;
          return (
            <text key={t} x={Math.sin(r) * 136} y={-Math.cos(r) * 136 + 4} textAnchor="middle" fontSize="14" fill="currentColor" opacity=".6">
              {t}°
            </text>
          );
        })}
        <circle r="100" fill="rgba(var(--base-color),.08)" />
        <circle r="78" fill="rgba(var(--base-color),.06)" />
        <g transform={`rotate(${value * 3})`}>
          <circle cx="0" cy="-100" r="6" fill="#fff" stroke="rgba(0,0,0,.2)" />
        </g>
        <text y="18" textAnchor="middle" fontSize="54" fill="currentColor" fontWeight={700}>
          {value}°
        </text>
      </svg>
      <button type="button" className="hm-dial-btn" aria-label="Rotate right" disabled={disabled} onClick={() => onCommit(value + 1)}>
        <RotateCw size={18} />
      </button>
    </div>
  );
}

/* ---------------- Configuration Management ---------------- */
export function ConfigSection({ onImport, onNew, onExport }: { onImport: () => void; onNew: () => void; onExport: () => void }) {
  const hub = useHub();
  const maps = useConfigStore((s) => s.maps);
  const activeMapId = useConfigStore((s) => s.activeMapId);
  const info = useConfigStore((s) => s.deviceInfo);
  const [batch, setBatch] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const slots = [0, 1, 2, 3];
  return (
    <div>
      {/* The panel body scrolls; a second scroll box here would overrun the panel edge. */}
      <div style={{ padding: "20px 24px", maxWidth: 900 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <h2 className="h-title" style={{ fontSize: 18, flex: "1 1 auto" }}>Local configuration</h2>
          <button type="button" className="h-btn" aria-pressed={batch} onClick={() => (setBatch(!batch), setPicked(new Set()))}>
            {batch ? "Cancel" : "Batch Operation"}
          </button>
          <button type="button" className="h-btn" onClick={onImport}>
            Import Config
          </button>
          <button type="button" className="h-btn primary" onClick={onNew}>
            New Configuration
          </button>
        </div>
        <p style={{ margin: "20px 0 12px", color: "var(--color-text-head-100)" }}>
          Config File <small style={{ color: "var(--color-text-hint-60)", marginLeft: 6 }}>Stored on device, accessible from any computer</small>
        </p>
        {slots.map((slot) => (
          <div key={slot} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span className="hm-slot-icon">
              <SlotChip n={slot + 1} />
            </span>
            <div className="hm-slot" data-active={slot === (info.onboardSlot ?? 0)}>
              Config File{slot + 1}
              {slot === (info.onboardSlot ?? 0) && <span className="hm-applying">Applying</span>}
              <span style={{ flex: 1 }} />
              <FileText size={16} aria-label="Onboard file" />
            </div>
          </div>
        ))}
        <p style={{ margin: "20px 0 12px", color: "var(--color-text-head-100)" }}>
          Computer Config <small style={{ color: "var(--color-text-hint-60)", marginLeft: 6 }}>Stored locally on the computer.Temporarily occupies last onboard slot when applied</small>
        </p>
        {maps.length === 0 ? (
          <div className="h-grid-bg" style={{ height: 180, display: "grid", placeItems: "center" }}>
            Local No Storage Configuration
          </div>
        ) : (
          maps.map((map) => (
            <div key={map.id} className="hm-slot" data-active={map.id === activeMapId} style={{ marginBottom: 8 }}>
              {batch && (
                <input
                  type="checkbox"
                  aria-label={`Select ${map.name}`}
                  checked={picked.has(map.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.currentTarget.checked) next.add(map.id);
                    else next.delete(map.id);
                    setPicked(next);
                  }}
                />
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{map.name}</span>
              {map.id === activeMapId && <span className="hm-applying">Applying</span>}
              <span style={{ flex: 1 }} />
              {!batch && map.id !== activeMapId && (
                <button type="button" className="h-btn" style={{ height: 26 }} onClick={() => void hub.selectMap(map.id, true)}>
                  Apply
                </button>
              )}
            </div>
          ))
        )}
        {batch && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="h-btn" disabled={!picked.size} onClick={onExport}>
              Export
            </button>
            <button
              type="button"
              className="h-btn danger"
              disabled={!picked.size || picked.size >= maps.length}
              onClick={() => {
                picked.forEach((id) => useConfigStore.getState().deleteMap(id));
                setPicked(new Set());
                setBatch(false);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Other settings ---------------- */
export function OtherSection() {
  const info = useConfigStore((s) => s.deviceInfo);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const device = useConfigStore((s) => s.selectedDevice);
  const colors = useMouseColorway((s) => s.colors);
  const color = device ? selectedColorIndex(device, colors) : 0;
  const setColor = (index: number) => {
    if (!device) return;
    useMouseColorway.getState().select(device, index);
    // The home card and the next connect read the colour from the remembered list (receivers via modelId).
    saveRememberedDevices(
      getRememberedDevices().map((saved) =>
        saved.deviceId === device.id || saved.modelId === device.id ? { ...saved, color: index } : saved,
      ),
    );
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "466px 1fr", padding: "60px 106px 0 0", gap: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <span style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--color-text-hint-60)", alignItems: "center" }}>
          {info.batteryLevel > 0 && (
            <>
              <BatteryFull size={16} /> {info.batteryLevel}% <span style={{ width: 1, height: 14, background: "var(--color-border-12)" }} />
            </>
          )}
          <Cable size={14} /> {info.connectionMode === "wireless_dongle" ? "Wireless Connection" : "Wired Connection"}
        </span>
        <MouseImage height={460} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 0 }}>
        <div className="h-card hm-other">
          <strong>Firmware Version V{info.firmwareMouse || "—"}</strong>
          <span>Latest VersionV {info.firmwareMouse || "—"}</span>
        </div>
        <div className="h-card hm-other row">
          <strong>Pair Receiver</strong>
          <button type="button" className="h-btn lg" disabled title="Receiver pairing is not verified for this device protocol">
            Pair Now
          </button>
        </div>
        <div className="h-card hm-other row">
          <span>
            <strong>Factory Reset</strong>
            <small>Reset all mouse settings to factory state, please operate carefully</small>
            {error && <small style={{ color: "var(--color-error)" }}>{error}</small>}
          </span>
          <button type="button" className="h-btn lg" disabled={!info.connected} onClick={() => setConfirm(true)}>
            Reset
          </button>
        </div>
        {device && <AppearancePicker device={device} color={color} setColor={setColor} />}
      </div>
      {confirm && (
        <Tip
          message="Reset all mouse settings to factory state?"
          confirm="Reset"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            restoreFactory().catch((e) => setError(e instanceof Error ? e.message : String(e)));
          }}
        />
      )}
    </div>
  );
}

