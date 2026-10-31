// Labels for the wider key assignments of BYKB and ARBITER boards, from their source encodings:
// - BYKB SDK 32-bit keycodes (getBykbKeycodeLabel): type in bits 24-31; type 0 = modifiers in bits 16-23 + HID key in
//   the low 16 bits; type 2 = HID consumer usage; 0x0D000000 = FN; types 7/8 = system/lighting functions.
// - ARBITER [class, code, code1] (keyboard-info.util enum): 16 general [mods, HID key], 48 consumer, 112 macro, 144-149 advanced.
// Modifier bits in both: 1 L Ctrl, 2 L Shift, 4 L Alt, 8 L Win, 16 R Ctrl, 32 R Shift, 64 R Alt, 128 R Win.
// Consumer names follow the USB HID Usage Tables, Consumer page (0x0C). Anything else shows its raw code.

const MODIFIERS = ["Ctrl", "Shift", "Alt", "Win", "R Ctrl", "R Shift", "R Alt", "R Win"];
const CONSUMER: Record<number, string> = {
  0x6f: "Brightness +",
  0x70: "Brightness −",
  0xb5: "Next",
  0xb6: "Previous",
  0xb7: "Stop",
  0xcd: "Play/Pause",
  0xe2: "Mute",
  0xe9: "Volume +",
  0xea: "Volume −",
  0x183: "Media Player",
  0x18a: "Mail",
  0x192: "Calculator",
  0x194: "My Computer",
  0x221: "Search",
  0x223: "Browser Home",
  0x224: "Browser Back",
  0x225: "Browser Forward",
  0x227: "Refresh",
  0x22a: "Bookmarks",
};
const ARBITER_CLASSES: Record<number, string> = {
  32: "Mouse",
  64: "System",
  80: "Program",
  96: "Web",
  128: "Wheel",
  144: "DKS",
  145: "TGL",
  146: "MT",
  147: "RS",
  148: "SOCD",
  149: "OKS",
};
const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

function combo(mods: number, key: number, hidLabel: (id: number) => string) {
  const parts = MODIFIERS.filter((_, bit) => mods & (1 << bit));
  if (key) parts.push(hidLabel(key));
  return parts.join(" + ") || "Disabled";
}
const consumer = (usage: number) => CONSUMER[usage] ?? `Media ${hex(usage)}`;

/** Label for a [class, 32-bit] BYKB or [class, code, code1] ARBITER assignment; HID ids use the caller's table. */
export function wideKeyLabel(code: readonly number[], hidLabel: (id: number) => string): string {
  if (code.length === 3) {
    const [cls, a, b] = code;
    if (cls === 0) return "Disabled";
    if (cls === 16) return combo(a, b, hidLabel);
    if (cls === 48) return consumer(a | (b << 8));
    if (cls === 112) return `M${a + 1}`;
    return ARBITER_CLASSES[cls] ?? `${cls}:${a}:${b}`;
  }
  const id = code[1] >>> 0;
  const type = id >>> 24;
  if (type === 0) return combo((id >>> 16) & 255, id & 0xffff, hidLabel);
  if (type === 2) return consumer(id & 0xffff);
  if (id === 0x0d000000) return "Fn";
  if (type === 8) return `Lighting ${hex(id)}`;
  return `Key ${hex(id)}`;
}
