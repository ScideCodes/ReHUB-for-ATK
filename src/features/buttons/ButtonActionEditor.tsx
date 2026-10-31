import { Select } from "../../ui";
import type { ButtonAction } from "../../types/schema";

const classes = [
  "Disable button",
  "Mouse button",
  "Change DPI",
  "Horizontal scroll",
  "Repeated clicks",
  "Keyboard shortcut",
  "Macro",
  "Switch polling rate",
  "Lighting action",
  "Switch onboard profile",
  "DPI lock",
  "Scroll wheel",
];
const explanations = [
  "Do nothing when this button is pressed.",
  "Use a standard click, back, or forward action.",
  "Cycle through your saved sensitivity stages.",
  "Scroll left or right.",
  "Send a set number of clicks with a delay between them.",
  "Save a keyboard or media sequence. Hardware writes are unverified.",
  "Save a repeated sequence. Hardware writes are unverified.",
  "Assign the device’s polling-rate switch action.",
  "This lighting action is not supported by the ZERO EX.",
  "Assign the device’s onboard profile switch action.",
  "Assign the device’s DPI lock action.",
  "Scroll up or down with a button press.",
];
const initialValues: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 0],
  [1, 0],
  [1, 1],
  [0, 0],
  [0, 1],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [1, 0],
];

function ByteInput({
  label,
  value,
  min = 0,
  max = 255,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="hub-field">
      <span className="hub-control-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => {
          const number = event.currentTarget.valueAsNumber;
          if (Number.isFinite(number))
            onChange(Math.max(min, Math.min(max, Math.round(number))));
        }}
      />
    </label>
  );
}

export function ButtonActionEditor({
  action,
  onChange,
}: {
  action: ButtonAction;
  onChange: (action: ButtonAction) => void;
}) {
  const update = (values: Partial<ButtonAction>) =>
    onChange({ ...action, ...values });
  const sequence = action.keyClass === 5 || action.keyClass === 6;
  const options = (values: [number, string][]) =>
    values.map(([value, label]) => ({ value, label }));
  const loopMode = [253, 254, 255].includes(action.keyValue2)
    ? String(action.keyValue2)
    : "loops";
  return (
    <div className="button-action-editor">
      <Select<number>
        label="What should this button do?"
        value={action.keyClass}
        options={classes.map((label, value) => ({
          value,
          label,
          description: explanations[value],
          disabled: value === 8,
          disabledReason: value === 8 ? "Unsupported by ZERO EX" : undefined,
        }))}
        onValueChange={(keyClass) => {
          const [keyValue1, keyValue2] = initialValues[keyClass];
          update({ keyClass, keyValue1, keyValue2, description: undefined });
        }}
      />
      {action.keyClass === 0 && (
        <p className="hub-muted">This mouse button is disabled.</p>
      )}
      {action.keyClass === 1 && (
        <fieldset className="mouse-action-bits">
          <legend className="hub-control-label">Mouse actions</legend>
          {(
            [
              [1, "Left"],
              [2, "Right"],
              [4, "Middle"],
              [8, "Backward"],
              [16, "Forward"],
            ] as [number, string][]
          ).map(([bit, label]) => (
            <label key={bit}>
              <input
                type="checkbox"
                checked={Boolean(action.keyValue1 & bit)}
                onChange={() => update({ keyValue1: action.keyValue1 ^ bit })}
              />
              <span>{label}</span>
            </label>
          ))}
          {action.keyValue1 === 0 && <p className="hub-control-hint">Off</p>}
        </fieldset>
      )}
      {action.keyClass === 2 && (
        <Select<number>
          label="DPI action"
          value={action.keyValue1}
          options={options([
            [1, "Cycle stages"],
            [2, "Increase stage"],
            [3, "Decrease stage"],
          ])}
          onValueChange={(keyValue1) => update({ keyValue1 })}
        />
      )}
      {action.keyClass === 3 && (
        <Select<number>
          label="Roll direction"
          value={action.keyValue1}
          options={options([
            [1, "Left"],
            [2, "Right"],
          ])}
          onValueChange={(keyValue1) => update({ keyValue1 })}
        />
      )}
      {action.keyClass === 4 && (
        <>
          <ByteInput
            label="Interval (ms)"
            value={action.keyValue1}
            min={1}
            onChange={(keyValue1) => update({ keyValue1 })}
          />
          <ByteInput
            label="Number of clicks"
            value={action.keyValue2}
            min={1}
            onChange={(keyValue2) => update({ keyValue2 })}
          />
        </>
      )}
      {action.keyClass === 5 && (
        <label className="hub-field">
          <span className="hub-control-label">Keyboard / media sequence</span>
          <textarea
            rows={4}
            value={action.description ?? ""}
            onChange={(event) =>
              update({ description: event.currentTarget.value })
            }
            aria-describedby="shortcut-verification"
          />
          <span id="shortcut-verification" className="hub-control-hint">
            Enter the keyboard, media, or combination sequence to save with this
            map.
          </span>
        </label>
      )}
      {action.keyClass === 6 && (
        <>
          <ByteInput
            label="Macro index"
            value={action.keyValue1}
            onChange={(keyValue1) => update({ keyValue1 })}
          />
          <Select<string>
            label="Playback mode"
            value={loopMode}
            options={[
              { value: "loops", label: "Loop count" },
              { value: "254", label: "Stop now" },
              { value: "253", label: "Repeat until next key" },
              { value: "255", label: "Repeat until any key" },
            ]}
            onValueChange={(value) =>
              update({ keyValue2: value === "loops" ? 1 : Number(value) })
            }
          />
          {loopMode === "loops" && (
            <ByteInput
              label="Loop count"
              value={action.keyValue2}
              max={252}
              onChange={(keyValue2) => update({ keyValue2 })}
            />
          )}
          <label className="hub-field">
            <span className="hub-control-label">Macro sequence</span>
            <textarea
              rows={6}
              value={action.description ?? ""}
              onChange={(event) =>
                update({ description: event.currentTarget.value })
              }
            />
            <span className="hub-control-hint">
              Save the sequence as text. Hardware sequence packing is
              unverified.
            </span>
          </label>
        </>
      )}
      {[7, 9, 10].includes(action.keyClass) && (
        <>
          <ByteInput
            label="Value 1"
            value={action.keyValue1}
            onChange={(keyValue1) => update({ keyValue1 })}
          />
          <ByteInput
            label="Value 2"
            value={action.keyValue2}
            onChange={(keyValue2) => update({ keyValue2 })}
          />
        </>
      )}
      {action.keyClass === 8 && (
        <p className="setting-reason">
          Chandeliers is unsupported by the ZERO EX.
        </p>
      )}
      {action.keyClass === 11 && (
        <Select<number>
          label="Wheel direction"
          value={action.keyValue1}
          options={options([
            [1, "Up"],
            [2, "Down"],
          ])}
          onValueChange={(keyValue1) => update({ keyValue1 })}
        />
      )}
      {sequence && (
        <div className="verification-notice">
          <span className="verification-tag">needs packet verification</span>
          <p>
            Saved in maps and simulated in mock mode. Hardware sequence writes
            are disabled.
          </p>
        </div>
      )}
    </div>
  );
}
