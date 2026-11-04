import { useEffect, useRef, useState } from "react";
import { BatteryFull, Cable, Cpu, Palette, PanelTop, Plus, Wifi, X } from "lucide-react";
import { hidClient } from "../hid/hidClient";
import { mouseEndpointSupportsReal } from "../devices/mouseProtocols";
import { useConfigStore } from "../store/configStore";
import type { DeviceDefinition } from "../types/schema";
import { DEVICE_REGISTRY, displayName } from "../devices/registry";
import { verifiedKeyboardProfile } from "../devices/keyboardProtocols";
import { DevicePreview } from "../ui/DevicePreview";
import { selectedColorIndex, useDeviceColorway } from "../ui/deviceColorway";
import {
  getRememberedDevices,
  saveRememberedDevices,
} from "../ui/keyboard/DeviceSelector";

export type HomeItem = {
  id: string;
  device: DeviceDefinition;
  color: number;
  connected: boolean;
  /** Receiver endpoints resolve to the mouse model behind them, like the original card. */
  model?: DeviceDefinition;
};

// The original demo mode shows exactly these three devices.
const DEMO_NAMES = ["ATK F1 Ultimate 2.0", "ATK RS6", "ATK x QK Hex80"];
export const DEMO_ITEMS: HomeItem[] = DEMO_NAMES.flatMap((name) => {
  const device = DEVICE_REGISTRY.find((d) => d.name === name);
  return device ? [{ id: `demo-${device.id}`, device, color: 0, connected: true }] : [];
});

function matches(device: DeviceDefinition, hid: HIDDevice) {
  return (
    Number(device.VID) === hid.vendorId &&
    Number(device.PID) === hid.productId &&
    hid.collections.some(
      (c) => c.usagePage === device.usagePage && c.usage === device.usage,
    )
  );
}

function remembered(): HomeItem[] {
  return getRememberedDevices().flatMap((saved, index) => {
    const device = DEVICE_REGISTRY.find((d) => d.id === saved.deviceId);
    if (!device || saved.mock) return [];
    const model = DEVICE_REGISTRY.find((d) => d.id === saved.modelId);
    // A receiver card shows the model behind it, so clamp against that model's colourways.
    const shown = model ?? device;
    return [
      {
        id: saved.instanceId ?? `saved-${index}-${device.id}`,
        device,
        color: Math.min(saved.color, Math.max(0, (shown.colorways?.length ?? 1) - 1)),
        connected: false,
        model,
      },
    ];
  });
}

// Port of the original EmptyPage: cycle three clips, start them muted by hand (autoplay
// attributes alone get blocked), and show alternating product images until a clip can play.
const CLIPS = ["mouse-v1.webm", "keyboard-v2.webm", "headset-v1.webm"];
function EmptyVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [clip, setClip] = useState(0);
  const [ready, setReady] = useState(false);
  const [mouse, setMouse] = useState(false);
  const play = () => {
    const el = video.current;
    if (!el) return;
    el.muted = true;
    void el.play()?.catch(() => {});
  };
  useEffect(() => {
    if (ready) return;
    const timer = setInterval(() => setMouse((m) => !m), 8000);
    return () => clearInterval(timer);
  }, [ready]);
  useEffect(play, [clip]);
  return (
    <>
      <video
        ref={video}
        className="hub-home-video"
        data-ready={ready}
        src={`/home/${CLIPS[clip]}`}
        muted
        playsInline
        preload="auto"
        onCanPlay={() => (setReady(true), play())}
        onEnded={() => setClip((c) => (c + 1) % CLIPS.length)}
      />
      {!ready && (
        <img
          key={String(mouse)}
          className={`hub-home-fallback ${mouse ? "mouse" : "keyboard"}`}
          src={mouse ? "/home/mouse.webp" : "/home/keyboard.webp"}
          alt=""
          draggable={false}
        />
      )}
    </>
  );
}

