import type { KeyboardSettings } from "../../devices/keyboardSettings";

// Browser illustration only; firmware determines the actual effect timing and pattern.
export function lightingPreview(settings: KeyboardSettings) {
  const mode = settings.light.mode;
  return {
    family: [0, 1, 2, 3, 4, 5].includes(mode)
      ? "still"
      : [6, 26].includes(mode)
        ? "breathe"
        : [31, 39].includes(mode)
          ? "reactive"
          : "wave",
    brightness: mode === 0 ? 0 : settings.light.brightness / 100,
    duration: 0.8 + (255 - settings.light.speed) / 32,
  };
}

export function previewKeyColor(settings: KeyboardSettings, index: number) {
  const key = settings.keys[index],
    mode = settings.light.mode;
  if (mode === 1) return key.color;
  // Illustrative spectrum samples stay in the renderer, never in saved settings or packets.
  if ([4, 5, 9, 11, 13, 19, 23, 25, 26, 28, 30, 39].includes(mode)) {
    const phase =
      mode === 4
        ? key.row / 5
        : mode === 5
          ? key.col / 15
          : index / settings.keys.length;
    return `hsl(${Math.round(phase * 360)} 75% 55%)`;
  }
  return settings.light.color;
}
