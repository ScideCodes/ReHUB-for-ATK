import type { ButtonAction } from "../../types/schema";
import { KEY_OPTIONS } from "../../devices/keyboardSettings";

// Original System-key menu (demoMode.store kE/AE/CE/_E/SE). Values use this project's
// ButtonKeyClass encoding; groups the project's protocol cannot encode are listed disabled.
export type ActionOption = {
  label: string;
  value?: [number, number, number];
};
export type ActionGroup = { label: string; children: ActionOption[] };

export const SYSTEM_GROUPS: ActionGroup[] = [
  {
    label: "Mouse & Keyboard",
    children: [
      { label: "Disable", value: [0, 0, 0] },
      { label: "Left Button", value: [1, 1, 0] },
      { label: "Right Click", value: [1, 2, 0] },
      { label: "Middle Key", value: [1, 4, 0] },
      { label: "Back", value: [1, 8, 0] },
      { label: "Advance", value: [1, 16, 0] },
    ],
  },
  {
    label: "Config File",
    children: [
      { label: "Switch Config File 1", value: [9, 0, 0] },
      { label: "Switch Config File 2", value: [9, 1, 0] },
      { label: "Switch Config File 3", value: [9, 2, 0] },
      { label: "Switch Config File 4", value: [9, 3, 0] },
      { label: "Config File Cycle", value: [9, 255, 0] },
    ],
  },
  {
    label: "DPI Key",
    children: [
      { label: "DPI Cycle", value: [2, 1, 0] },
      { label: "DPI+", value: [2, 2, 0] },
      { label: "DPI-", value: [2, 3, 0] },
    ],
  },
  {
    label: "Mouse Wheel",
    children: [
      { label: "Roll Left", value: [3, 1, 0] },
      { label: "Roll Right", value: [3, 2, 0] },
      { label: "Wheel Up", value: [11, 1, 0] },
      { label: "Wheel Down", value: [11, 2, 0] },
    ],
  },
  {
    label: "Multimedia",
    children: [
      "Brightness+", "Brightness-", "Media Player", "Stop Playback", "Play/Pause",
      "Previous Track", "Next Track", "Mute", "Volume+", "Volume-", "Mail", "Homepage",
      "Search", "Refresh", "Favorites", "Stop Loading", "Web Forward", "Web Back",
      "Calculator", "My Computer",
    ].map((label) => ({ label })),
  },
];

const MODIFIERS = new Set([224, 225, 226, 227, 228, 229, 230, 231]);
export const KEYBOARD_OPTIONS: ActionOption[] = KEY_OPTIONS.filter(
  (option) => option.value >= 4 && option.value <= 231 && !option.label.startsWith("Key "),
).map((option) => ({
  label: option.label,
  value: [5, option.value, MODIFIERS.has(option.value) ? 8 : 0],
}));

export const DEFAULT_LABELS: Record<string, string> = {
  left: "Left Button",
  right: "Right Click",
  middle: "Middle Key",
  side1: "Back",
  side2: "Advance",
  bottom: "DPI Cycle",
};

export function actionLabel(action: ButtonAction | undefined, macroName?: string) {
  if (!action) return "Disable";
  if (action.keyClass === 6) return macroName ?? "Macro";
  if (action.keyClass === 4) return "Fire Key";
  const all = [...SYSTEM_GROUPS.flatMap((g) => g.children), ...KEYBOARD_OPTIONS];
  const found = all.find(
    (option) =>
      option.value &&
      option.value[0] === action.keyClass &&
      option.value[1] === action.keyValue1,
  );
  return found?.label ?? action.label;
}
