import { useEffect, useId, useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { downloadMaps } from "../../features/maps/mapFiles";
import {
  createMap,
  editMetadata,
  flushMap,
  getEditorMap,
  useMapSession,
} from "../../features/maps/mapSession";
import type { SettingsMap } from "../../types/schema";
import { Button } from "../Button";
import { SettingsSnapshot } from "./SettingsSnapshot";
import { useDeviceSession } from "../../features/device/deviceSession";

export function MapQuickTools() {
  const hub = useHub();
  if (!hub.map) return null;

  return <SelectedMapTools key={hub.map.id} map={hub.map} />;
}

function SelectedMapTools({ map }: { map: SettingsMap }) {
  const hub = useHub();
  const [note, setNote] = useState(map.note);
  const busy = useDeviceSession((state) => state.busy);
  const statusId = useId();
  const saveStatus = useMapSession((state) => state.saveStatus[map.id]);
  const changed = note !== map.note;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setNote(map.note), [map.note]);

  useEffect(() => {
    if (
      typeof CSS !== "undefined" &&
      CSS.supports &&
      CSS.supports("field-sizing", "content")
    ) {
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(72, el.scrollHeight)}px`;
  }, [note]);

  function saveNote() {
    // Metadata actions target the active map, so stale blur events must stop here.
    const current = getEditorMap();
    if (current?.id !== map.id) return undefined;
    if (current.note !== note) editMetadata({ note });
    flushMap(map.id);
    const session = useMapSession.getState();
    if (session.saveStatus[map.id] === "error") {
      throw new Error(session.saveError ?? "Could not save this map.");
    }
    return getEditorMap();
  }

  const status = changed
    ? "Unsaved note"
    : saveStatus === "error"
      ? "Not saved"
      : saveStatus === "saving"
        ? "Saving locally"
        : "Saved locally";

  return (
    <section className="lg-map-quick-tools" aria-label="Selected map tools">
      <div className="lg-side-heading">
        <h2>Selected map</h2>
        <p title={map.name}>{map.name}</p>
      </div>
      <SettingsSnapshot settings={hub.settings} />
      <label className="lg-side-note">
        <span>Map note</span>
        <textarea
          ref={textareaRef}
          rows={3}
          value={note}
          placeholder="Game, sensitivity, or setup notes"
          aria-describedby={statusId}
          onChange={(event) => setNote(event.currentTarget.value)}
          onBlur={() =>
            void hub.run(() => {
              saveNote();
            })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setNote(map.note);
            }
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <small id={statusId} role="status" aria-live="polite">
          {status}
        </small>
      </label>
      <div className="lg-side-actions">
        <Button
          size="small"
          icon={<Copy size={14} aria-hidden="true" />}
          title="Duplicate this map without applying it to the mouse"
          disabled={busy}
          onClick={() =>
            void hub.run(() => {
              const current = saveNote();
              if (current) createMap(`${current.name} (Copy)`, "duplicate");
            })
          }
        >
          Duplicate
        </Button>
        <Button
          size="small"
          icon={<Download size={14} aria-hidden="true" />}
          title="Export only this map as JSON"
          onClick={() =>
            void hub.run(() => {
              const current = saveNote();
              if (current) downloadMaps([current]);
            })
          }
        >
          Export
        </Button>
      </div>
    </section>
  );
}
