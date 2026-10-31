import { memo, useRef, useCallback } from "react";

interface SensorRotationDiagramProps {
  angle: number;
  enabled?: boolean;
  onChange?: (angle: number) => void;
}

export const SensorRotationDiagram = memo(function SensorRotationDiagram({
  angle,
  enabled = true,
  onChange,
}: SensorRotationDiagramProps) {
  const min = -30;
  const max = 30;
  const clampedAngle = Math.max(min, Math.min(max, Math.round(angle)));

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Dial Geometry:
  // Center is (137.5, 130) inside a 275x260 SVG
  const cx = 137.5;
  const cy = 130;
  const r = 110;
  const circumference = 2 * Math.PI * r; // ~691.15

  // Map angle -30..+30 to -65deg..+65deg (0deg is 12 o'clock / straight up)
  const angleDeg = (clampedAngle / 30) * 65;
  const arcLength = (Math.abs(angleDeg) / 360) * circumference;

  // Thumb coordinates
  const thumbRad = ((angleDeg - 90) * Math.PI) / 180;
  const thumbX = cx + r * Math.cos(thumbRad);
  const thumbY = cy + r * Math.sin(thumbRad);

  // Total span of background calibration track (-65deg to +65deg = 130deg)
  const trackSpanLength = (130 / 360) * circumference; // ~249.58px

  const updateFromPointer = useCallback(
    (e: React.PointerEvent) => {
      if (!containerRef.current || !onChange) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      let deg = (rad * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      // Map deg (-65 to +65) to angle (-30 to +30)
      const mapped = Math.round((deg / 65) * 30);
      const next = Math.max(min, Math.min(max, mapped));
      onChange(next);
    },
    [onChange, min, max],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    updateFromPointer(e);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      updateFromPointer(e);
    },
    [updateFromPointer],
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* The illustrative preview remains usable without pointer capture. */ }
    }
  };

  // Section markers (-30, -15, 0, 15, 30)
  const sections = [-30, -15, 0, 15, 30];

  return (
    <div
      className={`lg-rotation-visualizer ${!enabled ? "is-disabled" : ""}`}
      role="img"
      aria-label={`Sensor rotation angle: ${clampedAngle > 0 ? "+" : ""}${clampedAngle}°`}
    >
      <div
        ref={containerRef}
        className="atk-mouse-rot-container"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <svg
          className="atk-rot-svg"
          width="275"
          height="260"
          viewBox="0 0 275 260"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="atkRotActiveGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="var(--hub-accent)" />
              <stop
                offset="100%"
                stopColor="var(--hub-accent)"
                stopOpacity="0.8"
              />
            </linearGradient>
          </defs>

          <circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="4"
            fill="none"
            strokeDasharray={`${trackSpanLength} ${circumference}`}
            strokeDashoffset="0"
            strokeLinecap="round"
            transform={`rotate(-155 ${cx} ${cy})`}
          />

          {clampedAngle !== 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              stroke="url(#atkRotActiveGradient)"
              strokeWidth="4.5"
              fill="none"
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={clampedAngle > 0 ? 0 : arcLength}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}

          <circle
            cx={cx}
            cy={cy}
            r="86"
            fill="rgba(255, 255, 255, 0.03)"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1.5"
          />
          <circle
            cx={cx}
            cy={cy}
            r="70"
            fill="rgba(0, 0, 0, 0.35)"
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth="1"
          />

          {sections.map((val) => {
            const secDeg = (val / 30) * 65;
            const secRad = ((secDeg - 90) * Math.PI) / 180;
            const tInX = cx + 98 * Math.cos(secRad);
            const tInY = cy + 98 * Math.sin(secRad);
            const tOutX = cx + 104 * Math.cos(secRad);
            const tOutY = cy + 104 * Math.sin(secRad);
            const lblX = cx + 124 * Math.cos(secRad);
            const lblY = cy + 124 * Math.sin(secRad);
            const isZero = val === 0;

            return (
              <g key={val} className="atk-rot-scale-item">
                <line
                  x1={tInX}
                  y1={tInY}
                  x2={tOutX}
                  y2={tOutY}
                  stroke={
                    isZero ? "var(--hub-accent)" : "rgba(255, 255, 255, 0.25)"
                  }
                  strokeWidth={isZero ? "2" : "1.5"}
                  strokeLinecap="round"
                />
                <text
                  x={lblX}
                  y={lblY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isZero ? "var(--hub-text)" : "var(--hub-text-muted)"}
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                  fontWeight={isZero ? "600" : "500"}
                >
                  {val > 0 ? `+${val}` : val}
                </text>
              </g>
            );
          })}

          <g className="atk-rot-thumb-group">
            <circle
              cx={thumbX}
              cy={thumbY}
              r="13"
              fill="rgba(255, 255, 255, 0.1)"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1"
            />
            <circle
              cx={thumbX}
              cy={thumbY}
              r="6"
              fill="var(--hub-accent)"
              filter="drop-shadow(0 0 6px var(--hub-accent))"
            />
            <circle cx={thumbX} cy={thumbY} r="2" fill="#ffffff" />
          </g>

          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--hub-text)"
            fontSize="26"
            fontFamily="var(--font-mono)"
            fontWeight="700"
          >
            {clampedAngle > 0 ? `+${clampedAngle}` : clampedAngle}°
          </text>
        </svg>
      </div>

      <div className="lg-rotation-readout">
        <span className="lg-rotation-tag">CALIBRATION</span>
        <span className="lg-rotation-value">
          {clampedAngle > 0 ? "+" : ""}
          {clampedAngle}°
        </span>
      </div>
    </div>
  );
});
