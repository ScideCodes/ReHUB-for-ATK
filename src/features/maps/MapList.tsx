import { useEffect, useId, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  Bookmark,
  Copy,
  Crosshair,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Shield,
  Trash2,
  Zap,
} from "lucide-react";
import { useConfigStore } from "../../store/configStore";
import { useHub } from "../../app/HubProvider";
import { useToast, transition } from "../../ui";
import { useDeviceSession } from "../device/deviceSession";
import {
  deleteEditorMap,
  duplicateEditorMap,
  editMetadata,
  reorderMaps,
  selectEditorMap,
  useMapSession,
} from "./mapSession";

const icons = { Bookmark, Zap, Crosshair, BatteryCharging, Shield };

export function MapList({ compact = false }: { compact?: boolean }) {
  const { maps, activeMapId } = useConfigStore();
  const drafts = useMapSession((state) => state.drafts);
  const busy = useDeviceSession((state) => state.busy);
  const hub = useHub();
  const listId = useId();
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  useEffect(() => {
    if (!actionsFor) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest("[data-map-id]")?.getAttribute("data-map-id") !==
          actionsFor
      )
        setActionsFor(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionsFor(null);
        document.getElementById(`${listId}-${actionsFor}-actions`)?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [actionsFor, listId]);
  function move(id: string, target: number) {
    const ids = maps.map((map) => map.id);
    const index = ids.indexOf(id);
    if (index < 0 || target < 0 || target >= ids.length) return;
    ids.splice(index, 1);
    ids.splice(target, 0, id);
    reorderMaps(ids);
  }
  function rename(id: string) {
    if (name.trim()) {
      selectEditorMap(id);
      editMetadata({ name: name.trim() });
    }
    setRenaming(null);
  }
  return (
    <ul className="map-list" aria-label="Saved maps">
      {maps.map((persisted, index) => {
        const map = drafts[persisted.id] ?? persisted;
        const Icon = icons[map.icon as keyof typeof icons] ?? Bookmark;
        const active = map.id === activeMapId;
        const summary = `${map.settings.pollingRate >= 1000 ? `${map.settings.pollingRate / 1000}K Hz` : `${map.settings.pollingRate} Hz`} · ${map.settings.dpiStages.length} stages${map.settings.rippleControl ? " · Ripple on" : ""}`;
        return (
          <motion.li
            layout="position"
            transition={transition(reduced)}
            key={map.id}
            className="map-item"
            data-map-id={map.id}
            data-active={active}
            style={{ "--map-color": map.color } as CSSProperties}
            draggable={!busy && renaming !== map.id && actionsFor !== map.id}
            onDragStartCapture={(event) => {
              setDragged(map.id);
              event.dataTransfer.setData("application/x-atk-map", map.id);
            }}
            onDragEndCapture={() => setDragged(null)}
            onDragOver={(event) => {
              if (dragged && !busy) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!dragged || busy) return;
              event.preventDefault();
              event.stopPropagation();
              move(dragged, index);
              setDragged(null);
            }}
          >
            {active && (
              <motion.span
                layoutId={`${listId}-map-active-bar`}
                className="map-active-bar"
                aria-hidden="true"
                transition={transition(reduced)}
              />
            )}
            <span className="map-color-dot" aria-hidden="true" />
            {renaming === map.id ? (
              <input
                autoFocus
                className="map-rename-input"
                aria-label="Map name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                onBlur={() => rename(map.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <button
                className="map-select"
                disabled={busy}
                aria-current={active ? "true" : undefined}
                aria-label={`${map.name} ${summary}`}
                title={`${map.name} · ${summary}`}
                onClick={() => void hub.selectMap(map.id)}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="map-item-copy">
                  <span className="map-name">{map.name}</span>{" "}
                  <span className="map-summary">{summary}</span>
                </span>
              </button>
            )}
            {!compact && (
              <>
                <span className="map-shortcut" aria-hidden="true">
                  {index < 9 ? index + 1 : <GripVertical size={12} />}
                </span>
                <button
                  id={`${listId}-${map.id}-actions`}
                  type="button"
                  className="map-menu-trigger"
                  aria-label={`Actions for ${map.name}`}
                  title={`Actions for ${map.name}`}
                  aria-expanded={actionsFor === map.id}
                  aria-controls={
                    actionsFor === map.id
                      ? `${listId}-${map.id}-menu`
                      : undefined
                  }
                  onClick={() =>
                    setActionsFor(actionsFor === map.id ? null : map.id)
                  }
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
                {actionsFor === map.id && (
                  <div
                    id={`${listId}-${map.id}-menu`}
                    className="map-actions"
                    role="group"
                    aria-label={`Actions for ${map.name}`}
                  >
                    <button
                      title="Rename map"
                      aria-label={`Rename ${map.name}`}
                      disabled={busy}
                      onClick={() => {
                        setActionsFor(null);
                        setRenaming(map.id);
                        setName(map.name);
                      }}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>Rename</span>
                    </button>
                    <button
                      title="Duplicate map"
                      aria-label={`Duplicate ${map.name}`}
                      disabled={busy}
                      onClick={() => {
                        duplicateEditorMap(map.id);
                        setActionsFor(null);
                      }}
                    >
                      <Copy size={14} aria-hidden="true" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      title="Move map up"
                      aria-label={`Move ${map.name} up`}
                      disabled={busy || index === 0}
                      onClick={() => move(map.id, index - 1)}
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                      <span>Move up</span>
                    </button>
                    <button
                      title="Move map down"
                      aria-label={`Move ${map.name} down`}
                      disabled={busy || index === maps.length - 1}
                      onClick={() => move(map.id, index + 1)}
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                      <span>Move down</span>
                    </button>
                    <button
                      title="Delete map"
                      aria-label={`Delete ${map.name}`}
                      disabled={busy}
                      onClick={() => {
                        setActionsFor(null);
                        const undo = deleteEditorMap(map.id);
                        toast({
                          title: `Deleted “${map.name}”`,
                          action: { label: "Undo delete", onClick: undo },
                          duration: 8000,
                        });
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
