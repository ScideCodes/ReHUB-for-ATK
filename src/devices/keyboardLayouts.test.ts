import { describe, expect, it } from "vitest";
import { layoutFor, layoutIndexes, rowsForLayout, ATK68_LAYOUT_KEY } from "./keyboardLayouts";
import { createKeyboardSettings, isAtk68Order } from "./keyboardSettings";
import { useKeyboardStore } from "../store/keyboardStore";
import map from "./keyboardLayoutMap.json";

describe("per-keyboard layouts", () => {
  it("keeps the ATK68 V2 Pro writer on its built-in layout", () => {
    expect(layoutFor({ id: "atk-68-v2-pro" }).key).toBe(ATK68_LAYOUT_KEY);
    expect(isAtk68Order(createKeyboardSettings())).toBe(true);
  });
  it("gives source layouts to mapped keyboards and builds settings from them", () => {
    const [id, file] = Object.entries(map).find(([, f]) => f === "hex80")!;
    const layout = layoutFor({ id });
    expect(layout.key).toBe(file);
    const settings = createKeyboardSettings(rowsForLayout(layout.key));
    expect(settings.keys).toHaveLength(layout.rows.flat().length);
    expect(layoutIndexes(settings, layout).every((i) => i >= 0)).toBe(true);
  });
  it("keeps BYKB [keyId, 32-bit code] layout defaults and key IDs", () => {
    const rows = rowsForLayout("atk_a87_ultra");
    expect(rows[0][0].defaultKey).toMatchObject({ 0: [0, 41], 1: [0, 117440516] });
    expect(rows[0][0].keyId).toBe(1);
    expect(createKeyboardSettings(rows).keys).toHaveLength(rows.flat().length);
  });
  it("selects or creates a map per layout without touching other keyboards' maps", () => {
    const store = useKeyboardStore.getState();
    const before = store.maps.length;
    store.useLayout("hex80");
    let s = useKeyboardStore.getState();
    const hex = s.maps.find((m) => m.id === s.activeId)!;
    expect(hex.layout).toBe("hex80");
    expect(s.maps).toHaveLength(before + 1);
    store.useLayout(ATK68_LAYOUT_KEY);
    s = useKeyboardStore.getState();
    expect(s.maps.find((m) => m.id === s.activeId)!.layout).toBe(ATK68_LAYOUT_KEY);
    store.useLayout("hex80");
    expect(useKeyboardStore.getState().activeId).toBe(hex.id);
  });
});
