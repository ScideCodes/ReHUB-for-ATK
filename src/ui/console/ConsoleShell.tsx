import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import "./tokens.css";
import "./console.css";

/** Black store-style top bar: back, ATK mark, device name, then actions. */
export function ConsoleTopBar({
  device,
  onBack,
  actions,
  children,
}: {
  device: string;
  onBack?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="cx-top cx-hero">
      <a
        className="lg-skip"
        href="#settings-editor"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("settings-editor")?.focus();
        }}
      >
        Skip to settings
      </a>
      {onBack && (
        <button
          type="button"
          className="cx-back"
          onClick={onBack}
          aria-label="Back to device list"
          title="Return to device selection"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      )}
      <span className="cx-mark">ATK</span>
      <strong className="cx-device">{device}</strong>
      {children}
      <div className="cx-top-actions">{actions}</div>
    </header>
  );
}

/** Fixed frame: top bar row, then rail | main | device tile. Nothing in the frame scrolls at 1440×900+. */
export function ConsoleShell({
  top,
  rail,
  aside,
  children,
}: {
  top: ReactNode;
  rail: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {top}
      {/* lg-workspace kept as a hook for existing browser checks; .cx rules own the layout. */}
      <div className="cx-body lg-workspace">
        {rail}
        {children}
        {aside}
      </div>
    </>
  );
}
