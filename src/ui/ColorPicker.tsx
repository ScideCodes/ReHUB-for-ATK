import { useEffect, useId, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { clsx } from "clsx";

export interface ColorPickerProps {
  label: string;
  value: string;
  onValueChange: (hex: string) => void;
  hideLabel?: boolean;
}

const presets = [
  { value: "#BDC9E2", label: "Ice" },
  { value: "#000000", label: "Black" },
  { value: "#F68641", label: "Orange" },
] as const;
const invalidMessage = "Use # followed by six letters A–F or numbers 0–9.";

function normalizeHex(value: string) {
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

export function ColorPicker({
  label,
  value,
  onValueChange,
  hideLabel = false,
}: ColorPickerProps) {
  const id = useId();
  const current = normalizeHex(value);
  const [draft, setDraft] = useState(current ?? value);
  const [error, setError] = useState(current ? "" : invalidMessage);
  const swatches: { value: string; label: string }[] = [...presets];
  if (current && !presets.some((preset) => preset.value === current))
    swatches.push({ value: current, label: "Custom" });

  useEffect(() => {
    const next = normalizeHex(value);
    setDraft(next ?? value);
    setError(next ? "" : invalidMessage);
  }, [value]);

  function commit(nextDraft: string) {
    const next = normalizeHex(nextDraft);
    if (!next) {
      setError(invalidMessage);
      return;
    }
    setDraft(next);
    setError("");
    if (next !== current) onValueChange(next);
  }

  function revert() {
    setDraft(current ?? value);
    setError(current ? "" : invalidMessage);
  }

  return (
    <div className="hub-color-picker">
      <span
        id={`${id}-label`}
        className={clsx("hub-control-label", hideLabel && "hub-sr-only")}
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="hub-color-swatches"
      >
        {swatches.map((swatch) => {
          const selected = swatch.value === current;
          return (
            <label
              key={swatch.value}
              className="hub-color-swatch"
              data-selected={selected}
            >
              <input
                className="hub-sr-only"
                type="radio"
                name={`${id}-swatch`}
                value={swatch.value}
                checked={selected}
                aria-label={`${swatch.label}, ${swatch.value}`}
                onChange={() => commit(swatch.value)}
              />
              <span
                className="hub-color-swatch-dot"
                style={{ "--swatch-color": swatch.value } as CSSProperties}
                aria-hidden="true"
              />
              <span className="hub-color-swatch-name">{swatch.label}</span>
              <Check
                size={13}
                className="hub-color-swatch-check"
                aria-hidden="true"
              />
            </label>
          );
        })}
      </div>
      <label className="hub-color-hex-field" htmlFor={`${id}-hex`}>
        <span className="hub-color-hex-label">Hex</span>
        <input
          id={`${id}-hex`}
          type="text"
          value={draft}
          className="hub-color-hex hub-number"
          aria-label={`${label} hex color`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError("");
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              commit(draft);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              revert();
            }
          }}
        />
      </label>
      {error && (
        <span id={`${id}-error`} className="hub-color-error" role="status">
          {error}
        </span>
      )}
    </div>
  );
}
