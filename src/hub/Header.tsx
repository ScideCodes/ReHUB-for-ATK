import { DeviceReportButton } from '../support/DeviceReportDialog';
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Check,
  Languages,
  MonitorPlay,
  Moon,
  Settings,
  Shirt,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { setTheme, useHubTheme } from "./theme";
import { LANGUAGES, setLanguage, useLanguage } from "../i18n/language";
import { useNotifications } from "./notifications";

export type HubTab = { id: string; label: string };

// Same paths as the original header logo (ATK GEAR wordmark, bolt in brand orange).
export function AtkLogo() {
  return (
    <svg className="logo" viewBox="0 0 115 32" fill="none" aria-label="ATK GEAR">
      <path
        d="M16.248 11.628c.895.61 4.1 2.043 12.026-1.054.222-.085.398.222.213.38-2.97 2.487-10.833 9.743-16.2 20.92-.117.239-.456.103-.383-.155 1.225-4.426 3.48-13.255 4.041-19.928.014-.163.181-.254.312-.163zm-3.933 8.744c-.895-.61-4.1-2.044-12.026 1.053-.222.086-.398-.221-.212-.38C3.047 18.564 10.914 11.304 16.28.128c.117-.24.457-.104.384.153-1.225 4.426-3.48 13.256-4.042 19.93-.013.162-.18.252-.312.162z"
        fill="#FF6900"
      />
      <path
        d="M53.755 10.869h-8.843v2.116h3.363v8.029h2.116v-8.03h3.364zm4.231 0h-2.115v10.145h2.115zm7.175.135h-2.658l-3.78 4.937 3.78 4.937h2.658l-3.78-4.937zm-25.286-.303-5.308 10.313h2.26l3.048-5.923 3.047 5.923h2.26zm58.448 0-5.308 10.313h2.26l3.048-5.923 3.047 5.923h2.26zm13.572 10.313h2.251l-2.341-4.047a3.2 3.2 0 0 0-1.37-6.094h-5.105v10.145h2.08V17.28h2.319l2.161 3.74zm-4.48-8.242h2.812a1.297 1.297 0 1 1 0 2.595h-2.812zm-22.858-1.908v.004h-1.153v10.146h1.153l6.966-.005v-1.935l-6.067.004v-2.206h5.263v-1.93h-5.263v-2.143h5.927v-1.935zm-2.921 4.272-.04-.162H76.41v1.813h3.232l-.058.176-.064.163a3.2 3.2 0 0 1-.696 1.094c-.42.434-.931.728-1.515.868a3.2 3.2 0 0 1-.76.095c-.564 0-1.098-.163-1.618-.493-.75-.475-1.211-1.13-1.41-2.003a3.17 3.17 0 0 1 .389-2.446c.46-.764 1.103-1.234 1.957-1.442q.362-.09.724-.09.47 0 .93.149.557.172 1.018.547l.014.009h2.509l-.04-.077a5.020 5.020 0 0 0-2.284-2.147 4.9 4.9 0 0 0-2.12-.493c-.394 0-.796.05-1.194.145a4.9 4.9 0 0 0-1.849.872 5.26 5.26 0 0 0-2.02 3.346 5.5 5.5 0 0 0 .062 2.08c.163.686.448 1.324.85 1.885a5.2 5.2 0 0 0 1.438 1.37 5.2 5.2 0 0 0 1.836.71c.28.049.57.072.85.072q.59 0 1.175-.14a5 5 0 0 0 2.586-1.551 5.24 5.24 0 0 0 1.284-2.681v-.068a5 5 0 0 0 0-1.605z"
        fill="currentColor"
      />
    </svg>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function PopIcon({
  tip,
  icon,
  children,
  width,
  badge,
  onOpen,
}: {
  tip: string;
  icon: ReactNode;
  children: ReactNode;
  width?: number;
  badge?: number;
  onOpen?: () => void;
}) {
  const pop = usePopover();
  return (
    <div ref={pop.ref} className="hub-tip" data-tip={pop.open ? undefined : tip}>
      <button
        type="button"
        className="hub-icon-btn"
        aria-label={tip}
        aria-expanded={pop.open}
        onClick={() => {
          if (!pop.open) onOpen?.();
          pop.setOpen(!pop.open);
        }}
      >
        {icon}
        {!!badge && (
          <span className="hub-badge" aria-label={`${badge} new`}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      {pop.open && (
        <div
          className="hub-pop"
          style={{ width }}
          role="menu"
          // Picking a menu item (e.g. a language) closes the menu; other content stays interactive.
          onClick={(event) => (event.target as Element).closest(".hub-menu-item") && pop.setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MessageCenter() {
  const { items, unseen, markSeen, clear } = useNotifications();
  return (
    <PopIcon tip="Message center" icon={<Bell size={20} strokeWidth={1.6} />} width={340} badge={unseen} onOpen={markSeen}>
      <div className="hub-messages">
        <div className="hub-messages-head">
          <strong>Message center</strong>
          {items.length > 0 && (
            <button type="button" className="h-btn" onClick={clear}>
              <Trash2 size={13} /> Clear
            </button>
          )}
        </div>
        {items.length ? (
          <ul>
            {[...items].reverse().map((item) => (
              <li key={item.id}>
                <span className="dot" aria-hidden="true" />
                <div>
                  <p>{item.message}{item.count > 1 && <b> ×{item.count}</b>}</p>
                  <time dateTime={new Date(item.time).toISOString()}>{new Date(item.time).toLocaleTimeString()}</time>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="h-desc" style={{ textAlign: "center", margin: "24px 0" }}>
            No more messages
          </p>
        )}
      </div>
    </PopIcon>
  );
}

export function Header({
  tabs,
  active,
  demo,
  onHome,
  onTab,
  onCloseTab,
  onDemo,
  onOpenPage,
}: {
  tabs: HubTab[];
  active: string;
  demo: boolean;
  onHome: () => void;
  onTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onDemo: () => void;
  onOpenPage: (id: "settings" | "wallpaper") => void;
}) {
  const theme = useHubTheme();
  const language = useLanguage();
  const away = active !== "home";
  return (
    <header className="hub-header">
      <div className="hub-header-left">
        <button
          type="button"
          className="hub-logo"
          data-away={away}
          onClick={onHome}
          aria-label="Home"
        >
          <AtkLogo />
          {away && (
            <span className="home">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M17.046 3.405 21.642 8l-4.596 4.596-1.414-1.414L17.815 9H9.25a4.75 4.75 0 0 0 0 9.5h6.25v2H9.25a6.75 6.75 0 1 1 0-13.5h8.563l-2.181-2.181z"
                  fill="currentColor"
                />
              </svg>
              Home
            </span>
          )}
        </button>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="hub-tab"
            data-active={tab.id === active}
            title={tab.label}
            onClick={() => onTab(tab.id)}
          >
            {/* Sibling buttons, not nested: the close button cannot live inside the tab's own button. */}
            <button type="button" className="label" aria-current={tab.id === active ? "page" : undefined}>
              {tab.label}
            </button>
            <button
              type="button"
              className="x"
              aria-label={`Close ${tab.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="hub-header-right">
        {demo ? (
          <div className="hub-tip" data-tip="Exit Demo Mode">
            <button type="button" className="hub-demo" data-on="true" onClick={onDemo}>
              <MonitorPlay size={16} />
              Exit Demo
            </button>
          </div>
        ) : (
          <div className="hub-tip" data-tip="Experience demo">
            <button type="button" className="hub-icon-btn" aria-label="Experience demo" onClick={onDemo}>
              <MonitorPlay size={20} strokeWidth={1.6} />
            </button>
          </div>
        )}
        <div className="hub-tip" data-tip="Background Wallpaper">
          <button type="button" className="hub-icon-btn" aria-label="Background Wallpaper" onClick={() => onOpenPage("wallpaper")}>
            <Shirt size={20} strokeWidth={1.6} />
          </button>
        </div>
        <div className="hub-tip" data-tip={theme.dark ? "Light" : "Dark"}>
          <button
            type="button"
            className="hub-icon-btn"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme.dark ? "light" : "dark")}
          >
            {theme.dark ? <Moon size={20} strokeWidth={1.6} /> : <Sun size={20} strokeWidth={1.6} />}
          </button>
        </div>
        <PopIcon tip="Language" icon={<Languages size={20} strokeWidth={1.6} />} width={170}>
          {LANGUAGES.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              className="hub-menu-item"
              role="menuitemradio"
              aria-checked={code === language}
              lang={code}
              translate="no"
              onClick={() => setLanguage(code)}
            >
              {name}
              {code === language && <Check size={14} />}
            </button>
          ))}
        </PopIcon>
        <DeviceReportButton compact />
        <MessageCenter />
        <div className="hub-tip" data-tip="Settings">
          <button type="button" className="hub-icon-btn" aria-label="Settings" onClick={() => onOpenPage("settings")}>
            <Settings size={20} strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </header>
  );
}
