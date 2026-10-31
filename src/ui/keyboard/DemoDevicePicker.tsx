import { useState, useEffect, useMemo } from "react";
import { DEVICE_REGISTRY } from "../../devices/registry";
import type { DeviceDefinition } from "../../types/schema";
import { Button, Dialog, Select } from "../index";
import { DevicePreview } from "../DevicePreview";
import { applyColorwayHex } from "../colorPalette";

export default function DemoDevicePicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (
    device: DeviceDefinition,
    colorway: number,
    mock: boolean,
  ) => Promise<void>;
}) {
  const uniqueModels = useMemo(() => {
    const map = new Map<string, DeviceDefinition>();
    for (const d of DEVICE_REGISTRY) {
      if (/dongle|receiver|adapter/i.test(d.name)) continue;
      if (!map.has(d.name)) {
        map.set(d.name, d);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, []);

  const [selectedName, setSelectedName] = useState<string>("ATK 68 V2 Pro");
  const [color, setColor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const device =
    uniqueModels.find((d) => d.name === selectedName) ??
    uniqueModels[0] ??
    DEVICE_REGISTRY[0];

  useEffect(() => {
    const selected = device.colorways?.[color];
    if (open && selected) applyColorwayHex(selected.hex);
  }, [open, device, color]);

  async function choose(mock: boolean) {
    setBusy(true);
    setError("");
    try {
      await onSelect(device, color, mock);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Select device"
      className="keyboard-black device-selector"
      footer={
        <>
          <Button disabled={busy} onClick={() => void choose(true)}>
            Mock device
          </Button>
        </>
      }
    >
      <Select
        label="Model"
        disabled={busy}
        value={device.name}
        options={uniqueModels.map((d) => ({ value: d.name, label: d.name }))}
        onValueChange={(val) => {
          setSelectedName(val);
          setColor(0);
          setError("");
        }}
      />
      <div
        className="keyboard-product"
        style={{
          minHeight: "150px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <DevicePreview device={device} color={color} />
      </div>
      <div className="keyboard-finishes" role="group" aria-label="Colorway">
        {device.colorways?.map((finish, i) => (
          <button
            type="button"
            disabled={busy}
            key={finish.id ?? finish.name}
            aria-pressed={i === color}
            onClick={() => {
              setColor(i);
              applyColorwayHex(finish.hex);
            }}
          >
            <span style={{ background: finish.hex }} />
            {finish.name}
          </button>
        ))}
      </div>
      <p className="keyboard-note">
        {device.kind === "keyboard"
          ? "Edit locally or try the mock. Connect hardware from the device panel for verified reads."
          : "Open the existing mouse configurator."}
      </p>
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}
