import { create } from "zustand";
import { useConfigStore } from "../../store/configStore";
import {
  DeviceSettingsSchema,
  SettingsMapSchema,
  type DeviceSettings,
  type SettingsMap,
} from "../../types/schema";
import { mapHref } from "../../app/navigation";
import { validateMaps } from "./mapFiles";

interface History {
  past: SettingsMap[];
  future: SettingsMap[];
  group: string;
  time: number;
}
interface MapSessionState {
  drafts: Record<string, SettingsMap>;
  histories: Record<string, History>;
  saveStatus: Record<string, "saving" | "saved" | "error">;
  saveError: string | null;
  splitAxes: Record<string, boolean>;
  liveEdit: boolean;
  commit?: { id: string; keys: (keyof DeviceSettings)[]; revision: number };
  lastEdit?: { id: string; group: string; time: number } | null;
}
export const useMapSession = create<MapSessionState>(() => ({
  drafts: {},
  histories: {},
  saveStatus: {},
  saveError: null,
  splitAxes: {},
  liveEdit: false,
  lastEdit: null,
}));
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function clone<T>(value: T): T {
  return structuredClone(value);
}
export function getEditorMap() {
  const state = useConfigStore.getState();
  return state.activeMapId
    ? (useMapSession.getState().drafts[state.activeMapId] ??
        state.maps.find((map) => map.id === state.activeMapId))
    : undefined;
}

export function flushMap(id: string) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  const draft = useMapSession.getState().drafts[id];
  if (!draft) return;
  try {
    SettingsMapSchema.parse(draft);
    useConfigStore.setState((state) => ({
      maps: state.maps.map((map) => (map.id === id ? clone(draft) : map)),
    }));
    useMapSession.setState((state) => {
      const drafts = { ...state.drafts };
      delete drafts[id];
      return {
        drafts,
        saveStatus: { ...state.saveStatus, [id]: "saved" },
        saveError: null,
      };
    });
  } catch (error) {
    useMapSession.setState((state) => ({
      saveStatus: { ...state.saveStatus, [id]: "error" },
      saveError:
        error instanceof Error ? error.message : "Could not save this map.",
    }));
  }
}
export function flushMaps() {
  Object.keys(useMapSession.getState().drafts).forEach(flushMap);
}

function stageMap(map: SettingsMap) {
  useMapSession.setState((state) => ({
    drafts: { ...state.drafts, [map.id]: map },
    saveStatus: { ...state.saveStatus, [map.id]: "saving" },
  }));
  if (useConfigStore.getState().activeMapId === map.id)
    useConfigStore.setState({ draftSettings: clone(map.settings) });
  const timer = timers.get(map.id);
  if (timer) clearTimeout(timer);
  timers.set(
    map.id,
    setTimeout(() => flushMap(map.id), 500),
  );
}

