import { ButtonSave } from "../LiveControls";
import { useState } from "react";
import { useHub } from "../../../app/HubProvider";
import {
  MouseIllustration,
  type MouseButtonId,
} from "../../../features/device/MouseIllustration";
import { ButtonActionEditor } from "../../../features/buttons/ButtonActionEditor";
import { editSetting } from "../../../features/maps/mapSession";
import { DeviceSettingsSchema } from "../../../types/schema";
import { Button } from "../../Button";

const buttons: { id: MouseButtonId; name: string }[] = [
  { id: "left", name: "Left click" },
  { id: "right", name: "Right click" },
  { id: "middle", name: "Wheel click" },
  { id: "side1", name: "Back" },
  { id: "side2", name: "Forward" },
];
export function ButtonsTab({ onDiff }: { onDiff?: () => void }) {
  const hub = useHub();
  const { settings } = hub;
  const [selected, setSelected] = useState<MouseButtonId>("left");
  const action = settings.buttons.find((button) => button.id === selected);

  return (
    <div className="lg-buttons">
      <p className="lg-tab-help">
        Select a button on the mouse to change its action.
      </p>
      <div className="lg-button-figure" data-selected={selected}>
        <MouseIllustration selected={selected} onSelect={setSelected} />
        <svg
          viewBox="0 0 520 420"
          className="lg-callout-lines"
          shapeRendering="geometricPrecision"
          aria-hidden="true"
        >
          <path className="lg-line-1" d="M165 88H185L220 132" />
          <path className="lg-line-2" d="M355 88H335L300 132" />
          <path className="lg-line-3" d="M355 184H320L266 158" />
          <path className="lg-line-4" d="M140 256H170L194 230" />
          <path className="lg-line-5" d="M160 190H180L202 195" />
        </svg>
        {buttons.map((button, index) => (
          <button
            key={button.id}
            className={`lg-callout lg-callout-${index + 1}`}
            aria-pressed={selected === button.id}
            onClick={() => setSelected(button.id)}
          >
            <span className="lg-callout-badge" aria-hidden="true">{index + 1}</span>
            <span className="lg-callout-label">{button.name}</span>
          </button>
        ))}
      </div>
      {action && (
        <section
          className="lg-button-assignment glass-clear glass-inset"
          aria-label="Button assignment"
        >
          <div className="lg-assignment-title">
            <span className="lg-button-number">
              {buttons.findIndex((item) => item.id === selected) + 1}
            </span>
            <div>
              <h2>{buttons.find((item) => item.id === selected)?.name}</h2>
              <p>Assignment saved to this map.</p>
            </div>
          </div>
          <ButtonActionEditor
            action={action}
            onChange={(next) =>
              editSetting(
                "buttons",
                settings.buttons.map((button) =>
                  button.id === selected ? next : button,
                ),
              )
            }
          />
          <ButtonSave onDiff={onDiff} />
        </section>
      )}
      {!action && (
        <div className="lg-empty">
          <h2>No assignment</h2>
          <p>This map has no entry for the selected button.</p>
          <Button
            onClick={() => {
              const entry = DeviceSettingsSchema.parse({}).buttons.find(
                (button) => button.id === selected,
              );
              if (entry) editSetting("buttons", [...settings.buttons, entry]);
            }}
          >
            Add default assignment
          </Button>
        </div>
      )}
      <p className="lg-footnote">
        ZERO EX exposes five remappable buttons. Sequence actions require packet
        verification on hardware.
      </p>
    </div>
  );
}
