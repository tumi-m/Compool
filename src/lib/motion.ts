/**
 * The arithmetic behind the motion: timings, offsets and layouts, kept pure so
 * they can be tested. Every animation in the app shows a value changing; these
 * are the functions that decide what the value is.
 */

/**
 * A bar that empties as a window of time runs out — a pairing code expiring, a
 * node going stale, a preload window approaching. One CSS animation over the
 * whole window, started part-way through with a negative delay, so the bar is
 * right on first paint and needs no timer to stay right afterwards.
 */
export function drainTiming(fromMs: number, toMs: number, nowMs: number) {
  const total = Math.max(0, toMs - fromMs);
  const elapsed = Math.min(total, Math.max(0, nowMs - fromMs));
  return {
    durationS: total / 1000,
    // Negative once the window is under way; positive while it has yet to
    // open, so the bar waits full instead of draining early.
    delayS: (nowMs < fromMs ? fromMs - nowMs : -elapsed) / 1000,
    /** What is left, 0–1 — the static value when motion is reduced. */
    left: total === 0 ? 0 : 1 - elapsed / total,
  };
}

/**
 * FLIP: how far each element has to be pushed back to where it was, so it can
 * glide to where it now is. Only elements that existed before and actually
 * moved get an offset — a new row arrives, it does not slide from nowhere.
 */
export function flipOffsets(before: Map<string, number>, after: Map<string, number>, threshold = 1): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, top] of after) {
    const was = before.get(key);
    if (was === undefined) continue;
    const dy = was - top;
    if (Math.abs(dy) > threshold) out.set(key, dy);
  }
  return out;
}

/** A ring drawn to a fraction: the dash offset that leaves `fraction` visible. */
export function ringDash(fraction: number, radius: number) {
  const circumference = 2 * Math.PI * radius;
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return { circumference, offset: circumference * (1 - f) };
}

/** Steam over the cup: one wisp for a cup, two for a few, three for a round. */
export function steamLevel(count: number): 1 | 2 | 3 {
  if (count >= 5) return 3;
  if (count >= 2) return 2;
  return 1;
}

// ---- settle-up flow ---------------------------------------------------------

export interface FlowTransfer {
  from: string;
  to: string;
  amountUsd: number;
}

export interface FlowLayout {
  width: number;
  height: number;
  payers: { id: string; x: number; y: number }[];
  payees: { id: string; x: number; y: number }[];
  links: {
    from: string;
    to: string;
    amountUsd: number;
    d: string;
    stroke: number;
    coins: number;
    /** Where the amount sits: on its own curve, near the payer, above the line. */
    label: { x: number; y: number };
  }[];
}

/**
 * Who pays whom, drawn as it is: payers on the left, payees on the right, one
 * curve per transfer with its thickness the amount. The greedy settlement only
 * ever has a person paying or being paid, never both, so two columns hold it.
 */
export function settleLayout(transfers: FlowTransfer[], width = 520, rowH = 54, pad = 70): FlowLayout {
  const payerIds = [...new Set(transfers.map((t) => t.from))];
  const payeeIds = [...new Set(transfers.map((t) => t.to))];
  const rows = Math.max(1, payerIds.length, payeeIds.length);
  const height = rows * rowH + 16;
  const place = (ids: string[], x: number) =>
    ids.map((id, i) => ({ id, x, y: Math.round(height / 2 + (i - (ids.length - 1) / 2) * rowH) }));
  const payers = place(payerIds, pad);
  const payees = place(payeeIds, width - pad);
  const max = Math.max(0, ...transfers.map((t) => t.amountUsd));

  const links = transfers.map((t) => {
    const a = payers.find((p) => p.id === t.from)!;
    const b = payees.find((p) => p.id === t.to)!;
    const share = max > 0 ? t.amountUsd / max : 0;
    const mid = (a.x + b.x) / 2;
    const x0 = a.x + 16;
    const x3 = b.x - 16;
    // A point a quarter of the way along this curve — before curves that share
    // a payee converge, so labels do not land on each other's lines.
    const q = 0.25;
    const u = 1 - q;
    const bx = u * u * u * x0 + 3 * u * u * q * mid + 3 * u * q * q * mid + q * q * q * x3;
    const by = a.y + (b.y - a.y) * (3 * u * q * q + q * q * q);
    return {
      from: t.from,
      to: t.to,
      amountUsd: t.amountUsd,
      // Start and end clear of the 14px node circles.
      d: `M ${x0} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${x3} ${b.y}`,
      stroke: Math.round((1.5 + share * 6.5) * 10) / 10,
      // More money, more coins along the curve — counted, not decorative.
      coins: share >= 0.66 ? 3 : share >= 0.33 ? 2 : 1,
      label: { x: Math.round(bx), y: Math.round(by - (1.5 + share * 6.5) / 2 - 7) },
    };
  });

  return { width, height, payers, payees, links };
}
