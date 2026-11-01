import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import {
  createKeyboardSettings,
  KeyboardSettingsSchema,
  type KeyboardSettings,
} from "../devices/keyboardSettings";
import { ATK68_LAYOUT_KEY, rowsForLayout } from "../devices/keyboardLayouts";

// Maps belong to one key layout (configs are per keyboard model, as in the original); older saved maps
// without a layout are ATK68 maps.
const MapSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(60),
    layout: z.string().min(1).max(60).default(ATK68_LAYOUT_KEY),
    settings: KeyboardSettingsSchema,
  })
  .refine(
    (m) => {
      const keys = rowsForLayout(m.layout).flat();
      return m.settings.keys.length === keys.length && keys.every((key, index) =>
        m.settings.keys[index].row === key.index[0] && m.settings.keys[index].col === key.index[1],
      );
    },
    "Keyboard map must follow its layout's matrix order",
  );
export const KeyboardBackupSchema = z
  .object({
    kind: z.literal("atk-keyboard-maps"),
    version: z.literal(1),
    maps: z.array(MapSchema).min(1).max(100),
  })
  .refine(
    (v) => new Set(v.maps.map((m) => m.id)).size === v.maps.length,
    "Duplicate map IDs",
  );
type KeyboardMap = z.infer<typeof MapSchema>;
type State = {
  maps: KeyboardMap[];
  activeId: string;
  past: KeyboardSettings[];
  future: KeyboardSettings[];
  saveError: string;
  edit: (settings: KeyboardSettings) => void;
  select: (id: string) => void;
  add: (duplicate: boolean, sourceId?: string) => void;
  rename: (name: string, id?: string) => void;
  remove: (id?: string) => void;
  undo: () => void;
  redo: () => void;
  importMaps: (value: unknown, layout?: string) => void;
  /** Selects a map of this layout for the keyboard being opened, creating a default one if none exists. */
  useLayout: (layout: string) => void;
};
const first: KeyboardMap = {
  id: "keyboard-default",
  name: "Default",
  layout: ATK68_LAYOUT_KEY,
  settings: createKeyboardSettings(),
};
export const useKeyboardStore = create<State>()(
  persist(
    (set, get) => ({
      maps: [first],
      activeId: first.id,
      past: [],
      future: [],
      saveError: "",
      edit(settings) {
        const next = KeyboardSettingsSchema.parse(settings),
          state = get(),
          current = state.maps.find((m) => m.id === state.activeId)!;
        if (JSON.stringify(next) === JSON.stringify(current.settings)) return;
        set({
          maps: state.maps.map((m) =>
            m.id === state.activeId ? { ...m, settings: next } : m,
          ),
          past: [...state.past, current.settings].slice(-40),
          future: [],
        });
      },
      select(id) {
        if (!get().maps.some((m) => m.id === id))
          throw new Error("Map not found");
        set({ activeId: id, past: [], future: [] });
      },
      add(duplicate, sourceId) {
        const state = get();
        if (state.maps.length >= 100)
          throw new Error("At most 100 keyboard maps");
        const current = state.maps.find((m) => m.id === state.activeId)!;
        const source = sourceId
          ? state.maps.find((m) => m.id === sourceId)
          : current;
        if (!source) throw new Error("Map not found");
        const map = {
          id: crypto.randomUUID(),
          name: duplicate ? `${source.name.slice(0, 50)} copy` : "New map",
          layout: source.layout,
          settings: duplicate
            ? structuredClone(source.settings)
            : createKeyboardSettings(rowsForLayout(source.layout)),
        };
        set({
          maps: [...state.maps, map],
          activeId: map.id,
          past: [],
          future: [],
        });
      },
      rename(name, id = get().activeId) {
        if (!get().maps.some((m) => m.id === id))
          throw new Error("Map not found");
        const trimmed = z.string().trim().min(1).max(60).parse(name);
        set((s) => ({
          maps: s.maps.map((m) => (m.id === id ? { ...m, name: trimmed } : m)),
        }));
      },
      useLayout(layout) {
        const state = get();
        const active = state.maps.find((m) => m.id === state.activeId);
        if (active?.layout === layout) return;
        const existing = state.maps.find((m) => m.layout === layout);
        if (existing) return set({ activeId: existing.id, past: [], future: [] });
        if (state.maps.length >= 100) throw new Error("At most 100 keyboard maps");
        const map = {
          id: crypto.randomUUID(),
          name: "Default",
          layout,
          settings: createKeyboardSettings(rowsForLayout(layout)),
        };
        set({ maps: [...state.maps, map], activeId: map.id, past: [], future: [] });
      },
      remove(id = get().activeId) {
        const state = get();
        const target = state.maps.find((m) => m.id === id);
        if (target && state.maps.filter((m) => m.layout === target.layout).length === 1)
          throw new Error("Keep at least one map for this keyboard");
        if (!state.maps.some((m) => m.id === id))
          throw new Error("Map not found");
        const maps = state.maps.filter((m) => m.id !== id);
        const sibling = maps.find((m) => m.layout === target!.layout)!;
        set(
          id === state.activeId
            ? { maps, activeId: sibling.id, past: [], future: [] }
            : { maps },
        );
      },
      undo() {
        const s = get(),
          previous = s.past.at(-1);
        if (!previous) return;
        const current = s.maps.find((m) => m.id === s.activeId)!;
        set({
          maps: s.maps.map((m) =>
            m.id === s.activeId ? { ...m, settings: previous } : m,
          ),
          past: s.past.slice(0, -1),
          future: [current.settings, ...s.future],
        });
      },
      redo() {
        const s = get(),
          next = s.future[0];
        if (!next) return;
        const current = s.maps.find((m) => m.id === s.activeId)!;
        set({
          maps: s.maps.map((m) =>
            m.id === s.activeId ? { ...m, settings: next } : m,
          ),
          past: [...s.past, current.settings],
          future: s.future.slice(1),
        });
      },
      importMaps(value, layout) {
        const parsed = KeyboardBackupSchema.parse(value);
        const selected = layout
          ? parsed.maps.find((map) => map.layout === layout)
          : parsed.maps[0];
        if (!selected) throw new Error("Backup has no maps for this keyboard layout.");
        set({
          maps: parsed.maps,
          activeId: selected.id,
          past: [],
          future: [],
        });
      },
    }),
    {
      name: "atk-hub-keyboard-maps-v1",
      partialize: (s) => ({ maps: s.maps, activeId: s.activeId }),
      merge(persisted, current) {
        const result = z
          .object({
            maps: z.array(MapSchema).min(1).max(100),
            activeId: z.string(),
          })
          .safeParse(persisted);
        if (!result.success)
          return {
            ...current,
            saveError: persisted
              ? "Saved keyboard maps failed validation; original storage retained until your next edit."
              : "",
          };
        const { maps, activeId } = result.data;
        if (new Set(maps.map((m) => m.id)).size !== maps.length)
          return {
            ...current,
            saveError:
              "Duplicate saved map IDs; original storage retained until your next edit.",
          };
        return {
          ...current,
          maps,
          activeId: maps.some((m) => m.id === activeId) ? activeId : maps[0].id,
        };
      },
    },
  ),
);
