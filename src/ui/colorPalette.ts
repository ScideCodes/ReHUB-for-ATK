export type PaletteTheme = "dark" | "light";
const rgb = (hex: string) =>
  hex
    .slice(1)
    .match(/.{2}/g)!
    .map((c) => parseInt(c, 16));
const toHex = (values: number[]) =>
  "#" + values.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) =>
  toHex(rgb(a).map((c, i) => c + (rgb(b)[i] - c) * t));
export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) =>
    rgb(hex)
      .map((c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (x + 0.05) / (y + 0.05);
}
function readable(
  color: string,
  background: string,
  ratio: number,
  toward: string,
) {
  for (let i = 0; i <= 100; i++) {
    const value = mix(color, toward, i / 100);
    if (contrastRatio(value, background) >= ratio) return value;
  }
  return toward;
}
const overrides: Record<
  string,
  Record<PaletteTheme, [string, string, string]>
> = {
  "#000000": {
    dark: ["#D2D5D8", "#ECEEF0", "#E5E7E9"],
    light: ["#3C4147", "#50565E", "#353B43"],
  },
  "#FFFFFF": {
    dark: ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
    light: ["#0F172A", "#1E293B", "#0F172A"],
  },
  "#BDC9E2": {
    dark: ["#BDC9E2", "#D6DEED", "#E5ECF8"],
    light: ["#405677", "#344761", "#20324A"],
  },
  "#F68641": {
    dark: ["#FF6A1A", "#FF7F3C", "#FAFAFA"],
    light: ["#A63B00", "#913300", "#692500"],
  },
};
export function paletteFromHex(
  input: string,
  theme: PaletteTheme,
): Record<string, string> {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(input))
    throw new Error("Colorway must be a valid hex color");
  const sourceHex = input.toUpperCase();
  const hex =
      sourceHex.length === 4
        ? "#" + [...sourceHex.slice(1)].map((c) => c + c).join("")
        : sourceHex.slice(0, 7),
    light = theme === "light",
    background = light ? "#D4D4D8" : "#45454A",
    toward = light ? "#000000" : "#FFFFFF";
  const preset = overrides[hex]?.[theme];
  const accent = readable(preset?.[0] ?? hex, background, 3, toward);
  const onAccent =
    contrastRatio("#FFFFFF", accent) > contrastRatio("#000000", accent)
      ? "#FFFFFF"
      : "#000000";
  const ember = readable(
    preset?.[1] ?? mix(accent, light ? "#000000" : "#FFFFFF", 0.18),
    onAccent,
    4.5,
    accent,
  );
  const ink = readable(preset?.[2] ?? hex, background, 4.5, toward);
  const burnt = mix(hex, "#000000", 0.65),
    channels = rgb(accent),
    neutral = light ? "#F4F4F6" : "#101012";
  const rgba = (color: string, alpha: number) =>
    `rgba(${rgb(color).join(",")},${alpha})`;
  const text = light ? "#18181A" : "#F5F5F7",
    muted = light ? "#44444C" : "#E2E2EA",
    faint = light ? "#5A5A62" : "#C8C8D2";
  const fill = light ? "rgba(255,255,255,.65)" : "rgba(255,255,255,.07)",
    border = light ? "rgba(0,0,0,.16)" : "rgba(255,255,255,.12)";
  const result: Record<string, string> = {
    "--finish-hex": sourceHex,
    "--hub-accent": accent,
    "--hub-ember": ember,
    "--hub-burnt": burnt,
    "--hub-accent-ink": ink,
    "--hub-on-accent": onAccent,
    "--hub-focus": accent,
    "--accent": accent,
    "--ember": ember,
    "--on-accent": onAccent,
    "--accent-rgb": channels.join(","),
    "--color-accent": channels.join(" "),
    "--color-accent-ember": rgb(ember).join(" "),
    "--color-accent-burnt": rgb(burnt).join(" "),
    "--accent-soft": rgba(accent, 0.12),
    "--selection-bg": rgba(accent, 0.22),
    "--ambient-light": rgba(hex, light ? 0.13 : 0.2),
    "--hub-accent-glow": "transparent",
    "--hub-bg": neutral,
    "--hub-bg-end": mix(neutral, hex, light ? 0.04 : 0.07),
    "--hub-surface": light ? "#F8F8FA" : "#1B1B1F",
    "--hub-elevated": light ? "#FFFFFF" : "#28282E",
    "--hub-text": text,
    "--hub-text-muted": muted,
    "--hub-text-faint": faint,
    "--color-text": rgb(text).join(" "),
    "--color-text-muted": rgb(muted).join(" "),
    "--color-text-faint": rgb(faint).join(" "),
    "--color-bg": rgb(neutral).join(" "),
    "--color-surface": rgb(light ? "#F8F8FA" : "#1B1B1F").join(" "),
    "--color-surface-elevated": rgb(light ? "#FFFFFF" : "#28282E").join(" "),
    "--color-surface-border": rgb(muted).join(" "),
    "--shadow-glass": light
      ? "0 20px 50px rgba(0,0,0,.09)"
      : "0 20px 50px rgba(0,0,0,.25)",
    "--shadow-panel": light
      ? "0 20px 50px rgba(0,0,0,.09)"
      : "0 20px 50px rgba(0,0,0,.25)",
    "--shadow-popup": light
      ? "0 16px 40px rgba(0,0,0,.14)"
      : "0 16px 40px rgba(0,0,0,.3)",
    "--glass-bg": fill,
    "--glass-tab-bg": light ? "rgba(255,255,255,.75)" : "rgba(18,18,20,.32)",
    "--glass-panel": fill,
    "--glass-sheet": light ? "rgba(255,255,255,.48)" : "rgba(18,18,20,.2)",
    "--glass-panel-top": fill,
    "--glass-panel-bottom": fill,
    "--lg-panel-top": fill,
    "--lg-panel-bottom": fill,
    "--glass-nested": light
      ? "rgba(255,255,255,.32)"
      : "rgba(255,255,255,.035)",
    "--glass-fallback": light ? "#F6F6F8" : "#18181A",
    "--glass-border": border,
    "--glass-border-top": light
      ? "rgba(255,255,255,.95)"
      : "rgba(255,255,255,.24)",
    "--glass-border-bottom": light
      ? "rgba(0,0,0,.08)"
      : "rgba(255,255,255,.045)",
    "--glass-highlight": light
      ? "rgba(255,255,255,.65)"
      : "rgba(255,255,255,.055)",
    "--glass-contrast-scrim": light
      ? "rgba(255,255,255,.35)"
      : "rgba(0,0,0,.78)",
    "--control-bg": light ? "rgba(0,0,0,.045)" : "rgba(255,255,255,.07)",
    "--control-hover": light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.12)",
    "--control-border": border,
    "--control-disabled": light ? "rgba(0,0,0,.025)" : "rgba(255,255,255,.025)",
    "--shadow-color": light ? "rgba(0,0,0,.12)" : "rgba(0,0,0,.35)",
    "--mask-opaque": "#000000",
    "--lg-success": light ? "#146638" : "#78D8A1",
    "--lg-warning": light ? "#754B00" : "#FFD17A",
    "--lg-error": light ? "#A51D26" : "#FF9692",
    "--switch-off": light ? "#74747C" : "#76767E",
    // Light theme: translucent white "on" was lighter than the grey "off" track.
    "--switch-on": light ? accent : "rgba(255,255,255,.42)",
    "--switch-thumb": "#FFFFFF",
    "--range-track": light ? "#8B8B94" : "#76767E",
    "--workspace-bg": fill,
    "--rail-bg": fill,
    "--surface-inset": light ? "rgba(0,0,0,.035)" : "rgba(0,0,0,.14)",
    "--device-display-bg": fill,
    "--line-subtle": border,
    "--badge-bg": fill,
    "--overlay-bg": light ? "rgba(20,20,24,.25)" : "rgba(0,0,0,.5)",
    "--scrollbar": rgba(muted, 0.3),
    "--apply-btn-start": accent,
    "--apply-btn-end": accent,
    "--apply-btn-hover-start": ember,
    "--apply-btn-hover-end": ember,
    "--apply-btn-ink": onAccent,
    "--apply-btn-glow": "transparent",
    "--apply-btn-glow-hover": "transparent",
    "--apply-btn-disabled": rgba(accent, 0.18),
    "--lg-ambient-one": rgba(hex, light ? 0.18 : 0.32),
    "--lg-ambient-two": rgba(hex, light ? 0.12 : 0.22),
    "--lg-ambient-three": rgba(mix(hex, "#FFFFFF", 0.4), light ? 0.12 : 0.18),
    "--lg-ambient-four": rgba(hex, light ? 0.08 : 0.12),
    "--lg-ambient-five": rgba(hex, light ? 0.14 : 0.24),
    "--lg-receiver-top": "#36363C",
    "--lg-receiver-bottom": "#141418",
  };
  return result;
}
export function applyColorwayHex(hex: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement,
    theme = root.dataset.theme === "light" ? "light" : "dark";
  const palette = paletteFromHex(hex, theme);
  root.dataset.colorwayHex = hex.toUpperCase();
  for (const [key, value] of Object.entries(palette))
    root.style.setProperty(key, value);
}
