import { useEffect, useState, type CSSProperties } from "react";
import { useHub } from "../../../app/HubProvider";
import { useConfigStore } from "../../../store/configStore";
import { findDeviceSpec } from "../../../features/device/deviceCatalog";
import {
  editSetting,
  editSettings,
  useMapSession,
} from "../../../features/maps/mapSession";
import { AdvancedSettings } from "../../../features/shared/AdvancedSettings";
import { Button, Segmented, Toggle } from "../../index";
import { SensitivityCalculator } from "../SensitivityCalculator";
import {
  CommitColorPicker,
  CommitSlider,
  NumericField,
  Row,
} from "../controls";

function normalizeDpi(value: number, min = 50, max = 36000) {
  const step = value > 10000 ? 50 : 10;
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}
export function DpiTab() {
  const { map, settings } = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const spec = findDeviceSpec(info.cid, info.mid);
  const minDpi = spec?.minDpi ?? 50;
  const maxDpi = spec?.maxDpi ?? 36000;

  const index = Math.min(
    settings.activeDpiStage,
    Math.max(0, settings.dpiStages.length - 1),
  );
  const stage = settings.dpiStages[index];
  const splitChoice = useMapSession((state) =>
    map ? state.splitAxes[map.id] : undefined,
  );
  const split =
    splitChoice ?? settings.dpiStages.some((item) => item.xDpi !== item.yDpi);
  const [preview, setPreview] = useState(stage?.xDpi ?? 800);
  useEffect(
    () => setPreview(stage?.xDpi ?? 800),
    [stage?.xDpi, index, map?.id],
  );
  if (!stage)
    return (
      <div className="lg-empty">
        <h2>No DPI stages</h2>
        <p>Add a stage to set the mouse sensitivity.</p>
        <Button
          variant="primary"
          onClick={() =>
            editSettings(
              {
                dpiStages: [
                  {
                    stage: 0,
                    xDpi: 800,
                    yDpi: 800,
                    color: "#FF6A1A",
                    enabled: true,
                  },
                ],
                activeDpiStage: 0,
              },
              "dpiStages",
            )
          }
        >
          Add DPI stage
        </Button>
      </div>
    );
  function update(axis: "xDpi" | "yDpi", value: number) {
    const dpi = normalizeDpi(value, minDpi, maxDpi);
    editSetting(
      "dpiStages",
      settings.dpiStages.map((item, position) =>
        position === index
          ? {
              ...item,
              [axis]: dpi,
              ...(!split ? { xDpi: dpi, yDpi: dpi } : {}),
            }
          : item,
      ),
    );
    if (axis === "xDpi") setPreview(dpi);
  }
  function setCount(count: number) {
    const stages = settings.dpiStages.slice(0, count);
    while (stages.length < count)
      stages.push({ ...stage, stage: stages.length, enabled: true });
    editSettings(
      { dpiStages: stages, activeDpiStage: Math.min(index, count - 1) },
      "dpiStages",
    );
  }
  return (
    <div
      className="lg-dpi"
      style={{ "--stage-active-color": stage.color } as CSSProperties}
    >
      <div className="lg-dpi-readout">
        <span className="lg-reading-label">
          Stage {index + 1}
          {split ? " · X axis" : " · Linked X / Y"}
        </span>
        <div>
          <output className="lg-hero-number">
            {normalizeDpi(preview, minDpi, maxDpi).toLocaleString("en-US")}
          </output>
          <span className="lg-unit">DPI</span>
        </div>
        <p>Pointer distance per inch of mouse movement.</p>
      </div>
      <div className="lg-dpi-slider" key={map?.id + ":" + index}>
        <CommitSlider
          label={`Stage ${index + 1} DPI`}
          hideLabel
          hideValue
          value={stage.xDpi}
          min={minDpi}
          max={maxDpi}
          step={10}
          onPreview={setPreview}
          onCommit={(value) => update("xDpi", value)}
        />
        <div className="lg-scale">
          <span>{minDpi.toLocaleString("en-US")}</span>
          <span>{maxDpi.toLocaleString("en-US")}</span>
        </div>
        <div className="lg-exact-value">
          <span>Exact {split ? "X" : "DPI"} value</span>
          <div className="dpi-number-input">
            <NumericField
              label={`Stage ${index + 1} X DPI value`}
              value={stage.xDpi}
              min={minDpi}
              max={maxDpi}
              step={stage.xDpi > 10000 ? 50 : 10}
              onCommit={(value) => update("xDpi", value)}
            />
          </div>
        </div>
        {split && (
          <Row label="Y axis" help="Vertical sensitivity.">
            <CommitSlider
              label="Y DPI"
              value={stage.yDpi}
              min={minDpi}
              max={maxDpi}
              step={10}
              suffix=" DPI"
              onCommit={(value) => update("yDpi", value)}
            />
            <NumericField
              label="Exact Y DPI"
              value={stage.yDpi}
              min={minDpi}
              max={maxDpi}
              step={stage.yDpi > 10000 ? 50 : 10}
              onCommit={(value) => update("yDpi", value)}
            />
          </Row>
        )}
      </div>
      <div className="lg-stage-strip" role="group" aria-label="DPI stages">
        {settings.dpiStages.map((item, position) => (
          <button
            type="button"
            key={position}
            style={{ "--stage-color": item.color } as CSSProperties}
            aria-pressed={position === index}
            onClick={() => editSetting("activeDpiStage", position)}
          >
            <span>Stage {position + 1}</span>
            <strong>{item.xDpi.toLocaleString("en-US")}</strong>
          </button>
        ))}
      </div>
      <AdvancedSettings
        title="Stage options"
        description="Stage count, axis linking, color, and DPI button."
      >
        <Row label="Stage count">
          <Segmented
            label="DPI stage count"
            hideLabel
            value={settings.dpiStages.length}
            options={Array.from({ length: 8 }, (_, i) => ({
              value: i + 1,
              label: String(i + 1),
            }))}
            onValueChange={setCount}
          />
        </Row>
        <Row
          label="Link X and Y"
          help="Use the same horizontal and vertical sensitivity."
        >
          <Toggle
            label="Link X and Y DPI"
            hideLabel
            checked={!split}
            onCheckedChange={(linked) => {
              if (map)
                useMapSession.setState((state) => ({
                  splitAxes: { ...state.splitAxes, [map.id]: !linked },
                }));
              if (linked)
                editSetting(
                  "dpiStages",
                  settings.dpiStages.map((item) => ({
                    ...item,
                    yDpi: item.xDpi,
                  })),
                );
            }}
          />
        </Row>
        <Row
          label="DPI button"
          help="Allow an assigned DPI action to switch stages."
        >
          <Toggle
            label="DPI switching"
            hideLabel
            checked={settings.dpiButtonEnabled}
            onCheckedChange={(value) => editSetting("dpiButtonEnabled", value)}
          />
        </Row>
        <Row
          label={`Stage ${index + 1} color`}
          help={
            spec?.family === "zero" || spec?.noDpiRGB
              ? `Saved with the map. ${info.name || "This model"} has no DPI LED; this color is not sent to the mouse.`
              : "Saved with the map and programmed into the mouse DPI LED."
          }
        >
          <CommitColorPicker
            label="Stage RGB"
            hideLabel
            value={stage.color}
            onValueChange={(color) =>
              editSetting(
                "dpiStages",
                settings.dpiStages.map((item, position) =>
                  position === index ? { ...item, color } : item,
                ),
              )
            }
          />
        </Row>
      </AdvancedSettings>
      <SensitivityCalculator dpiX={stage.xDpi} dpiY={stage.yDpi} />
    </div>
  );
}
