import { useState } from "react";
import { Keyboard, Mouse } from "lucide-react";
import type { DeviceDefinition } from "../types/schema";
import { resolveDeviceImage } from "../devices/presentation";
import layoutPreviews from "../devices/layoutPreviews.json";

export function DevicePreview({
  device,
  color = 0,
}: {
  device: DeviceDefinition;
  color?: number;
}) {
  const src = resolveDeviceImage(device, color);
  const [failed, setFailed] = useState<string | null>(null);
  const name = `${device.name}${device.colorways?.[color] ? `, ${device.colorways[color].name}` : ""}`;
  const Icon = device.kind === "mouse" ? Mouse : Keyboard;
  const layout =
    device.kind === "keyboard"
      ? (
          layoutPreviews as Record<
            string,
            { image: string; source: string; name: string; keyCount: number }
          >
        )[`${Number(device.VID)}:${Number(device.PID)}`]
      : undefined;
  if ((!src || src === failed) && layout)
    return (
      <figure
        className="device-layout-preview"
        role="img"
        aria-label={`${device.name}; ${layout.keyCount}-key source layout preview; product photo unavailable`}
        title={`Source: ${layout.source}`}
      >
        <img src={layout.image} alt="" />
        <figcaption>Layout preview</figcaption>
      </figure>
    );
  return src && src !== failed ? (
    <img src={src} alt={name} onError={() => setFailed(src)} />
  ) : (
    <div
      className="device-preview-unavailable"
      role="img"
      aria-label={`${name}; image unavailable`}
    >
      <Icon aria-hidden="true" />
      <span>Image unavailable</span>
    </div>
  );
}
