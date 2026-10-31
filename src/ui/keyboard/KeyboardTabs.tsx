import { motion } from "framer-motion";
import { useLightingReducedMotion as useReducedMotionPreference } from "./useLightingReducedMotion";
import {
  Keyboard,
  Gauge,
  Lightbulb,
  SlidersHorizontal,
  ListOrdered,
  Settings2,
} from "lucide-react";
import type { CSSProperties } from "react";

const icons = {
  keys: Keyboard,
  trigger: Gauge,
  lighting: Lightbulb,
  advanced: SlidersHorizontal,
  macros: ListOrdered,
  settings: Settings2,
};
export function KeyboardTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const reduced = useReducedMotionPreference();
  return (
    <nav
      className="lg-tabs glass-clear keyboard-tabs"
      aria-label="Keyboard settings"
      role="tablist"
      style={{ "--keyboard-tab-count": tabs.length } as CSSProperties}
    >
      {tabs.map((item) => {
        const Icon = icons[item.id as keyof typeof icons] ?? Settings2;
        return (
          <motion.button
            type="button"
            key={item.id}
            id={`keyboard-tab-${item.id}`}
            role="tab"
            aria-controls="keyboard-tab-panel"
            aria-selected={value === item.id}
            aria-current={value === item.id ? "page" : undefined}
            tabIndex={value === item.id ? 0 : -1}
            title={item.label}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const index = tabs.findIndex((tab) => tab.id === item.id);
              const next =
                tabs[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          tabs.length) %
                        tabs.length
                ];
              onChange(next.id);
              document.getElementById(`keyboard-tab-${next.id}`)?.focus();
            }}
            whileTap={reduced ? undefined : { scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            {value === item.id && (
              <motion.span
                className="lg-tab-pill"
                layoutId="keyboard-liquid-tab"
                aria-hidden="true"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 32, mass: 0.9 }
                }
              />
            )}
            <Icon size={16} aria-hidden="true" />
            <span>{item.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
