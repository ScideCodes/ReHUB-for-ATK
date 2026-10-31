import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RecordedKey } from "../../ui/liquid/macros";

// Original Macro Settings keeps a named macro list; buttons reference one by value.
export type MouseMacro = { id: string; name: string; events: RecordedKey[] };

export const useMouseMacros = create<{
  macros: MouseMacro[];
  save: (macro: MouseMacro) => void;
  remove: (id: string) => void;
}>()(
  persist(
    (set) => ({
      macros: [],
      save: (macro) =>
        set((state) => ({
          macros: state.macros.some((m) => m.id === macro.id)
            ? state.macros.map((m) => (m.id === macro.id ? macro : m))
            : [...state.macros, macro].slice(0, 64),
        })),
      remove: (id) => set((state) => ({ macros: state.macros.filter((m) => m.id !== id) })),
    }),
    { name: "atk-hub-mouse-macros" },
  ),
);
