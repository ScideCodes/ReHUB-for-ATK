import { useEffect, useState } from "react";
import { Dialog } from "../ui/Dialog";
import type { DesktopDevice, DesktopPreferences } from "./bridge";

export function DesktopDeviceChooser() {
  const [devices, setDevices] = useState<DesktopDevice[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const api = window.rehubDesktop;
    if (!api) return;
    const update = (items: DesktopDevice[] | null) => {
      setDevices(items);
      setSelected((id) => (items?.some((d) => d.deviceId === id) ? id : ""));
      setError("");
    };
    const unsubscribe = api.onChooser(update);
    void api.getChooser().then(update);
    return unsubscribe;
  }, []);
  async function choose(id: string) {
    try {
      if (!(await window.rehubDesktop?.chooseDevice(id)))
        setError("The device is no longer available. Select it again.");
    } catch {
      setError("Could not select the device. Cancel and try again.");
    }
  }
  return (
    <Dialog
      open={devices !== null}
      onClose={() => void choose("")}
      title="Select a device"
      description="Choose the device ReHUB may access. Close other configurators if your device is missing."
      className="device-report-dialog"
      footer={
        <>
          <button className="h-btn" onClick={() => void choose("")}>
            Cancel
          </button>
          <button
            className="h-btn primary"
            disabled={!selected}
            onClick={() => void choose(selected)}
          >
            Select device
          </button>
        </>
      }
    >
      <div className="device-report-form">
        {devices?.length ? (
          devices.map((d) => (
            <label key={d.deviceId} className="report-check">
              <input
                type="radio"
                name="hid-device"
                value={d.deviceId}
                checked={selected === d.deviceId}
                onChange={() => setSelected(d.deviceId)}
              />
              <span>
                {d.name === "Wireless mouse 8k dongle-H" || (d.vendorId === 0x373b && (d.productId === 0x11d8 || d.productId === 0x11cc || d.productId === 0x12cc)) ? "ATK Frost Zero Extreme" : d.name}
                <br />
                <small>
                  VID {d.vendorId.toString(16).padStart(4, "0")} / PID{" "}
                  {d.productId.toString(16).padStart(4, "0")}
                </small>
              </span>
            </label>
          ))
        ) : (
          <p>
            No matching devices found. Connect your device with a USB cable or
            2.4 GHz receiver. You can cancel and send a device report from the
            header.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
export function DesktopSettings() {
  const [prefs, setPrefs] = useState<DesktopPreferences>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [release, setRelease] = useState<string>();
  useEffect(() => {
    void window.rehubDesktop
      ?.getPreferences()
      .then(setPrefs)
      .catch(() => setStatus("Could not load desktop settings."));
  }, []);
  if (!window.rehubDesktop) return null;
  async function update(key: "closeToTray" | "launchAtLogin", value: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setBusy(true);
    try {
      setPrefs(
        await window.rehubDesktop!.setPreferences({
          closeToTray: prefs.closeToTray,
          launchAtLogin: prefs.launchAtLogin,
          [key]: value,
        }),
      );
      setStatus("Desktop settings saved.");
    } catch {
      setPrefs(previous);
      setStatus("Could not save desktop settings. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setStatus("Checking GitHub Releases…");
    setRelease(undefined);
    try {
      const result = await window.rehubDesktop!.checkUpdates();
      setStatus(result.message);
      setRelease(result.url);
    } catch {
      setStatus("Could not check for updates. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hp-card">
      <h2>Desktop app</h2>
      <div className="device-report-form">
        <p>
          ReHUB {prefs?.version} runs locally. No server or browser is required.
        </p>
        <label className="report-check">
          <input
            type="checkbox"
            checked={prefs?.closeToTray ?? false}
            disabled={!prefs || busy}
            onChange={(e) => void update("closeToTray", e.target.checked)}
          />
          Keep running in the system tray when I close the window
        </label>
        <label className="report-check">
          <input
            type="checkbox"
            checked={prefs?.launchAtLogin ?? false}
            disabled={!prefs?.canLaunchAtLogin || busy}
            onChange={(e) => void update("launchAtLogin", e.target.checked)}
          />
          Launch ReHUB when I sign in to Windows
        </label>
        {prefs && !prefs.canLaunchAtLogin && (
          <p>Launch at login is available in the installed Windows app.</p>
        )}
        <p>
          Update checks contact GitHub only when you click below. Updates are
          installed manually.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="h-btn"
            disabled={busy}
            onClick={() => void check()}
          >
            Check for updates
          </button>
          <button
            className="h-btn"
            onClick={() => void window.rehubDesktop?.disconnect()}
          >
            Disconnect devices…
          </button>
        </div>
        {status && <p role="status">{status}</p>}
        {release && (
          <a
            className="h-btn"
            href={release}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open GitHub Releases
          </a>
        )}
      </div>
    </section>
  );
}
