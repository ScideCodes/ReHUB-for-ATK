import { BatteryCharging } from "lucide-react";
import { useHub } from "../../../app/HubProvider";
import { useConfigStore } from "../../../store/configStore";
import { useDeviceSession } from "../../../features/device/deviceSession";
import { editSetting } from "../../../features/maps/mapSession";
import { Select, Toggle } from "../../index";
import { CommitSlider, Row } from "../controls";

const times = [10, 30, 60, 120, 300, 600, 900];
export function PowerTab() {
  const { settings } = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const issues = useDeviceSession((state) => state.readIssues);
  return (
    <div className="lg-power">
      <section className="lg-power-meter glass-clear glass-inset">
        <div className="lg-battery-drawing" aria-hidden="true">
          <span
            style={{
              transform: `scaleX(${info.connected ? Math.max(0, Math.min(100, info.batteryLevel)) / 100 : 0})`,
            }}
          />
        </div>
        <div>
          <span className="lg-reading-label">
            {info.isCharging && info.connected ? (
              <>
                <BatteryCharging size={16} />
                Charging
              </>
            ) : (
              "Battery"
            )}
          </span>
          <strong>
            {info.connected ? info.batteryLevel : "—"}
            <small>{info.connected ? "%" : ""}</small>
          </strong>
          <p>
            {info.connected
              ? `${info.voltageMv} mV`
              : "Connect a device to read battery status."}
          </p>
        </div>
      </section>
      <Row
        label="Deep sleep"
        help="Put the mouse to sleep after this period of inactivity."
      >
        <Select
          label="Deep sleep timer"
          hideLabel
          value={settings.sleepTime}
          options={[...new Set([...times, settings.sleepTime])]
            .sort((a, b) => a - b)
            .map((value) => ({
              value,
              label:
                value < 60
                  ? `${value} seconds`
                  : value === 60
                    ? "1 minute"
                    : `${value / 60} minutes`,
            }))}
          onValueChange={(value) => editSetting("sleepTime", value)}
        />
      </Row>
      <Row
        label="Sensor standby"
        help="Rest the sensor while the mouse is idle."
      >
        <Toggle
          label="Sensor standby"
          hideLabel
          checked={settings.sensorSleepEnabled}
          onCheckedChange={(value) => editSetting("sensorSleepEnabled", value)}
        />
      </Row>
      <Row label="Standby timer" help="Delay before the sensor enters standby.">
        <CommitSlider
          label="Standby timer"
          hideLabel
          value={settings.sensorSleepTime}
          min={10}
          max={300}
          step={10}
          suffix=" s"
          disabled={!settings.sensorSleepEnabled}
          disabledReason="Enable sensor standby to adjust its timer."
          onCommit={(value) => editSetting("sensorSleepTime", value)}
        />
        <div className="lg-scale">
          <span>10 s</span>
          <span>300 s</span>
        </div>
      </Row>
      {issues
        .filter((issue) =>
          ["sensorSleepTime", "sensorSleepEnabled"].includes(issue.key),
        )
        .map((issue) => (
          <p className="lg-inline-notice" key={issue.path}>
            {issue.label}: {issue.message}
          </p>
        ))}
      <p className="lg-footnote">
        Higher polling rates and shorter sleep delays affect battery use.
        Runtime estimates are not available.
      </p>
    </div>
  );
}
