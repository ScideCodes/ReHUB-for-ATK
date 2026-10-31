import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { useDeviceSession } from "../../features/device/deviceSession";
import { useConfigStore } from "../../store/configStore";
import { Button } from "../Button";
import { SettingsSnapshot } from "./SettingsSnapshot";

const hex = (value: number) =>
  `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;

export function DeviceQuickTools() {
  const hub = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const settings = useConfigStore((state) => state.activeSettings);
  const busy = useDeviceSession((state) => state.busy);
  const readIssues = useDeviceSession((state) => state.readIssues);
  const [copying, setCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState({ identity: "", text: "" });
  const identity = `${info.connected}:${info.isMock}:${info.vendorId}:${info.productId}:${info.serial}`;

  async function copyDetails() {
    if (!info.connected || busy || copying) return;
    setCopying(true);
    setCopyStatus({ identity, text: "" });
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access unavailable");
      }
      const connection = info.isMock
        ? "Mock device"
        : info.connectionMode === "wireless_dongle"
          ? "2.4G receiver"
          : "Wired";
      const text = [
        `Device: ${info.name || "HID device"}`,
        `Connection: ${connection}`,
        `VID / PID: ${hex(info.vendorId)} / ${hex(info.productId)}`,
        `CID / MID: ${info.cid} / ${info.mid}`,
        `Mouse firmware: ${info.firmwareMouse || "Unavailable"}`,
        `Receiver firmware: ${info.firmwareDongle || "Unavailable"}`,
        `Serial: ${info.serial || "Unavailable"}`,
        hub.generic
          ? "Battery: unavailable (protocol unverified)"
          : `Battery: ${info.batteryLevel}%${info.isCharging ? " (charging)" : ""}`,
      ].join("\n");
      await navigator.clipboard.writeText(text);
      setCopyStatus({ identity, text: "Device details copied" });
    } catch {
      setCopyStatus({
        identity,
        text: "Could not copy. Check browser clipboard permission.",
      });
    } finally {
      setCopying(false);
    }
  }

  return (
    <section className="lg-device-quick-tools" aria-label="Mouse settings">
      <div className="lg-side-heading">
        <h3>On mouse</h3>
        <p>
          {!info.connected
            ? "Connect a device to read its settings."
            : hub.generic
              ? "Read-only device. Settings are unverified for this model."
              : "Last acknowledged settings"}
        </p>
      </div>
      {info.connected && (
        <>
          {!hub.generic && (
            <SettingsSnapshot
              settings={settings}
              unavailable={readIssues.map((issue) => issue.key)}
            />
          )}
          <div className="lg-side-actions">
            <Button
              size="small"
              icon={<RefreshCw size={14} aria-hidden="true" />}
              disabled={busy}
              title="Read the mouse settings without changing your map"
              onClick={() => void hub.readDevice()}
            >
              Refresh
            </Button>
            <Button
              size="small"
              icon={<Copy size={14} aria-hidden="true" />}
              disabled={busy || copying}
              title="Copy device identifiers, firmware, serial, and battery"
              onClick={() => void copyDetails()}
            >
              Copy details
            </Button>
          </div>
          <p className="lg-side-hint" role="status" aria-live="polite">
            {copyStatus.identity === identity ? copyStatus.text : ""}
          </p>
        </>
      )}
    </section>
  );
}
