import mice from "./mice.json";
import keyboards from "./devices.json";
import { DeviceDefinitionSchema, type DeviceDefinition } from "../types/schema";

export const MOUSE_DEVICES: DeviceDefinition[] = mice.map((d) =>
  DeviceDefinitionSchema.parse(d),
);
export const KEYBOARD_DEVICES: DeviceDefinition[] = keyboards.map((d) =>
  DeviceDefinitionSchema.parse(d),
);
export const DEVICE_REGISTRY: DeviceDefinition[] = [
  ...MOUSE_DEVICES,
  ...KEYBOARD_DEVICES,
];

export const ATK68: DeviceDefinition =
  DEVICE_REGISTRY.find(
    (d) => d.VID.toUpperCase() === "0X373B" && d.PID.toUpperCase() === "0X1048",
  ) ?? DEVICE_REGISTRY[0];

/**
 * Find device in registry by VID and PID (case-insensitive) with optional usagePage.
 */
export function findByVidPid(
  vid: string | number,
  pid: string | number,
  usagePage?: number,
): DeviceDefinition | undefined {
  const normVid =
    typeof vid === "number"
      ? "0X" + vid.toString(16).toUpperCase()
      : vid.toUpperCase();
  const normPid =
    typeof pid === "number"
      ? "0X" + pid.toString(16).toUpperCase()
      : pid.toUpperCase();

  return DEVICE_REGISTRY.find((d) => {
    const matchVid = d.VID.toUpperCase() === normVid;
    const matchPid = d.PID.toUpperCase() === normPid;
    if (!matchVid || !matchPid) return false;
    if (usagePage !== undefined && d.usagePage !== undefined) {
      return d.usagePage === usagePage;
    }
    return true;
  });
}

/**
 * Generate WebHID requestDevice filters for every device in the registry.
 */
export function requestDeviceFilters(): HIDDeviceFilter[] {
  return DEVICE_REGISTRY.map((d) => {
    const filter: HIDDeviceFilter = {
      vendorId: parseInt(d.VID, 16),
      productId: parseInt(d.PID, 16),
    };
    if (d.usagePage !== undefined) filter.usagePage = d.usagePage;
    if (d.usage !== undefined) filter.usage = d.usage;
    return filter;
  });
}

const KEYBOARD_CONTROLS = [
  { id: "keys", label: "Keys", capabilities: ["keyRemap", "layers"] },
  {
    id: "trigger",
    label: "Trigger",
    capabilities: ["actuation", "rapidTrigger", "deadZones"],
  },
  { id: "lighting", label: "Lighting", capabilities: ["rgb", "perKeyRgb"] },
  {
    id: "advanced",
    label: "Advanced",
    capabilities: ["mt", "tgl", "dks", "rs", "socd", "oks"],
  },
  { id: "macros", label: "Macros", capabilities: ["macros"] },
  {
    id: "settings",
    label: "Settings",
    capabilities: ["pollingRate", "keyboardOptions", "calibration"],
  },
] as const;

export function controlsFor(device: DeviceDefinition) {
  return KEYBOARD_CONTROLS.filter((control) =>
    control.capabilities.some((cap) => device.capabilities?.includes(cap)),
  );
}

export function supports(
  device: DeviceDefinition,
  capability: string,
): boolean {
  return device.capabilities?.includes(capability) ?? false;
}
