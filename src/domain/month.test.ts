import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMonths,
  clampDate,
  currentMonth,
  dayHeading,
  daysInMonth,
  defaultDateFor,
  formatDate,
  formatDateTimeShort,
  isDateKey,
  isMonthKey,
  monthLabel,
  monthRange,
  monthStartTs,
  shortMonthLabel,
  todayLocal,
} from './month';

afterEach(() => {
  vi.useRealTimers();
});

describe('month arithmetic', () => {
  it('adds and subtracts months across years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-03', -14)).toBe('2025-01');
    expect(addMonths('2026-03', 0)).toBe('2026-03');
    expect(addMonths('2026-03', 22)).toBe('2028-01');
  });

  it('builds inclusive month ranges', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthRange('2026-02', '2026-02')).toEqual(['2026-02']);
    expect(monthRange('2026-03', '2026-02')).toEqual([]);
  });

  it('knows days in month incl. leap years', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2100-02')).toBe(28);
    expect(daysInMonth('2000-02')).toBe(29);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('clamps day to month length', () => {
    expect(clampDate('2026-02', 31)).toBe('2026-02-28');
    expect(clampDate('2028-02', 30)).toBe('2028-02-29');
    expect(clampDate('2026-04', 31)).toBe('2026-04-30');
    expect(clampDate('2026-01', 5)).toBe('2026-01-05');
    expect(clampDate('2026-01', 0)).toBe('2026-01-01');
  });
});

describe('labels', () => {
  it('formats Turkish month labels', () => {
    expect(monthLabel('2026-09')).toBe('Eylül 2026');
    expect(monthLabel('2026-02')).toBe('Şubat 2026');
    expect(shortMonthLabel('2026-08')).toBe('Ağu');
    expect(dayHeading('2026-09-30')).toBe('30 Eylül, Çarşamba');
    expect(formatDate('2026-09-05')).toBe('05.09.2026');
  });

  it('formats timestamps', () => {
    expect(formatDateTimeShort(new Date(2026, 8, 29, 14, 5).getTime())).toBe('29 Eyl 14:05');
  });
});

describe('validation', () => {
  it('validates keys', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey(202609)).toBe(false);
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-9-1')).toBe(false);
  });
});

describe('local dates (Europe/Istanbul)', () => {
  it('runs tests in Istanbul time', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Istanbul');
  });

  it('uses local date, not UTC, around midnight', () => {
    // 22:30 UTC = 01:30 on 1 October in Istanbul
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T22:30:00Z'));
    expect(todayLocal()).toBe('2026-10-01');
    expect(currentMonth()).toBe('2026-10');
  });

  it('month start timestamp is local midnight', () => {
    const d = new Date(monthStartTs('2026-10'));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 1, 0]);
  });

  it('picks default dates for the form', () => {
    expect(defaultDateFor('2026-09', '2026-09-15')).toBe('2026-09-15');
    expect(defaultDateFor('2026-02', '2026-03-31')).toBe('2026-02-28');
    expect(defaultDateFor('2026-08', '2026-09-10')).toBe('2026-08-10');
  });
});
