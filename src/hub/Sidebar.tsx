import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BatteryFull,
  Bug,
  Cable,
  ChevronLeft,
  ChevronRight,
  Cpu,
  PanelLeft,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { id: string; label: string; icon: LucideIcon };

export function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);
  return ref;
}

export type ConfigSlot = { id: string; name: string };

/** Left column of the original device page: device card, Config File picker, section nav. */
export function Sidebar({
  name,
  battery,
  wired = true,
  heading,
  items,
  active,
  onSelect,
  slots,
  activeSlot,
  onSlot,
  onManage,
  devicePanel,
}: {
  name: string;
  battery?: number;
  wired?: boolean;
  heading: string;
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  slots: ConfigSlot[];
  activeSlot: string;
  onSlot: (id: string) => void;
  onManage: () => void;
  devicePanel?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<"device" | "config" | null>(null);
  const ref = useOutside(open !== null, () => setOpen(null));
  const slotName = slots.find((slot) => slot.id === activeSlot)?.name ?? slots[0]?.name;
  return (
    <aside className="hub-side" data-collapsed={collapsed} ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="hub-side-card device"
        aria-expanded={open === "device"}
        onClick={() => setOpen(open === "device" ? null : "device")}
      >
        <span style={{ minWidth: 0 }}>
          <small>
            {battery !== undefined && (
              <>
                {battery}% <BatteryFull size={14} />
              </>
            )}
            {wired && <Cable size={12} />}
          </small>
          <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        </span>
        {open === "device" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
      <button
        type="button"
        className="hub-side-card config"
        aria-expanded={open === "config"}
        onClick={() => setOpen(open === "config" ? null : "config")}
      >
        <span>{slotName}</span>
        {open === "config" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
      {open === "device" && devicePanel && (
        <div className="hub-flyout" style={{ left: "calc(100% + 4px)", top: 0 }}>
          {devicePanel}
        </div>
      )}
      {open === "config" && (
        <div className="hub-flyout" style={{ left: "calc(100% + 4px)", top: 58 }}>
          <h4>
            Configuration File
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                onManage();
              }}
            >
              Manage Configuration Files <ChevronRight size={12} />
            </button>
          </h4>
          <div className="sub">Config File</div>
          {slots.map((slot, index) => (
            <button
              key={slot.id}
              type="button"
              className="hub-flyout-item"
              aria-pressed={slot.id === activeSlot}
              onClick={() => {
                onSlot(slot.id);
                setOpen(null);
              }}
            >
              {slot.name}
              <SlotChip n={index + 1} />
            </button>
          ))}
          <div className="sub">Custom configuration</div>
        </div>
      )}
      <nav className="hub-side-nav" aria-label={heading}>
        <h3>{heading}</h3>
        <div className="items">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="hub-nav-item"
              aria-current={item.id === active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              onClick={() => onSelect(item.id)}
            >
              <item.icon size={20} strokeWidth={1.5} />
              <span className="label" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
        <div className="hub-side-foot">
          <button
            type="button"
            className="label"
            disabled
            title="Bug Feedback needs an ATK account; not available offline"
          >
            <Bug size={14} /> Bug Feedback
          </button>
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeft size={18} />
          </button>
        </div>
      </nav>
    </aside>
  );
}

export function SlotChip({ n }: { n: number }) {
  return (
    <span style={{ position: "relative", display: "inline-grid", placeItems: "center" }} aria-hidden="true">
      <Cpu size={22} strokeWidth={1.4} />
      <span style={{ position: "absolute", fontSize: 9, fontWeight: 700 }}>{n}</span>
    </span>
  );
}
