import { create } from "zustand";
import { useConfigStore } from "../../store/configStore";
import {
  applySettingsToDevice,
  isAutoReconnecting,
  isKnownDevice,
  isMouseSessionVerified,
  useDeviceSession,
} from "../../features/device/deviceSession";
import {
  clone,
  getEditorMap,
  restoreMapValues,
  useMapSession,
} from "../../features/maps/mapSession";
import type { DeviceSettings } from "../../types/schema";
import { errorMessage } from "../errorMessage";

type Key = keyof DeviceSettings;
type Pending = { id: string; values: Partial<DeviceSettings> };
interface LiveState {
  status: "live" | "saving" | "saved" | "error";
  reason: string;
  reconnect: boolean;
  retry: (() => void) | null;
}
export const useLiveApply = create<LiveState>(() => ({
  status: "live",
  reason: "",
  reconnect: false,
  retry: null,
}));

let dismissedForCurrentConnection = false;

export function dismissApplyBanner() {
  dismissedForCurrentConnection = true;
  useLiveApply.setState({ reconnect: false });
}

export function resetDismissedBanners() {
  dismissedForCurrentConnection = false;
}

export function liveBlockReason() {
  const store = useConfigStore.getState();
  if (!store.deviceInfo.connected)
    return "Not connected: saved to this map only";
  if (!isKnownDevice() || !isMouseSessionVerified()) return "Read-only device";
  if (useDeviceSession.getState().busy || store.isApplying)
    return "Device busy: saved to this map only";
  return "";
}

/** Commit scheduler only. All diffs, packets and verification stay in deviceSession. */
export function startLiveApply() {
  let pending: Pending | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  let connection = connectionKey();
  function connectionKey() {
    const info = useConfigStore.getState().deviceInfo;
    return `${info.connected}:${info.isMock}:${info.productId}:${info.serial}`;
  }
  function queued(): Pending | undefined {
    return pending;
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 300);
  }
  function enqueue(id: string, values: Partial<DeviceSettings>) {
    if (pending?.id !== id) pending = { id, values: {} };
    Object.assign(pending.values, values);
    useLiveApply.setState({ status: "saving", reason: "", retry: null });
    schedule();
  }
  async function flush() {
    if (running || !pending || stopped) return;
    const batch = pending;
    pending = undefined;
    const blocked = liveBlockReason();
    if (blocked || batch.id !== useConfigStore.getState().activeMapId) {
      useLiveApply.setState({ status: "live", reason: blocked });
      return;
    }
    const target = {
      ...clone(useConfigStore.getState().activeSettings),
      ...clone(batch.values),
    };
    const keys = Object.keys(batch.values) as Key[];
    if (
      keys.every(
        (key) =>
          JSON.stringify(target[key]) ===
          JSON.stringify(useConfigStore.getState().activeSettings[key]),
      )
    ) {
      useLiveApply.setState({ status: "live" });
      return;
    }
    running = true;
    const batchConnection = connection;
    try {
      const skipped = await applySettingsToDevice(target);
      if (stopped || connection !== batchConnection) return;
      if (skipped.length) throw new Error(skipped.join(" · "));
      useLiveApply.setState({ status: "saved", reason: "", retry: null });
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        if (!pending && !running) useLiveApply.setState({ status: "live" });
      }, 2000);
    } catch (error) {
      if (stopped || connection !== batchConnection) return;
      const acknowledged = useConfigStore.getState().activeSettings;
      const rollback: Partial<DeviceSettings> = {};
      for (const key of keys) {
        Object.assign(rollback, { [key]: clone(acknowledged[key]) });
        // A newer edit to a failed field must not silently retry it.
        const next = queued();
        if (next?.id === batch.id) delete next.values[key];
      }
      restoreMapValues(batch.id, rollback);
      useLiveApply.setState({
        status: "error",
        reason: errorMessage(error),
        retry: () => {
          if (liveBlockReason() || getEditorMap()?.id !== batch.id) return;
          restoreMapValues(batch.id, batch.values);
          enqueue(batch.id, batch.values);
        },
      });
    } finally {
      running = false;
      if (queued() && Object.keys(queued()!.values).length && !stopped)
        schedule();
      else pending = undefined;
    }
  }
  const unsubscribeMaps = useMapSession.subscribe((state, previous) => {
    if (!state.commit || state.commit === previous.commit) return;
    const { id, keys } = state.commit;
    const map = getEditorMap();
    if (!map || map.id !== id) return;
    const liveKeys = keys.filter((key) => key !== "buttons");
    if (!liveKeys.length) return;
    const blocked = liveBlockReason();
    if (blocked && !(running && blocked.startsWith("Device busy"))) {
      useLiveApply.setState({ status: "live", reason: blocked });
      return;
    }
    const values: Partial<DeviceSettings> = {};
    for (const key of liveKeys)
      Object.assign(values, { [key]: clone(map.settings[key]) });
    enqueue(id, values);
  });
  const unsubscribeStore = useConfigStore.subscribe((state, previous) => {
    if (connectionKey() !== connection) {
      const wasConnected = previous ? previous.deviceInfo.connected : false;
      const isNowConnected = state.deviceInfo.connected;
      const wasMock = previous ? previous.deviceInfo.isMock : false;
      const isMock = state.deviceInfo.isMock;
      const isMockSwitch = wasConnected && isNowConnected && wasMock && isMock;

      if (!wasConnected && isNowConnected) {
        dismissedForCurrentConnection = false;
      }

      connection = connectionKey();
      pending = undefined;
      clearTimeout(timer);
      const isAuto = isAutoReconnecting();
      const isTestEnv =
        typeof process !== "undefined" && Boolean(process.env.VITEST);
      const shouldPrompt =
        !isAuto &&
        !wasConnected &&
        isNowConnected &&
        !isMockSwitch &&
        !dismissedForCurrentConnection &&
        (!isMock || isTestEnv);

      useLiveApply.setState({
        status: "live",
        reason: "",
        retry: null,
        reconnect: shouldPrompt,
      });
    }
    if (state.activeMapId !== previous.activeMapId) {
      pending = undefined;
      clearTimeout(timer);
      useLiveApply.setState({
        status: "live",
        reason: "",
        retry: null,
        reconnect: false,
      });
    }
  });
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(savedTimer);
    unsubscribeMaps();
    unsubscribeStore();
  };
}
