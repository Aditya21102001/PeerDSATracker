import { describe, expect, it } from 'vitest';
import { timeAgo } from './app-footer';

/**
 * The footer stamps a build time so a bug report can name the deploy it came from. A relative form
 * is what people read, but only if it degrades quietly: the value comes from a generated file and
 * from an endpoint that may not have answered, so "Invalid Date" in the footer is a real
 * possibility and an unacceptable one.
 */
describe('timeAgo', () => {
  const now = Date.parse('2026-08-18T12:00:00Z');

  it('picks the largest unit that fits', () => {
    expect(timeAgo('2026-08-18T11:59:30Z', now)).toContain('second');
    expect(timeAgo('2026-08-18T11:30:00Z', now)).toContain('minute');
    expect(timeAgo('2026-08-18T09:00:00Z', now)).toContain('hour');
    expect(timeAgo('2026-08-15T12:00:00Z', now)).toContain('day');
    expect(timeAgo('2026-05-18T12:00:00Z', now)).toContain('month');
    expect(timeAgo('2024-08-18T12:00:00Z', now)).toContain('year');
  });

  it('reads as the past', () => {
    // Intl counts backwards with negative values; getting the sign wrong renders a build that was
    // packaged an hour ago as "in 1 hour".
    expect(timeAgo('2026-08-18T11:00:00Z', now)).toBe('1 hour ago');
  });

  it('says nothing rather than something wrong', () => {
    // No build info generated, or /api/meta not answered yet. An empty string is dropped by the
    // template; "Invalid Date" would be shipped to every page.
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo(undefined, now)).toBe('');
    expect(timeAgo('not a date', now)).toBe('');
  });
});
