import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, CircleAlert } from "lucide-react";

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  className = "",
  label,
}: {
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div className={`h-seg ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="h-switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Range input that previews while dragging and commits on release, like Element's el-slider. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange?: (value: number) => void;
  onCommit: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(value);
  // Value when the current drag or key press began: a live onChange preview may already have moved `value`.
  const start = useRef(value);
  const active = useRef(false);
  useEffect(() => {
    setLocal(value);
    if (!active.current) start.current = value;
  }, [value]);
  const fill = max > min ? ((local - min) / (max - min)) * 100 : 0;
  const begin = () => {
    if (!active.current) start.current = value;
    active.current = true;
  };
  const commit = () => {
    active.current = false;
    if (local !== start.current) onCommit(local);
    start.current = local;
  };
  return (
    <input
      type="range"
      className="h-slider"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={local}
      disabled={disabled}
      style={{ ["--fill" as string]: `${fill}%` }}
      onChange={(event) => {
        const next = Number(event.currentTarget.value);
        setLocal(next);
        onChange?.(next);
      }}
      onPointerDown={begin}
      onKeyDown={begin}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}

export function NumBox({
  value,
  min,
  max,
  step = 1,
  unit,
  onCommit,
  label,
  disabled,
  digits = 0,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onCommit: (value: number) => void;
  label: string;
  disabled?: boolean;
  digits?: number;
}) {
  const [text, setText] = useState(value.toFixed(digits));
  useEffect(() => setText(value.toFixed(digits)), [value, digits]);
  const clamp = (next: number) =>
    Math.min(max, Math.max(min, Math.round(next / step) * step));
  const commit = (next: number) => {
    if (!Number.isFinite(next)) return setText(value.toFixed(digits));
    const clamped = Number(clamp(next).toFixed(digits));
    setText(clamped.toFixed(digits));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <span className="h-num">
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={() => commit(Number(text))}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(Number(text));
        }}
      />
      {unit && <span className="unit">{unit}</span>}
      <span className="spin">
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled}
          onClick={() => commit(value + step)}
        >
          <ChevronUp size={10} />
        </button>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled}
          onClick={() => commit(value - step)}
        >
          <ChevronDown size={10} />
        </button>
      </span>
    </span>
  );
}

export function Tip({
  title = "Tip",
  message,
  confirm = "I Know",
  cancel = "Cancel",
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: ReactNode;
  confirm?: string;
  cancel?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);
  return (
    <div className="h-overlay" onMouseDown={onCancel}>
      <div
        className="h-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <div className="body">
          <CircleAlert
            size={22}
            fill="#f0a020"
            color="#fff"
            style={{ flex: "none", marginTop: 2 }}
          />
          <div>{message}</div>
        </div>
        <div className="actions">
          {cancel && (
            <button type="button" className="h-btn" onClick={onCancel}>
              {cancel}
            </button>
          )}
          <button type="button" className="h-btn primary" onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Settings card with icon title, description and a trailing control (Parameter Settings style). */
export function OptionRow({
  icon,
  title,
  desc,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="h-card"
      style={{ display: "flex", alignItems: "center", gap: 24 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 className="h-title">
          {icon}
          {title}
        </h3>
        {desc && (
          <p
            className="h-desc"
            style={{ fontSize: 14, lineHeight: "21px", textAlign: "justify" }}
          >
            {desc}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Store-style dropdown (pill trigger + floating list); replaces the native select so it matches the UI. */
export function Dropdown({
  value,
  options,
  onChange,
  label,
  disabled,
  tone = "light",
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  tone?: "light" | "hero";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const down = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open, options, value]);
  const choose = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };
  return (
    <div className="h-dd" data-tone={tone} ref={ref}>
      <button
        type="button"
        className="h-dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? ""}`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            setOpen(true);
          } else if (open) {
            if (event.key === "Escape") setOpen(false);
            if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) event.preventDefault();
            if (event.key === "ArrowDown") setActive((a) => Math.min(options.length - 1, a + 1));
            if (event.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            if (event.key === "Enter" && options[active]) choose(options[active].value);
          }
        }}
      >
        <span>{current?.label ?? "—"}</span>
        <ChevronDown size={15} className="chev" />
      </button>
      {open && (
        <ul className="h-dd-list" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              data-active={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option.value)}
            >
              {option.label}
              {option.value === value && <Check size={14} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
