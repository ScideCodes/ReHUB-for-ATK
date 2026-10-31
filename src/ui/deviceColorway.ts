import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeviceDefinition } from "../types/schema";
import { colorwayFinish, deviceKey } from "../devices/presentation";
import { applyColorwayHex } from "./colorPalette";
import { setMouseFinish } from "./finishTheme";

export const useDeviceColorway = create<{
  colors: Record<string, string>;
  select: (device: DeviceDefinition, color: number) => void;
}>()(
  persist(
    (set) => ({
      colors: {},
      select(device, index) {
        const color = device.colorways?.[index];
        if (!color) return;
        set((state) => ({
          colors: {
            ...state.colors,
            [deviceKey(device)]: color.id ?? color.name,
          },
        }));
        if (device.kind === "mouse") {
          setMouseFinish(colorwayFinish(color.id ?? color.name));
        }
        applyColorwayHex(color.hex);
      },
    }),
    // Retain the storage key so existing mouse choices survive the shared store.
    { name: "atk-hub-mouse-colorways", version: 1 },
  ),
);

export function selectedColorIndex(
  device: DeviceDefinition,
  colors: Record<string, string>,
  fallback = 0,
) {
  const value = colors[deviceKey(device)];
  const index = device.colorways?.findIndex((c) => (c.id ?? c.name) === value) ?? -1;
  return index >= 0 ? index : Math.max(0, Math.min(fallback, (device.colorways?.length ?? 1) - 1));
}
