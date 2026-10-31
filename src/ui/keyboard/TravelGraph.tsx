import { motion, useReducedMotion } from "framer-motion";
import type { KeyboardSettings } from "../../devices/keyboardSettings";
import { transition } from "../motion";

export function TravelGraph({
  value,
  label = "Selected key",
  scope = "key",
}: {
  value: KeyboardSettings["keys"][number];
  label?: string;
  scope?: "key" | "all";
}) {
  const timing = transition(useReducedMotion());
  const start = 64;
  const width = 332;
  const end = start + width;
  const position = (mm: number) => start + (mm / 3.3) * width;
  const actuation = position(value.actuation);

  return (
    <figure className="keyboard-travel" data-rt={value.rt.on}>
      <figcaption>
        <div>
          <span>
            {scope === "all"
              ? `All keys · preview ${label}`
              : `${label} · selected key`}
          </span>
          <h2>First press</h2>
        </div>
        <strong>
          {value.actuation.toFixed(2)}
          <small> mm</small>
        </strong>
      </figcaption>
      <svg
        viewBox="0 0 420 100"
        role="img"
        aria-label={`Actuation ${value.actuation.toFixed(2)} millimetres from rest. The highlighted area is past the first-press threshold.`}
      >
        <text x={start} y="18">
          Key up
        </text>
        <text x={end} y="18" textAnchor="end">
          Fully down
        </text>
        {[0, 1, 2, 3.3].map((tick) => (
          <g key={tick}>
            <line
              x1={position(tick)}
              x2={position(tick)}
              y1="30"
              y2="74"
              className="travel-grid"
            />
            <text x={position(tick)} y="94" textAnchor="middle">
              {tick.toFixed(tick === 3.3 ? 1 : 0)}
            </text>
          </g>
        ))}
        <text x="12" y="56">
          Press →
        </text>
        <line x1={start} x2={end} y1="50" y2="50" className="travel-track" />
        <motion.g
          initial={false}
          animate={{ x: actuation }}
          transition={timing}
        >
          <motion.rect
            initial={false}
            animate={{ scaleX: (3.3 - value.actuation) / 3.3 }}
            style={{ originX: 0 }}
            transition={timing}
            x="0"
            y="34"
            width={width}
            height="32"
            rx="8"
            className="travel-band"
          />
        </motion.g>
        <motion.g
          initial={false}
          animate={{ x: actuation }}
          transition={timing}
          data-travel-marker="actuation"
          data-mm={value.actuation}
        >
          <line x1="0" x2="0" y1="26" y2="74" className="travel-marker" />
          <circle cx="0" cy="50" r="8" className="travel-point" />
        </motion.g>
      </svg>
      <div className="keyboard-travel-explanation hub-sr-only">
        <span>
          <i className="travel-rest-dot" />
          Before the point: no press
        </span>
        <span>
          <i className="keyboard-legend-dot" />
          At the point: press registers
        </span>
      </div>
      <section
        className="keyboard-travel-repeat"
        aria-label="Rapid trigger explanation"
      >
        <div className="keyboard-travel-repeat-heading">
          <h3>After the first press</h3>
          <span>{value.rt.on ? "Rapid trigger on" : "Rapid trigger off"}</span>
        </div>
        {value.rt.on ? (
          <div className="keyboard-travel-steps">
            {(["release", "press"] as const).map((kind) => {
              const distance = value.rt[kind];
              return (
                <div key={kind} className="keyboard-travel-step">
                  <div>
                    <span>
                      {kind === "release" ? "Lift to reset" : "Press again"}
                    </span>
                    <strong>{distance.toFixed(2)} mm</strong>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="keyboard-note">
            Enable rapid trigger to set separate reset and repeat distances.
          </p>
        )}
      </section>
      <p className="keyboard-note">
        Illustration of the preview key, not a live sensor reading.
      </p>
    </figure>
  );
}
