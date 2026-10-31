import { memo } from "react";
import { clsx } from "clsx";
import { useDeviceSession } from "./deviceSession";
import { useConfigStore } from "../../store/configStore";
import { resolveMouseImage } from "./deviceCatalog";
import { resolveDeviceImage } from "../../devices/presentation";
import { selectedColorIndex, useMouseColorway } from "../../ui/mouseColorway";

export type MouseButtonId = "left" | "right" | "middle" | "side1" | "side2";

type Region = { id: MouseButtonId; label: string; path: string };

/* Hit areas are drawn in the photo's own pixel space (312 x 582). */
const PHOTO_WIDTH = 312;
const PHOTO_HEIGHT = 582;

const regions: Region[] = [
  {
    id: "left",
    label: "Left button",
    path: "M154 8C92 8 42 34 28 104L22 252H154Z",
  },
  {
    id: "right",
    label: "Right button",
    path: "M158 8C220 8 270 34 284 104L290 252H158Z",
  },
  {
    id: "middle",
    label: "Middle button",
    path: "M136 72Q155 62 176 72L177 154Q156 163 135 154Z",
  },
  {
    id: "side1",
    label: "Backward button",
    path: "M4 276Q4 268 14 268H28V348H20Q4 346 4 338Z",
  },
  {
    id: "side2",
    label: "Forward button",
    path: "M6 182Q6 174 16 174H30V248H16Q6 248 6 240Z",
  },
];

type Props = {
  selected?: MouseButtonId;
  onSelect?: (id: MouseButtonId) => void;
  compact?: boolean;
};

export const MouseIllustration = memo(function MouseIllustration({
  selected,
  onSelect,
  compact = false,
}: Props) {
  const skin = useDeviceSession((state) => state.skin);
  const info = useConfigStore((state) => state.deviceInfo);
  const model = useConfigStore((state) => state.selectedDevice);
  const colors = useMouseColorway((state) => state.colors);
  const photoHref =
    model && (info.isMock || model.name === info.name)
      ? resolveDeviceImage(model, selectedColorIndex(model, colors))
      : resolveMouseImage(info.cid, info.mid, skin);

  return (
    <div
      className={clsx(
        "mouse-illustration",
        compact && "mouse-illustration--compact",
      )}
      data-skin={skin}
    >
      <svg
        viewBox={`0 0 ${PHOTO_WIDTH} ${PHOTO_HEIGHT}`}
        shapeRendering="geometricPrecision"
        role={onSelect ? "group" : "img"}
        aria-label={
          onSelect
            ? "Select one of five mouse buttons"
            : `${model?.name ?? info.name ?? "Mouse"}${photoHref ? "" : "; image unavailable"}`
        }
      >
        {!photoHref && (
          <path
            d="M156 10C65 10 18 65 18 180v230c0 110 48 160 138 160s138-50 138-160V180C294 65 247 10 156 10Z"
            fill="currentColor"
            opacity=".12"
          />
        )}
        <image
          className="mouse-photo"
          href={photoHref ?? undefined}
          width={PHOTO_WIDTH}
          height={PHOTO_HEIGHT}
          preserveAspectRatio="xMidYMid meet"
          style={{ imageRendering: "auto" }}
        />
        {onSelect &&
          regions.map((region) => (
            <g
              key={region.id}
              role="button"
              tabIndex={0}
              aria-label={region.label}
              aria-pressed={selected === region.id}
              className="mouse-button-region"
              data-selected={selected === region.id}
              onClick={() => onSelect(region.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(region.id);
                }
              }}
            >
              <path d={region.path} />
            </g>
          ))}
      </svg>
    </div>
  );
});
