import { DeviceDiagnostics } from "../../hid/diagnostics";
import { createElement } from "react";
import { KeyboardSaveContext } from "./SaveStatus";
import type { KeyboardReceipt } from "./liveApply";
import { verifiedKeyboardProfile } from "../../devices/keyboardProtocols";
import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import type { DeviceDefinition } from "../../types/schema";
import {
  KeyboardSettingsSchema,
  createKeyboardSettings,
  type KeyboardSettings,
} from "../../devices/keyboardSettings";
import { KeyboardMock } from "../../mock/keyboardDevice";
import {
  KeyboardClient,
  keyboardSession,
  type KeyboardReadScope,
  type KeyboardSnapshot,
} from "../../hid/keyboardClient";
import { keyboardAdapter } from "../../protocol/keyboardAdapters";
import {
  KeyboardBackupSchema,
  useKeyboardStore,
} from "../../store/keyboardStore";
import { Dialog, useToast } from "../index";
import { applyColorwayHex } from "../colorPalette";
import { selectedColorIndex, useDeviceColorway } from "../deviceColorway";
import { createKeyboardLiveApply, type KeyboardLiveState } from "./liveApply";
import { KeyboardView } from "../../hub/keyboard/KeyboardView";
import { layoutFor } from "../../devices/keyboardLayouts";
import { adoptRead } from "./adoptRead";


// What each untested write tier sends (see src/protocol/keyboards/bityuanWrites.ts and keyboardWrites.ts).
const UNTESTED_SCOPE: Record<string, string> = {
  BITYUAN: "Options, polling, dead zones, lighting, travel, rapid trigger, key assignments and per-key colours are sent",
  HFD: "Options, polling, key assignments and per-key colours are sent; lighting stays local",
  DUCKBREAD: "The same settings as the verified ATK68 V2 Pro writer are sent (both use the same source controller)",
  "13": "Polling, Win lock, WASD swap, Mac mode and key assignments are sent; lighting and travel stay local",
};

