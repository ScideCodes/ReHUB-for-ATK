import { useState, useEffect } from "react";
import { useHub } from "../../../app/HubProvider";
import { useConfigStore } from "../../../store/configStore";
import { findDeviceSpec } from "../../../features/device/deviceCatalog";
import { isDeviceFeatureSupported } from "../../../features/device/deviceFeatures";
import { DEVICES } from "../../../protocol/constants";
import type { PollingRate } from "../../../types/schema";
import { editSetting } from "../../../features/maps/mapSession";
import { AdvancedSettings } from "../../../features/shared/AdvancedSettings";
import { LodDiagram } from "../../../features/performance/LodDiagram";
import { SensorRotationDiagram } from "../../../features/performance/SensorRotationDiagram";
import { Segmented, Toggle } from "../../index";
import { CommitSlider, Row } from "../controls";

export function PerformanceTab() {
  const { settings, generic } = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const selectedDevice = useConfigStore((state) => state.selectedDevice);
  const spec = findDeviceSpec(info.cid, info.mid);
  const activeDevice =
    selectedDevice || (DEVICES.find((d) => d.name === info.name) ?? null);

  const maxPolling = spec?.maxPollingRate ?? 8000;
  const pollingRates = (
    [125, 250, 500, 1000, 2000, 4000, 8000] as PollingRate[]
  ).filter((rate) => rate <= maxPolling);

  const isContinuousLod =
    !spec ||
    spec.sensor.includes("3950") ||
    spec.sensor.includes("3955") ||
    spec.family === "zero";
  const lodMin = isContinuousLod ? 0.7 : 1.0;
  const lodStep = isContinuousLod ? 0.1 : 1.0;
  const lodPresets = isContinuousLod ? [0.7, 1.0, 1.5, 2.0] : [1.0, 2.0];

  const hasLongDistance = spec ? spec.hasLongDistance : true;
  const hasSensorAngle = spec ? spec.hasSensorAngle : true;

  const showLod = isDeviceFeatureSupported("lod", activeDevice);
  const showSensorAngle =
    isDeviceFeatureSupported("sensorAngle", activeDevice) && hasSensorAngle;
  const showLongDistance =
    isDeviceFeatureSupported("longDistance", activeDevice) && hasLongDistance;
  const showSensorPower = isDeviceFeatureSupported("sensorPower", activeDevice);
  const showRippleControl = isDeviceFeatureSupported(
    "rippleControl",
    activeDevice,
  );
  const showMotionSync = isDeviceFeatureSupported("motionSync", activeDevice);
  const showAngleSnapping = isDeviceFeatureSupported(
    "angleSnapping",
    activeDevice,
  );
  const hasRapidTrigger = activeDevice?.features?.some((f) =>
    f.toLowerCase().includes("rapid trigger"),
  );

  const [previewLod, setPreviewLod] = useState<number>(settings.lod);
  const [previewAngle, setPreviewAngle] = useState<number>(
    settings.sensorAngle,
  );

  useEffect(() => {
    setPreviewLod(settings.lod);
  }, [settings.lod]);

  useEffect(() => {
    setPreviewAngle(settings.sensorAngle);
  }, [settings.sensorAngle]);

  const highDisabled =
    info.connected &&
    !["wired", "wireless_dongle"].includes(info.connectionMode);
  return (
    <div className="lg-performance">
      <section className="lg-polling glass-clear glass-inset">
        <div className="lg-section-title">
          <h2>Polling rate</h2>
          <span className="lg-numeric">
            {settings.pollingRate.toLocaleString("en-US")} Hz
          </span>
        </div>
        <p className="lg-tab-help">
          Reports per second. Higher rates use more power and CPU time.
        </p>
        <Segmented<PollingRate>
          label="Polling rate"
          hideLabel
          value={settings.pollingRate}
          onValueChange={(value) => editSetting("pollingRate", value)}
          options={pollingRates.map((value) => ({
            value,
            label: String(value),
            disabled: value > 1000 && highDisabled,
            disabledReason:
              value > 1000 && highDisabled
                ? "Requires USB or 8K receiver"
                : undefined,
          }))}
        />
        <div className="lg-polling-interval">
          <span>Report interval</span>
          <strong>
            {(1000 / settings.pollingRate).toLocaleString("en-US", {
              maximumFractionDigits: 3,
            })}{" "}
            ms
          </strong>
        </div>
      </section>

      {hasRapidTrigger && (
        <section
          className="lg-keyboard-performance glass-clear glass-inset p-4 rounded-xl border border-[#2D333B]"
          data-testid="keyboard-rapid-trigger"
        >
          <div className="lg-section-title">
            <h2>Rapid Trigger & Actuation</h2>
            <span className="lg-numeric">0.1 - 3.3 mm</span>
          </div>
          <p className="lg-tab-help text-xs text-[#8C929A] mt-1">
            Dynamic magnetic switch travel and instant key reset.
          </p>
        </section>
      )}

      {showLod && (
        <section
          className="lg-lod glass-clear glass-inset"
          data-testid="lod-section"
        >
          <div className="lg-lod-layout">
            <div className="lg-lod-controls">
              <div className="lg-section-title">
                <h2>Lift-off distance</h2>
                <span className="lg-numeric">{previewLod.toFixed(1)} mm</span>
              </div>
              <p className="lg-tab-help">
                Cutoff height at which the optical sensor ceases tracking when
                lifted from the surface.
              </p>
              <div className="lg-lod-slider-wrap">
                <CommitSlider
                  label="Lift-off distance"
                  hideLabel
                  min={lodMin}
                  max={2.0}
                  step={lodStep}
                  suffix=" mm"
                  formatValue={(value) => `${value.toFixed(1)} mm`}
                  value={previewLod}
                  onPreview={(value) => setPreviewLod(Number(value.toFixed(1)))}
                  onCommit={(value) => {
                    const rounded = Number(value.toFixed(1));
                    setPreviewLod(rounded);
                    editSetting("lod", rounded);
                  }}
                />
              </div>
              <div className="lg-lod-presets">
                <span className="lg-lod-preset-label">Presets</span>
                <div className="lg-lod-preset-list">
                  {lodPresets.map((val) => {
                    const label =
                      val === 0.7
                        ? "0.7 mm (Low)"
                        : val === 1.0
                          ? "1.0 mm (Default)"
                          : val === 1.5
                            ? "1.5 mm"
                            : "2.0 mm (High)";
                    return (
                      <button
                        key={val}
                        type="button"
                        className={`lg-lod-preset-pill ${previewLod === val ? "is-active" : ""}`}
                        onClick={() => {
                          setPreviewLod(val);
                          editSetting("lod", val);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="lg-lod-diagram-wrap">
              <LodDiagram height={previewLod} />
            </div>
          </div>
        </section>
      )}

      {showMotionSync && (
        <Row
          label="Motion sync"
          help="Align sensor samples with USB report timing."
        >
          <Toggle
            label="Motion sync"
            hideLabel
            checked={settings.motionSync}
            onCheckedChange={(value) => editSetting("motionSync", value)}
          />
        </Row>
      )}

      {showAngleSnapping && (
        <Row
          label="Angle snapping"
          help="Straighten small deviations in your hand movement."
        >
          <Toggle
            label="Angle snapping"
            hideLabel
            checked={settings.angleSnapping}
            onCheckedChange={(value) => editSetting("angleSnapping", value)}
          />
        </Row>
      )}

      {showRippleControl && (
        <Row
          label="Ripple control"
          help="Smooth small sensor jitters at high DPI."
        >
          <Toggle
            label="Ripple control"
            hideLabel
            checked={settings.rippleControl}
            onCheckedChange={(value) => editSetting("rippleControl", value)}
          />
        </Row>
      )}
      {!generic && (showLongDistance || showSensorPower || showSensorAngle) && (
        <AdvancedSettings
          title="Sensor options"
          description="Power mode, wireless range, and alignment."
        >
          {showLongDistance && (
            <Row
              label="RF boost"
              help={
                hasLongDistance
                  ? "Enable far-distance wireless mode."
                  : "Not supported on this mouse model or wired connection."
              }
            >
              <Toggle
                label="RF boost"
                hideLabel
                disabled={!hasLongDistance}
                checked={hasLongDistance && settings.longDistanceMode}
                onCheckedChange={(value) =>
                  editSetting("longDistanceMode", value)
                }
              />
            </Row>
          )}
          {showSensorPower && (
            <Row
              label="Sensor power"
              help="Saved and simulated in mock mode. Hardware values need packet verification."
            >
              <Segmented
                label="Sensor power"
                hideLabel
                value={settings.sensorPowerMode}
                options={[
                  { value: "HP", label: "High performance" },
                  { value: "LP", label: "Low power" },
                ]}
                onValueChange={(value) => editSetting("sensorPowerMode", value)}
              />
            </Row>
          )}
          {showSensorAngle && (
            <div className="lg-sensor-rot-card">
              <div className="lg-sensor-rot-header">
                <div>
                  <div className="lg-sensor-rot-title-row">
                    <h3>Sensor rotation</h3>
                    {hasSensorAngle && (
                      <span className="lg-numeric lg-rot-numeric">
                        {previewAngle > 0 ? `+${previewAngle}` : previewAngle}°
                      </span>
                    )}
                  </div>
                  <p className="lg-sensor-rot-desc">
                    {hasSensorAngle ? (
                      <>
                        Compensate for natural grip angle tilt{" "}
                        <span className="hub-nowrap">(&minus;30° to +30°)</span>
                        .
                      </>
                    ) : (
                      `Sensor angle rotation is not supported on this model's optical sensor (${spec?.sensor ?? "entry sensor"}).`
                    )}
                  </p>
                </div>
                <Toggle
                  label="Enable sensor rotation"
                  hideLabel
                  disabled={!hasSensorAngle}
                  checked={hasSensorAngle && settings.sensorAngleEnabled}
                  onCheckedChange={(value) =>
                    editSetting("sensorAngleEnabled", value)
                  }
                />
              </div>

              {hasSensorAngle && (
                <div
                  className={`lg-sensor-rot-body ${
                    !settings.sensorAngleEnabled ? "is-disabled" : ""
                  }`}
                >
                  <div className="lg-sensor-rot-controls">
                    <CommitSlider
                      label="Rotation angle"
                      min={-30}
                      max={30}
                      value={settings.sensorAngle}
                      disabled={!settings.sensorAngleEnabled}
                      suffix="°"
                      onPreview={(val) => setPreviewAngle(val)}
                      onCommit={(value) => {
                        setPreviewAngle(value);
                        editSetting("sensorAngle", value);
                      }}
                    />

                    <div className="lg-sensor-rot-steppers">
                      <button
                        type="button"
                        className="lg-rot-step-btn"
                        disabled={
                          !settings.sensorAngleEnabled ||
                          settings.sensorAngle <= -30
                        }
                        onClick={() => {
                          const next = Math.max(-30, settings.sensorAngle - 1);
                          setPreviewAngle(next);
                          editSetting("sensorAngle", next);
                        }}
                      >
                        &minus;1°
                      </button>
                      <button
                        type="button"
                        className="lg-rot-step-btn lg-rot-reset-btn"
                        disabled={
                          !settings.sensorAngleEnabled ||
                          settings.sensorAngle === 0
                        }
                        onClick={() => {
                          setPreviewAngle(0);
                          editSetting("sensorAngle", 0);
                        }}
                      >
                        Reset (0°)
                      </button>
                      <button
                        type="button"
                        className="lg-rot-step-btn"
                        disabled={
                          !settings.sensorAngleEnabled ||
                          settings.sensorAngle >= 30
                        }
                        onClick={() => {
                          const next = Math.min(30, settings.sensorAngle + 1);
                          setPreviewAngle(next);
                          editSetting("sensorAngle", next);
                        }}
                      >
                        +1°
                      </button>
                    </div>
                  </div>

                  <div className="lg-sensor-rot-diagram-col">
                    <SensorRotationDiagram
                      angle={previewAngle}
                      enabled={settings.sensorAngleEnabled}
                      onChange={(value) => {
                        setPreviewAngle(value);
                        editSetting("sensorAngle", value);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </AdvancedSettings>
      )}
    </div>
  );
}
