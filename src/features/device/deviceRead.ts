import { DeviceSettingsSchema, type DeviceSettings } from "../../types/schema";
import { settingLabel } from "../shared/settingLabels";

export interface DeviceReadIssue {
  key: keyof DeviceSettings;
  path: string;
  label: string;
  received: unknown;
  message: string;
}

export function validateDeviceSnapshot(
  candidate: DeviceSettings,
  previous: DeviceSettings,
  keys: readonly (keyof DeviceSettings)[],
) {
  const settings = structuredClone(previous);
  const issues: DeviceReadIssue[] = [];
  for (const key of keys) {
    const parsed = DeviceSettingsSchema.shape[key].safeParse(candidate[key]);
    if (parsed.success) {
      Object.assign(settings, { [key]: parsed.data });
      continue;
    }
    for (const issue of parsed.error.issues) {
      const path = [key, ...issue.path].join(".");
      let received: unknown = candidate[key];
      for (const part of issue.path)
        received =
          received && typeof received === "object"
            ? (received as Record<PropertyKey, unknown>)[part]
            : undefined;
      issues.push({
        key,
        path,
        label: settingLabel(path),
        received,
        message: issue.message,
      });
    }
  }
  if (!settings.dpiStages.length || settings.dpiStages.length > 8) {
    settings.dpiStages = structuredClone(previous.dpiStages);
    issues.push({
      key: "dpiStages",
      path: "dpiStages",
      label: "DPI stages",
      received: candidate.dpiStages.length,
      message: "The stage count must be between 1 and 8.",
    });
  }
  if (settings.activeDpiStage >= settings.dpiStages.length) {
    issues.push({
      key: "activeDpiStage",
      path: "activeDpiStage",
      label: "Active DPI stage",
      received: candidate.activeDpiStage,
      message: "The active stage is outside the available DPI stages.",
    });
    settings.activeDpiStage = Math.min(
      previous.activeDpiStage,
      settings.dpiStages.length - 1,
    );
  }
  return { settings, issues };
}