export function Home({
  demo,
  onOpen,
}: {
  demo: boolean;
  onOpen: (item: HomeItem, mock: boolean) => Promise<void>;
}) {
  const [items, setItems] = useState<HomeItem[]>(remembered);
  // Opening a mouse can take seconds; show which card is connecting.
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const colors = useDeviceColorway((s) => s.colors);

  useEffect(() => {
    if (!navigator.hid) return;
    let alive = true;
    const refresh = async () => {
      const hids = await navigator.hid.getDevices().catch(() => []);
      if (alive)
        setItems((list) =>
          list.map((item) => ({ ...item, connected: hids.some((h) => matches(item.device, h)) })),
        );
    };
    void refresh();
    navigator.hid.addEventListener("connect", refresh);
    navigator.hid.addEventListener("disconnect", refresh);
    return () => {
      alive = false;
      navigator.hid.removeEventListener("connect", refresh);
      navigator.hid.removeEventListener("disconnect", refresh);
    };
  }, []);

  function persist(list: HomeItem[]) {
    setItems(list);
    saveRememberedDevices(
      list.map((item) => ({ instanceId: item.id, deviceId: item.device.id!, color: item.color, modelId: item.model?.id })),
    );
  }

  async function addDevice() {
    setError("");
    if (!navigator.hid) return setError("WebHID is not supported in this browser.");
    try {
      // Boot (FF02) endpoints are never offered; keyboards only when a verified profile exists.
      const filters = DEVICE_REGISTRY.filter(
        (d) => d.VID && d.PID && d.usagePage !== 0xff02 && (d.kind !== "keyboard" || !!verifiedKeyboardProfile(d)),
      ).map((d) => ({
        vendorId: parseInt(d.VID, 16),
        productId: parseInt(d.PID, 16),
        ...(d.usagePage !== undefined && { usagePage: d.usagePage }),
        ...(d.usage !== undefined && { usage: d.usage }),
      }));
      const chosen = await navigator.hid.requestDevice({ filters });
      const next = [...items];
      for (const hid of chosen) {
        const device = DEVICE_REGISTRY.find((d) => d.VID && d.PID && matches(d, hid));
        if (!device) throw new Error(`Unsupported HID device: ${hid.productName || "unknown"}`);
        let model: DeviceDefinition | undefined;
        if (device.kind === "mouse" && mouseEndpointSupportsReal(hid.vendorId, hid.productId)) {
          const info = await hidClient.connectHardware(hid);
          useConfigStore.setState({ deviceInfo: info });
          model = DEVICE_REGISTRY.find((d) => d.kind === "mouse" && d.cid === info.cid && d.mid === info.mid);
        }
        const existing = next.find((item) => item.device.id === device.id);
        if (existing) Object.assign(existing, { connected: true, model: model ?? existing.model });
        else next.unshift({ id: crypto.randomUUID(), device, color: 0, connected: true, model });
      }
      persist(next);
    } catch (err) {
      if ((err as DOMException).name !== "NotAllowedError")
        setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function open(item: HomeItem, mock: boolean) {
    setBusy(true);
    setOpening(item.id);
    setError("");
    try {
      await onOpen(item, mock);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setOpening(null);
    }
  }

  const list = demo ? DEMO_ITEMS : items;
  const info = useConfigStore((st) => st.deviceInfo);
  // Older saved entries lack a model id; resolve it from the connected receiver's identity.
  const withModel = (item: HomeItem): HomeItem =>
    item.model || item.device.kind !== "mouse" || !info.connected || info.isMock ||
    info.vendorId !== Number(item.device.VID) || info.productId !== Number(item.device.PID)
      ? item
      : { ...item, model: DEVICE_REGISTRY.find((d) => d.kind === "mouse" && d.cid === info.cid && d.mid === info.mid) };
  const footer = (
    <p className="hub-home-note">
      The driver cannot recognize Bluetooth connection. Please use a 2.4G receiver or a cable connection
    </p>
  );

  if (!list.length)
    return (
      <main className="hub-home" data-testid="device-home">
        <EmptyVideo />
        <div className="hub-home-empty">
          <button type="button" className="h-btn primary" onClick={addDevice}>
            <Plus size={14} /> Add Device
          </button>
          <h1>Please connect device</h1>
          <p>The driver cannot recognize Bluetooth connection. Please use a 2.4G receiver or a cable connection</p>
          {error && <p role="alert" className="hub-home-error">{error}</p>}
        </div>
      </main>
    );

  return (
    <main className="hub-home" data-testid="device-home">
      <div className="hub-home-cards">
        {list.map(withModel).map((item) => ({
          ...item, color: selectedColorIndex(item.model ?? item.device, colors, item.color),
        })).map((item, index) => (
          <div key={item.id} className="hub-device-card" data-kind={item.device.kind} data-opening={opening === item.id || undefined} aria-busy={opening === item.id || undefined} style={{ ["--i" as string]: index }}>
            <button
              type="button"
              className="cover"
              disabled={busy}
              aria-label={`Open ${item.device.name}`}
              // Open the HID endpoint (receiver/cable), not the model entry: the session matches on its VID/PID.
              onClick={() => void open(item, demo)}
            >
              <DevicePreview device={item.model ?? item.device} color={item.color} />
            </button>
            <div className="info">
              <div className="name" title={displayName((item.model ?? item.device).name)}>{displayName((item.model ?? item.device).name)}</div>
              <div className="status">
                <span>
                  {item.device.usagePage !== undefined && item.model ? <Wifi size={16} /> : <Cable size={16} />}
                  {(demo || (item.model && info.connected && info.batteryLevel > 0)) && (
                    <>
                      <BatteryFull size={18} /> {demo ? 100 : info.batteryLevel}%
                    </>
                  )}
                  {opening === item.id ? <em>Connecting…</em> : !demo && !item.connected && <em>Not connected</em>}
                </span>
                <span className="tools" aria-hidden="true">
                  <Palette size={16} />
                  <PanelTop size={16} />
                  <Cpu size={16} />
                </span>
              </div>
            </div>
            {!demo && (
              <button
                type="button"
                className="forget"
                aria-label={`Remove ${item.device.name}`}
                onClick={() => persist(items.filter((other) => other.id !== item.id))}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p role="alert" className="hub-home-error">{error}</p>}
      {!demo && (
        <button type="button" className="h-btn primary hub-home-add" onClick={addDevice}>
          <Plus size={14} /> Add Device
        </button>
      )}
      {footer}
    </main>
  );
}
