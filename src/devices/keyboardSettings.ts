import { z } from "zod";
import layout from "./atk68Layout.json";
import { wideKeyLabel } from "./keycodeLabels";

const byte = z.number().int().min(0).max(255);
const keycode = z.tuple([byte, byte]);
// Key assignments as each family stores them: [class, id] (DUCKBREAD/BITYUAN/HFD), BYKB [0, 32-bit SDK keycode],
// ARBITER [class, code, code1]. Only the ATK68 writer sends assignments, and only [class, byte] ones.
const layerCode = z.union([
  z.tuple([byte, z.number().int().min(0).max(0xffffffff)]),
  z.tuple([byte, byte, byte]),
]);
const color = z.string().regex(/^#[\da-f]{6}$/i);
export const KEY_LAYOUT = layout.layouts.keymap;
export const LIGHT_MODES = [
  [0, "Off"],
  [1, "Custom"],
  [2, "Static"],
  [3, "Focus"],
  [4, "Vertical rainbow"],
  [5, "Horizontal rainbow"],
  [6, "Breathing"],
  [7, "Ribbon"],
  [8, "Laser"],
  [9, "Pinwheel"],
  [11, "Vortex"],
  [13, "Spectrum cycle"],
  [19, "Colorful swirls"],
  [23, "Double vortex"],
  [25, "Christmas"],
  [26, "Spectrum breathing"],
  [28, "Spectrum floating"],
  [30, "Digital rain"],
  [31, "Key reactive"],
  [36, "Cross"],
  [39, "Fingertip rainbow"],
] as const;
export const KeyboardSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    deviceId: z.literal("atk-68-v2-pro"),
    // 125-500Hz: HFD wm and BYKB SDK rates; ATK68 writes stay limited by its own write gate.
    pollingRate: z.union([
      z.literal(125),
      z.literal(250),
      z.literal(500),
      z.literal(1000),
      z.literal(2000),
      z.literal(4000),
      z.literal(8000),
    ]),
    options: z.object({
      rgbArea: byte,
      exchangeWasd: z.boolean(),
      macSwitch: z.boolean(),
      winLock: z.boolean(),
      sixKeyNoPunch: z.boolean(),
      bottomTrigger: z.boolean(),
      performanceMode: z.boolean(),
    }),
    deadZone: z.object({
      top: z.number().min(0).max(3.3),
      bottom: z.number().min(0).max(3.3),
    }),
    light: z.object({
      mode: z
        .number()
        .int()
        .refine((v) => LIGHT_MODES.some(([id]) => id === v)),
      brightness: z.number().int().min(1).max(100),
      speed: z.number().int().min(1).max(255),
      color,
    }),
    keys: z
      .array(
        z.object({
          // Up to the largest source matrix (6x18); ATK68 uses 5x15.
          row: z.number().int().min(0).max(7),
          col: z.number().int().min(0).max(23),
          layers: z.array(layerCode).length(4),
          // Source bP TRAVEL_INFO_MAP: RS7 reaches 3.4mm; the ATK68 write gate keeps its own 3.3mm cap.
          actuation: z.number().min(0.1).max(3.4),
          rt: z.object({
            on: z.boolean(),
            press: z.number().min(0.02).max(3.4),
            release: z.number().min(0.02).max(3.4),
          }),
          color,
        }),
      )
      // One entry per position of the map's own layout (see keyboardStore MapSchema.layout).
      .min(1)
      .max(256),
    macros: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          actions: z
            .array(
              z.object({
                code: z.string().min(1).max(40),
                down: z.boolean(),
                delay: z.number().int().min(0).max(65535),
              }),
            )
            .max(1000),
        }),
      )
      .length(16),
    advanced: z
      .array(
        z.object({
          kind: z.enum(["mt", "tgl", "dks", "rs", "socd", "oks"]),
          key: z.number().int().min(0).max(255),
          otherKey: z.number().int().min(0).max(255),
          layer: z.number().int().min(0).max(3),
          tap: keycode,
          hold: keycode,
          delay: z.number().int().min(0).max(65535),
          point: z.number().min(0.1).max(3.3),
          rt: z.boolean(),
          priority: z.enum(["last", "first", "second", "neutral"]),
          dks: z
            .array(
              z.object({
                code: keycode,
                events: z.array(z.boolean()).length(10),
              }),
            )
            .length(4),
        }),
      )
      .max(120),
  })
  .superRefine((settings, ctx) => {
    const seen = new Set<string>();
    for (const key of settings.keys) {
      const id = `${key.row}:${key.col}`;
      if (seen.has(id)) ctx.addIssue({ code: "custom", message: "Duplicate matrix key" });
      seen.add(id);
    }
    for (const action of settings.advanced)
      if (action.key >= settings.keys.length || action.otherKey >= settings.keys.length)
        ctx.addIssue({ code: "custom", message: "Advanced action points at a missing key" });
    for (const kind of ["mt", "tgl", "dks", "rs", "socd", "oks"]) {
      if (settings.advanced.filter((a) => a.kind === kind).length > 20)
        ctx.addIssue({
          code: "custom",
          message: "At most 20 advanced actions per family",
        });
    }
  });
