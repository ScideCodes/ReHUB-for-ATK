import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { Check, LoaderCircle } from "lucide-react";
import { clsx } from "clsx";
import { transition } from "./motion";

export interface ButtonProps extends Omit<
  HTMLMotionProps<"button">,
  "children"
> {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "normal" | "icon";
  loading?: boolean;
  success?: boolean;
  progress?: number;
  icon?: ReactNode;
}

export function Button({
  children,
  variant = "secondary",
  size = "normal",
  loading = false,
  success = false,
  progress,
  icon,
  disabled,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const reduced = useReducedMotion();
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    setShowSuccess(success);
    if (!success) return;
    const timer = window.setTimeout(() => setShowSuccess(false), 1200);
    return () => window.clearTimeout(timer);
  }, [success]);
  const blocked = disabled || loading;
  return (
    <motion.button
      type={type}
      className={clsx(
        "hub-button",
        `hub-button--${variant}`,
        `hub-button--${size}`,
        className,
      )}
      disabled={blocked}
      aria-busy={loading || undefined}
      whileTap={blocked || reduced ? undefined : { scale: 0.96 }}
      transition={transition(reduced)}
      {...props}
      title={props.title ?? props["aria-label"]}
    >
      <span className="hub-button-content">
        {showSuccess ? (
          <Check size={16} aria-hidden="true" />
        ) : loading ? (
          <LoaderCircle size={16} className="hub-loading" aria-hidden="true" />
        ) : (
          icon
        )}
        {children}
      </span>
      {progress !== undefined && (
        <span className="hub-button-progress" aria-hidden="true">
          <motion.span
            animate={{
              scaleX: Math.max(
                0,
                Math.min(1, Number.isFinite(progress) ? progress : 0),
              ),
            }}
            transition={transition(reduced)}
          />
        </span>
      )}
    </motion.button>
  );
}
