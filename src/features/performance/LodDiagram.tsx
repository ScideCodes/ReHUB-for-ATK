import { memo } from "react";

interface LodDiagramProps {
  height: number;
}

// Streamlined ergonomic mouse silhouette with sensor diode aperture
const MOUSE_OUTLINE_PATH =
  "M 14 18 C 14 14 20 6 34 3 C 48 0 66 1 82 7 C 94 11 106 18 106 24 C 106 27 102 28 98 28 L 20 28 C 15 28 14 24 14 18 Z";

export const LodDiagram = memo(function LodDiagram({
  height,
}: LodDiagramProps) {
  // Height ranges from 0.7mm to 2.0mm.
  // Visual lift: 0.7mm -> 6px, 2.0mm -> 24px.
  const clampedHeight = Math.max(0.7, Math.min(2.0, height));
  const liftPx = Math.round(6 + ((clampedHeight - 0.7) / 1.3) * 18);

  // Surface datum Y coordinate is 74px inside 96px frame
  const surfaceY = 74;
  const mouseBottomY = surfaceY - liftPx;
  // MOUSE_OUTLINE_PATH base line sits at Y=28
  const mouseTranslateY = mouseBottomY - 28;
  const sensorX = 60; // center of sensor lens

  return (
    <div
      className="lg-lod-visualizer"
      role="img"
      aria-label={`Lift-off distance illustration: ${clampedHeight.toFixed(1)} mm`}
    >
      <svg
        viewBox="0 0 170 96"
        className="lg-lod-svg"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="lodLaserBeam" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--hub-accent)" stopOpacity="0.9" />
            <stop
              offset="60%"
              stopColor="var(--hub-accent)"
              stopOpacity="0.35"
            />
            <stop
              offset="100%"
              stopColor="var(--hub-accent)"
              stopOpacity="0.1"
            />
          </linearGradient>

          <radialGradient id="lodGroundSpot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--hub-accent)" stopOpacity="0.8" />
            <stop
              offset="50%"
              stopColor="var(--hub-accent)"
              stopOpacity="0.25"
            />
            <stop offset="100%" stopColor="var(--hub-accent)" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="lodMouseStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop
              offset="0%"
              stopColor="var(--hub-text-muted)"
              stopOpacity="0.6"
            />
            <stop offset="50%" stopColor="var(--hub-text)" />
            <stop
              offset="100%"
              stopColor="var(--hub-text-muted)"
              stopOpacity="0.8"
            />
          </linearGradient>
        </defs>

        <g className="lg-lod-surface-group">
          <line
            x1="8"
            y1={surfaceY}
            x2="162"
            y2={surfaceY}
            stroke="var(--control-border)"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />
          <line
            x1="18"
            y1={surfaceY + 1}
            x2="152"
            y2={surfaceY + 1}
            stroke="var(--line-subtle)"
            strokeWidth="1"
          />
          <ellipse
            cx={sensorX}
            cy={surfaceY}
            rx={Math.max(6, liftPx * 0.45)}
            ry="2.5"
            fill="url(#lodGroundSpot)"
          />
        </g>

        <g className="lg-lod-beam-group">
          <polygon
            points={`${sensorX - 2},${mouseBottomY} ${sensorX + 2},${mouseBottomY} ${sensorX + Math.max(5, liftPx * 0.35)},${surfaceY} ${sensorX - Math.max(5, liftPx * 0.35)},${surfaceY}`}
            fill="url(#lodLaserBeam)"
          />
          <line
            x1={sensorX}
            y1={mouseBottomY}
            x2={sensorX}
            y2={surfaceY}
            stroke="var(--hub-accent)"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        </g>

        <g
          className="lg-lod-mouse-group"
          style={{
            transform: `translateY(${mouseTranslateY}px)`,
            transition: "transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)",
          }}
        >
          <path
            d={MOUSE_OUTLINE_PATH}
            fill="rgba(255, 255, 255, 0.04)"
            stroke="url(#lodMouseStroke)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <rect
            x="36"
            y="6"
            width="4"
            height="8"
            rx="2"
            fill="none"
            stroke="var(--hub-text-muted)"
            strokeWidth="1"
          />
          <rect
            x={sensorX - 3}
            y="26"
            width="6"
            height="2.5"
            rx="1"
            fill="var(--hub-accent)"
          />
        </g>

        <g className="lg-lod-caliper-group">
          <line
            x1="120"
            y1={mouseBottomY}
            x2="132"
            y2={mouseBottomY}
            stroke="var(--hub-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{
              transition:
                "y1 200ms cubic-bezier(0.2, 0.9, 0.3, 1), y2 200ms cubic-bezier(0.2, 0.9, 0.3, 1)",
            }}
          />
          <line
            x1="130"
            y1={mouseBottomY}
            x2="130"
            y2={surfaceY}
            stroke="var(--hub-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="120"
            y1={surfaceY}
            x2="132"
            y2={surfaceY}
            stroke="var(--hub-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="128"
            y1={(mouseBottomY + surfaceY) / 2}
            x2="132"
            y2={(mouseBottomY + surfaceY) / 2}
            stroke="var(--hub-accent)"
            strokeWidth="1"
          />
        </g>
      </svg>

      <div className="lg-lod-telemetry">
        <span className="lg-lod-tag">THRESHOLD</span>
        <span className="lg-lod-value">{clampedHeight.toFixed(1)} mm</span>
      </div>
    </div>
  );
});
