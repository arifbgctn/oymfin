import type { DateKey, MonthKey } from './types';

export const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MONTHS_SHORT_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const WEEKDAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const pad = (n: number) => String(n).padStart(2, '0');

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonthKey(s: unknown): s is MonthKey {
  return typeof s === 'string' && MONTH_RE.test(s);
}

export function isDateKey(s: unknown): s is DateKey {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return d <= daysInMonth(`${y}-${pad(m)}`);
}

function parseMonth(m: MonthKey): [number, number] {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return [y, mo];
}

/** Yerel saate göre bugünün tarihi (toISOString UTC kullandığı için kullanılmaz). */
export function todayLocal(now: Date = new Date()): DateKey {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(now: Date = new Date()): MonthKey {
  return todayLocal(now).slice(0, 7);
}

export function toMonthKey(date: DateKey): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = parseMonth(m);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function compareMonth(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function daysInMonth(m: MonthKey): number {
  const [y, mo] = parseMonth(m);
  return new Date(y, mo, 0).getDate();
}

/** Ayın `day`. günü; ay kısaysa son güne kısılır. */
export function clampDate(m: MonthKey, day: number): DateKey {
  return `${m}-${pad(Math.min(Math.max(1, day), daysInMonth(m)))}`;
}

export function monthLabel(m: MonthKey): string {
  const [y, mo] = parseMonth(m);
  return `${MONTHS_TR[mo - 1]} ${y}`;
}

export function shortMonthLabel(m: MonthKey): string {
  return MONTHS_SHORT_TR[parseMonth(m)[1] - 1] ?? '';
}

/** Yeni işlem formu için varsayılan tarih: seçili ay bu aysa bugün, değilse aynı gün (kısılmış). */
export function defaultDateFor(selected: MonthKey, today: DateKey): DateKey {
  if (toMonthKey(today) === selected) return today;
  return clampDate(selected, Number(today.slice(8, 10)));
}

/** "30 Eylül, Çarşamba" */
export function dayHeading(date: DateKey): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Date(y, m - 1, d).getDay();
  return `${d} ${MONTHS_TR[m - 1]}, ${WEEKDAYS_TR[wd]}`;
}

/** "30.09.2026" */
export function formatDate(date: DateKey): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

/** Zaman damgası → "29 Eyl 14:05" */
export function formatDateTimeShort(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT_TR[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ayın ilk günü yerel gece yarısı (ms). */
export function monthStartTs(m: MonthKey): number {
  const [y, mo] = parseMonth(m);
  return new Date(y, mo - 1, 1).getTime();
}
