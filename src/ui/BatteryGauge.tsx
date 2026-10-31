import { motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";
import { clsx } from "clsx";
import { NumberTicker } from "./NumberTicker";
import { transition } from "./motion";

export interface BatteryGaugeProps {
  level: number | null;
  charging?: boolean;
  connected?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function BatteryGauge({
  level,
  charging = false,
  connected = true,
  showLabel = true,
  className,
}: BatteryGaugeProps) {
  const reduced = useReducedMotion();
  const known = connected && level !== null && Number.isFinite(level);
  const percent = known ? Math.round(Math.max(0, Math.min(100, level!))) : 0;
  const label = known
    ? `${percent}%${charging ? ", charging" : ""}`
    : "Battery level unavailable";
  return (
    <div
      className={clsx(
        "hub-battery",
        known && percent <= 20 && "hub-battery--low",
        className,
      )}
      role="meter"
      aria-label="Battery"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? percent : undefined}
      aria-valuetext={label}
    >
      <span className="hub-battery-shell" aria-hidden="true">
        <motion.span
          className="hub-battery-fill"
          initial={false}
          animate={{ scaleX: percent / 100 }}
          transition={transition(reduced)}
        />
      </span>
      {charging && connected && (
        <Zap size={14} className="hub-battery-charging" aria-hidden="true" />
      )}
      {showLabel && (
        <span aria-hidden="true">
          {known ? (
            <NumberTicker value={percent} suffix="%" />
          ) : (
            <span className="hub-number">—</span>
          )}
        </span>
      )}
    </div>
  );
}
