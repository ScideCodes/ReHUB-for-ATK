import { useLightingReducedMotion } from "./useLightingReducedMotion";
import type { DeviceDefinition } from "../../types/schema";
import {
  LIGHT_MODES,
  keyLabel,
  type KeyboardSettings,
} from "../../devices/keyboardSettings";
import { supports } from "../../devices/registry";
import { Segmented } from "../index";
import {
  SaveSelect,
  SaveSlider,
  SaveToggle,
  SaveColorPicker,
  SaveStatus,
} from "./SaveStatus";

import { KeyAssignmentPicker } from "./KeyAssignmentPicker";

export type KeyboardEditorProps = {
  device: DeviceDefinition;
  settings: KeyboardSettings;
  edit: (update: (draft: KeyboardSettings) => void) => void;
  selected: number;
  layer: number;
  setLayer: (value: number) => void;
};
const classes = [
  { value: 0, label: "Keyboard" },
  { value: 82, label: "Layer" },
  { value: 87, label: "MT / TGL" },
  { value: 119, label: "Macro" },
  { value: 120, label: "Lighting" },
  { value: 124, label: "System" },
  { value: 126, label: "Keyboard / DKS" },
];

export function KeysControls({
  device,
  settings,
  edit,
  selected,
  layer,
  setLayer,
}: KeyboardEditorProps) {
  const key = settings.keys[selected],
    code = key.layers[layer];
  return (
    <div
      className="keyboard-keys-toolbar"
      role="toolbar"
      aria-label="Key assignments"
    >
      {supports(device, "layers") && (
        <Segmented
          label="Layer"
          value={layer}
          options={[0, 1, 2, 3].map((value) => ({
            value,
            label: ["Windows", "Windows Fn", "macOS", "macOS Fn"][value],
          }))}
          onValueChange={setLayer}
        />
      )}
      {supports(device, "keyRemap") && (
        <>
          <SaveSelect
            label="Action class"
            saveFields={[`key.${selected}.layer.${layer}`]}
            value={code[0]}
            options={
              classes.some((c) => c.value === code[0])
                ? classes
                : [
                    ...classes,
                    { value: code[0], label: `Source class ${code[0]}` },
                  ]
            }
            onValueChange={(value) =>
              edit((s) => {
                s.keys[selected].layers[layer] = [value, 0];
              })
            }
          />
          <div className="keyboard-saved-control">
            <KeyAssignmentPicker
              code={code}
              macros={settings.macros}
              onChange={(value) =>
                edit((s) => {
                  s.keys[selected].layers[layer][1] = value;
                })
              }
            />
            <SaveStatus fields={[`key.${selected}.layer.${layer}`]} />
          </div>
          <details className="keyboard-assignment-reference">
            <summary>Assignment reference</summary>
            <p className="keyboard-note">
              Fn layers are separate mappings. Macro IDs are 0–15. MT uses 0–19;
              TGL uses 20–39. Advanced hardware assignments need packet
              verification.
            </p>
          </details>
        </>
      )}
    </div>
  );
}

