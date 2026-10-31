import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { transition } from "./motion";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  accessibleLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  hideLabel = false,
  className,
}: SegmentedProps<T>) {
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <div className={clsx("hub-segmented-field", className)}>
      <span
        id={`${id}-label`}
        className={clsx("hub-control-label", hideLabel && "hub-sr-only")}
      >
        {label}
      </span>
      <div
        className="hub-segmented"
        role="radiogroup"
        aria-labelledby={`${id}-label`}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const blocked = disabled || option.disabled;
          const hintId = `${id}-reason-${index}`;
          return (
            <label
              key={String(option.value)}
              className="hub-segmented-option"
              data-selected={selected}
              data-disabled={blocked || undefined}
            >
              <input
                className="hub-sr-only"
                type="radio"
                name={id}
                value={String(option.value)}
                checked={selected}
                disabled={blocked}
                aria-label={option.accessibleLabel}
                aria-describedby={option.disabledReason ? hintId : undefined}
                onChange={() => onValueChange(option.value)}
              />
              {selected && (
                <motion.span
                  className="hub-segmented-highlight"
                  layoutId={`segment-${id}`}
                  transition={transition(reduced)}
                  aria-hidden="true"
                />
              )}
              <span className="hub-segmented-content">{option.label}</span>
              {option.disabledReason && (
                <span id={hintId} className="hub-segmented-reason">
                  {option.disabledReason}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
