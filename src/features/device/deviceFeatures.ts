import type { DeviceDefinition } from "../../types/schema";

export type FeatureKey =
  | "sensitivity"
  | "buttons"
  | "performance"
  | "lighting"
  | "clicks"
  | "power"
  | "macro"
  | "sensorAngle"
  | "longDistance"
  | "sensorPower"
  | "rippleControl"
  | "motionSync"
  | "angleSnapping"
  | "lod";

export function isDeviceFeatureSupported(
  feature: FeatureKey | string,
  device: DeviceDefinition | null | undefined,
): boolean {
  // If no keyboard device definition is selected, assume mouse device
  if (!device || device.kind === "mouse") {
    return true;
  }

  const features = device.features || [];
  const normalized = features.map((f) => f.toLowerCase());

  switch (feature) {
    case "sensitivity":
      return normalized.some(
        (f) => f.includes("dpi") || f.includes("sensitivity"),
      );

    case "buttons":
      return normalized.some(
        (f) =>
          f.includes("key remapping") ||
          f.includes("button") ||
          f.includes("keys"),
      );

    case "performance":
      return normalized.some(
        (f) =>
          f.includes("rapid trigger") ||
          f.includes("rt") ||
          f.includes("performance") ||
          f.includes("actuation") ||
          f.includes("snap tap") ||
          f.includes("socd"),
      );

    case "lighting":
      return normalized.some(
        (f) =>
          f.includes("lighting") || f.includes("rgb") || f.includes("light"),
      );

    case "clicks":
      return normalized.some(
        (f) => f.includes("debounce") || f.includes("click"),
      );

    case "power":
      return normalized.some(
        (f) =>
          f.includes("power") ||
          f.includes("battery") ||
          f.includes("wireless"),
      );

    case "macro":
      return normalized.some((f) => f.includes("macro"));

    case "sensorAngle":
      return normalized.some(
        (f) => f.includes("sensor angle") || f.includes("rotation"),
      );

    case "longDistance":
      return normalized.some(
        (f) => f.includes("long distance") || f.includes("rf boost"),
      );

    case "sensorPower":
      return normalized.some((f) => f.includes("sensor power"));

    case "rippleControl":
      return normalized.some((f) => f.includes("ripple"));

    case "motionSync":
      return normalized.some(
        (f) => f.includes("motion sync") || f.includes("motionsync"),
      );

    case "angleSnapping":
      return normalized.some(
        (f) => f.includes("angle snap") || f.includes("anglesnap"),
      );

    case "lod":
      return normalized.some(
        (f) => f.includes("lod") || f.includes("lift-off"),
      );

    default:
      return normalized.some((f) => f.includes(feature.toLowerCase()));
  }
}