export function TriggerControls({
  device,
  settings,
  edit,
  selected,
  layer,
  scope,
  selectedKeys = [selected],
  onSelectKey,
}: KeyboardEditorProps & {
  scope: "key" | "all";
  selectedKeys?: number[];
  onSelectKey: (index: number) => void;
}) {
  const key = settings.keys[selected],
    step = settings.options.performanceMode ? 0.01 : 0.02;
  const indices =
    scope === "all" ? settings.keys.map((_, index) => index) : selectedKeys;
  const targets = indices.map((index) => settings.keys[index]);
  function update(change: (target: KeyboardSettings["keys"][number]) => void) {
    if (!indices.length) return;
    edit((draft) => {
      indices.forEach((index) => change(draft.keys[index]));
    });
  }
  const mixed = (read: (target: typeof key) => unknown) =>
    targets.some((target) => read(target) !== read(key));
  return (
    <div className="keyboard-controls keyboard-trigger-controls">
      <p className="keyboard-note" role="status">
        {targets.length === 0
          ? "Select keys on the keyboard to edit their trigger settings."
          : `${targets.length} ${targets.length === 1 ? "key selected" : "keys selected"}. Changes affect only this selection.`}
      </p>
      <SaveSelect
        label="Preview key"
        value={selected}
        disabled={targets.length === 0}
        options={indices.map((value) => ({
          value,
          label: `${keyLabel(settings.keys[value].layers[layer])} · ${settings.keys[value].row + 1}:${settings.keys[value].col + 1}`,
        }))}
        onValueChange={onSelectKey}
      />
      {supports(device, "actuation") && (
        <fieldset
          className="keyboard-control-group"
          disabled={targets.length === 0}
        >
          <legend>First press</legend>
          <SaveSlider
            label="Actuation"
            saveFields={indices.map((index) => `key.${index}.actuation`)}
            description={
              mixed((target) => target.actuation)
                ? "Mixed across keys. Changing this sets selected keys’ actuation."
                : "Travel before the key registers a press."
            }
            min={0.1}
            max={3.3}
            step={step}
            value={key.actuation}
            suffix=" mm"
            onValueChange={(value) =>
              update((target) => {
                target.actuation = value;
              })
            }
          />
        </fieldset>
      )}
      {supports(device, "rapidTrigger") && (
        <fieldset
          className="keyboard-control-group"
          disabled={targets.length === 0}
        >
          <legend>Reset &amp; repeat</legend>
          <SaveToggle
            label="Rapid trigger"
            saveFields={indices.map((index) => `key.${index}.rt.on`)}
            description={
              mixed((target) => target.rt.on)
                ? "Mixed across keys. This switch sets rapid trigger for selected keys."
                : "Reset and repress after movement from each turning point."
            }
            checked={key.rt.on}
            onCheckedChange={(value) =>
              update((target) => {
                target.rt.on = value;
              })
            }
          />
          <SaveSlider
            label="Press sensitivity"
            saveFields={indices.map((index) => `key.${index}.rt.press`)}
            description={
              mixed((target) => target.rt.press)
                ? "Mixed across keys. Changing this sets selected keys’ press distance."
                : "Downward movement needed to register again."
            }
            min={0.02}
            max={3.3}
            step={step}
            suffix=" mm"
            disabled={!key.rt.on}
            value={key.rt.press}
            onValueChange={(value) =>
              update((target) => {
                target.rt.press = value;
              })
            }
          />
          <SaveSlider
            label="Release sensitivity"
            saveFields={indices.map((index) => `key.${index}.rt.release`)}
            description={
              mixed((target) => target.rt.release)
                ? "Mixed across keys. Changing this sets selected keys’ release distance."
                : "Upward movement needed to reset the key."
            }
            min={0.02}
            max={3.3}
            step={step}
            suffix=" mm"
            disabled={!key.rt.on}
            value={key.rt.release}
            onValueChange={(value) =>
              update((target) => {
                target.rt.release = value;
              })
            }
          />
        </fieldset>
      )}
      {supports(device, "deadZones") && (
        <details>
          <summary>Global dead zones</summary>
          <p className="keyboard-note">
            Ignore travel near the top and bottom. Values are verified by a
            separate device read.
          </p>
          {(["top", "bottom"] as const).map((edge) => (
            <SaveSlider
              key={edge}
              label={`${edge === "top" ? "Top" : "Bottom"} dead zone`}
              saveFields={[`deadZone.${edge}`]}
              min={0}
              max={3.3}
              step={0.01}
              suffix=" mm"
              value={settings.deadZone[edge]}
              onValueChange={(value) =>
                edit((s) => {
                  s.deadZone[edge] = value;
                })
              }
            />
          ))}
        </details>
      )}
    </div>
  );
}

