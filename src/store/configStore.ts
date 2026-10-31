import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DeviceInfo,
  DeviceSettings,
  DeviceSettingsSchema,
  SettingsMap,
  DeviceDefinition,
} from "../types/schema";
import { hidClient } from "../hid/hidClient";
import { parseMapFile } from "../features/maps/mapFiles";

const DEFAULT_SETTINGS: DeviceSettings = DeviceSettingsSchema.parse({});

const DEFAULT_MAPS: SettingsMap[] = [
  {
    id: "map-comp-8k",
    name: "Competitive 8K",
    color: "#FF6A1A", // ATK Orange
    icon: "Zap",
    note: "Ultra-low latency 8000Hz, 1ms debounce, Motion Sync ON for esports",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      ...DEFAULT_SETTINGS,
      pollingRate: 8000,
      lod: 1.0,
      keyDebounce: 1,
      motionSync: true,
      rippleControl: false,
      angleSnapping: false,
    },
  },
  {
    id: "map-balanced-4k",
    name: "Balanced 4K",
    color: "#FF9A4D", // Ember Amber
    icon: "Crosshair",
    note: "Smooth tracking 4000Hz, Motion Sync ON, optimal battery/performance",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      ...DEFAULT_SETTINGS,
      pollingRate: 4000,
      lod: 1.0,
      keyDebounce: 2,
      motionSync: true,
      rippleControl: false,
    },
  },
  {
    id: "map-battery-1k",
    name: "Desktop & Battery 1K",
    color: "#10b981", // Emerald
    icon: "BatteryCharging",
    note: "Max battery life 1000Hz, Motion Sync OFF, sleep after 60s",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      ...DEFAULT_SETTINGS,
      pollingRate: 1000,
      lod: 1.0,
      keyDebounce: 4,
      motionSync: false,
      sleepTime: 60,
    },
  },
  {
    id: "map-sniper",
    name: "Tactical Precision",
    color: "#E25822", // Flame
    icon: "Shield",
    note: "Low lift-off 0.7mm, angle snapping enabled for crosshair alignment",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      ...DEFAULT_SETTINGS,
      pollingRate: 1000,
      lod: 0.7,
      keyDebounce: 2,
      motionSync: true,
      angleSnapping: true,
    },
  },
];

interface ConfigState {
  deviceInfo: DeviceInfo;
  activeSettings: DeviceSettings;
  draftSettings: DeviceSettings;
  previousSettings: DeviceSettings | null; // For Undo
  maps: SettingsMap[];
  activeMapId: string | null;
  isApplying: boolean;
  lastToast: {
    message: string;
    type: "success" | "error" | "info";
    canUndo?: boolean;
  } | null;
  selectedDevice: DeviceDefinition | null;

