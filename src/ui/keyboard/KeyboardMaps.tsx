import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  Download,
  Layers,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useKeyboardStore } from "../../store/keyboardStore";
import { Button, Dialog } from "../index";

export function KeyboardMaps({
  collapsed,
  onToggle,
  onExport,
  onImport,
  onError,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onExport: () => void;
  onImport: () => void;
  onError: (error: unknown) => void;
}) {
  const store = useKeyboardStore();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [action, setAction] = useState<{
    kind: "rename" | "delete";
    id: string;
    name: string;
  } | null>(null);
  const [name, setName] = useState("");
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const filtered = store.maps.filter((map) =>
    map.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      onError(error);
    }
  };
  const closeMenu = (restore = false) => {
    setMenu(null);
    if (restore) trigger.current?.focus();
  };
  useEffect(() => {
    if (!menu) return;
    popup.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setMenu(null);
    };
    const dismiss = () => setMenu(null);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);
  const target = store.maps.find((map) => map.id === menu?.id);
  function perform(kind: "rename" | "delete") {
    if (!target) return;
    setName(target.name);
    setAction({ kind, id: target.id, name: target.name });
    setMenu(null);
  }
  return (
    <aside
      className="keyboard-panel keyboard-library"
      aria-label="Keyboard maps"
      data-collapsed={collapsed}
    >
      <header className="keyboard-maps-header">
        {!collapsed && (
          <div className="keyboard-maps-heading">
            <h2>Maps</h2>
            <span>{store.maps.length}</span>
          </div>
        )}
        <Button
          className="keyboard-maps-new"
          size="small"
          icon={<Plus size={16} />}
          title="New map"
          aria-label="New map"
          disabled={store.maps.length >= 100}
          onClick={() =>
            run(() => {
              store.add(false);
              setQuery("");
            })
          }
        >
          {!collapsed && <span>New</span>}
        </Button>
        <Button
          size="icon"
          className="keyboard-maps-collapse"
          title={collapsed ? "Expand maps" : "Collapse maps"}
          aria-label={collapsed ? "Expand maps" : "Collapse maps"}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </Button>
      </header>
      {!collapsed && (
        <label className="keyboard-maps-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search maps"
            placeholder="Search maps"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className="keyboard-maplist" aria-label="Saved keyboard maps">
        {(collapsed ? store.maps : filtered).map((map) => {
          const index = store.maps.findIndex((item) => item.id === map.id);
          const summary = `${(map.settings.pollingRate / 1000).toLocaleString()}K Hz · ${map.settings.keys.filter((key) => key.rt.on).length} RT keys`;
          return (
            <div
              className="keyboard-map-row"
              key={map.id}
              data-active={map.id === store.activeId}
            >
              <button
                className="keyboard-map-select"
                type="button"
                aria-pressed={map.id === store.activeId}
                aria-label={
                  collapsed
                    ? `${index < 9 ? `${index + 1} ` : ""}${map.name} ${summary}`
                    : undefined
                }
                title={`${map.name} — ${summary}`}
                onClick={() => run(() => store.select(map.id))}
              >
                <span className="keyboard-map-symbol" aria-hidden="true">
                  <Layers size={18} />
                  <small>{index < 9 ? index + 1 : ""}</small>
                </span>
                {!collapsed && (
                  <span className="keyboard-map-copy">
                    <strong>{map.name}</strong> <small>{summary}</small>
                  </span>
                )}
              </button>
              <button
                className="keyboard-map-overflow"
                type="button"
                title={`Actions for ${map.name}`}
                aria-label={`Actions for ${map.name}`}
                aria-haspopup="menu"
                aria-expanded={menu?.id === map.id}
                onClick={(e) => {
                  if (menu?.id === map.id) {
                    closeMenu(true);
                    return;
                  }
                  trigger.current = e.currentTarget;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenu({
                    id: map.id,
                    x: Math.max(
                      8,
                      Math.min(rect.right + 8, window.innerWidth - 184),
                    ),
                    y: Math.max(
                      8,
                      Math.min(rect.top, window.innerHeight - 154),
                    ),
                  });
                }}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          );
        })}
        {!collapsed && !filtered.length && (
          <div className="keyboard-maps-empty" role="status">
            <p>No matching maps.</p>
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        )}
      </div>
      <footer className="keyboard-maps-footer">
        {!collapsed && <span>Stored locally</span>}
        <div>
          <Button
            size="icon"
            title="Export keyboard maps"
            aria-label="Export keyboard maps"
            onClick={onExport}
          >
            <Download size={16} />
          </Button>
          <Button
            size="icon"
            title="Import keyboard maps"
            aria-label="Import map backup"
            onClick={onImport}
          >
            <Upload size={16} />
          </Button>
        </div>
      </footer>
      {store.saveError && (
        <p className="keyboard-note" role="alert" title={store.saveError}>
          {collapsed ? "Storage error" : store.saveError}
        </p>
      )}
      {menu &&
        target &&
        createPortal(
          <div
            className="keyboard-map-menu"
            ref={popup}
            role="menu"
            aria-label={`Actions for ${target.name}`}
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={(event) => {
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              ];
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                buttons[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          buttons.length) %
                        buttons.length
                ]?.focus();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeMenu(true);
              }
              if (event.key === "Tab") {
                event.preventDefault();
                closeMenu(true);
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => perform("rename")}
            >
              <Pencil size={14} />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={store.maps.length >= 100}
              onClick={() =>
                run(() => {
                  store.add(true, target.id);
                  setQuery("");
                  closeMenu(true);
                })
              }
            >
              <Copy size={14} />
              Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={store.maps.length < 2}
              onClick={() => perform("delete")}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>,
          document.body,
        )}
      <Dialog
        open={action !== null}
        onClose={() => {
          setAction(null);
          setTimeout(() => trigger.current?.focus(), 0);
        }}
        title={
          action?.kind === "rename" ? "Rename map" : "Delete keyboard map?"
        }
        description={
          action?.kind === "rename"
            ? "Change the name of this saved map."
            : `Delete ${action?.name ?? "this map"}? Export a backup first if needed.`
        }
        destructive={action?.kind === "delete"}
        confirmLabel={action?.kind === "rename" ? "Save name" : "Delete map"}
        onConfirm={() => {
          if (!action) return;
          if (action.kind === "rename") {
            if (!name.trim()) throw new Error("Enter a map name.");
            store.rename(name, action.id);
          } else store.remove(action.id);
          setAction(null);
        }}
      >
        {action?.kind === "rename" && (
          <label className="keyboard-field">
            Map name
            <input
              data-autofocus
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
      </Dialog>
    </aside>
  );
}
