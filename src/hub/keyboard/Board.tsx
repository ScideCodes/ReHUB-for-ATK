import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { keyLabel, type KeyboardSettings } from "../../devices/keyboardSettings";
import { layoutIndexes, type BoardLayout } from "../../devices/keyboardLayouts";

// Key captions in the original's style ("!1", "Back Space", "Left\nCtrl").
const NAMES: Record<number, string> = {
  30: "!1", 31: "@2", 32: "#3", 33: "$4", 34: "%5", 35: "^6", 36: "&7", 37: "*8", 38: "(9", 39: ")0",
  40: "Enter", 41: "Esc", 42: "Back Space", 43: "Tab", 44: "Space", 45: "-_", 46: "+=", 47: "{[", 48: "}]",
  49: "|\\", 51: ":;", 52: "\"'", 53: "~`", 54: "<,", 55: ">.", 56: "?/", 57: "Caps Lock", 73: "Insert",
  74: "Home", 75: "Page\nUp", 76: "Delete", 77: "End", 78: "Page\nDown", 79: "→", 80: "←", 81: "↓", 82: "↑",
  224: "Left\nCtrl", 225: "Left Shift", 226: "Left\nAlt", 227: "Left\nWin", 228: "Right\nCtrl", 229: "Right Shift",
  230: "Right\nAlt", 231: "Right\nWin",
};

export function caption(code: readonly number[]) {
  if (code[0] === 0 && NAMES[code[1]]) return NAMES[code[1]];
  if (code[0] === 82) return "Win Fn";
  if (code[0] === 126) return "Fn";
  return keyLabel(code);
}

const units = (rows: BoardLayout["rows"]) =>
  Math.max(...rows.map((row) => row.reduce((sum, key) => sum + (key.w ?? 1) + (key.ml ?? 0) + (key.mr ?? 0), 0)));
/** settings.keys indexes of W, A, S, D (by their base-layer code) on this layout. */
export function wasdKeys(settings: KeyboardSettings, indexes: number[]) {
  return indexes.filter((i) => i >= 0 && [26, 4, 22, 7].includes(settings.keys[i].layers[0][1]) && settings.keys[i].layers[0][0] === 0);
}

/** Largest key unit (px) that fits the board's free space, capped at `max`. */
function useFitUnit(max: number, unitsWide: number, rows: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(Math.min(max, 54));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 24, h = el.clientHeight - 24;
      setUnit(Math.max(30, Math.min(max, Math.floor(w / unitsWide), Math.floor(h / rows))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [max, unitsWide, rows]);
  return { ref, unit };
}

/** Static original-style keyboard: white keycaps on a light plate, 54px unit. */
export function Board({
  settings,
  layer = 0,
  selected,
  onSelect,
  unit: maxUnit = 72,
  render,
  tint,
  onSelection,
  layout,
}: {
  settings: KeyboardSettings;
  layer?: number;
  selected: ReadonlySet<number>;
  onSelect?: (index: number, event: React.MouseEvent) => void;
  unit?: number;
  render?: (index: number, label: string) => ReactNode;
  tint?: (index: number) => string | undefined;
  /** Multi-select like the original driver: click or sweep adds keys, starting on a selected key removes; clearing is explicit. */
  onSelection?: (keys: Set<number>) => void;
  /** Device key layout; positions the map does not hold yet render disabled. */
  layout: BoardLayout;
}) {
  const fit = useFitUnit(maxUnit, units(layout.rows), layout.rows.length);
  const indexes = layoutIndexes(settings, layout);
  const unit = fit.unit;
  const drag = useRef<{ next: Set<number>; remove: boolean } | null>(null);
  const latest = useRef(onSelection);
  latest.current = onSelection;
  useEffect(() => {
    const end = () => (drag.current = null);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);
  const sweep = (i: number) => {
    const d = drag.current;
    if (!d) return;
    if (d.remove) d.next.delete(i);
    else d.next.add(i);
    latest.current?.(new Set(d.next));
  };
  let slot = 0;
  return (
    <div className="hk-fit" ref={fit.ref}>
    <div className="hk-board" role="group" aria-label="Keyboard" data-multi={!!onSelection} style={{ ["--u" as string]: `${unit}px` }}>
      {layout.rows.map((row, r) => (
        <div className="hk-row" key={r}>
          {row.map((key) => {
            const i = indexes[slot++];
            const w = key.w ?? 1;
            const mr = key.mr ?? 0;
            const ml = key.ml ?? 0;
            if (i < 0) return <span key={`gap-${r}-${slot}`} className="hk-key hk-missing" style={{ width: unit * w - 4, height: unit - 4 }} />;
            const code = settings.keys[i]?.layers[layer] ?? [0, 0];
            // Some source layouts (kb_68, atk_68_v4) carry no legends; an unread [0,0] there is unknown, not "Disabled".
            const label = !key.defaultKey && code[0] === 0 && code[1] === 0 ? "" : caption(code);
            const color = tint?.(i);
            const name = label.replace("\n", " ") || `Key row ${key.index[0] + 1}, column ${key.index[1] + 1}`;
            return (
              <button
                key={i}
                type="button"
                className="hk-key"
                aria-pressed={selected.has(i)}
                // Custom content (Trigger values) is the visible name, led by a hidden key name when the key has no legend;
                // an aria-label there would hide the values from screen readers.
                aria-label={render ? undefined : name}
                style={{
                  width: unit * w - 4,
                  height: unit - 4,
                  marginRight: mr ? unit * mr : undefined,
                  marginLeft: ml ? unit * ml : undefined,
                  // The original treats black as unlit and leaves those keys plain.
                  ...(color && color.toLowerCase() !== "#000000" && { ["--tint" as string]: color }),
                }}
                onClick={(event) => !onSelection && onSelect?.(i, event)}
                onPointerDown={(event) => {
                  if (!onSelection || event.button !== 0) return;
                  event.preventDefault();
                  // Release implicit touch capture so the sweep reaches other keys.
                  (event.target as Element).releasePointerCapture?.(event.pointerId);
                  // Selection accumulates: a press or sweep adds keys; starting on a selected key removes instead.
                  drag.current = { next: new Set(selected), remove: selected.has(i) };
                  sweep(i);
                  onSelect?.(i, event);
                }}
                onPointerEnter={() => sweep(i)}
              >
                {render ? (
                  <>
                    {!label && <span className="hub-sr-only">{name}</span>}
                    {render(i, label)}
                  </>
                ) : (
                  label
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
    </div>
  );
}
