import { create } from "zustand";
import { useConfigStore } from "../store/configStore";

export type Notification = { id: number; message: string; time: number; count: number };

const MAX_ITEMS = 50;
let nextId = 1;

/** Message center: device and settings errors for this session, newest last. */
export const useNotifications = create<{
  items: Notification[];
  unseen: number;
  push: (message: string) => void;
  markSeen: () => void;
  clear: () => void;
}>()((set) => ({
  items: [],
  unseen: 0,
  push(message) {
    const text = message.trim();
    if (!text) return;
    set((state) => {
      const last = state.items[state.items.length - 1];
      // A repeat of the latest error bumps its counter instead of flooding the list.
      const items =
        last?.message === text
          ? [...state.items.slice(0, -1), { ...last, count: last.count + 1, time: Date.now() }]
          : [...state.items, { id: nextId++, message: text, time: Date.now(), count: 1 }].slice(-MAX_ITEMS);
      return { items, unseen: state.unseen + 1 };
    });
  },
  markSeen: () => set({ unseen: 0 }),
  clear: () => set({ items: [], unseen: 0 }),
}));

export const notifyError = (message: string) => useNotifications.getState().push(message);

// The config store reports mouse apply/read failures through `lastToast`.
useConfigStore.subscribe((state, previous) => {
  const toast = state.lastToast;
  if (toast && toast !== previous.lastToast && toast.type === "error") notifyError(toast.message);
});