export function KeyboardWorkspace({
  device,
  initialColor,
  initialMock,
}: {
  device: DeviceDefinition;
  initialColor: number;
  initialMock: boolean;
}) {
  const store = useKeyboardStore(),
    map = store.maps.find((m) => m.id === store.activeId)!,
    settings = map.settings;
  const triggerKeys = [0];
  const triggerScope = "key" as "key" | "all";
  const [tab, setTab] = useState("keys"),
    [selected, setSelected] = useState(0),
    [layer, setLayer] = useState(0);
  const colors = useDeviceColorway((s) => s.colors);
  const color = selectedColorIndex(device, colors, initialColor);
  const setColor = (index: number) => useDeviceColorway.getState().select(device, index);
  useLayoutEffect(() => {
    if (
      tab === "trigger" &&
      triggerScope === "key" &&
      triggerKeys.length &&
      !triggerKeys.includes(selected)
    )
      setSelected(triggerKeys[0]);
    const content = document.querySelector<HTMLElement>(".keyboard-scroll");
    if (
      window.matchMedia("(max-width: 1100px)").matches &&
      tab !== "keys" &&
      tab !== "trigger"
    ) {
      document
        .getElementById("keyboard-controls")
        ?.scrollIntoView({ block: "start", inline: "nearest" });
    } else if (content) content.scrollTop = 0;
  }, [tab]);
  const retained = initialMock ? null : keyboardSession(device);
  const cached = retained?.connected ? retained.lastSnapshot : null;
  const [mode, setMode] = useState<"offline" | "mock" | "hardware">(
    initialMock ? "mock" : cached ? "hardware" : "offline",
  );
  const [cachedRefreshing, setCachedRefreshing] = useState(false);
  const [backgroundReading, setBackgroundReading] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    // Quick reads (cached or small tabs) would only flash the notice; show it once a read runs long.
    [slowRead, setSlowRead] = useState(false),
    [firmware, setFirmware] = useState(cached?.firmware ?? "");
  const [, setObserved] = useState<KeyboardSettings | null>(
      cached?.settings ?? null,
    ),
    [calibrating, setCalibrating] = useState(false);
  const [, setUnreadFields] = useState<(keyof KeyboardSettings)[]>(
    cached?.unreadFields ?? [],
  );
  const [, setReadWarnings] = useState<string[]>(
    cached?.warnings ?? [],
  );
  const [confirm, setConfirm] = useState<
      "delete" | "calibrate" | "defaults" | null
    >(null),
    [importValue, setImportValue] = useState<unknown>(null);
  const [emptyDiagnostics] = useState(() => new DeviceDiagnostics("keyboard"));
  const diagnostics = useRef(retained?.diagnostics ?? emptyDiagnostics);
  const client = useRef<KeyboardClient | null>(retained),
    mock = useRef<KeyboardMock | null>(null),
    file = useRef<HTMLInputElement>(null),
    mounted = useRef(true);
  const reading = useRef(false),
    loadedTabs = useRef(new Set<string>());
  useEffect(() => {
    if (!busy) return setSlowRead(false);
    const timer = setTimeout(() => setSlowRead(true), 500);
    return () => clearTimeout(timer);
  }, [busy]);
  const { toast } = useToast();
  const finish = device.colorways?.[color];
  const hardwareVerified = useMemo(() => {
    try {
      const adapter = keyboardAdapter(device);
      if (!adapter) return false;
      adapter.validateRead(adapter.readFrame("version"), device);
      return true;
    } catch {
      return false;
    }
  }, [device]);
  const writeVerified = !!verifiedKeyboardProfile(device)?.keySettings;
  const untestedWrites = useMemo(() => {
    const profile = verifiedKeyboardProfile(device);
    return !!profile && "untestedWrites" in profile && !!profile.untestedWrites;
  }, [device]);
  // Live apply runs for verified writers and the opt-in untested tier (consent asked on the first write).
  const canWrite = writeVerified || untestedWrites;
  const [receipts, setReceipts] = useState<Record<string, KeyboardReceipt>>({});
  const [writeDialog, setWriteDialog] = useState(false);
  const consentRequest = useRef<((allowed: boolean) => void) | null>(null);
  function requestWrites() {
    if (client.current?.writesConfirmed) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      consentRequest.current = resolve;
      setWriteDialog(true);
    });
  }
  function finishConsent(allow: boolean) {
    if (allow && client.current?.connected) client.current.confirmWrites();
    consentRequest.current?.(allow);
    consentRequest.current = null;
    setWriteDialog(false);
  }
  const [liveState, setLiveState] = useState<KeyboardLiveState>({
    status: "ready",
    message: "New edits apply automatically",
  });
  const live = useRef<ReturnType<typeof createKeyboardLiveApply> | null>(null);
  const liveContext = useRef({
    client: client.current,
    mapId: map.id,
    enabled: false,
    busy: false,
    dragging: false,
  });
  liveContext.current = {
    client: client.current,
    mapId: map.id,
    enabled: mode === "hardware" && canWrite,
    busy: busy || reading.current,
    dragging: false,
  };
  useEffect(() => {
    const scheduler = createKeyboardLiveApply({
      context: () => ({
        ...liveContext.current,
        dragging: !!document.querySelector(
          '.keyboard-workspace [data-dragging="true"]',
        ),
      }),
      state: setLiveState,
      snapshot: (snapshot) => {
        present(snapshot);
        loadedTabs.current.clear();
        loadedTabs.current.add("base:0");
      },
      running: setBusy,
      authorize: requestWrites,
      receipts: (updates) =>
        setReceipts((current) => ({ ...current, ...updates })),
    });
    live.current = scheduler;
    return () => {
      scheduler.stop();
      live.current = null;
    };
  }, []);
  useEffect(() => {
    live.current?.cancel();
    setReceipts({});
    setWriteDialog(false);
    return () => {
      consentRequest.current?.(false);
      consentRequest.current = null;
    };
  }, [map.id, mode]);
  useLayoutEffect(() => {
    applyColorwayHex(finish?.hex ?? "#000000");
  }, [finish?.hex]);
  function report(error: unknown) {
    toast({
      title: error instanceof Error ? error.message : String(error),
      tone: "error",
    });
  }
  function edit(update: (draft: KeyboardSettings) => void) {
    try {
      const current = useKeyboardStore.getState();
      const previous = current.maps.find(
        (item) => item.id === current.activeId,
      )!.settings;
      const next = structuredClone(previous);
      update(next);
      const parsed = KeyboardSettingsSchema.parse(next);
      store.edit(parsed);
      live.current?.enqueue(previous, parsed);
    } catch (error) {
      report(error);
    }
  }
  function history(direction: "undo" | "redo") {
    const previous = useKeyboardStore
      .getState()
      .maps.find(
        (item) => item.id === useKeyboardStore.getState().activeId,
      )!.settings;
    useKeyboardStore.getState()[direction]();
    const current = useKeyboardStore.getState();
    live.current?.enqueue(
      previous,
      current.maps.find((item) => item.id === current.activeId)!.settings,
    );
  }
  useEffect(() => {
    mounted.current = true;
    const retainedClient = client.current;
    if (retainedClient)
      retainedClient.onDisconnect = () => {
        setMode("offline");
        setCachedRefreshing(false);
        setObserved(null);
        setBusy(false);
      };
    if (!initialMock && cached) void connect(true);
    if (!initialMock && !cached && navigator.hid && hardwareVerified) {
      void navigator.hid
        .getDevices()
        .then((devices) => {
          if (
            mounted.current &&
            devices.some(
              (d) =>
                d.vendorId === Number(device.VID) &&
                d.productId === Number(device.PID),
            )
          )
            void connect(true);
        })
        .catch(report);
    }
    return () => {
      mounted.current = false;
      if (client.current) client.current.onDisconnect = undefined;
    };
  }, []);
  useEffect(() => {
    if (mode !== "mock") return;
    try {
      mock.current ??= new KeyboardMock(device);
      setObserved(mock.current.apply(settings, { supportedOnly: true }));
    } catch (error) {
      report(error);
    }
  }, [mode, settings, device]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          "input,textarea,select,[contenteditable=true],.keyboard-recording,.hk-recorder,[role=dialog],[role=listbox],[role=menu],[role=combobox]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        history(e.shiftKey ? "redo" : "undo");
      }
      if (!e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const next = store.maps.filter((map) => map.layout === layoutFor(device).key)[+e.key - 1];
        if (next) {
          e.preventDefault();
          store.select(next.id);
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [store]);

  // As in the original hub, a fresh hardware read is what the editor shows: verified fields replace the
  // active map's values (matched by matrix position) as one undoable step. No writes are queued.
  function adopt(snapshot: KeyboardSnapshot) {
    const state = useKeyboardStore.getState();
    const map = state.maps.find((m) => m.id === state.activeId);
    if (!map || map.layout !== layoutFor(device).key) return;
    const s = adoptRead(map.settings, snapshot);
    try {
      state.edit(KeyboardSettingsSchema.parse(s));
    } catch (error) {
      report(error);
    }
  }
  function present(snapshot: KeyboardSnapshot) {
    setObserved(snapshot.settings);
    setUnreadFields(snapshot.unreadFields);
    setReadWarnings(snapshot.warnings);
    setFirmware(snapshot.firmware);
  }
  async function connect(authorizedOnly = false) {
    if (reading.current) return;
    live.current?.cancel();
    reading.current = true;
    loadedTabs.current.clear();
    setBusy(true);
    setProgress(0);
    const next = keyboardSession(device);
    client.current = next;
    diagnostics.current = next.diagnostics;
    next.onDisconnect = () => {
      if (mounted.current) {
        setMode("offline");
        setCachedRefreshing(false);
        setObserved(null);
        setBusy(false);
      }
    };
    try {
      await next.connect(authorizedOnly);
      if (!mounted.current || !next.connected) return;
      setMode("hardware");
      const previous = next.cachedSnapshot;
      setCachedRefreshing(!!previous);
      if (previous)
        present({
          ...previous,
          unreadFields: ["options", "pollingRate", "deadZone", "light", "keys"],
        });
      const snapshot = await next.snapshot(
        (value) => {
          if (mounted.current) setProgress(value);
        },
        { scope: "base" },
      );
      if (!mounted.current) return;
      setCachedRefreshing(false);
      adopt(snapshot);
      setObserved(snapshot.settings);
      setUnreadFields(snapshot.unreadFields);
      setReadWarnings(snapshot.warnings);
      setFirmware(snapshot.firmware);
      setMode("hardware");
    } catch (error) {
      await next.close();
      if (mounted.current) {
        setMode("offline");
        setCachedRefreshing(false);
        report(error);
      }
    } finally {
      reading.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (
      mode !== "hardware" ||
      busy ||
      reading.current ||
      !client.current?.connected
    )
      return;
    const scope: KeyboardReadScope =
      tab === "trigger"
        ? "trigger"
        : tab === "lighting"
          ? "lighting"
          : tab === "settings"
            ? "base"
            : "keys";
    const key = `${scope}:${scope === "keys" ? layer : 0}`;
    if (loadedTabs.current.has(key)) return;
    loadedTabs.current.add(key);
    reading.current = true;
    setBusy(true);
    setProgress(0);
    const active = client.current;
    void active
      .snapshot(
        (value) => {
          if (mounted.current) setProgress(value);
        },
        { scope, layer, fresh: false },
      )
      .then((snapshot) => {
        if (mounted.current && client.current === active) {
          present(snapshot);
          adopt(snapshot);
        }
      })
      .catch((error) => {
        if (mounted.current) report(error);
      })
      .finally(() => {
        reading.current = false;
        if (mounted.current) setBusy(false);
      });
  }, [mode, busy, tab, layer, backgroundReading]);
  useEffect(() => {
    if (
      mode !== "hardware" ||
      busy ||
      reading.current ||
      !client.current?.connected
    )
      return;
    const jobs: { scope: KeyboardReadScope; layer: number }[] = writeVerified
      ? [
          { scope: "trigger", layer: 0 },
          { scope: "lighting", layer: 0 },
          ...[0, 1, 2, 3].map((layer) => ({ scope: "keys" as const, layer })),
        ]
      : [{ scope: "lighting", layer: 0 }];
    const job = jobs.find(
      ({ scope, layer }) => !loadedTabs.current.has(`${scope}:${layer}`),
    );
    if (!job) return;
    const active = client.current;
    const load = () => {
      if (
        reading.current ||
        !active.connected ||
        client.current !== active ||
        !mounted.current
      )
        return;
      reading.current = true;
      setBackgroundReading(true);
      const key = `${job.scope}:${job.layer}`;
      loadedTabs.current.add(key);
      void active
        .snapshot(() => {}, { ...job, fresh: false })
        .then((snapshot) => {
          if (mounted.current && client.current === active) {
          present(snapshot);
          adopt(snapshot);
        }
        })
        .catch((error) => {
          if (mounted.current && active.connected) report(error);
        })
        .finally(() => {
          reading.current = false;
          if (mounted.current) setBackgroundReading(false);
        });
    };
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if (window.requestIdleCallback)
        idle = window.requestIdleCallback(load, { timeout: 1000 });
      else load();
    }, 200);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [mode, busy, tab, layer, backgroundReading, writeVerified]);
  function exportMaps() {
    const data = KeyboardBackupSchema.parse({
      kind: "atk-keyboard-maps",
      version: 1,
      maps: store.maps,
    });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "atk-keyboard-maps.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return createElement(
    KeyboardSaveContext.Provider,
    {
      value: {
        receipts,
        settings,
        hardware: mode === "hardware" && canWrite,
        mock: mode === "mock",
        retry: () => live.current?.retry(),
      },
    },
    <>
      <KeyboardView
        device={device}
        color={color}
        setColor={setColor}
        settings={settings}
        edit={edit}
        mode={mode}
        busy={busy}
        firmware={firmware}
        notice={
          !hardwareVerified && mode !== "mock"
            ? `Protocol not verified, demo only · ${device.name}`
            : hardwareVerified && !canWrite && mode === "hardware"
              ? "Read-only · edits stay on this computer"
              : cachedRefreshing
                ? "Cached, refreshing · display only"
                : // Background prefetches of other tabs stay silent.
                  busy && slowRead && mode === "hardware"
                  ? `Reading keyboard · ${progress}%`
                  : mode === "hardware" && liveState.status === "error"
                    ? "Save failed · draft kept"
                    : undefined
        }
        layer={layer}
        setLayer={setLayer}
        onSection={(id) =>
          setTab(
            ({ light: "lighting", trigger: "trigger", keys: "keys", advanced: "advanced", macro: "macros" } as Record<string, string>)[id] ?? "settings",
          )
        }
        history={history}
        exportMaps={exportMaps}
        importMaps={() => file.current?.click()}
        resetMap={() => setConfirm("defaults")}
        calibrating={calibrating}
        onCalibrate={() => {
          if (calibrating) {
            mock.current?.finishCalibration();
            setCalibrating(false);
            toast({ title: "Mock calibration completed", tone: "success" });
          } else setConfirm("calibrate");
        }}
      />
      <input
        type="file"
        accept=".json,application/json"
        ref={file}
        hidden
        aria-label="Import keyboard maps"
        onChange={async (e) => {
          const input = e.currentTarget,
            chosen = input.files?.[0];
          input.value = "";
          if (!chosen) return;
          try {
            if (chosen.size > 4_000_000)
              throw new Error("Keyboard backup exceeds 4 MB");
            setImportValue(
              KeyboardBackupSchema.parse(JSON.parse(await chosen.text())),
            );
          } catch (error) {
            report(error);
          }
        }}
      />
      <Dialog
        open={importValue !== null}
        onClose={() => setImportValue(null)}
        title="Import keyboard maps"
        description="Replace your keyboard maps with this validated backup? Mouse maps are unchanged."
        onConfirm={() => {
          store.importMaps(importValue, layoutFor(device).key);
          setImportValue(null);
        }}
        confirmLabel="Replace keyboard maps"
      />
      <Dialog
        open={writeDialog}
        title={untestedWrites ? "Allow untested keyboard writes?" : "Allow keyboard writes?"}
        description={
          untestedWrites
            ? `Writes for ${device.name} follow the original ATK driver's source code but were never tested on this keyboard. A wrong write could change settings stored on it. ${UNTESTED_SCOPE[device.protocolFamily ?? ""] ?? UNTESTED_SCOPE.BITYUAN}, each verified by readback. This lasts until the keyboard disconnects.`
            : "New edits will be sent to this ATK68 connection and verified by readback. Existing maps are not applied automatically. Firmware and unverified actions stay blocked."
        }
        confirmLabel={untestedWrites ? "Allow untested writes" : "Allow writes"}
        onClose={() => finishConsent(false)}
        onConfirm={() => finishConsent(true)}
      />
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === "defaults"
            ? "Reset map draft?"
            : "Start mock calibration?"
        }
        description={
          confirm === "defaults"
            ? `Reset ${map.name} to local defaults, including assignments and macros? Undo restores your draft. This does not send hardware commands.`
            : "This simulates the calibration lifecycle without sending hardware commands."
        }
        onConfirm={() => {
          if (confirm === "defaults") store.edit(createKeyboardSettings(layoutFor(device).rows));
          else {
            mock.current?.startCalibration();
            setCalibrating(true);
          }
          setConfirm(null);
        }}
      />
    </>,
  );
}
