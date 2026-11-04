import { useEffect, useState } from "react";
import housing from "./switch/housing.webp";
import window_ from "./switch/window.webp";
import stem from "./switch/stem.webp";

// Original ATK hub "atk-travel-axis": a switch whose stem sinks with the trigger travel, a 0-to-max ruler and a
// vertical handle. The stem moves at most STEM_TRAVEL px (the original travelImagesHeight) at full travel.
const STEM_TRAVEL = 15;
const SECTIONS = 6;

export function TravelDemo({
  value,
  min,
  max,
  step,
  disabled,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  // Local while dragging; written to the keys once, on release, like the original.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const ticks = Array.from({ length: SECTIONS + 1 }, (_, i) => ((i * max) / SECTIONS).toFixed(3));
  return (
    <div className="hk-axis" data-disabled={disabled || undefined}>
      <div className="hk-axis-scale">
        <div className="hk-axis-ruler" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{tick} —</span>
          ))}
        </div>
        <input
          type="range"
          className="hk-axis-handle"
          aria-label="Trigger travel demo"
          min={min}
          max={max}
          step={step}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(Number(event.currentTarget.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className="hk-axis-value" style={{ top: `${(draft / max) * 100}%` }} aria-hidden="true">
          {draft.toFixed(3)}mm
        </span>
      </div>
      <div className="hk-switch" aria-hidden="true">
        <img src={housing} alt="" draggable={false} style={{ zIndex: 3 }} />
        <img src={window_} alt="" draggable={false} style={{ zIndex: 2 }} />
        <img src={stem} alt="" draggable={false} style={{ zIndex: 2, top: `${(STEM_TRAVEL * draft) / max}px` }} />
      </div>
    </div>
  );
}
