import type { DeviceSettings } from "../../types/schema";

const number = new Intl.NumberFormat("en-US");

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;
}

export function SettingsSnapshot({
  settings,
  unavailable = [],
}: {
  settings: DeviceSettings;
  unavailable?: readonly string[];
}) {
  const active = settings.dpiStages.find(
    (stage) => stage.stage === settings.activeDpiStage,
  );
  const dpi = active
    ? active.xDpi === active.yDpi
      ? number.format(active.xDpi)
      : `${number.format(active.xDpi)} × ${number.format(active.yDpi)}`
    : "Unavailable";
  const rows = [
    {
      label: "Active DPI",
      value: dpi,
      unreadable:
        unavailable.includes("dpiStages") ||
        unavailable.includes("activeDpiStage"),
    },
    {
      label: "Polling",
      value: `${number.format(settings.pollingRate)} Hz`,
      unreadable: unavailable.includes("pollingRate"),
    },
    {
      label: "Debounce",
      value: `${settings.keyDebounce} ms`,
      unreadable: unavailable.includes("keyDebounce"),
    },
    {
      label: "Sleep",
      value: duration(settings.sleepTime),
      unreadable: unavailable.includes("sleepTime"),
    },
  ];

  return (
    <dl className="lg-settings-snapshot">
      {rows.map(({ label, value, unreadable }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{unreadable ? "Unreadable" : value}</dd>
        </div>
      ))}
    </dl>
  );
}