export type KeyboardSettings = z.infer<typeof KeyboardSettingsSchema>;
export type AdvancedAction = KeyboardSettings["advanced"][number];

// These are explicit mock/editor defaults, never treated as a hardware read.
export function createKeyboardSettings(
  rows: readonly (readonly { index: number[]; defaultKey?: Record<string, number[]> }[])[] = KEY_LAYOUT,
): KeyboardSettings {
  return KeyboardSettingsSchema.parse({
    schemaVersion: 1,
    deviceId: "atk-68-v2-pro",
    pollingRate: 1000,
    options: {
      rgbArea: 0,
      exchangeWasd: false,
      macSwitch: false,
      winLock: false,
      sixKeyNoPunch: false,
      bottomTrigger: false,
      performanceMode: false,
    },
    deadZone: { top: 0.1, bottom: 0.1 },
    light: { mode: 2, brightness: 60, speed: 128, color: "#ffffff" },
    keys: rows.flat().map((key) => ({
      row: key.index[0],
      col: key.index[1],
      layers: [0, 1, 2, 3].map(
        (layer) => {
          // Some source layouts (type 13: A87/A98 Ultra, RS8 Neo, V75X Ultra) store 32-bit actions,
          // not this app's [class, code] bytes; those keys start unassigned instead of mis-decoded.
          const code = key.defaultKey?.[layer];
          return code && code.every((v) => v >= 0 && v <= 255) ? code : [0, layer === 0 ? 0 : 1];
        },
      ),
      actuation: 1.5,
      rt: { on: false, press: 0.1, release: 0.1 },
      color: "#ffffff",
    })),
    macros: Array.from({ length: 16 }, (_, i) => ({
      name: `M${i + 1}`,
      actions: [],
    })),
    advanced: [],
  });
}

export function keyLabel(code: readonly number[]): string {
  if (code.length === 3 || code[1] > 255) return wideKeyLabel(code, (id) => keyLabel([0, id]));
  if (code[0] === 0) {
    const id = code[1];
    if (id >= 4 && id <= 29) return String.fromCharCode(65 + id - 4);
    if (id >= 30 && id <= 38) return String(id - 29);
    if (id >= 58 && id <= 69) return `F${id - 57}`;
    return (
      (
        {
          39: "0",
          40: "Enter",
          41: "Esc",
          42: "Backspace",
          43: "Tab",
          44: "Space",
          45: "−",
          46: "=",
          47: "[",
          48: "]",
          49: "\\",
          51: ";",
          52: "'",
          53: "`",
          54: ",",
          55: ".",
          56: "/",
          57: "Caps",
          73: "Insert",
          74: "Home",
          75: "PgUp",
          76: "Del",
          77: "End",
          78: "PgDn",
          79: "Right",
          80: "Left",
          81: "Down",
          82: "Up",
          224: "Ctrl",
          225: "Shift",
          226: "Alt",
          227: "Win",
          228: "R Ctrl",
          229: "R Shift",
          230: "R Alt",
          231: "R Win",
          0: "Disabled",
          1: "Transparent",
        } as Record<number, string>
      )[id] ?? `Key ${id}`
    );
  }
  if (code[0] === 119) return `M${code[1] + 1}`;
  if (code[0] === 82) return `Layer ${code[1]}`;
  return `${code[0]}:${code[1]}`;
}
export const KEY_OPTIONS = Array.from({ length: 256 }, (_, id) => ({
  value: id,
  label: keyLabel([0, id]),
}));

/** The ATK68 writer addresses keys by index: an ATK68 map must hold exactly KEY_LAYOUT in order. */
export function isAtk68Order(settings: KeyboardSettings) {
  const flat = KEY_LAYOUT.flat();
  return (
    settings.keys.length === flat.length &&
    flat.every((k, i) => settings.keys[i].row === k.index[0] && settings.keys[i].col === k.index[1])
  );
}
