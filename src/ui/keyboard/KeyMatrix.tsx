import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { useLightingReducedMotion } from "./useLightingReducedMotion";
import { lightingPreview, previewKeyColor } from "./lightingPreview";
import {
  KEY_LAYOUT,
  keyLabel,
  type KeyboardSettings,
} from "../../devices/keyboardSettings";

// Source layout widths and margins are key units; source preview uses an 8px gap.
// --key-min is the key floor (34px; dense desktop tabs lower it to 30px).
const layoutRows = KEY_LAYOUT.map((row) => ({
  units: row.reduce(
    (sum, key) =>
      sum +
      (key.w ?? 1) +
      ("ml" in key ? Number(key.ml) : 0) +
      ("mr" in key ? Number(key.mr) : 0),
    0,
  ),
  gap: 8 * (row.length - 1),
}));
const keyUnit = `max(var(--key-min, 34px), min(${layoutRows.map((row) => `calc((100cqw - ${row.gap}px) / ${row.units})`).join(", ")}))`;

export function KeyMatrix({
  settings,
  selected,
  selectedKeys,
  onSelect,
  layer,
  assignments,
  lighting = false,
  paintColor,
  onPaint,
  animatePreview = true,
}: {
  settings: KeyboardSettings;
  selected: number;
  selectedKeys?: number[];
  onSelect: (key: number) => void;
  layer: number;
  assignments?: number[];
  lighting?: boolean;
  paintColor?: string;
  onPaint?: (indices: number[]) => void;
  animatePreview?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const reduced = useLightingReducedMotion();
  const preview = lightingPreview(settings);
  const painting = !!(
    lighting &&
    settings.light.mode === 1 &&
    paintColor &&
    onPaint
  );
  const latest = useRef({ settings, paintColor, onPaint, painting });
  latest.current = { settings, paintColor, onPaint, painting };
  const stroke = useRef<{
    pointer: number;
    keys: Set<number>;
    source: KeyboardSettings["keys"];
    originals: Map<HTMLButtonElement, string>;
  } | null>(null);
  function paint(index: number) {
    const active = stroke.current,
      current = latest.current;
    if (
      !active ||
      !current.painting ||
      active.source !== current.settings.keys ||
      active.keys.has(index)
    )
      return;
    const button = viewport.current?.querySelector<HTMLButtonElement>(
      `button[data-key-index="${index}"]`,
    );
    if (!button) return;
    active.keys.add(index);
    active.originals.set(button, button.style.getPropertyValue("--key-led"));
    button.style.setProperty("--key-led", current.paintColor!);
  }
  function cancel() {
    const active = stroke.current;
    active?.originals.forEach((color, button) =>
      button.style.setProperty(
        "--key-led",
        active.source === latest.current.settings.keys
          ? color
          : previewKeyColor(
              latest.current.settings,
              Number(button.dataset.keyIndex),
            ),
      ),
    );
    stroke.current = null;
  }
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (stroke.current?.pointer !== event.pointerId) return;
      const points = event.getCoalescedEvents?.() ?? [];
      for (const point of points.length ? points : [event]) {
        const button = document
          .elementFromPoint(point.clientX, point.clientY)
          ?.closest<HTMLButtonElement>("button[data-key-index]");
        if (button && viewport.current?.contains(button))
          paint(Number(button.dataset.keyIndex));
      }
    };
    const finish = (event: PointerEvent) => {
      const active = stroke.current;
      if (!active || active.pointer !== event.pointerId) return;
      if (
        !latest.current.painting ||
        active.source !== latest.current.settings.keys
      ) {
        cancel();
        return;
      }
      stroke.current = null;
      latest.current.onPaint?.([...active.keys]);
    };
    const abort = (event: PointerEvent) => {
      if (stroke.current?.pointer === event.pointerId) cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", abort);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", abort);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  useEffect(() => {
    cancel();
  }, [painting, paintColor]);
  useEffect(() => {
    if (stroke.current && stroke.current.source !== settings.keys) cancel();
  }, [settings.keys]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = (width: number) => {
      element.dataset.overflow = String(
        layoutRows.some((row) => width < row.units * 34 + row.gap),
      );
    };
    const style = getComputedStyle(element);
    measure(
      element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
    );
    const observer = new ResizeObserver((entries) =>
      measure(entries[0].contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  let index = 0;
  return (
    <figure
      className="keyboard-matrix-frame"
      data-lighting={lighting}
      data-effect={preview.family}
      data-preview-motion={animatePreview && !reduced}
      data-painting={painting}
      style={
        {
          "--led-brightness": preview.brightness,
          "--led-duration": `${preview.duration}s`,
        } as CSSProperties
      }
    >
      <div
        className="keyboard-matrix-viewport"
        style={{ "--u": keyUnit } as CSSProperties}
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Scrollable keyboard layout"
      >
        <div
          className="keyboard-matrix"
          role="group"
          aria-label="Keyboard keys"
        >
          {KEY_LAYOUT.map((row, r) => (
            <div className="keyboard-keyrow" key={r}>
              {row.map((key) => {
                const n = index++,
                  value = settings.keys[n],
                  label = keyLabel(value.layers[layer]);
                return (
                  <button
                    type="button"
                    key={key.index.join(":")}
                    aria-label={`${label}, row ${value.row + 1}, column ${value.col + 1}`}
                    aria-pressed={
                      selectedKeys ? selectedKeys.includes(n) : selected === n
                    }
                    data-key-index={n}
                    data-assigned={assignments?.includes(n) || undefined}
                    aria-description={
                      assignments?.includes(n)
                        ? "Advanced action assigned"
                        : undefined
                    }
                    title={label}
                    onPointerDown={(event) => {
                      if (!painting || event.button !== 0 || stroke.current)
                        return;
                      event.preventDefault();
                      event.currentTarget.focus({ preventScroll: true });
                      stroke.current = {
                        pointer: event.pointerId,
                        keys: new Set(),
                        source: settings.keys,
                        originals: new Map(),
                      };
                      paint(n);
                      onSelect(n);
                    }}
                    onClick={(event) => {
                      onSelect(n);
                      if (painting && event.detail === 0) onPaint?.([n]);
                    }}
                    style={
                      {
                        "--key-w": key.w ?? 1,
                        "--key-h": "h" in key ? key.h : 1,
                        "--key-ml": "ml" in key ? key.ml : 0,
                        "--key-mr": "mr" in key ? key.mr : 0,
                        "--key-led": previewKeyColor(settings, n),
                        "--led-phase":
                          (-((value.row * 3 + value.col) % 15) / 15) *
                          preview.duration,
                      } as CSSProperties
                    }
                  >
                    {assignments?.includes(n) && (
                      <i
                        className="keyboard-assignment-dot"
                        aria-hidden="true"
                      />
                    )}
                    {lighting && (
                      <span className="keyboard-key-led" aria-hidden="true" />
                    )}
                    <span className="keyboard-key-label">{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="keyboard-legend">
        <span>
          <i className="keyboard-legend-dot" aria-hidden="true" />
          <span>{selectedKeys ? "Selected keys" : "Selected key"}</span>
        </span>
        <span>
          {painting
            ? "Click or drag to paint · one undo per stroke"
            : lighting && preview.family === "reactive"
              ? "Press a preview key to test the light"
              : selectedKeys
                ? "Click to select or deselect"
                : "Click a key to edit"}
        </span>
        {assignments && (
          <span>
            <i className="keyboard-assignment-dot" aria-hidden="true" />
            <span>Advanced action</span>
          </span>
        )}
        <span className="keyboard-scroll-hint">
          Scroll horizontally to see all keys
        </span>
      </figcaption>
    </figure>
  );
}
