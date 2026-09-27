/**
 * §14.8 state 2. Skeletons match the final dimensions exactly, so nothing shifts
 * when the real thing arrives. Never a spinner where a shape is known.
 */
export function Skeleton({ h, w = '100%', r = 4 }: { h: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function BasinSkeleton() {
  return (
    <div className="panel basin" aria-hidden="true">
      <div className="basinHead">
        <Skeleton h={13} w={120} />
        <Skeleton h={18} w={88} />
      </div>
      <Skeleton h={88} r={0} />
      <div className="basinFoot">
        <Skeleton h={11} w={94} />
        <Skeleton h={11} w={118} />
      </div>
      <Skeleton h={13} w={150} />
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="panel stackv" aria-hidden="true">
      <Skeleton h={20} w={160} />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={13} w={`${94 - i * 11}%`} />
      ))}
    </div>
  );
}

/** Announced to a screen reader once, rather than a wall of silent boxes. */
export function LoadingRegion({ label }: { label: string }) {
  return (
    <span className="srOnly" role="status" aria-live="polite">
      {label}
    </span>
  );
}
