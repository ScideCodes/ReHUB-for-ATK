import { DiagnosticsButton } from "../Diagnostics";
import { hidClient } from "../../hid/hidClient";
import { useEffect, useRef, useState } from "react";
import { Info, Undo2, Redo2, Usb, Wifi } from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { useConfigStore } from "../../store/configStore";
import { useDeviceSession } from "../../features/device/deviceSession";
import { ApplyMapBanner, MapComparison, SaveStatus } from "./LiveControls";
import { travelHistory, useMapSession } from "../../features/maps/mapSession";
import { MouseIllustration } from "../../features/device/MouseIllustration";
import { FinishPicker } from "../FinishPicker";
import { BatteryGauge, Button, Select, Toggle } from "../index";
import { ActiveMapChip } from "./SideWidgets";
import { DeviceQuickTools } from "./DeviceQuickTools";
import { SHOWCASE_DEVICES } from "../../features/device/deviceCatalog";
import { ConsoleTopBar } from "../console/ConsoleShell";
import { AppearanceButton } from "../console/Appearance";

/** Store-style top bar; device status and apply stay in the device tile. */
export function ConsoleHeader({ onDevices }: { onDevices?: () => void }) {
  const info = useConfigStore((state) => state.deviceInfo);
  return (
    <ConsoleTopBar
      device={info.name || "ATK ZERO EX"}
      onBack={onDevices}
      actions={
        <>
          <AppearanceButton />
          <DiagnosticsButton
          source={hidClient.diagnostics}
          identity={{
            vendorId: info.vendorId,
            productId: info.productId,
            usagePage: 0xff04,
            usage: 2,
            reportId: 8,
          }}
          mode={
            info.isMock ? "mock" : info.connected ? "hardware" : "disconnected"
          }
          />
        </>
      }
    >
      <ActiveMapChip />
    </ConsoleTopBar>
  );
}

