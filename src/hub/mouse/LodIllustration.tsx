// Side view of the mouse above the desk: the gap is the lift-off distance the sensor still tracks at.
const SURFACE_Y = 62;
const MIN_LIFT = 4;
const MAX_LIFT = 24;
// Mouse side profile, drawn with its base at y=0 (front on the left).
const BODY =
  "M10 0 H112 C118 0 121 -6 119 -13 C115 -27 98 -36 76 -36 C54 -36 30 -30 16 -19 C9 -13 6 -5 10 0 Z";
const SENSOR_X = 58;
const MEASURE_X = 144;

export function LodIllustration({ lod, min, max }: { lod: number; min: number; max: number }) {
  const span = max - min;
  const t = span > 0 ? Math.min(1, Math.max(0, (lod - min) / span)) : 0.5;
  const lift = MIN_LIFT + t * (MAX_LIFT - MIN_LIFT);
  const base = SURFACE_Y - lift;
  return (
    <svg className="hm-lod-art" viewBox="0 0 168 76" width="168" height="76" aria-hidden="true">
      <line className="surface" x1="4" y1={SURFACE_Y} x2="164" y2={SURFACE_Y} />
      <g className="lift" style={{ transform: `translateY(${base}px)` }}>
        <path className="body" d={BODY} />
        <path className="seam" d="M17 -18 C28 -27 44 -33 60 -35" />
        <rect className="wheel" x="38" y="-36" width="9" height="5" rx="2.5" />
        <rect className="foot" x="18" y="-1.5" width="16" height="3" rx="1.5" />
        <rect className="foot" x="88" y="-1.5" width="16" height="3" rx="1.5" />
        <rect className="sensor" x={SENSOR_X - 5} y="-2" width="10" height="4" rx="2" />
      </g>
      <line className="beam" x1={SENSOR_X} y1={base + 2} x2={SENSOR_X} y2={SURFACE_Y} />
      <ellipse className="spot" cx={SENSOR_X} cy={SURFACE_Y} rx="9" ry="2" />
      <line className="guide" x1="120" y1={base} x2={MEASURE_X} y2={base} />
      <g className="measure">
        <line x1={MEASURE_X} y1={base} x2={MEASURE_X} y2={SURFACE_Y} />
        <line x1={MEASURE_X - 5} y1={base} x2={MEASURE_X + 5} y2={base} />
        <line x1={MEASURE_X - 5} y1={SURFACE_Y} x2={MEASURE_X + 5} y2={SURFACE_Y} />
      </g>
      <text className="value" x={MEASURE_X} y={base - 6} textAnchor="middle">
        {lod.toFixed(1)} mm
      </text>
    </svg>
  );
}
