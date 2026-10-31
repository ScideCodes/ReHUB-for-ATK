import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function AdvancedSettings({
  title = "Advanced settings",
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <details className="advanced-settings glass-clear glass-inset">
      <summary className="advanced-settings-summary">
        <span className="advanced-settings-copy">
          <span className="advanced-settings-title">{title}</span>
          {description && (
            <span className="advanced-settings-description">{description}</span>
          )}
        </span>
        <ChevronDown
          size={18}
          className="advanced-settings-chevron"
          aria-hidden="true"
        />
      </summary>
      <div className="advanced-settings-content">{children}</div>
    </details>
  );
}