function editMap(
  updates: Partial<
    Pick<SettingsMap, "name" | "color" | "icon" | "note" | "settings">
  >,
  group: string,
) {
  const current = getEditorMap();
  if (!current) return;
  const next = SettingsMapSchema.parse({
    ...current,
    ...updates,
    updatedAt: Date.now(),
  });
  if (!next.name.trim()) throw new Error("A map needs a name.");
  if (!/^#[0-9a-f]{6}$/i.test(next.color))
    throw new Error("Choose a valid map color.");
  if (
    JSON.stringify({ ...next, updatedAt: 0 }) ===
    JSON.stringify({ ...current, updatedAt: 0 })
  )
    return;
  const history = useMapSession.getState().histories[current.id] ?? {
    past: [],
    future: [],
    group: "",
    time: 0,
  };
  const coalesce = history.group === group && Date.now() - history.time < 400;
  const now = Date.now();
  useMapSession.setState((state) => ({
    histories: {
      ...state.histories,
      [current.id]: {
        past: coalesce
          ? history.past
          : [...history.past, clone(current)].slice(-100),
        future: [],
        group,
        time: now,
      },
    },
    lastEdit: null,
  }));
  stageMap(next);
  if (updates.settings)
    publishCommit(current.id, current.settings, next.settings);
}
export function editSetting<K extends keyof DeviceSettings>(
  key: K,
  value: DeviceSettings[K],
) {
  const map = getEditorMap();
  if (map)
    editMap(
      {
        settings: DeviceSettingsSchema.parse({ ...map.settings, [key]: value }),
      },
      key,
    );
}
export function editSettings(updates: Partial<DeviceSettings>, group: string) {
  const map = getEditorMap();
  if (map)
    editMap(
      { settings: DeviceSettingsSchema.parse({ ...map.settings, ...updates }) },
      group,
    );
}
export function editMetadata(
  updates: Partial<Pick<SettingsMap, "name" | "color" | "icon" | "note">>,
) {
  editMap(updates, Object.keys(updates).join(","));
}

export function selectEditorMap(id: string) {
  flushMaps();
  const map = useConfigStore.getState().maps.find((item) => item.id === id);
  if (!map) return;
  useConfigStore.setState({
    activeMapId: id,
    draftSettings: clone(map.settings),
  });
  if (typeof window !== "undefined")
    window.history.replaceState(null, "", mapHref(map));
}

export function travelHistory(direction: "undo" | "redo") {
  const current = getEditorMap();
  if (!current) return;
  const history = useMapSession.getState().histories[current.id];
  if (!history) return;
  const source = direction === "undo" ? history.past : history.future;
  const target = source[source.length - 1];
  if (!target) return;
  const now = Date.now();
  const next =
    direction === "undo"
      ? {
          past: history.past.slice(0, -1),
          future: [...history.future, clone(current)],
          group: "",
          time: 0,
        }
      : {
          past: [...history.past, clone(current)],
          future: history.future.slice(0, -1),
          group: "",
          time: 0,
        };
  useMapSession.setState((state) => ({
    histories: { ...state.histories, [current.id]: next },
    lastEdit: null,
  }));
  stageMap({ ...clone(target), updatedAt: now });
  publishCommit(current.id, current.settings, target.settings);
}

export function createMap(
  name: string,
  mode: "blank" | "duplicate" | "capture" = "blank",
) {
  if (!name.trim()) throw new Error("Enter a map name.");
  flushMaps();
  const source = getEditorMap();
  const store = useConfigStore.getState();
  if (mode === "capture" && !store.deviceInfo.connected)
    throw new Error("Connect a device before capturing its settings.");
  const settings =
    mode === "capture"
      ? store.activeSettings
      : mode === "duplicate" && source
        ? source.settings
        : DeviceSettingsSchema.parse({});
  const now = Date.now();
  const map: SettingsMap = {
    id: `map-${crypto.randomUUID()}`,
    name: name.trim(),
    color: mode === "duplicate" && source ? source.color : "#FF6A1A",
    icon: source && mode === "duplicate" ? source.icon : "Bookmark",
    note: mode === "duplicate" && source ? source.note : "",
    createdAt: now,
    updatedAt: now,
    settings: clone(settings),
  };
  useConfigStore.setState({ maps: [...store.maps, map] });
  selectEditorMap(map.id);
  return map.id;
}

export function duplicateEditorMap(id: string) {
  const map = useConfigStore.getState().maps.find((item) => item.id === id);
  if (!map) return;
  selectEditorMap(id);
  return createMap(`${map.name} (Copy)`, "duplicate");
}

export function deleteEditorMap(id: string) {
  flushMaps();
  const state = useConfigStore.getState();
  const index = state.maps.findIndex((map) => map.id === id);
  if (index < 0) throw new Error("The map no longer exists.");
  const deleted = clone(state.maps[index]);
  const wasActive = state.activeMapId === id;
  const remaining = state.maps.filter((map) => map.id !== id);
  useConfigStore.setState({
    maps: remaining,
    ...(wasActive
      ? {
          activeMapId: remaining[0]?.id ?? null,
          draftSettings: clone(
            remaining[0]?.settings ?? DeviceSettingsSchema.parse({}),
          ),
        }
      : {}),
  });
  return () => {
    const current = useConfigStore.getState();
    if (current.maps.some((map) => map.id === id)) return;
    const maps = [...current.maps];
    maps.splice(Math.min(index, maps.length), 0, deleted);
    useConfigStore.setState({ maps });
    if (wasActive) selectEditorMap(id);
  };
}

export function reorderMaps(ids: string[]) {
  flushMaps();
  const maps = useConfigStore.getState().maps;
  if (
    ids.length !== maps.length ||
    new Set(ids).size !== maps.length ||
    ids.some((id) => !maps.some((map) => map.id === id))
  )
    throw new Error("Invalid map order.");
  useConfigStore.setState({
    maps: ids.map((id) => maps.find((map) => map.id === id)!),
  });
}

export function replaceMaps(maps: SettingsMap[]) {
  validateMaps(maps);
  timers.forEach(clearTimeout);
  timers.clear();
  useMapSession.setState({
    drafts: {},
    histories: {},
    saveStatus: {},
    saveError: null,
    splitAxes: {},
  });
  useConfigStore.setState({
    maps: clone(maps),
    activeMapId: maps[0]?.id ?? null,
    draftSettings: clone(maps[0]?.settings ?? DeviceSettingsSchema.parse({})),
  });
  if (maps[0]) selectEditorMap(maps[0].id);
}

let revision = 0;
function publishCommit(
  id: string,
  before: DeviceSettings,
  after: DeviceSettings,
) {
  const keys = (Object.keys(after) as (keyof DeviceSettings)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  // Stage colors are map metadata on ZERO EX; editing them must not apply DPI.
  const deviceKeys = keys.filter(
    (key) =>
      key !== "dpiStages" ||
      JSON.stringify(before.dpiStages.map(({ xDpi, yDpi }) => [xDpi, yDpi])) !==
        JSON.stringify(after.dpiStages.map(({ xDpi, yDpi }) => [xDpi, yDpi])),
  );
  if (deviceKeys.length)
    useMapSession.setState({
      commit: { id, keys: deviceKeys, revision: ++revision },
    });
}

/** Restore acknowledged values without creating another hardware commit. */
export function restoreMapValues(id: string, values: Partial<DeviceSettings>) {
  const map =
    useMapSession.getState().drafts[id] ??
    useConfigStore.getState().maps.find((item) => item.id === id);
  if (map)
    stageMap({
      ...clone(map),
      settings: DeviceSettingsSchema.parse({ ...map.settings, ...values }),
      updatedAt: Date.now(),
    });
}
