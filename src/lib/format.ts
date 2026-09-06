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
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function relative(isoStr: string, now = Date.now()): string {
  const d = now - Date.parse(isoStr);
  if (!Number.isFinite(d)) return '—';
  if (d < 60_000) return 'just now';
  return `${duration(d)} ago`;
}
