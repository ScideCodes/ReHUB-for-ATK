import type { DeviceDefinition } from "../types/schema";

export function resolveDeviceImage(
  device: DeviceDefinition,
  color: number,
): string | null {
  const selected = device.colorways?.[color];
  const image = device.colorways?.length ? selected?.image : device.images?.[0];
  if (!image || /^(?:https?:|data:|\/\/)/i.test(image)) return null;
  if (image.startsWith("/")) return image;
  return `/devices/${device.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${image}`;
}

export function deviceKey(device: DeviceDefinition): string {
  return (
    device.id ??
    `${device.VID}:${device.PID}:${device.usagePage ?? ""}:${device.usage ?? ""}:${device.name}`
  );
}

export function colorwayFinish(
  value: string,
):
  "ice" | "black" | "orange" | "white" | "gray" | "rose" | "purple" | "yellow" {
  const color = value.toLowerCase();
  if (/ice|translucent/.test(color) && !/black|orange/.test(color))
    return "ice";
  if (/black/.test(color)) return "black";
  if (/orange/.test(color)) return "orange";
  if (/white/.test(color)) return "white";
  if (/gr[ae]y|silver/.test(color)) return "gray";
  if (/pink|rose|red/.test(color)) return "rose";
  if (/purple/.test(color)) return "purple";
  if (/yellow/.test(color)) return "yellow";
  return "black";
}
