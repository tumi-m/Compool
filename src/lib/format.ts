export function usd(n: number, places = 2): string {
  const abs = Math.abs(n);
  const p = abs > 0 && abs < 0.01 ? 4 : places;
  return `$${n.toFixed(p)}`;
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function pct(f: number | null): string {
  return f === null ? '—' : `${Math.round(f * 100)}%`;
}

/** "next tide 14:22" — the label the whole interface speaks in. */
export function clockAt(ms: number, tz?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(new Date(ms));
}

export function duration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  // Past a day, minutes are noise and hours become hard to read: "3d 4h", not
  // "76h 00m".
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
  }
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

/**
 * How long ago, the way a person says it. The first version produced
 * "24h 00m ago" and "48h 00m ago", which is a stopwatch, not a sentence.
 */
export function relative(isoStr: string, now = Date.now()): string {
  const t = Date.parse(isoStr);
  const d = now - t;
  if (!Number.isFinite(d)) return '—';
  if (d < 0) return 'just now'; // clock skew between tabs; never "in 3s ago"
  if (d < 45_000) return 'just now';
  const min = Math.round(d / 60_000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(d / 3_600_000);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(d / 86_400_000);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? 'last week' : `${weeks} weeks ago`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(t));
}

/**
 * A clock time with the day when it is not today: "21:00", "tomorrow 03:00",
 * "Mon 03:00". A bare "03:00" for a window that opens on Monday reads as
 * tonight, which is wrong by three days.
 */
export function whenAt(ms: number, now = Date.now(), tz?: string): string {
  const time = clockAt(ms, tz);
  const dayKey = (t: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  const today = dayKey(now);
  const that = dayKey(ms);
  if (that === today) return time;
  if (that === dayKey(now + 86_400_000)) return `tomorrow ${time}`;
  if (that === dayKey(now - 86_400_000)) return `yesterday ${time}`;
  if (Math.abs(ms - now) < 6.5 * 86_400_000) {
    return `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: tz }).format(new Date(ms))} ${time}`;
  }
  return `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(new Date(ms))} ${time}`;
}

/** The viewer's own zone, and a short human name for any zone. */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function zoneName(tz: string): string {
  return tz.split('/').pop()!.replace(/_/g, ' ');
}
