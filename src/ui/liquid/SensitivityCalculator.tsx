import { useId, useState } from "react";
import { Calculator, Copy } from "lucide-react";
import { Button, Dialog } from "../index";

export function matchSensitivity(
  previousDpi: number,
  sensitivity: number,
  nextDpi: number,
) {
  if (
    ![previousDpi, sensitivity, nextDpi].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const result = sensitivity * (previousDpi / nextDpi);
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function SensitivityCalculator({
  dpiX,
  dpiY,
}: {
  dpiX: number;
  dpiY: number;
}) {
  const [open, setOpen] = useState(false);
  const [previousDpi, setPreviousDpi] = useState("800");
  const [sensitivity, setSensitivity] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const id = useId();
  const split = dpiX !== dpiY;
  const results = (
    split
      ? [
          ["Horizontal", dpiX],
          ["Vertical", dpiY],
        ]
      : [["New sensitivity", dpiX]]
  ) as [string, number][];
  function clearFeedback() {
    setCopyMessage("");
  }
  return (
    <>
      <Button
        className="lg-calculator-trigger"
        size="small"
        variant="ghost"
        icon={<Calculator size={15} />}
        onClick={() => {
          clearFeedback();
          setOpen(true);
        }}
      >
        Match in-game sensitivity
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Match your sensitivity"
        description="Keep the same aim speed when changing DPI. For linear sensitivity in the same game."
      >
        <div className="lg-sensitivity-calculator">
          <div className="lg-calculator-inputs">
            <label className="hub-field" htmlFor={`${id}-dpi`}>
              <span>Previous DPI</span>
              <input
                id={`${id}-dpi`}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={previousDpi}
                onChange={(event) => {
                  setPreviousDpi(event.target.value);
                  clearFeedback();
                }}
              />
            </label>
            <label className="hub-field" htmlFor={`${id}-sensitivity`}>
              <span>Previous in-game sensitivity</span>
              <input
                id={`${id}-sensitivity`}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={sensitivity}
                onChange={(event) => {
                  setSensitivity(event.target.value);
                  clearFeedback();
                }}
              />
            </label>
          </div>
          {results.map(([label, dpi]) => {
            const result = matchSensitivity(
              Number(previousDpi),
              Number(sensitivity),
              dpi,
            );
            const formatted =
              result === null ? "" : String(Number(result.toPrecision(8)));
            return (
              <div className="lg-calculator-result" key={label}>
                <label className="hub-field">
                  <span>
                    {label} at {dpi.toLocaleString("en-US")} DPI
                  </span>
                  <input
                    aria-label={label}
                    value={formatted}
                    readOnly
                    placeholder="Enter your previous settings"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <Button
                  size="small"
                  icon={<Copy size={14} />}
                  disabled={result === null}
                  aria-label={`Copy ${label.toLowerCase()}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formatted);
                      setCopyMessage(`${label} copied.`);
                    } catch {
                      setCopyMessage("Select the result and copy it manually.");
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
            );
          })}
          {sensitivity !== "" &&
            matchSensitivity(Number(previousDpi), Number(sensitivity), dpiX) ===
              null && (
              <p className="lg-calculator-note" role="alert">
                Enter positive, finite values for DPI and sensitivity.
              </p>
            )}
          {split && (
            <p className="lg-calculator-note">
              X and Y use different DPI. One in-game sensitivity value cannot
              preserve both axes.
            </p>
          )}
          <p className="lg-calculator-note">
            Paste the result into your game. This calculator does not change
            mouse settings.
          </p>
          <p className="lg-calculator-feedback" role="status">
            {copyMessage}
          </p>
        </div>
      </Dialog>
    </>
  );
}
