import { settingLabel } from "../shared/settingLabels";
import { useState } from "react";
import type { DeviceSettings } from "../../types/schema";
import type { FeatureId } from "../../app/navigation";
import { Button } from "../../ui";

export function featureForSettingPath(path: string): FeatureId {
  if (path.startsWith("buttons")) return "buttons";
  if (path.startsWith("dpi") || path.startsWith("activeDpi"))
    return "sensitivity";
  if (
    path.startsWith("keyDebounce") ||
    path.startsWith("fastTrigger") ||
    path.startsWith("rollingDelay")
  )
    return "clicks";
  if (path.startsWith("sleepTime") || path.startsWith("sensorSleepTime"))
    return "power";
  if (path.startsWith("dongleRgbMode") || path.startsWith("receiverLight"))
    return "lighting";
  return "performance"; // lod, pollingRate, motionSync, angleSnapping, rippleControl, sensorAngle, etc.
}

export interface SettingDifference {
  path: string;
  label: string;
  before: string;
  after: string;
}

function flatten(settings: DeviceSettings) {
  const result: Record<string, unknown> = {};
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      if (path === "dpiStages") result["dpiStages.length"] = value.length;
      const order = ["left", "right", "middle", "side1", "side2"];
      if (path === "buttons")
        value.forEach((item) => {
          const index = order.indexOf(item.id);
          if (index >= 0) visit(item, `${path}.${index}`);
        });
      else value.forEach((item, index) => visit(item, `${path}.${index}`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => {
        if (
          [
            "schemaVersion",
            "color",
            "enabled",
            "stage",
            "id",
            "label",
          ].includes(key)
        )
          return;
        visit(item, path ? `${path}.${key}` : key);
      });
    } else result[path] = value;
  };
  visit(settings, "");
  return result;
}

function display(path: string, value: unknown) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value === undefined || value === "") return "—";
  if (path === "activeDpiStage") return String(Number(value) + 1);
  if (path === "pollingRate") return `${value} Hz`;
  if (path === "lod") return `${value} mm`;
  if (
    [
      "keyDebounce",
      "rollingDelay",
      "fastTrigger.leftDelay",
      "fastTrigger.rightDelay",
    ].includes(path)
  )
    return `${value} ms`;
  if (["sleepTime", "sensorSleepTime"].includes(path)) return `${value} s`;
  return String(value);
}
export function settingsDiff(
  before: DeviceSettings,
  after: DeviceSettings,
  unavailableKeys: readonly string[] = [],
): SettingDifference[] {
  const a = flatten(before);
  const b = flatten(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(
      (path) =>
        a[path] !== b[path] &&
        !unavailableKeys.some(
          (key) => path === key || path.startsWith(`${key}.`),
        ),
    )
    .map((path) => ({
      path,
      label: settingLabel(path),
      before: display(path, a[path]),
      after: display(path, b[path]),
    }));
}

export function MapDiff({
  differences,
  limit = 6,
  onSelectPath,
}: {
  differences: SettingDifference[];
  limit?: number;
  onSelectPath?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!differences.length) return <p className="hub-muted">In sync</p>;
  const visible = expanded ? differences : differences.slice(0, limit);
  const List = onSelectPath ? "div" : "dl";
  const Label = onSelectPath ? "span" : "dt";
  const Value = onSelectPath ? "span" : "dd";
  return (
    <div className="map-diff">
      <List className="map-diff-list">
        {visible.map((difference) => {
          const content = (
            <>
              <Label className="map-diff-label">
                {difference.label}
                {onSelectPath && (
                  <span className="map-diff-goto-hint">Jump to tab →</span>
                )}
              </Label>
              <Value className="map-diff-value">
                <span>{difference.before}</span>
                <span aria-label="changes to">→</span>
                <strong>{difference.after}</strong>
              </Value>
            </>
          );
          return onSelectPath ? (
            <button
              key={difference.path}
              type="button"
              className="map-diff-row map-diff-row-interactive"
              onClick={() => onSelectPath(difference.path)}
              title={`Go to ${difference.label} setting`}
            >
              {content}
            </button>
          ) : (
            <div key={difference.path} className="map-diff-row">
              {content}
            </div>
          );
        })}
      </List>
      {differences.length > limit && (
        <Button
          size="small"
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Show less"
            : `Show all ${differences.length} differences`}
        </Button>
      )}
    </div>
  );
}
