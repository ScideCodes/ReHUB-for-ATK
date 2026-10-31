import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import { clsx } from "clsx";
import { NumberTicker } from "./NumberTicker";
import { transition } from "./motion";
import "./sliderFx.css";
import "./liquidFx.css";
import "./liquidFx";

export interface SliderProps {
  label: string;
  hideLabel?: boolean;
  hideValue?: boolean;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  formatValue?: (value: number) => string;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  disabled?: boolean;
  disabledReason?: string;
  description?: string;
  className?: string;
}

const TICKS = Array.from({ length: 11 }, (_, index) => index);
const COMMIT_KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];

export function Slider({
  label,
  hideLabel = false,
  hideValue = false,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  formatValue,
  onValueChange,
  onValueCommit,
  disabled = false,
  disabledReason,
  description,
  className,
}: SliderProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reduced = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);
  const commitTimer = useRef<number | undefined>(undefined);
  const safeValue = Math.max(
    min,
    Math.min(max, Number.isFinite(value) ? value : min),
  );
  const fraction = max > min ? (safeValue - min) / (max - min) : 0;
  const hint = disabled && disabledReason ? disabledReason : description;
  const formatted = formatValue
    ? formatValue(safeValue)
    : `${safeValue}${suffix}`;

  // Latest values for the wheel handler, which is attached once.
  const latest = useRef({
    safeValue,
    min,
    max,
    step,
    onValueChange,
    onValueCommit,
  });
  latest.current = { safeValue, min, max, step, onValueChange, onValueCommit };

  // The fill, thumb and bubble follow one spring so they always stay in sync.
  const spring = useSpring(fraction, {
    stiffness: 520,
    damping: 38,
    mass: 0.7,
  });
  useEffect(() => {
    if (dragging || reduced) spring.jump(fraction);
    else spring.set(fraction);
  }, [fraction, dragging, reduced, spring]);
  const velocity = useVelocity(spring);
  const stretch = useTransform(velocity, [-5, 0, 5], [1.4, 1, 1.4]);
  const squash = useTransform(stretch, (amount) => 1 / amount);
  const thumbLeft = useTransform(
    spring,
    (amount) => `calc(8px + (100% - 16px) * ${amount})`,
  );

  // Scroll over a focused slider to nudge it (hold Shift for 10x steps).
  useEffect(() => {
    const element = input.current;
    if (!element || disabled) return;
    const onWheel = (event: WheelEvent) => {
      if (document.activeElement !== element || !event.deltaY) return;
      event.preventDefault();
      const state = latest.current;
      const decimals = (String(state.step).split(".")[1] ?? "").length;
      const direction = event.deltaY < 0 ? 1 : -1;
      const raw =
        state.safeValue + direction * state.step * (event.shiftKey ? 10 : 1);
      const next = Number(
        Math.min(state.max, Math.max(state.min, raw)).toFixed(decimals),
      );
      if (next === state.safeValue) return;
      state.onValueChange(next);
      window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(
        () => latest.current.onValueCommit?.(next),
        220,
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      window.clearTimeout(commitTimer.current);
    };
  }, [disabled]);

  const active = !disabled && (dragging || hovered || focused);
  return (
    <div
      className={clsx("hub-slider-field", className)}
      data-dragging={dragging}
      data-active={active}
    >
      <div className="hub-slider-heading">
        <label
          htmlFor={id}
          className={clsx("hub-control-label", hideLabel && "hub-sr-only")}
        >
          {label}
        </label>
        <output
          htmlFor={id}
          className={clsx("hub-slider-output", hideValue && "hub-sr-only")}
        >
          {hideValue ? (
            formatted
          ) : (
            <NumberTicker
              value={safeValue}
              suffix={formatValue ? "" : suffix}
              formatter={formatValue}
            />
          )}
        </output>
      </div>
      <div
        className="hub-slider-control"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <span className="hub-slider-track" aria-hidden="true">
          <motion.span style={{ scaleX: spring }} />
        </span>
        <span className="hub-slider-ticks" aria-hidden="true">
          {TICKS.map((tick) => (
            <span
              key={tick}
              data-passed={fraction >= tick / 10 - 0.0001}
              style={
                {
                  left: `calc(8px + (100% - 16px) * ${tick / 10})`,
                } as CSSProperties
              }
            />
          ))}
        </span>
        <input
          ref={input}
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          disabled={disabled}
          aria-valuetext={formatted}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onValueChange(Number(event.currentTarget.value))}
          onPointerDown={(event) => {
            setDragging(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerUp={(event) => {
            setDragging(false);
            onValueCommit?.(Number(event.currentTarget.value));
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyUp={(event) => {
            if (COMMIT_KEYS.includes(event.key))
              onValueCommit?.(Number(event.currentTarget.value));
          }}
        />
        <motion.span
          className="hub-slider-thumb"
          aria-hidden="true"
          style={{
            left: thumbLeft,
            scaleX: reduced ? 1 : stretch,
            scaleY: reduced ? 1 : squash,
          }}
        />
        <motion.span
          className="hub-slider-bubble-anchor"
          style={{ left: thumbLeft }}
        >
          <AnimatePresence>
            {active && (
              <motion.span
                className="hub-slider-bubble"
                aria-hidden="true"
                initial={{ opacity: 0, y: reduced ? 0 : 6, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: reduced ? 0 : 4, scale: 0.94 }}
                transition={transition(reduced)}
              >
                {formatted}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
      </div>
      {hint && (
        <span id={`${id}-hint`} className="hub-control-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