export function DevicePanel({
  sheet = false,
  controlsOnly = false,
  onDetails,
  onDiff,
}: {
  sheet?: boolean;
  controlsOnly?: boolean;
  onDiff: () => void;
  onDetails: () => void;
}) {
  const hub = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const busy = useDeviceSession((state) => state.busy);
  const readIssues = useDeviceSession((state) => state.readIssues);
  const skipped = useDeviceSession((state) => state.skipped);
  const history = useMapSession((state) =>
    hub.map ? state.histories[hub.map.id] : undefined,
  );
  const [compactFacts, setCompactFacts] = useState(
    () => matchMedia("(max-height: 780px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-height: 780px)");
    const update = () => setCompactFacts(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <aside
      className={`lg-device-panel ${controlsOnly ? "studio-actions" : ""} ${sheet || controlsOnly ? "lg-device-in-sheet" : "glass-panel"}`}
      aria-label="Device and apply"
    >
      {!controlsOnly && (sheet || !hub.sheetOpen) && (
        <ApplyMapBanner onDiff={onDiff} />
      )}
      {!controlsOnly && (
        <div
          className="lg-device-scroll"
          tabIndex={0}
          aria-label="Mouse information"
        >
          <div className="lg-device-heading">
            <div className="lg-device-name">
              <h2>{info.name || "ATK ZERO EX"}</h2>
              <span
                className="lg-status-dot" role="img"
                data-connected={info.connected}
                aria-label={info.connected ? "Connected" : "Disconnected"}
              />
            </div>
            <div className="lg-device-header-actions">
              <div className="lg-history-group">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Undo map edit"
                  title="Undo · Ctrl+Z"
                  disabled={!history?.past.length}
                  onClick={() => travelHistory("undo")}
                >
                  <Undo2 size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Redo map edit"
                  title="Redo · Ctrl+Shift+Z"
                  disabled={!history?.future.length}
                  onClick={() => travelHistory("redo")}
                >
                  <Redo2 size={15} />
                </Button>
              </div>

              <Button
                className={sheet ? "device-details-link" : ""}
                data-feature="device"
                aria-current={hub.feature === "device" ? "page" : undefined}
                variant="ghost"
                size="icon"
                aria-label="Device details"
                title="Device details"
                onClick={onDetails}
              >
                <Info size={16} />
              </Button>
            </div>
          </div>
          <p className="lg-device-connection">
            {info.connected ? (
              info.isMock ? (
                "Simulated connection"
              ) : info.connectionMode === "wireless_dongle" ? (
                <>
                  <Wifi size={13} />
                  2.4G · Receiver
                </>
              ) : (
                <>
                  <Usb size={13} />
                  Wired
                </>
              )
            ) : (
              "Device disconnected"
            )}
          </p>
          <div className="lg-device-portrait">
            <MouseIllustration compact />
          </div>
          <div className="lg-device-finish-selector">
            <FinishPicker compact />
          </div>
          <div className="lg-device-mock-toggle">
            <Toggle
              label="Mock Device"
              checked={info.connected && info.isMock}
              disabled={busy}
              onCheckedChange={(enabled) =>
                enabled ? void hub.connect(true) : void hub.disconnect()
              }
            />
          </div>
          {info.connected && info.isMock && (
            <div className="lg-showcase-picker">
              <span className="lg-showcase-label">Model Showcase</span>
              <Select<string>
                label="Model Showcase"
                hideLabel
                value={`${info.cid}:${info.mid}`}
                options={(SHOWCASE_DEVICES.some(
                  (dev) => dev.cid === info.cid && dev.mid === info.mid,
                )
                  ? SHOWCASE_DEVICES
                  : [
                      {
                        cid: info.cid,
                        mid: info.mid,
                        name: info.name,
                        sensor: "Local simulation",
                      },
                      ...SHOWCASE_DEVICES,
                    ]
                ).map((dev) => ({
                  value: `${dev.cid}:${dev.mid}`,
                  label: dev.name,
                  description: `${dev.sensor}`,
                }))}
                onValueChange={(val) => {
                  const [c, m] = val.split(":").map(Number);
                  void hub.connect(true, c, m);
                }}
                className="lg-showcase-dropdown"
              />
            </div>
          )}
          {info.connected ? (
            <div className="lg-device-battery">
              <span>{info.isCharging ? "Charging" : "Battery"}</span>
              {hub.generic ? (
                <span>Unavailable</span>
              ) : (
                <BatteryGauge
                  connected
                  level={info.batteryLevel}
                  charging={info.isCharging}
                />
              )}
            </div>
          ) : (
            <div className="lg-connect-state">
              <Button
                variant="primary"
                loading={busy}
                disabled={busy || !("hid" in navigator)}
                icon={<Usb size={15} />}
                onClick={() => void hub.connect()}
              >
                Connect device
              </Button>
              <p>
                {"hid" in navigator
                  ? "Connect by USB or 8K receiver."
                  : "WebHID needs a Chromium browser."}
              </p>
            </div>
          )}
          <details className="lg-device-details" open={!compactFacts}>
            <summary>Details</summary>
            <dl className="lg-device-facts">
              <div>
                <dt>Mouse firmware</dt>
                <dd>{info.firmwareMouse || "—"}</dd>
              </div>
              <div>
                <dt>Receiver firmware</dt>
                <dd>{info.firmwareDongle || "—"}</dd>
              </div>
              <div>
                <dt>Serial</dt>
                <dd>{info.serial || "—"}</dd>
              </div>
            </dl>
          </details>
          {readIssues.length > 0 && (
            <details className="lg-read-warning">
              <summary>{readIssues.length} device read warnings</summary>
              {readIssues.map((issue) => (
                <p key={issue.path}>
                  {issue.label}: {issue.message}
                </p>
              ))}
              <Button
                size="small"
                disabled={busy}
                onClick={() => void hub.readDevice()}
              >
                Read again
              </Button>
            </details>
          )}
          {skipped.length > 0 && (
            <details className="lg-read-warning">
              <summary>Settings skipped on apply</summary>
              {skipped.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </details>
          )}
          <DeviceQuickTools
            key={`${info.connected}:${info.serial}:${info.isMock}`}
          />
        </div>
      )}
      <div className="lg-apply-section apply-bar">
        <MapComparison onDiff={onDiff} />
        <SaveStatus />
      </div>
    </aside>
  );
}

export function CompactDeviceBar({ onDiff }: { onDiff: () => void }) {
  const hub = useHub();
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bar.current) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--hub-bottom-bar-height",
        `${bar.current?.getBoundingClientRect().height ?? 0}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(bar.current);
    update();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--hub-bottom-bar-height");
    };
  }, []);
  const info = useConfigStore((state) => state.deviceInfo);
  const history = useMapSession((state) =>
    hub.map ? state.histories[hub.map.id] : undefined,
  );
  return (
    <div ref={bar} className="lg-compact-device glass-panel" role="contentinfo" aria-label="Device actions">
      <Button className="review-button" onClick={() => hub.setSheetOpen(true)}>
        <span className="lg-grabber" aria-hidden="true" />
        <span>{info.connected ? "Device information" : "Connect device"}</span>
      </Button>
      <div
        className="lg-compact-history" role="group"
        aria-label="Map history and comparison"
      >
        <Button
          size="icon"
          aria-label="Undo map edit"
          title="Undo"
          disabled={!history?.past.length}
          onClick={() => travelHistory("undo")}
        >
          <Undo2 size={17} />
        </Button>
        <Button
          size="icon"
          aria-label="Redo map edit"
          title="Redo"
          disabled={!history?.future.length}
          onClick={() => travelHistory("redo")}
        >
          <Redo2 size={17} />
        </Button>
      </div>
      <MapComparison onDiff={onDiff} />
      <SaveStatus />
    </div>
  );
}
