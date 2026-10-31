import type { DeviceDefinition } from "../types/schema";

export function AppearancePicker({ device, color, setColor }: {
  device: DeviceDefinition;
  color: number;
  setColor: (index: number) => void;
}) {
  if (!device.colorways?.length) return null;
  return (
    <div className="h-card hm-other">
      <strong>Product Appearance Preview</strong>
      <div role="group" aria-label="Product colour" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {device.colorways.map((c, i) => (
          <button key={c.id ?? c.name} type="button" className={`h-btn${i === color ? " primary" : ""}`}
            aria-pressed={i === color} onClick={() => setColor(i)}>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
