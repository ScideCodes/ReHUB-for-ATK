import { useHub } from "../../app/HubProvider";
import { useConfigStore } from "../../store/configStore";

export function ShortcutCard() {
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const shortcuts = [
    ["1–9", "Switch map"],
    [`${modifier} K`, "Search"],
    [`${modifier} Z`, "Undo edit"],
    [`${modifier} Shift Z`, "Redo edit"],
  ];
  return (
    <section className="lg-shortcuts" aria-label="Keyboard shortcuts">
      <h3 className="lg-side-heading">Shortcuts</h3>
      <ul className="lg-keys">
        {shortcuts.map(([keys, label]) => (
          <li key={label}>
            <span>{label}</span>
            <kbd className="lg-kbd">{keys}</kbd>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ActiveMapChip() {
  const { map } = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const link = info.connected
    ? info.isMock
      ? "Simulated"
      : "Live"
    : "Offline";
  return (
    <div className="lg-map-chip" role="group" aria-label="Active map">
      <span className="map-color-dot" aria-hidden="true" />
      <strong title={map?.name}>{map?.name ?? "No map"}</strong>
      <span aria-hidden="true">·</span>
      <span>{link}</span>
    </div>
  );
}
