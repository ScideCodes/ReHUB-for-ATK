import { useId } from "react";
import { useHub } from "../../../app/HubProvider";
import { useConfigStore } from "../../../store/configStore";
import { editSetting } from "../../../features/maps/mapSession";
import "../lighting-options.css";

const modes = [
  { value: 0, label: "Off", description: "No receiver indicator." },
  {
    value: 1,
    label: "Connection / polling",
    description: "Show connection and polling state.",
  },
  { value: 2, label: "Battery", description: "Show the mouse battery state." },
  {
    value: 3,
    label: "Low battery only",
    description: "Light only when the battery is low.",
  },
];
export function LightingTab() {
  const { settings } = useHub();
  const info = useConfigStore((state) => state.deviceInfo);
  const id = useId();
  const lit = settings.dongleRgbMode === 1 || settings.dongleRgbMode === 2;
  return (
    <div className="lg-lighting lg-lighting-options">
      <div
        className="lg-receiver-preview glass-clear glass-inset"
        data-lit={lit}
        data-mode={settings.dongleRgbMode}
      >
        <span className="lg-preview-label">Receiver preview</span>
        <svg
          viewBox="0 0 420 220"
          role="img"
          aria-label={`8K Dongle-H preview, ${modes[settings.dongleRgbMode]?.label}`}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0.8" y2="1">
              <stop offset="0" stopColor="var(--lg-receiver-top)" />
              <stop offset="1" stopColor="var(--lg-receiver-bottom)" />
            </linearGradient>
          </defs>
          <path
            d="M82 83Q85 64 105 60L304 60Q330 61 337 84L350 145Q351 163 329 170L92 170Q68 168 70 149Z"
            fill={`url(#${id})`}
            stroke="var(--control-border)"
          />
          <path
            d="M93 68H312M78 151H343"
            stroke="var(--glass-border-top)"
            fill="none"
          />
          <rect
            x="184"
            y="46"
            width="53"
            height="14"
            rx="5"
            fill="var(--surface-inset)"
            stroke="var(--control-border)"
          />
          <text
            x="210"
            y="119"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="25"
            fontFamily="var(--font-sans)"
            letterSpacing="-1"
          >
            ATK
          </text>
          <rect
            className="lg-receiver-led"
            x="173"
            y="145"
            width="74"
            height="5"
            rx="2.5"
          />
          <text
            x="210"
            y="202"
            textAnchor="middle"
            fill="var(--hub-text)"
            fontSize="11"
            fontFamily="var(--font-sans)"
          >
            8K Dongle-H
          </text>
        </svg>
        <p>
          {settings.dongleRgbMode === 3
            ? "Low-battery indicator"
            : lit
              ? "Indicator enabled"
              : "Indicator off"}
          <span>{modes[settings.dongleRgbMode]?.description}</span>
        </p>
      </div>
      <fieldset className="lg-led-modes" aria-describedby={`${id}-led-help`}>
        <legend>Receiver LED</legend>
        <p id={`${id}-led-help`}>Choose what the 8K Dongle-H displays.</p>
        <div className="lg-led-mode-list">
          {modes.map((mode) => (
            <label className="lg-led-mode" key={mode.value}>
              <input
                type="radio"
                name={`${id}-led-mode`}
                value={mode.value}
                checked={settings.dongleRgbMode === mode.value}
                aria-labelledby={`${id}-led-label-${mode.value}`}
                aria-describedby={`${id}-led-description-${mode.value}`}
                onChange={() => editSetting("dongleRgbMode", mode.value)}
              />
              <span>
                <strong id={`${id}-led-label-${mode.value}`}>
                  {mode.label}
                </strong>
                <span id={`${id}-led-description-${mode.value}`}>
                  {mode.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {info.connectionMode !== "wireless_dongle" && (
        <p className="lg-inline-notice">
          {info.connected
            ? "Connect the 8K receiver to apply its LED setting."
            : "Connect the 8K receiver to apply. Preview works offline."}
        </p>
      )}
      <div className="lg-lighting-notes">
        <p>Mouse lighting is not available on the Frost Zero Extreme.</p>
        <p>
          Firmware controls indicator colors and the low-battery threshold.
          Preview shows the selected mode.
        </p>
      </div>
    </div>
  );
}
