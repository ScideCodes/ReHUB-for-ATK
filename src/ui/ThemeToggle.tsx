import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "./Segmented";
import { useTheme, type ThemePreference } from "./useTheme";

export interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  return (
    <Segmented<ThemePreference>
      label="Theme"
      value={theme}
      onValueChange={setTheme}
      hideLabel
      className={className}
      options={[
        {
          value: "dark",
          accessibleLabel: "Dark theme",
          label: (
            <>
              <Moon size={15} aria-hidden="true" />
              {!compact && <span>Dark</span>}
            </>
          ),
        },
        {
          value: "light",
          accessibleLabel: "Light theme",
          label: (
            <>
              <Sun size={15} aria-hidden="true" />
              {!compact && <span>Light</span>}
            </>
          ),
        },
        {
          value: "system",
          accessibleLabel: "System theme",
          label: (
            <>
              <Monitor size={15} aria-hidden="true" />
              {!compact && <span>System</span>}
            </>
          ),
        },
      ]}
    />
  );
}
