import {
  mouseEndpointSupportsReal,
  mouseHidLabel,
} from "../../devices/mouseProtocols";
import { verifiedKeyboardProfile } from "../../devices/keyboardProtocols";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DEVICE_REGISTRY } from "../../devices/registry";
import type { DeviceDefinition } from "../../types/schema";
import { Button, Dialog } from "../index";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { DevicePreview } from "../DevicePreview";
import { applyColorwayHex } from "../colorPalette";
import { ThemeToggle } from "../ThemeToggle";
import { z } from "zod";
import { hidClient } from "../../hid/hidClient";
import { useConfigStore } from "../../store/configStore";
import "./keyboard.css";

gsap.registerPlugin(useGSAP);

const DemoDevicePicker = lazy(() => import("./DemoDevicePicker"));

const REMEMBERED_DEVICES_KEY = "atk-hub-remembered-devices-list";

export interface ConnectedItem {
  id: string; // unique key in list
  device: DeviceDefinition;
  color: number;
  status: "connected" | "remembered" | "mock";
  mock?: boolean;
  displayDevice?: DeviceDefinition;
  hardwareKey?: string;
}

const RememberedSchema = z
  .array(
    z.object({
      deviceId: z.string().min(1),
      color: z.number().int().nonnegative(),
      mock: z.boolean().optional(),
      instanceId: z.string().min(1).optional(),
      modelId: z.string().min(1).optional(),
      displayName: z.string().min(1).max(120).optional(),
      hardwareKey: z.string().min(1).max(200).optional(),
    }),
  )
  .max(100);
