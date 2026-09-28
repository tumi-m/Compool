import { describe, expect, it } from 'vitest';
import { duration, relative, whenAt, zoneName } from '@/lib/format';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('relative time, as a sentence', () => {
  it('says "just now" for the last few seconds, and for clock skew', () => {
    expect(relative(ago(5_000), NOW)).toBe('just now');
    expect(relative(ago(-3_000), NOW)).toBe('just now');
  });

  it('uses minutes, then hours', () => {
    expect(relative(ago(5 * 60_000), NOW)).toBe('5 min ago');
    expect(relative(ago(3 * 3_600_000), NOW)).toBe('3 h ago');
  });

  it('says yesterday and N days ago instead of "24h 00m ago"', () => {
    expect(relative(ago(24 * 3_600_000), NOW)).toBe('yesterday');
    expect(relative(ago(48 * 3_600_000), NOW)).toBe('2 days ago');
    expect(relative(ago(24 * 3_600_000), NOW)).not.toMatch(/h \d\dm/);
  });

  it('moves to weeks, then to a date', () => {
    expect(relative(ago(8 * 86_400_000), NOW)).toBe('last week');
    expect(relative(ago(20 * 86_400_000), NOW)).toBe('2 weeks ago');
    expect(relative(ago(60 * 86_400_000), NOW)).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
  });

  it('never throws on garbage', () => {
    expect(relative('not a date', NOW)).toBe('—');
  });
});

describe('durations', () => {
  it('stays in hours and minutes under a day', () => {
    expect(duration(5 * 3_600_000 + 2 * 60_000)).toBe('5h 02m');
  });

  it('switches to days past a day, so a weekend wait reads as one', () => {
    expect(duration(76 * 3_600_000)).toBe('3d 4h');
    expect(duration(48 * 3_600_000)).toBe('2d');
  });
});

describe('clock times with the day attached', () => {
  const tz = 'UTC';
  it('is a bare time today', () => {
    expect(whenAt(Date.parse('2026-09-30T21:00:00Z'), NOW, tz)).toBe('21:00');
  });
  it('says tomorrow', () => {
    expect(whenAt(Date.parse('2026-10-01T03:00:00Z'), NOW, tz)).toBe('tomorrow 03:00');
  });
  it('names the weekday within the week — a Monday window is not "tonight"', () => {
    expect(whenAt(Date.parse('2026-10-05T03:00:00Z'), NOW, tz)).toBe('Mon 03:00');
  });
  it('falls back to a date beyond a week', () => {
    expect(whenAt(Date.parse('2026-10-20T03:00:00Z'), NOW, tz)).toBe('20 Oct 03:00');
  });
  it('judges "today" in the zone it is shown in', () => {
    // 23:30 UTC on the 30th is already the 1st in Johannesburg.
    const t = Date.parse('2026-09-30T23:30:00Z');
    expect(whenAt(t, NOW, 'UTC')).toBe('23:30');
    expect(whenAt(t, NOW, 'Africa/Johannesburg')).toBe('tomorrow 01:30');
  });
});

describe('zone names', () => {
  it('reads the city', () => {
    expect(zoneName('America/New_York')).toBe('New York');
    expect(zoneName('Africa/Johannesburg')).toBe('Johannesburg');
  });
});
