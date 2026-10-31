import {
  Activity,
  Battery,
  Crosshair,
  Layers3,
  Mouse,
  Settings2,
  Sparkles,
  Timer,
  Usb,
  type LucideIcon,
} from "lucide-react";
import type { SettingsMap } from "../types/schema";

export type FeatureId =
  | "device"
  | "performance"
  | "sensitivity"
  | "buttons"
  | "clicks"
  | "power"
  | "lighting"
  | "maps"
  | "system";
export const FEATURES: {
  id: FeatureId;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "device",
    label: "Your device",
    description:
      "Connect your mouse, choose its finish, and manage onboard memory.",
    icon: Usb,
  },
  {
    id: "performance",
    label: "Sensor & polling",
    description: "Adjust how your mouse tracks movement and reports it.",
    icon: Activity,
  },
  {
    id: "sensitivity",
    label: "Sensitivity",
    description: "Find your preferred pointer speed and save your DPI stages.",
    icon: Crosshair,
  },
  {
    id: "buttons",
    label: "Button mapping",
    description: "Choose what each of your five mouse buttons does.",
    icon: Mouse,
  },
  {
    id: "clicks",
    label: "Click response",
    description: "Adjust click timing and reduce unwanted double clicks.",
    icon: Timer,
  },
  {
    id: "power",
    label: "Power",
    description: "Choose when your mouse rests to save battery.",
    icon: Battery,
  },
  {
    id: "lighting",
    label: "Receiver light",
    description: "Choose what the light on your 8K receiver tells you.",
    icon: Sparkles,
  },
  {
    id: "maps",
    label: "Saved maps",
    description: "Keep different settings for different games or everyday use.",
    icon: Layers3,
  },
  {
    id: "system",
    label: "Settings & tools",
    description: "Appearance, safe mode, file tools, and device diagnostics.",
    icon: Settings2,
  },
];

function slug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "map"
  );
}
export function mapHref(map: SettingsMap) {
  return `#/map/${slug(map.name)}--${encodeURIComponent(map.id)}`;
}
export function resolveMapHash(hash: string, maps: SettingsMap[]) {
  const exact = maps.find((map) => mapHref(map) === hash);
  if (exact) return exact;
  try {
    const name = decodeURIComponent(hash.replace(/^#\/map\//, ""));
    return maps.find((map) => map.id === name || slug(map.name) === name);
  } catch {
    return undefined;
  }
}
