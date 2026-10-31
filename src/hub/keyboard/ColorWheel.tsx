import { useEffect, useRef, useState } from "react";

function hexToHsv(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Hue/saturation wheel + value bar + HEX/RGB fields, like the original colour picker. */
export function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [format, setFormat] = useState<"hex" | "rgb">("rgb");
  useEffect(() => setHsv(hexToHsv(value)), [value]);
  const wheel = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const pick = (event: React.PointerEvent, commit: boolean) => {
    const box = wheel.current!.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2, y = event.clientY - box.top - box.height / 2;
    const next = { ...hsv, h: ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360, s: Math.min(1, Math.hypot(x, y) / (box.width / 2)) };
    setHsv(next);
    if (commit) onChange(hsvToHex(next.h, next.s, next.v));
  };
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const angle = ((hsv.h - 90) * Math.PI) / 180;
  return (
    <div style={{ width: 200 }}>
      <div
        ref={wheel}
        className="hk-wheel"
        role="slider"
        aria-label="Hue and saturation"
        aria-valuetext={hex}
        tabIndex={0}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), pick(e, false))}
        onPointerMove={(e) => e.buttons && pick(e, false)}
        onPointerUp={(e) => pick(e, true)}
      >
        <span style={{ left: `${50 + Math.cos(angle) * hsv.s * 50}%`, top: `${50 + Math.sin(angle) * hsv.s * 50}%`, background: hex }} />
      </div>
      <input
        type="range"
        className="hk-value"
        aria-label="Brightness of colour"
        min={0}
        max={100}
        value={Math.round(hsv.v * 100)}
        style={{ background: `linear-gradient(90deg, #000, ${hsvToHex(hsv.h, hsv.s, 1)})` }}
        onChange={(e) => setHsv({ ...hsv, v: Number(e.currentTarget.value) / 100 })}
        onPointerUp={() => onChange(hex)}
        onKeyUp={() => onChange(hex)}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
        <div className="h-seg" style={{ flex: "none" }}>
          <button type="button" aria-pressed={format === "hex"} onClick={() => setFormat("hex")}>HEX</button>
          <button type="button" aria-pressed={format === "rgb"} onClick={() => setFormat("rgb")}>RGB</button>
        </div>
        {format === "hex" ? (
          <input
            className="h-input"
            style={{ width: 90, height: 28 }}
            aria-label="Hex colour"
            defaultValue={hex}
            key={hex}
            onBlur={(e) => /^#[0-9a-f]{6}$/i.test(e.currentTarget.value) && onChange(e.currentTarget.value.toLowerCase())}
          />
        ) : (
          rgb.map((c, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-text-hint-60)" }}>
              {"RGB"[i]}
              <input
                className="h-input"
                style={{ width: 44, height: 28, padding: "0 4px", textAlign: "center" }}
                aria-label={`${"Red Green Blue".split(" ")[i]} channel`}
                defaultValue={c}
                key={hex + i}
                onBlur={(e) => {
                  const v = Math.max(0, Math.min(255, Math.round(Number(e.currentTarget.value))));
                  if (!Number.isFinite(v)) return;
                  const next = [...rgb];
                  next[i] = v;
                  onChange(`#${next.map((x) => x.toString(16).padStart(2, "0")).join("")}`);
                }}
              />
            </label>
          ))
        )}
      </div>
    </div>
  );
}
