import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { transition } from "./motion";

export interface ToggleProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  hideLabel?: boolean;
  className?: string;
  id?: string;
}

export function Toggle({
  label,
  checked,
  onCheckedChange,
  description,
  disabled = false,
  disabledReason,
  hideLabel = false,
  className,
  id,
}: ToggleProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hint = disabled && disabledReason ? disabledReason : description;
  const reduced = useReducedMotion();
  return (
    <div className={clsx("hub-toggle-field", className)}>
      <div className={clsx("hub-control-copy", hideLabel && "hub-sr-only")}>
        <label htmlFor={controlId} className="hub-control-label">
          {label}
        </label>
        {hint && (
          <span id={`${controlId}-hint`} className="hub-control-hint">
            {hint}
          </span>
        )}
      </div>
      <motion.button
        id={controlId}
        type="button"
        role="switch"
        aria-label={label}
        title={disabled && disabledReason ? disabledReason : label}
        aria-checked={checked}
        aria-describedby={hint ? `${controlId}-hint` : undefined}
        disabled={disabled}
        className="hub-toggle"
        data-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        whileTap={disabled || reduced ? undefined : { scale: 0.97 }}
      >
        <span className="hub-toggle-track" aria-hidden="true">
          <motion.span
            className="hub-toggle-thumb"
            animate={{ x: checked ? 20 : 0 }}
            transition={transition(reduced)}
          ></motion.span>
        </span>
      </motion.button>
      {hideLabel && disabled && disabledReason && (
        <span className="hub-control-hint">{disabledReason}</span>
      )}
    </div>
  );
}