  // Actions
  setSelectedDevice: (device: DeviceDefinition | null) => void;
  setToast: (toast: ConfigState["lastToast"]) => void;
  clearToast: () => void;
  connectHardware: () => Promise<void>;
  connectMock: (
    cid?: number,
    mid?: number,
    model?: DeviceDefinition,
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  updateDraft: <K extends keyof DeviceSettings>(
    key: K,
    value: DeviceSettings[K],
  ) => void;
  setDraftSettings: (settings: DeviceSettings) => void;
  applyDraftToDevice: () => Promise<void>;
  applyMap: (mapId: string) => Promise<void>;
  saveCurrentAsMap: (
    name: string,
    color?: string,
    icon?: string,
    note?: string,
  ) => string;
  updateMap: (mapId: string, updates: Partial<SettingsMap>) => void;
  deleteMap: (mapId: string) => void;
  duplicateMap: (mapId: string) => string;
  revertToActiveMap: () => void;
  undoApply: () => Promise<void>;
  exportMapsJson: () => string;
  importMapsJson: (json: string) => boolean;
}

export const useConfigStore = create<ConfigState>()(
  persist<ConfigState, [], [], Pick<ConfigState, "maps" | "activeMapId">>(
    (set, get) => {
      // Wire up hardware status listener
      hidClient.onStatusChange = (info) => {
        set({ deviceInfo: info });
      };

      return {
        deviceInfo: hidClient.getDeviceInfo(),
        activeSettings: DEFAULT_SETTINGS,
        draftSettings: DEFAULT_SETTINGS,
        previousSettings: null,
        maps: DEFAULT_MAPS,
        activeMapId: "map-comp-8k",
        isApplying: false,
        lastToast: null,
        selectedDevice: null,

        setSelectedDevice: (device) => set({ selectedDevice: device }),
        setToast: (toast) => set({ lastToast: toast }),
        clearToast: () => set({ lastToast: null }),

        connectHardware: async () => {
          try {
            const info = await hidClient.connectHardware();
            const read = await hidClient.readDeviceSettings();
            const merged = DeviceSettingsSchema.parse({
              ...get().draftSettings,
              ...read,
            });
            set({
              deviceInfo: info,
              activeSettings: merged,
              draftSettings: merged,
              lastToast: {
                message: `Connected to ${info.name}`,
                type: "success",
              },
            });
          } catch (err) {
            set({
              lastToast: {
                message: (err instanceof Error ? err.message : "Unknown error") || "Connection failed",
                type: "error",
              },
            });
          }
        },

        connectMock: async (
          cid = 1,
          mid = 4,
          model?: DeviceDefinition,
        ) => {
          try {
            const info = await hidClient.connectMock(cid, mid, model);
            const read = await hidClient.readDeviceSettings();
            const merged = DeviceSettingsSchema.parse({
              ...get().draftSettings,
              ...read,
            });
            set({
              deviceInfo: info,
              selectedDevice: model ?? null,
              activeSettings: merged,
              draftSettings: merged,
              lastToast: {
                message: `Connected: ${info.name}`,
                type: "success",
              },
            });
          } catch (err) {
            set({
              lastToast: {
                message: (err instanceof Error ? err.message : "Unknown error") || "Mock failed",
                type: "error",
              },
            });
          }
        },

        disconnect: async () => {
          await hidClient.disconnect();
          set({
            deviceInfo: hidClient.getDeviceInfo(),
            lastToast: { message: "Device disconnected", type: "info" },
          });
        },

        updateDraft: (key, value) => {
          const current = get().draftSettings;
          const updated = { ...current, [key]: value };
          set({ draftSettings: updated });
        },

        setDraftSettings: (settings) => {
          set({ draftSettings: settings });
        },

        applyDraftToDevice: async () => {
          const { draftSettings, activeSettings, deviceInfo } = get();
          if (!deviceInfo.connected) {
            set({
              lastToast: {
                message: "Cannot apply: Device not connected",
                type: "error",
              },
            });
            return;
          }

          set({ isApplying: true });
          try {
            await hidClient.applySettings(draftSettings, activeSettings);
            set({
              previousSettings: activeSettings,
              activeSettings: { ...draftSettings },
              isApplying: false,
              lastToast: {
                message: "Settings successfully applied to device",
                type: "success",
                canUndo: true,
              },
            });
          } catch (err) {
            set({
              isApplying: false,
              lastToast: {
                message: `Apply failed: ${(err instanceof Error ? err.message : "Unknown error")}`,
                type: "error",
              },
            });
          }
        },

        applyMap: async (mapId: string) => {
          const { maps, deviceInfo, activeSettings } = get();
          const target = maps.find((m) => m.id === mapId);
          if (!target) return;

          set({
            activeMapId: mapId,
            draftSettings: { ...target.settings },
          });

          if (deviceInfo.connected) {
            set({ isApplying: true });
            try {
              await hidClient.applySettings(target.settings, activeSettings);
              set({
                previousSettings: activeSettings,
                activeSettings: { ...target.settings },
                isApplying: false,
                lastToast: {
                  message: `Map "${target.name}" applied to device!`,
                  type: "success",
                  canUndo: true,
                },
              });
            } catch (err) {
              set({
                isApplying: false,
                lastToast: {
                  message: `Apply failed: ${(err instanceof Error ? err.message : "Unknown error")}`,
                  type: "error",
                },
              });
            }
          } else {
            set({
              lastToast: {
                message: `Map "${target.name}" selected (Device offline)`,
                type: "info",
              },
            });
          }
        },

        saveCurrentAsMap: (
          name,
          color = "#FF6A1A",
          icon = "Bookmark",
          note = "",
        ) => {
          const id = `map-${Date.now()}`;
          const newMap: SettingsMap = {
            id,
            name,
            color,
            icon,
            note,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            settings: { ...get().draftSettings },
          };
          set((state) => ({
            maps: [...state.maps, newMap],
            activeMapId: id,
            lastToast: { message: `Saved map "${name}"`, type: "success" },
          }));
          return id;
        },

        updateMap: (mapId, updates) => {
          set((state) => ({
            maps: state.maps.map((m) =>
              m.id === mapId ? { ...m, ...updates, updatedAt: Date.now() } : m,
            ),
            lastToast: { message: "Map updated", type: "success" },
          }));
        },

        deleteMap: (mapId) => {
          set((state) => {
            const remaining = state.maps.filter((m) => m.id !== mapId);
            return {
              maps: remaining,
              activeMapId:
                state.activeMapId === mapId
                  ? (remaining[0]?.id ?? null)
                  : state.activeMapId,
              lastToast: { message: "Map deleted", type: "info" },
            };
          });
        },

        duplicateMap: (mapId) => {
          const { maps } = get();
          const orig = maps.find((m) => m.id === mapId);
          if (!orig) return "";
          const newId = `map-${Date.now()}`;
          const dup: SettingsMap = {
            ...orig,
            id: newId,
            name: `${orig.name} (Copy)`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          set((state) => ({
            maps: [...state.maps, dup],
            activeMapId: newId,
            lastToast: {
              message: `Duplicated "${orig.name}"`,
              type: "success",
            },
          }));
          return newId;
        },

        revertToActiveMap: () => {
          const { activeMapId, maps } = get();
          const current = maps.find((m) => m.id === activeMapId);
          if (current) {
            set({
              draftSettings: { ...current.settings },
              lastToast: { message: "Reverted to map defaults", type: "info" },
            });
          }
        },

        undoApply: async () => {
          const { previousSettings, deviceInfo } = get();
          if (!previousSettings || !deviceInfo.connected) return;

          set({ isApplying: true });
          try {
            await hidClient.applySettings(previousSettings);
            set({
              activeSettings: { ...previousSettings },
              draftSettings: { ...previousSettings },
              previousSettings: null,
              isApplying: false,
              lastToast: {
                message: "Undone! Reverted device to previous state",
                type: "success",
              },
            });
          } catch (err) {
            set({
              isApplying: false,
              lastToast: {
                message: `Undo failed: ${(err instanceof Error ? err.message : "Unknown error")}`,
                type: "error",
              },
            });
          }
        },

        exportMapsJson: () => {
          const { maps } = get();
          return JSON.stringify(maps, null, 2);
        },

        importMapsJson: (json: string) => {
          try {
            const parsed = parseMapFile(json);
            set({
              maps: parsed,
              activeMapId: parsed[0]?.id || null,
              lastToast: {
                message: `Imported ${parsed.length} maps successfully`,
                type: "success",
              },
            });
            return true;
          } catch (e) {
            set({
              lastToast: {
                message: `Failed to import: ${(e instanceof Error ? e.message : "") || "Invalid JSON"}`,
                type: "error",
              },
            });
            return false;
          }
        },
      };
    },
    {
      name: "atk-webhid-config-storage",
      storage: createJSONStorage<Pick<ConfigState, "maps" | "activeMapId">>(() =>
        typeof window !== "undefined"
          ? localStorage
          : ({
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }),
      ),
      partialize: (state) => ({
        maps: state.maps,
        activeMapId: state.activeMapId,
      }),
    },
  ),
);
