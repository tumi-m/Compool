/**
 * §14.2. Three stacked bars, each shorter than the one above, arced along the
 * bottom edge: a wave, a capacity meter and a stack of chips seen edge-on. Solid
 * single colour, no gradient — it has to survive a 16px favicon and a one-colour
 * screenprint.
 */
export function Mark({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
  const bars = [
    { y: 12, w: 52 },
    { y: 30, w: 38 },
    { y: 48, w: 24 },
  ];
  const h = 12;
  // A quadratic sits halfway to its control point, so the control offset is
  // doubled to land the apex at the 12% specified.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {bars.map((b) => (
        <path
          key={b.y}
          fill={color}
          d={`M2 ${b.y} H${2 + b.w} V${b.y + h} Q${2 + b.w / 2} ${b.y + h - h * 0.24} 2 ${b.y + h} Z`}
        />
      ))}
    </svg>
  );
}
