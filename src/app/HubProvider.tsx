import { isMouseSessionVerified } from "../features/device/deviceSession";
import { errorMessage } from "../ui/errorMessage";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConfigStore } from "../store/configStore";
import type { DeviceSettings, SettingsMap } from "../types/schema";
import { Dialog, useToast } from "../ui";
import { mapHref, resolveMapHash, type FeatureId } from "./navigation";
import {
  applySettingsToDevice,
  buildApplyPlan,
  connectDevice,
  deviceOperation,
  disconnectDevice,
  initializeDevice,
  isKnownDevice,
  refreshDevice,
  useDeviceSession,
} from "../features/device/deviceSession";
import {
  clone,
  flushMaps,
  getEditorMap,
  replaceMaps,
  selectEditorMap,
  useMapSession,
} from "../features/maps/mapSession";
import { downloadMaps, parseMapFile } from "../features/maps/mapFiles";
import { settingsDiff } from "../features/maps/MapDiff";

interface HubContextValue {
  feature: FeatureId;
  setFeature: (feature: FeatureId) => void;
  map: SettingsMap | undefined;
  settings: DeviceSettings;
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  newMapOpen: boolean;
  setNewMapOpen: (open: boolean) => void;
  generic: boolean;
  selectMap: (id: string, apply?: boolean) => Promise<void>;
  apply: (customTitle?: string) => Promise<void>;
  undoApply: () => Promise<void>;
  connect: (mock?: boolean, cid?: number, mid?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  readDevice: () => Promise<void>;
  importFile: (file: File) => Promise<void>;
  exportMaps: () => void;
  openImport: () => void;
  run: (
    action: () => void | Promise<unknown>,
    success?: string,
  ) => Promise<void>;
}
const HubContext = createContext<HubContextValue | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const store = useConfigStore();
  const session = useMapSession();