export function LightingControls({
  device,
  settings,
  edit,
  paintColor,
  onPaintColorChange,
  animatePreview,
  onAnimatePreviewChange,
}: KeyboardEditorProps & {
  paintColor: string;
  onPaintColorChange: (color: string) => void;
  animatePreview: boolean;
  onAnimatePreviewChange: (value: boolean) => void;
}) {
  const reduced = useLightingReducedMotion();
  const colorModes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 26, 28, 31, 36];
  return (
    <div className="keyboard-controls">
      {supports(device, "rgb") && (
        <fieldset className="keyboard-control-group">
          <legend>Keyboard lighting</legend>
          <SaveSelect
            label="Effect"
            saveFields={["light.mode"]}
            value={settings.light.mode}
            options={LIGHT_MODES.map(([value, label]) => ({ value, label }))}
            onValueChange={(value) =>
              edit((s) => {
                s.light.mode = value;
              })
            }
          />
          <SaveSlider
            label="Brightness"
            saveFields={["light.brightness"]}
            min={1}
            max={100}
            value={settings.light.brightness}
            suffix="%"
            onValueChange={(value) =>
              edit((s) => {
                s.light.brightness = value;
              })
            }
            disabled={settings.light.mode === 0}
          />
          <SaveSlider
            label="Speed"
            saveFields={["light.speed"]}
            min={1}
            max={255}
            value={settings.light.speed}
            onValueChange={(value) =>
              edit((s) => {
                s.light.speed = value;
              })
            }
            disabled={[0, 1, 2, 3, 4, 5, 30].includes(settings.light.mode)}
          />
          {colorModes.includes(settings.light.mode) && (
            <div className="keyboard-color-section">
              <SaveColorPicker
                label="Effect color"
                saveFields={["light.color"]}
                value={settings.light.color}
                onValueChange={(hex) =>
                  edit((s) => {
                    s.light.color = hex;
                  })
                }
              />
            </div>
          )}
        </fieldset>
      )}
      {supports(device, "perKeyRgb") && settings.light.mode === 1 && (
        <div className="keyboard-color-section">
          <SaveColorPicker
            label="Paint color"
            value={paintColor}
            onValueChange={onPaintColorChange}
          />
        </div>
      )}
      {supports(device, "rgb") &&
        ![0, 1, 2, 3, 4, 5].includes(settings.light.mode) && (
          <SaveToggle
            label="Animate preview"
            checked={animatePreview && !reduced}
            onCheckedChange={onAnimatePreviewChange}
            disabled={!!reduced}
            disabledReason="Disabled by your reduced-motion preference."
            description="Preview motion only; this does not change the saved effect."
          />
        )}
      <p className="keyboard-note">
        {settings.light.mode === 1
          ? "Choose a paint color, then click or drag across keycaps. Each stroke is one undo step."
          : "The preview uses the saved effect color. Firmware-generated colors and timing may differ."}{" "}
        Per-key colors save after the custom-color commit is read back.
      </p>
    </div>
  );
}

export function SettingsControls({
  device,
  settings,
  edit,
}: KeyboardEditorProps) {
  const flags = [
    [
      "winLock",
      "Windows key lock",
      "Prevent the Windows key from opening Start.",
    ],
    [
      "exchangeWasd",
      "Swap WASD and arrows",
      "Exchange movement keys with arrow keys.",
    ],
    ["macSwitch", "macOS mode", "Use the macOS base and Fn layers."],
    [
      "sixKeyNoPunch",
      "6-key rollover",
      "Limit simultaneous keys for compatibility.",
    ],
    [
      "bottomTrigger",
      "Bottom optimization",
      "Use the controller’s bottom-trigger optimization.",
    ],
    ["performanceMode", "Extreme mode", "Use 0.01 mm adjustment steps."],
  ] as const;
  return (
    <>
      {supports(device, "pollingRate") && (
        <section className="keyboard-settings-card" aria-label="Polling">
          <h2>Polling rate</h2>
          <p className="keyboard-note">
            How often the keyboard reports input to your computer.
          </p>
          <SaveSelect
            label="Report rate"
            saveFields={["pollingRate"]}
            value={settings.pollingRate}
            options={[1000, 2000, 4000, 8000].map((value) => ({
              value,
              label: `${value.toLocaleString()} Hz`,
            }))}
            onValueChange={(value) =>
              edit((s) => {
                s.pollingRate = value as KeyboardSettings["pollingRate"];
              })
            }
          />
        </section>
      )}
      {supports(device, "keyboardOptions") && (
        <section
          className="keyboard-settings-card keyboard-settings-options"
          aria-label="Keyboard options"
        >
          <h2>Keyboard options</h2>
          <div className="keyboard-options-grid">
            {flags.map(([field, label, description]) => (
              <SaveToggle
                key={field}
                label={label}
                saveFields={[`options.${field}`]}
                description={description}
                checked={settings.options[field]}
                onCheckedChange={(value) =>
                  edit((s) => {
                    s.options[field] = value;
                  })
                }
              />
            ))}
          </div>
          <details>
            <summary>Source field</summary>
            <label className="keyboard-field">
              RGB area byte
              <input
                type="number"
                min={0}
                max={255}
                step={1}
                value={settings.options.rgbArea}
                onChange={(e) => {
                  if (e.currentTarget.validity.valid && e.target.value !== "")
                    edit((s) => {
                      s.options.rgbArea = +e.target.value;
                    });
                }}
              />
            </label>
            <SaveStatus fields={["options.rgbArea"]} />
            <p className="keyboard-note">
              Source field; value meanings need packet verification.
            </p>
          </details>
        </section>
      )}
    </>
  );
}
