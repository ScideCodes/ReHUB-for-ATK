import { useState } from "react";
import {
  type AdvancedAction,
  KEY_OPTIONS,
  keyLabel,
} from "../../devices/keyboardSettings";
import { Button, Segmented } from "../index";
import {
  SaveSelect as Select,
  SaveSlider as Slider,
  SaveToggle as Toggle,
} from "./SaveStatus";
import type { KeyboardEditorProps } from "./BasicControls";

const kinds = [
  {
    value: "mt",
    label: "Mod tap",
    description: "Tap for one key; hold for another.",
  },
  { value: "tgl", label: "Toggle", description: "Toggle a key’s held state." },
  {
    value: "dks",
    label: "Dynamic keystroke",
    description: "Four actions across the travel cycle.",
  },
  {
    value: "rs",
    label: "Rapid snap",
    description: "Resolve a pair by travel depth.",
  },
  {
    value: "socd",
    label: "SOCD",
    description: "Choose what happens when both keys are held.",
  },
  {
    value: "oks",
    label: "OKS",
    description:
      "Controller-specific paired-key action; verify hardware behavior.",
  },
] as const;
export function AdvancedControls({
  device,
  settings,
  edit,
  selected,
  layer,
  setLayer,
}: KeyboardEditorProps) {
  const available = kinds.filter((k) => device.capabilities?.includes(k.value));
  const [requestedKind, setKind] = useState<AdvancedAction["kind"]>(
    available[0]?.value ?? "mt",
  );
  const kind =
    available.find((item) => item.value === requestedKind)?.value ??
    available[0]?.value;
  const count = settings.advanced.filter((a) => a.kind === kind).length;
  const index = settings.advanced.findIndex(
    (a) => a.kind === kind && a.key === selected && a.layer === layer,
  );
  const action = settings.advanced[index];
  function update(change: Partial<AdvancedAction>) {
    edit((s) => {
      Object.assign(s.advanced[index], change);
    });
  }
  function add() {
    if (!kind || count >= 20) return;
    edit((s) => {
      s.advanced.push({
        kind,
        key: selected,
        otherKey: (selected + 1) % s.keys.length,
        layer,
        tap: [0, 4],
        hold: [0, 225],
        delay: 200,
        point: 1.5,
        rt: false,
        priority: "last",
        dks: Array.from({ length: 4 }, () => ({
          code: [0, 0],
          events: Array(10).fill(false),
        })),
      });
    });
  }
  if (!kind)
    return (
      <p className="keyboard-note">
        This device does not list advanced actions.
      </p>
    );
  return (
    <div className="keyboard-controls keyboard-advanced">
      {device.capabilities?.includes("layers") && (
        <Segmented
          label="Layer"
          value={layer}
          options={["Windows", "Windows Fn", "macOS", "macOS Fn"].map(
            (label, value) => ({ label, value }),
          )}
          onValueChange={setLayer}
        />
      )}
      <div className="keyboard-advanced-context">
        <strong>{keyLabel(settings.keys[selected].layers[layer])}</strong>
        <span>
          Layer {layer + 1} · row {settings.keys[selected].row + 1}, column{" "}
          {settings.keys[selected].col + 1}
        </span>
      </div>
      <Select
        saveFields={["advanced"]}
        label="Advanced action"
        value={kind}
        options={available}
        onValueChange={(value) => setKind(value as AdvancedAction["kind"])}
      />
      <p className="keyboard-note">
        {kinds.find((k) => k.value === kind)?.description}
      </p>
      <p className="keyboard-note keyboard-advanced-local">
        Local only - not sent to device. Shared-slot ownership and removal are
        not verified; existing device actions are preserved.
      </p>
      {!action ? (
        <div className="keyboard-advanced-empty">
          <p>
            No {kinds.find((k) => k.value === kind)?.label.toLowerCase()} action
            on this key.
          </p>
          <Button onClick={add} disabled={count >= 20}>
            Add to selected key
          </Button>
          <span className="keyboard-note">
            {count >= 20
              ? "20-action limit reached. Remove an existing action first."
              : `${count} of 20 actions used`}
          </span>
        </div>
      ) : (
        <>
          {(kind === "mt" || kind === "tgl") && (
            <>
              <Select
                saveFields={["advanced"]}
                label={kind === "mt" ? "Tap key" : "Toggle key"}
                value={action.tap[1]}
                options={KEY_OPTIONS}
                onValueChange={(value) => update({ tap: [0, value] })}
              />
              {kind === "mt" && (
                <Select
                  saveFields={["advanced"]}
                  label="Hold key"
                  value={action.hold[1]}
                  options={KEY_OPTIONS}
                  onValueChange={(value) => update({ hold: [0, value] })}
                />
              )}
              <label className="keyboard-field">
                Threshold (ms)
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={action.delay}
                  onChange={(e) => {
                    if (e.currentTarget.validity.valid)
                      update({ delay: +e.target.value });
                  }}
                />
              </label>
            </>
          )}
          {["rs", "socd", "oks"].includes(kind) && (
            <>
              <Select
                saveFields={["advanced"]}
                label="Second key"
                value={action.otherKey}
                options={settings.keys.map((key, value) => ({
                  value,
                  label: `${keyLabel(key.layers[layer])} (${key.row + 1},${key.col + 1})`,
                  disabled: value === selected,
                }))}
                onValueChange={(otherKey) => update({ otherKey })}
              />
              <Slider
                saveFields={["advanced"]}
                label="Trigger point"
                min={0.1}
                max={3.3}
                step={0.01}
                suffix=" mm"
                value={action.point}
                onValueChange={(point) => update({ point })}
              />
              <Toggle
                saveFields={["advanced"]}
                label="Use rapid trigger"
                checked={action.rt}
                onCheckedChange={(rt) => update({ rt })}
              />
              {kind === "socd" && (
                <Select
                  saveFields={["advanced"]}
                  label="When both keys are held"
                  value={action.priority}
                  options={[
                    { value: "last", label: "Last pressed" },
                    { value: "first", label: "First key" },
                    { value: "second", label: "Second key" },
                    { value: "neutral", label: "Neutral" },
                  ]}
                  onValueChange={(priority) =>
                    update({ priority: priority as AdvancedAction["priority"] })
                  }
                />
              )}
            </>
          )}
          {kind === "dks" && (
            <>
              <p className="keyboard-note">
                Source exposes ten event bits per action. Their travel-stage
                meanings need packet verification.
              </p>
              {action.dks.map((slot, n) => (
                <fieldset className="keyboard-dks" key={n}>
                  <legend>Action {n + 1}</legend>
                  <Select
                    saveFields={["advanced"]}
                    label="Key"
                    value={slot.code[1]}
                    options={KEY_OPTIONS}
                    onValueChange={(value) =>
                      edit((s) => {
                        s.advanced[index].dks[n].code = [0, value];
                      })
                    }
                  />
                  <div className="keyboard-bits">
                    {slot.events.map((enabled, bit) => (
                      <label key={bit}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) =>
                            edit((s) => {
                              s.advanced[index].dks[n].events[bit] =
                                e.target.checked;
                            })
                          }
                        />
                        Bit {bit}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </>
          )}
          <Button
            onClick={() =>
              edit((s) => {
                s.advanced.splice(index, 1);
              })
            }
          >
            Remove action
          </Button>
        </>
      )}
    </div>
  );
}