  const { toast } = useToast();
  const [feature, setFeature] = useState<FeatureId>("sensitivity");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [importCandidate, setImportCandidate] = useState<SettingsMap[] | null>(
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const handledEditTime = useRef<number>(0);
  const lastEdit = useMapSession((state) => state.lastEdit);
  const map = store.activeMapId
    ? (session.drafts[store.activeMapId] ??
      store.maps.find((item) => item.id === store.activeMapId))
    : undefined;
  const settings = map?.settings ?? store.draftSettings;
  const generic =
    store.deviceInfo.connected &&
    (!isKnownDevice() || !isMouseSessionVerified());

  async function run(action: () => void | Promise<unknown>, success?: string) {
    try {
      await action();
      if (success) toast({ title: success, tone: "success" });
    } catch (error) {
      toast({ title: errorMessage(error), tone: "error", duration: 0 });
    }
  }
  async function applySnapshot(snapshot: DeviceSettings, customTitle?: string) {
    const before = useConfigStore.getState();
    const diffs = settingsDiff(before.activeSettings, snapshot);
    const plan = buildApplyPlan(
      snapshot,
      before.activeSettings,
      before.deviceInfo.isMock,
      useDeviceSession.getState().readIssues.map((issue) => issue.key),
    );
    const skipped = await applySettingsToDevice(clone(snapshot));
    const noWrites = !before.deviceInfo.isMock && !plan.packets.length;
    const defaultTitle = noWrites
      ? "No verified settings to apply"
      : skipped.length
        ? "Applied supported settings"
        : diffs.length === 1
          ? `${diffs[0].label}: ${diffs[0].after}`
          : diffs.length > 1
            ? `${diffs.length} settings applied (${diffs[0].label}...)`
            : "Settings applied";
    toast({
      title: customTitle ?? defaultTitle,
      tone: noWrites ? "info" : "success",
      message: skipped.length ? skipped.join(" · ") : undefined,
      action: noWrites
        ? undefined
        : {
            label: "Undo last apply",
            onClick: async () => {
              const previous = useConfigStore.getState().previousSettings;
              if (previous) await applySettingsToDevice(previous, true);
            },
          },
    });
  }
  async function selectMap(id: string, apply = true) {
    if (useDeviceSession.getState().busy) return;
    selectEditorMap(id);
    const selected = getEditorMap();
    if (
      apply &&
      selected &&
      useConfigStore.getState().deviceInfo.connected &&
      isKnownDevice()
    )
      await run(() => applySnapshot(selected.settings));
  }
  async function apply(customTitle?: string) {
    flushMaps();
    const current = getEditorMap();
    if (current) await run(() => applySnapshot(current.settings, customTitle));
  }
  async function undoApply() {
    const previous = useConfigStore.getState().previousSettings;
    if (previous)
      await run(
        () => applySettingsToDevice(previous, true),
        "Previous device settings restored",
      );
  }
  async function importFile(file: File) {
    await run(async () => {
      // Refuse before reading a huge file into memory; parseMapFile enforces the same bound on the text.
      if (file.size > 4_000_000) throw new Error("Map file exceeds 4 MB.");
      setImportCandidate(parseMapFile(await file.text()));
    });
  }
  function exportMaps() {
    flushMaps();
    void run(
      () => downloadMaps(useConfigStore.getState().maps),
      "Maps exported",
    );
  }

  useEffect(() => {
    const initial = resolveMapHash(
      window.location.hash,
      useConfigStore.getState().maps,
    );
    const selected =
      initial ??
      useConfigStore
        .getState()
        .maps.find(
          (item) => item.id === useConfigStore.getState().activeMapId,
        ) ??
      useConfigStore.getState().maps[0];
    if (selected) selectEditorMap(selected.id);
    void run(initializeDevice);
    const onHash = () => {
      const target = resolveMapHash(
        window.location.hash,
        useConfigStore.getState().maps,
      );
      if (target) selectEditorMap(target.id);
    };
    const onVisibility = () => {
      if (document.hidden) flushMaps();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("beforeunload", flushMaps);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("beforeunload", flushMaps);
      document.removeEventListener("visibilitychange", onVisibility);
      flushMaps();
    };
  }, []);

  useEffect(() => {
    if (map) window.history.replaceState(null, "", mapHref(map));
  }, [map?.id, map?.name]);
  useEffect(() => {
    if (!lastEdit || lastEdit.time === handledEditTime.current) return;
    if (lastEdit.group === "buttons") {
      handledEditTime.current = lastEdit.time;
      return;
    }
    if (!store.deviceInfo.connected || generic) return;

    const editTime = lastEdit.time;
    const timer = window.setTimeout(async () => {
      if (handledEditTime.current === editTime) return;
      handledEditTime.current = editTime;

      const currentMap = getEditorMap();
      if (!currentMap) return;

      const before = useConfigStore.getState().activeSettings;
      const diffs = settingsDiff(before, currentMap.settings).filter(
        (d) => !d.path.startsWith("buttons"),
      );
      if (!diffs.length) return;

      const targetSettings: DeviceSettings = {
        ...currentMap.settings,
        buttons: clone(before.buttons),
      };

      try {
        await applySettingsToDevice(targetSettings);
        const title =
          diffs.length === 1
            ? `${diffs[0].label}: ${diffs[0].after}`
            : `${diffs[0].label} updated (${diffs.length} settings)`;
        toast({ title, tone: "success", duration: 3000 });
      } catch (error) {
        toast({ title: errorMessage(error), tone: "error", duration: 4000 });
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [lastEdit, store.deviceInfo.connected, generic]);

  return (
    <HubContext.Provider
      value={{
        feature,
        setFeature,
        map,
        settings,
        railCollapsed,
        setRailCollapsed,
        sheetOpen,
        setSheetOpen,
        paletteOpen,
        setPaletteOpen,
        newMapOpen,
        setNewMapOpen,
        generic,
        selectMap,
        apply,
        undoApply,
        connect: (mock = false, cid = 1, mid = 4) =>
          run(
            () => connectDevice(mock, cid, mid),
            mock ? "Mock device connected" : "Device connected",
          ),
        disconnect: () => run(disconnectDevice, "Device disconnected"),
        readDevice: () =>
          run(
            () => deviceOperation(() => refreshDevice()),
            "Device settings refreshed; map unchanged",
          ),
        importFile,
        exportMaps,
        openImport: () => fileInput.current?.click(),
        run,
      }}
    >
      {children}
      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Import maps JSON"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importFile(file);
          event.currentTarget.value = "";
        }}
      />
      <Dialog
        open={importCandidate !== null}
        onClose={() => setImportCandidate(null)}
        title="Import maps"
        description={`Replace the current map library with ${importCandidate?.length ?? 0} validated maps?`}
        confirmLabel="Replace maps"
        onConfirm={() => {
          if (importCandidate) {
            replaceMaps(importCandidate);
            setImportCandidate(null);
            toast({ title: "Maps imported", tone: "success" });
          }
        }}
      >
        <ul className="import-map-list">
          {importCandidate?.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      </Dialog>
    </HubContext.Provider>
  );
}

export function useHub() {
  const context = useContext(HubContext);
  if (!context) throw new Error("useHub must be used inside HubProvider.");
  return context;
}
