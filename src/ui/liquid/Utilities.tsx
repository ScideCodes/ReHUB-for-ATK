import { useEffect, useState } from "react";
import { MapQuickTools } from "./MapQuickTools";
import { Download, Upload } from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { useConfigStore } from "../../store/configStore";
import {
  refreshDevice,
  restoreFactory,
  selectProfile,
  useDeviceSession,
} from "../../features/device/deviceSession";
import {
  createMap,
  editMetadata,
  useMapSession,
} from "../../features/maps/mapSession";
import {
  MapDiff,
  featureForSettingPath,
  settingsDiff,
} from "../../features/maps/MapDiff";
import { MapList } from "../../features/maps/MapList";
import { HidConsole } from "../../features/system/HidConsole";
import { Button, Dialog, Segmented, Select, Toggle } from "../index";
import { ColorPicker } from "../ColorPicker";
import { FinishPicker } from "../FinishPicker";
import { Row } from "./controls";

export function NewMapDialog() {
  const hub = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const busy = useDeviceSession((state) => state.busy);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"blank" | "duplicate" | "capture">("blank");
  useEffect(() => {
    if (hub.newMapOpen) {
      setName("");
      setMode("blank");
    }
  }, [hub.newMapOpen]);
  return (
    <Dialog
      open={hub.newMapOpen}
      onClose={() => hub.setNewMapOpen(false)}
      title="New map"
      confirmLabel="Create map"
      onConfirm={async () => {
        if (!name.trim()) throw new Error("Enter a map name.");
        if (mode === "capture") await refreshDevice();
        createMap(name, mode);
      }}
    >
      <div className="lg-form">
        <label className="hub-field">
          <span>Map name</span>
          <input
            name="map-name"
            data-autofocus
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            autoComplete="off"
          />
        </label>
        <Select
          label="Starting point"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "blank", label: "Default settings" },
            {
              value: "duplicate",
              label: "Duplicate current map",
              disabled: !hub.map,
            },
            {
              value: "capture",
              label: "Capture from device",
              disabled: !info.connected || busy || hub.generic,
              disabledReason: !info.connected
                ? "Connect a device first"
                : undefined,
            },
          ]}
        />
      </div>
    </Dialog>
  );
}
export function BackupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const hub = useHub();
  const count = useConfigStore((state) => state.maps.length);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Backup maps"
      description={`${count} maps stored on this computer. Export a versioned JSON backup or import an existing file.`}
    >
      <div className="lg-backup-options">
        <Button icon={<Download size={18} />} onClick={hub.exportMaps}>
          Export all maps
        </Button>
        <Button icon={<Upload size={18} />} onClick={hub.openImport}>
          Import JSON backup
        </Button>
      </div>
      <p className="lg-footnote">
        Imports are validated before you confirm replacing your library. You can
        also drop a JSON file into the app.
      </p>
    </Dialog>
  );
}
export function DiffDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const hub = useHub();
  const active = useConfigStore((state) => state.activeSettings);
  const info = useConfigStore((state) => state.deviceInfo);
  const issues = useDeviceSession((state) => state.readIssues);

  const handleSelectPath = (path: string) => {
    const targetFeature = featureForSettingPath(path);
    hub.setFeature(targetFeature);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Map vs device"
      description={
        info.connected
          ? `Changes in ${hub.map?.name ?? "the selected map"} compared with the last device read. Click any change to jump directly to that setting.`
          : "Connect a device for a current comparison."
      }
    >
      <MapDiff
        differences={settingsDiff(
          active,
          hub.settings,
          issues.map((issue) => issue.key),
        )}
        limit={100}
        onSelectPath={handleSelectPath}
      />
      {issues.length > 0 && (
        <p className="lg-inline-notice">
          Unreadable fields are excluded from this comparison.
        </p>
      )}
    </Dialog>
  );
}
export function MapTools() {
  const hub = useHub();
  const maps = useConfigStore((state) => state.maps);
  const drafts = useMapSession((state) => state.drafts);
  const [name, setName] = useState(hub.map?.name ?? "");
  const [compare, setCompare] = useState("");
  useEffect(() => setName(hub.map?.name ?? ""), [hub.map?.id, hub.map?.name]);
  const other = drafts[compare] ?? maps.find((map) => map.id === compare);
  if (!hub.map)
    return (
      <p className="lg-empty">
        Create a map from the left rail to start editing.
      </p>
    );
  return (
    <div>
      <MapQuickTools />
      <Row label="Map name">
        <label className="hub-field">
          <span className="hub-sr-only">Map name</span>
          <input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            onBlur={() => {
              if (name.trim()) editMetadata({ name: name.trim() });
              else setName(hub.map?.name ?? "");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setName(hub.map?.name ?? "");
            }}
          />
        </label>
      </Row>
      <Row label="Map marker" help="Metadata stored with this map.">
        <ColorPicker
          label="Map color"
          hideLabel
          value={hub.map.color}
          onValueChange={(color) => editMetadata({ color })}
        />
      </Row>
      <Row label="Icon">
        <Select
          label="Map icon"
          hideLabel
          value={hub.map.icon}
          options={[
            ...new Set([
              hub.map.icon,
              "Bookmark",
              "Zap",
              "Crosshair",
              "BatteryCharging",
              "Shield",
            ]),
          ].map((value) => ({
            value,
            label:
              (
                {
                  Bookmark: "Bookmark",
                  Zap: "Lightning",
                  Crosshair: "Target",
                  BatteryCharging: "Battery",
                  Shield: "Shield",
                } as Record<string, string>
              )[value] ?? value,
          }))}
          onValueChange={(icon) => editMetadata({ icon })}
        />
      </Row>
      <Row label="Note">
        <label className="hub-field">
          <span className="hub-sr-only">Map note</span>
          <textarea
            rows={3}
            value={hub.map.note}
            onChange={(event) =>
              editMetadata({ note: event.currentTarget.value })
            }
          />
        </label>
      </Row>
      <Row label="Compare maps">
        <Select
          label="Compare with"
          hideLabel
          value={compare}
          options={[
            { value: "", label: "Choose a map" },
            ...maps
              .filter((map) => map.id !== hub.map?.id)
              .map((map) => ({ value: map.id, label: map.name })),
          ]}
          onValueChange={setCompare}
        />
      </Row>
      {other && (
        <MapDiff
          differences={settingsDiff(other.settings, hub.settings)}
          limit={100}
        />
      )}
      <section className="lg-map-library">
        <h2>Map library</h2>
        <p className="lg-muted">
          Rename, reorder, duplicate, or delete a map from its action menu.
        </p>
        <MapList />
      </section>
      <div className="lg-toolbar">
        <Button onClick={() => hub.setNewMapOpen(true)}>New map</Button>
        <Button onClick={hub.openImport}>Import</Button>
        <Button onClick={hub.exportMaps}>Export</Button>
      </div>
    </div>
  );
}
export function DeviceTools() {
  const hub = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const busy = useDeviceSession((state) => state.busy);
  const [reset, setReset] = useState(false);
  return (
    <div>
      <Row
        label="Connection"
        help={
          info.connected
            ? info.isMock
              ? "Simulated ZERO EX"
              : info.name
            : "USB or 8K Dongle-H"
        }
      >
        <Button
          disabled={busy || (!info.connected && !("hid" in navigator))}
          onClick={() =>
            info.connected ? void hub.disconnect() : void hub.connect()
          }
        >
          {info.connected ? "Disconnect" : "Connect device"}
        </Button>
      </Row>
      <Row
        label="Onboard profile"
        help="Switches the connected device's profile directly."
      >
        <Segmented
          label="Onboard profile"
          hideLabel
          value={info.onboardSlot}
          options={[0, 1, 2].map((value) => ({
            value,
            label: String(value + 1),
          }))}
          disabled={!info.connected || busy || hub.generic}
          onValueChange={(value) =>
            void hub.run(() => selectProfile(value), "Profile selected")
          }
        />
      </Row>
      <Row
        label="Read from device"
        help="Refreshes the device snapshot without changing your map."
      >
        <Button
          disabled={!info.connected || busy}
          onClick={() => void hub.readDevice()}
        >
          Read settings
        </Button>
      </Row>
      <dl className="lg-device-facts">
        <div>
          <dt>RF link</dt>
          <dd>
            {info.connectionMode === "wireless_dongle"
              ? info.rfOnline
                ? "Online"
                : "Offline"
              : "Not applicable"}
          </dd>
        </div>
        <div>
          <dt>CID / MID</dt>
          <dd>{info.connected ? `${info.cid} / ${info.mid}` : "—"}</dd>
        </div>
        <div>
          <dt>Voltage</dt>
          <dd>{info.connected ? `${info.voltageMv} mV` : "—"}</dd>
        </div>
      </dl>
      <Row
        label="Factory reset"
        help="Resets the device. Saved maps stay on this computer."
      >
        <Button
          variant="danger"
          disabled={!info.connected || busy || hub.generic}
          onClick={() => setReset(true)}
        >
          Restore defaults
        </Button>
      </Row>
      <Dialog
        open={reset}
        onClose={() => setReset(false)}
        title="Restore factory settings?"
        description="The connected mouse will reset to its defaults. Your saved maps remain available."
        destructive
        confirmLabel="Restore factory settings"
        onConfirm={restoreFactory}
      />
    </div>
  );
}
export function SystemTools() {
  const safe = useDeviceSession((state) => state.safeMode);
  const busy = useDeviceSession((state) => state.busy);
  const [unsafe, setUnsafe] = useState(false);
  return (
    <div>
      <Row
        label="Safe mode"
        help="Limits the diagnostic console to known commands."
      >
        <Toggle
          label="Safe mode"
          hideLabel
          checked={safe}
          disabled={busy}
          onCheckedChange={(enabled) =>
            enabled
              ? useDeviceSession.setState({ safeMode: true })
              : setUnsafe(true)
          }
        />
      </Row>
      <Row
        label="Mouse finish"
        help="Matches the mouse illustration and theme accent to your shell."
      >
        <FinishPicker compact />
      </Row>
      <details className="advanced-settings glass-clear glass-inset">
        <summary className="advanced-settings-summary">
          <span>HID console</span>
          <span className="lg-muted">Packets and EEPROM</span>
        </summary>
        <div className="advanced-settings-content">
          <HidConsole />
        </div>
      </details>
      <Dialog
        open={unsafe}
        onClose={() => setUnsafe(false)}
        title="Turn off safe mode?"
        description="The console will allow unlisted opcodes. Pairing, firmware, and unverified hardware writes remain blocked."
        destructive
        confirmLabel="Turn off safe mode"
        onConfirm={() => useDeviceSession.setState({ safeMode: false })}
      />
    </div>
  );
}
