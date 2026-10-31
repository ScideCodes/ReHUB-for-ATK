import { useEffect } from "react";
import { clsx } from "clsx";
import { useConfigStore } from "../store/configStore";
import { useDeviceSession } from "../features/device/deviceSession";
import {
  getDeviceFinishes,
  setMouseFinish,
  type MouseFinish,
} from "./finishTheme";
import { applyColorwayHex } from "./colorPalette";
import { Select } from "./Select";
import "../styles/finish.css";
import { selectedColorIndex, useMouseColorway } from "./mouseColorway";

export interface FinishPickerProps {
  compact?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

export function FinishPicker({
  compact = false,
  className,
  label = "Mouse finish",
  description = "Matches the mouse illustration to your finish.",
}: FinishPickerProps) {
  const finish = useDeviceSession((state) => state.skin);
  const info = useConfigStore((state) => state.deviceInfo);
  const model = useConfigStore((state) => state.selectedDevice);
  const colors = useMouseColorway((state) => state.colors);
  const selectColor = useMouseColorway((state) => state.select);
  const selectedModel =
    model && (info.isMock || model.name === info.name) ? model : null;
  const availableFinishes = getDeviceFinishes(info.cid, info.mid);

  // Auto-adapt if current finish is not available on selected mouse model
  useEffect(() => {
    if (!selectedModel && !availableFinishes.some((f) => f.value === finish)) {
      if (availableFinishes.length > 0) {
        setMouseFinish(availableFinishes[0].value);
      }
    }
  }, [info.cid, info.mid, availableFinishes, finish, selectedModel]);

  const options = availableFinishes.map((option) => ({
    value: option.value,
    label: option.name || option.label,
    swatch: option.swatch,
  }));

  return (
    <div
      className={clsx(
        "finish-picker",
        "finish-picker-dropdown-wrap",
        className,
      )}
      data-compact={compact || undefined}
    >
      <label className={clsx("finish-picker-label", compact && "hub-sr-only")}>
        {label}
      </label>
      {selectedModel ? (
        <Select<number>
          label={label}
          hideLabel
          value={selectedColorIndex(selectedModel, colors)}
          options={(selectedModel.colorways ?? []).map((color, value) => ({
            value,
            label: color.name,
            swatch: color.hex,
          }))}
          onValueChange={(value) => selectColor(selectedModel, value)}
          disabled={!selectedModel.colorways?.length}
          description={!compact ? description : undefined}
          className="finish-dropdown-select"
        />
      ) : (
        <Select<MouseFinish>
          label={label}
          hideLabel
          value={finish}
          options={options}
          onValueChange={(val) => {
            setMouseFinish(val);
            const chosen = availableFinishes.find((f) => f.value === val);
            if (chosen) applyColorwayHex(chosen.swatch);
          }}
          description={!compact ? description : undefined}
          className="finish-dropdown-select"
        />
      )}
    </div>
  );
}
