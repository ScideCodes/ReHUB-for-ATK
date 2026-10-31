import atk68 from "./atk68Layout.json";
import layoutMap from "./keyboardLayoutMap.json";
import type { KeyboardSettings } from "./keyboardSettings";

// Source key layouts (extracted/asar_unpacked/keymaps), assigned per keyboard by
// scripts/generate-keyboard-layouts.mjs. Keyboards without a source layout use the ATK68 reference.
export type LayoutKey = {
  index: number[];
  w?: number;
  mr?: number;
  ml?: number;
  defaultKey?: Record<string, number[]>;
  /** BYKB SDK key ID (source defaultKey[layer][0]), the address remapping.getKeymaps reads by. */
  keyId?: number;
};
export type BoardLayout = { key: string; name: string; rows: LayoutKey[][]; fromSource: boolean };
export const ATK68_LAYOUT_KEY = "atk68";

type LayoutFile = { name: string; layouts: { keymap: LayoutKey[][] } };

// BYKB Ultra/Neo layouts store defaults as [keyId, 32-bit SDK keycode], not [class, code]:
// keep the key ID and the code as a [0, code32] assignment (see keycodeLabels).
export function normalizeLayout(file: LayoutFile): LayoutFile {
  const keys = file.layouts.keymap.flat();
  if (!keys.some((k) => Object.values(k.defaultKey ?? {}).some((v) => v[1] > 255))) return file;
  const keymap = file.layouts.keymap.map((row) =>
    row.map((k) => ({
      ...k,
      keyId: k.defaultKey?.["0"]?.[0],
      defaultKey: k.defaultKey && Object.fromEntries(Object.entries(k.defaultKey).map(([l, v]) => [l, [0, v[1]]])),
    })),
  );
  return { ...file, layouts: { ...file.layouts, keymap } };
}

const files = Object.fromEntries(
  Object.entries(import.meta.glob<LayoutFile>("./layouts/*.json", { eager: true, import: "default" })).map(
    ([path, file]) => [path, normalizeLayout(file)],
  ),
);
const ATK68: BoardLayout = { key: ATK68_LAYOUT_KEY, name: atk68.name, rows: atk68.layouts.keymap, fromSource: true };

export function layoutFor(device?: { id?: string }): BoardLayout {
  const file = device?.id && (layoutMap as Record<string, string>)[device.id];
  const json = file && files[`./layouts/${file}.json`];
  if (json) return { key: file, name: json.name, rows: json.layouts.keymap, fromSource: true };
  return device?.id === "atk-68-v2-pro" ? ATK68 : { ...ATK68, fromSource: false };
}

/** Index into settings.keys for every layout position (row-major), or -1 when the map lacks it. */
export function layoutIndexes(settings: KeyboardSettings, layout: BoardLayout) {
  const byPos = new Map(settings.keys.map((k, i) => [`${k.row}:${k.col}`, i]));
  return layout.rows.flat().map((k) => byPos.get(`${k.index[0]}:${k.index[1]}`) ?? -1);
}

export function rowsForLayout(key: string): LayoutKey[][] {
  return files[`./layouts/${key}.json`]?.layouts.keymap ?? ATK68.rows;
}
