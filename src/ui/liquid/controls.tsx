import { useEffect, useRef, useState, type ReactNode } from "react";
import { ColorPicker } from "../ColorPicker";
import { Button } from "../Button";
import { Slider } from "../Slider";

export function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="lg-row">
      <div>
        <h2>{label}</h2>
        {help && <p>{help}</p>}
      </div>
      <div className="lg-row-control">{children}</div>
    </div>
  );
}

export function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const numeric = Number(draft);
    const next =
      draft.trim() && Number.isFinite(numeric)
        ? Math.max(min, Math.min(max, Math.round(numeric / step) * step))
        : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }
  return (
    <label className="lg-number-field">
      <span className="hub-sr-only">{label}</span>
      <input
        aria-label={label}
        inputMode="numeric"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(value));
          }
        }}
      />
    </label>
  );
}

/** Pointer updates stay local; a completed gesture creates one map edit. */
export function CommitSlider({
  value,
  onCommit,
  onPreview,
  ...props
}: Omit<Parameters<typeof Slider>[0], "onValueChange" | "onValueCommit"> & {
  onCommit: (value: number) => void;
  onPreview?: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  const changed = useRef(false);
  useEffect(() => {
    setDraft(value);
    latest.current = value;
    changed.current = false;
  }, [value]);
  function commit(next = latest.current) {
    if (!changed.current) return;
    changed.current = false;
    onCommit(next);
  }
  return (
    <div onBlurCapture={() => commit()} onPointerCancel={() => commit()}>
      <Slider
        {...props}
        value={draft}
        onValueChange={(next) => {
          latest.current = next;
          changed.current = true;
          setDraft(next);
          onPreview?.(next);
        }}
        onValueCommit={commit}
      />
    </div>
  );
}

export function CommitColorPicker(props: Parameters<typeof ColorPicker>[0]) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const latest = useRef(props.value);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDraft(props.value);
    latest.current = props.value;
  }, [props.value]);
  function close() {
    setOpen(false);
    if (latest.current !== props.value) props.onValueChange(latest.current);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [open, props.value, props.onValueChange]);
  return (
    <div
      ref={panel}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          open
        )
          close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <Button
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {props.label}: {props.value}
      </Button>
      {open && (
        <div className="glass-inset">
          <ColorPicker
            {...props}
            value={draft}
            onValueChange={(value) => {
              latest.current = value;
              setDraft(value);
            }}
          />
          <Button onClick={close}>Done</Button>
        </div>
      )}
    </div>
  );
}
