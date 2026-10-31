import { useHub } from "../../../app/HubProvider";
import { editSetting } from "../../../features/maps/mapSession";
import { Toggle } from "../../index";
import { CommitSlider, Row } from "../controls";

export function DebounceTab() {
  const { settings } = useHub();
  const fast = settings.fastTrigger;
  return (
    <div className="lg-debounce">
      <section className="lg-timing-hero glass-clear glass-inset">
        <Row
          label="Debounce"
          help="Filters contact bounce. Increase if double clicks occur."
        >
          <CommitSlider
            label="Global debounce"
            value={settings.keyDebounce}
            min={0}
            max={20}
            suffix=" ms"
            hideLabel
            onCommit={(value) => editSetting("keyDebounce", value)}
          />
        </Row>
      </section>
      <section className="lg-click-pair glass-clear glass-inset">
        {(["left", "right"] as const).map((side) => (
          <div key={side} className="lg-click-column">
            <h2>{side === "left" ? "Left button" : "Right button"}</h2>
            <Toggle
              label="Fast trigger"
              checked={side === "left" ? fast.leftEnabled : fast.rightEnabled}
              onCheckedChange={(enabled) =>
                editSetting("fastTrigger", {
                  ...fast,
                  [side === "left" ? "leftEnabled" : "rightEnabled"]: enabled,
                })
              }
            />
            <p className="lg-tab-help">
              Enable the button's fast-trigger mode.
            </p>
            <CommitSlider
              label="Click delay"
              value={side === "left" ? fast.leftDelay : fast.rightDelay}
              min={0}
              max={20}
              suffix=" ms"
              onCommit={(value) =>
                editSetting("fastTrigger", {
                  ...fast,
                  [side === "left" ? "leftDelay" : "rightDelay"]: value,
                })
              }
            />
          </div>
        ))}
      </section>
      <section className="lg-debounce-wheel glass-clear glass-inset">
        <Row label="Wheel debounce" help="Filters repeated wheel signals.">
          <CommitSlider
            label="Wheel debounce"
            hideLabel
            value={settings.rollingDelay}
            min={0}
            max={50}
            suffix=" ms"
            onCommit={(value) => editSetting("rollingDelay", value)}
          />
        </Row>
      </section>
    </div>
  );
}