export function getRememberedDevices(): z.infer<typeof RememberedSchema> {
  try {
    const raw = localStorage.getItem(REMEMBERED_DEVICES_KEY);
    if (!raw) return [];
    const result = RememberedSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function saveRememberedDevices(list: z.infer<typeof RememberedSchema>) {
  try {
    localStorage.setItem(REMEMBERED_DEVICES_KEY, JSON.stringify(list));
  } catch {
    /* Keep the current list usable when browser storage is unavailable. */
  }
}

export function DeviceHomePage({
  onSelect,
}: {
  onSelect: (
    device: DeviceDefinition,
    colorway: number,
    mock: boolean,
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mockOpen, setMockOpen] = useState(false);
  const [forget, setForget] = useState<ConnectedItem | null>(null);
  const [devicesList, setDevicesList] = useState<ConnectedItem[]>([]);
  const [page, setPage] = useState(0);
  const reduced = useReducedMotion();
  const pageSize = 3;
  const webHIDAvailable = typeof window !== "undefined" && "hid" in navigator;
  const content = useRef<HTMLDivElement>(null);

  // Transform/opacity only, so the entrance never counts as layout shift.
  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".device-home-card", {
          opacity: 0,
          y: 12,
          duration: 0.45,
          ease: "power3.out",
        });
      });
    },
    { scope: content },
  );

  useEffect(() => {
    const saved = getRememberedDevices();
    if (saved.length > 0) {
      const items: ConnectedItem[] = [];
      for (const [index, s] of saved.entries()) {
        const match = DEVICE_REGISTRY.find((d) => d.id === s.deviceId);
        if (match) {
          items.push({
            id: s.instanceId ?? `saved-${index}-${match.id}`,
            device: match,
            color: Math.min(
              s.color,
              Math.max(0, (match.colorways?.length ?? 1) - 1),
            ),
            status: s.mock ? "mock" : "remembered",
            mock: s.mock,
            hardwareKey: s.hardwareKey,
            displayDevice:
              DEVICE_REGISTRY.find((d) => d.id === s.modelId) ??
              (s.displayName ? { ...match, name: s.displayName } : undefined),
          });
        }
      }
      setDevicesList(items);
    }
  }, []);

  useEffect(() => {
    if (!navigator.hid) return;
    let active = true;
    const refresh = async () => {
      try {
        const devices = await navigator.hid.getDevices();
        if (!active) return;
        setDevicesList((items) =>
          items.map((item) =>
            item.mock
              ? item
              : {
                  ...item,
                  status: devices.some(
                    (hid) =>
                      Number(item.device.VID) === hid.vendorId &&
                      Number(item.device.PID) === hid.productId &&
                      hid.collections.some(
                        (c) =>
                          c.usagePage === item.device.usagePage &&
                          c.usage === item.device.usage,
                      ),
                  )
                    ? "connected"
                    : "remembered",
                },
          ),
        );
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : String(error));
      }
    };
    void refresh();
    navigator.hid.addEventListener("connect", refresh);
    navigator.hid.addEventListener("disconnect", refresh);
    return () => {
      active = false;
      navigator.hid.removeEventListener("connect", refresh);
      navigator.hid.removeEventListener("disconnect", refresh);
    };
  }, []);

  function persistList(items: ConnectedItem[]) {
    saveRememberedDevices(
      items.map((it) => ({
        instanceId: it.id,
        deviceId: it.device.id!,
        color: it.color,
        mock: it.mock,
        modelId: it.displayDevice?.id,
        displayName: it.displayDevice?.name,
        hardwareKey: it.hardwareKey,
      })),
    );
  }

  function removeDevice(indexToRemove: number) {
    const updated = devicesList.filter((_, i) => i !== indexToRemove);
    setDevicesList(updated);
    persistList(updated);
    if (page > 0 && page >= Math.ceil(updated.length / pageSize)) {
      setPage(Math.max(0, page - 1));
    }
  }

  async function choose(dev: DeviceDefinition, col: number, mock: boolean) {
    setBusy(true);
    setError("");
    try {
      await onSelect(dev, col, mock);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function connectWebHID() {
    if (!webHIDAvailable) {
      setError("WebHID is not supported in this browser.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const filters = DEVICE_REGISTRY.filter(
        (d) =>
          d.VID &&
          d.PID &&
          d.usagePage !== 0xff02 &&
          (d.kind !== "keyboard" || !!verifiedKeyboardProfile(d)),
      ).map((d) => {
        const f: {
          vendorId: number;
          productId: number;
          usagePage?: number;
          usage?: number;
        } = {
          vendorId: parseInt(d.VID, 16),
          productId: parseInt(d.PID, 16),
        };
        if (d.usagePage !== undefined) f.usagePage = d.usagePage;
        if (d.usage !== undefined) f.usage = d.usage;
        return f;
      });
      const selectedDevices = await navigator.hid.requestDevice({ filters });
      if (!selectedDevices || selectedDevices.length === 0) {
        setBusy(false);
        return;
      }

      const newItems = [...devicesList];
      for (const hidDevice of selectedDevices) {
        const match = DEVICE_REGISTRY.find(
          (d) =>
            d.VID &&
            d.PID &&
            parseInt(d.VID, 16) === hidDevice.vendorId &&
            parseInt(d.PID, 16) === hidDevice.productId &&
            hidDevice.collections.some(
              (c: HIDCollectionInfo) =>
                c.usagePage === d.usagePage && c.usage === d.usage,
            ),
        );
        if (!match)
          throw new Error(
            `Unsupported HID device: ${mouseHidLabel(hidDevice)}`,
          );
        if (match) {
          let displayDevice: DeviceDefinition | undefined;
          let serial =
            "serialNumber" in hidDevice &&
            typeof hidDevice.serialNumber === "string"
              ? hidDevice.serialNumber
              : undefined;
          if (
            match.kind === "mouse" &&
            mouseEndpointSupportsReal(hidDevice.vendorId, hidDevice.productId)
          ) {
            const info = await hidClient.connectHardware(hidDevice);
            useConfigStore.setState({ deviceInfo: info });
            if (
              !serial &&
              /[1-9a-f]/i.test(info.serial.replace(/[^\da-f]/gi, ""))
            )
              serial = info.serial;
            displayDevice = DEVICE_REGISTRY.find(
              (model) =>
                model.kind === "mouse" &&
                model.cid === info.cid &&
                model.mid === info.mid,
            ) ?? { ...match, name: info.name, colorways: [], images: [] };
          }
          const itemKey = crypto.randomUUID();
          const hardwareKey = serial
            ? `${hidDevice.vendorId}:${hidDevice.productId}:${serial}`
            : undefined;
          const existingIdx = newItems.findIndex(
            (it) => hardwareKey !== undefined && it.hardwareKey === hardwareKey,
          );
          if (existingIdx >= 0) {
            newItems[existingIdx] = {
              ...newItems[existingIdx],
              status: "connected",
              mock: false,
              displayDevice,
              hardwareKey,
            };
          } else {
            if (newItems.length >= 100)
              throw new Error(
                "Remove a saved device before adding another (100 maximum).",
              );
            newItems.unshift({
              id: itemKey,
              device: match,
              color: 0,
              status: "connected",
              displayDevice,
              hardwareKey,
            });
          }
        }
      }

      setDevicesList(newItems);
      persistList(newItems);
      setPage(0);
    } catch (err) {
      if ((err as DOMException).name !== "NotAllowedError")
        setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(devicesList.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleDevices = devicesList.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );

  return (
    <main className="keyboard-black device-home" data-testid="device-home">
      <div className="device-home-header">
        <h1>ATK Hub</h1>
        <ThemeToggle compact />
        {!webHIDAvailable && (
          <span className="keyboard-note">
            WebHID unavailable — use Mock to explore.
          </span>
        )}
      </div>

      <div
        ref={content}
        className="device-home-content"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "28px",
          width: "100%",
          maxWidth: "1200px",
          alignItems: "center",
        }}
      >
        <div
          className="device-home-card"
          style={{ maxWidth: "480px", width: "100%" }}
        >
          <p className="device-home-help">
            Connect your ATK mice and keyboards to configure settings.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              width: "100%",
              justifyContent: "center",
            }}
          >
            <Button
              className="lg-apply-button"
              disabled={busy || !webHIDAvailable}
              onClick={() => void connectWebHID()}
            >
              Connect device
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setMockOpen(true)}
            >
              Mock device
            </Button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="keyboard-note"
            style={{ color: "var(--hub-error, #f87)" }}
          >
            {error}
          </p>
        )}

        {devicesList.length > 0 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                padding: "0 12px",
              }}
            >
              <span
                className="keyboard-note"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  gridColumn: "2",
                  textAlign: "center",
                }}
              >
                Connected &amp; Saved Devices ({devicesList.length})
              </span>
              {totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    justifySelf: "end",
                  }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={currentPage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span
                    className="keyboard-note"
                    style={{
                      fontSize: "12px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {currentPage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              )}
            </div>

            <div
              style={{
                width: "100%",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentPage}
                  initial={{ opacity: 0, x: reduced ? 0 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduced ? 0 : -20 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="device-home-gallery"
                >
                  {visibleDevices.map((item, itemIdx) => {
                    const globalIdx = currentPage * pageSize + itemIdx;
                    const presentation = item.displayDevice ?? item.device;
                    return (
                      <div
                        key={item.id}
                        className="device-home-connected"
                        data-kind={item.device.kind}
                        data-testid={`connected-device-${item.device.id}`}
                      >
                        <button
                          type="button"
                          className="device-card-open"
                          disabled={busy}
                          aria-label={`Open ${presentation.name} settings`}
                          title={`Open ${presentation.name} settings`}
                          onClick={() =>
                            void choose(
                              item.device,
                              item.color,
                              item.mock ?? false,
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Forget ${presentation.name}`}
                          title="Forget this device"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForget(item);
                          }}
                          className="device-card-delete"
                          disabled={busy}
                        >
                          <Trash2 size={16} />
                        </button>

                        <div className="keyboard-product">
                          <DevicePreview
                            device={presentation}
                            color={item.color}
                          />
                        </div>
                        <div className="device-card-info">
                          <div className="device-card-heading">
                            <strong
                              className="device-card-name"
                              title={presentation.name}
                            >
                              {presentation.name}
                            </strong>
                            <span
                              className="device-card-meta"
                              data-status={item.status}
                            >
                              {item.device.kind === "mouse" &&
                              !mouseEndpointSupportsReal(
                                Number(item.device.VID),
                                Number(item.device.PID),
                              )
                                ? "Local demo · Protocol unverified"
                                : item.status === "mock"
                                  ? "Mock"
                                  : item.status === "connected"
                                    ? "Connected"
                                    : "Saved"}
                            </span>
                          </div>

                          <div
                            className="keyboard-finishes"
                            role="group"
                            aria-label="Colorway"
                          >
                            {presentation.colorways?.map((f, i) => (
                              <button
                                type="button"
                                key={f.id ?? f.name}
                                aria-pressed={i === item.color}
                                disabled={busy}
                                title={f.name}
                                aria-label={f.name}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const updated = [...devicesList];
                                  updated[globalIdx] = { ...item, color: i };
                                  setDevicesList(updated);
                                  persistList(updated);
                                  applyColorwayHex(f.hex);
                                }}
                              >
                                <span style={{ background: f.hex }} />
                                <span className="hub-sr-only">{f.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={forget !== null}
        onClose={() => setForget(null)}
        title="Forget saved device?"
        description={`Remove ${forget?.displayDevice?.name ?? forget?.device.name ?? "this device"} from this list? Its maps and hardware connection are kept.`}
        confirmLabel="Forget device"
        destructive
        onConfirm={() => {
          const index = devicesList.findIndex((item) => item.id === forget?.id);
          if (index >= 0) removeDevice(index);
          setForget(null);
        }}
      />
      {mockOpen && (
        <Suspense fallback={<p role="status">Loading demo devices…</p>}>
          <DemoDevicePicker
            open={mockOpen}
            onClose={() => setMockOpen(false)}
            onSelect={async (d, c, m) => {
              if (devicesList.length >= 100)
                throw new Error(
                  "Remove a saved device before adding another (100 maximum).",
                );
              const item: ConnectedItem = {
                id: crypto.randomUUID(),
                device: d,
                color: c,
                status: m ? "mock" : "remembered",
                mock: m,
              };
              const updated = [item, ...devicesList];
              persistList(updated);
              setDevicesList(updated);
              setPage(0);
              try {
                await onSelect(d, c, m);
                setMockOpen(false);
              } catch (error) {
                persistList(devicesList);
                setDevicesList(devicesList);
                throw error;
              }
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
