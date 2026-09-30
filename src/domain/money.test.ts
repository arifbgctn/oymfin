import { describe, expect, it } from 'vitest';
import {
  formatAmountInput,
  formatCompactTRY,
  formatPercent,
  formatQuantity,
  formatSignedTRY,
  formatTRY,
  parseQuantity,
  parseTRY,
} from './money';

describe('parseTRY', () => {
  it.each([
    ['1234', 123400],
    ['1234,5', 123450],
    ['1.234,56', 123456],
    ['1.234.567,89', 123456789],
    [',5', 50],
    ['0,29', 29],
    ['1,15', 115],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1.234', 123400],
    ['12.345', 1234500],
    ['1.234.567', 123456700],
    [' 1.234,56 ₺ ', 123456],
    ['1234 TL', 123400],
    ['1234tl', 123400],
    ['1 234,56', 123456],
    ['1 234,56', 123456],
    ['12,', 1200],
    ['0', 0],
    ['007', 700],
    ['999.999.999,99', 99999999999],
  ])('%j → %d', (input, expected) => {
    expect(parseTRY(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', ',', '1,234,5', '12,345', '1.23.4', '1.2345,00', '1e5', '-5', '--1', '1,2,3', '12.3456', '1.000.000.000', '1.234,5.6', '₺'])(
    '%j → null',
    (input) => {
      expect(parseTRY(input)).toBeNull();
    },
  );

  it('round-trips with formatAmountInput', () => {
    for (const k of [0, 1, 5, 29, 99, 100, 115, 123456, 100000000, 99999999999, 7654321]) {
      expect(parseTRY(formatAmountInput(k))).toBe(k);
    }
  });
});

describe('parseQuantity', () => {
  it.each([
    ['10', 10],
    ['10,5', 10.5],
    ['0,00012345', 0.00012345],
    ['0.123', 0.123],
    ['1.234', 1234],
    ['1.234,5', 1234.5],
    ['12.5', 12.5],
  ])('%j → %d', (input, expected) => {
    expect(parseQuantity(input)).toBeCloseTo(expected, 10);
  });

  it.each(['', 'x', '0,000000001', '-1', '10000000'])('%j → null', (input) => {
    expect(parseQuantity(input)).toBeNull();
  });
});

describe('formatTRY', () => {
  it.each([
    [123456, '1.234,56 ₺'],
    [0, '0,00 ₺'],
    [5, '0,05 ₺'],
    [100000000, '1.000.000,00 ₺'],
    [-123456, '-1.234,56 ₺'],
    [99.6, '1,00 ₺'],
  ])('%d → %j', (k, expected) => {
    expect(formatTRY(k)).toBe(expected);
  });

  it('formats signed values', () => {
    expect(formatSignedTRY(1000)).toBe('+10,00 ₺');
    expect(formatSignedTRY(-1000)).toBe('-10,00 ₺');
    expect(formatSignedTRY(0)).toBe('0,00 ₺');
  });
});

describe('formatCompactTRY', () => {
  it('uses B and Mn suffixes', () => {
    expect(formatCompactTRY(1250000)).toBe('12,5 B ₺');
    expect(formatCompactTRY(100000)).toBe('1 B ₺');
    expect(formatCompactTRY(120000000)).toBe('1,2 Mn ₺');
    expect(formatCompactTRY(50000)).toBe('500 ₺');
    expect(formatCompactTRY(0)).toBe('0 ₺');
  });
});

describe('formatPercent', () => {
  it('puts % first (Turkish style)', () => {
    expect(formatPercent(12.5)).toBe('%12,5');
    expect(formatPercent(-3)).toBe('-%3,0');
    expect(formatPercent(95.06, 1)).toBe('%95,1');
    expect(formatPercent(7, 0)).toBe('%7');
  });
});

describe('formatQuantity', () => {
  it('trims trailing zeros and groups thousands', () => {
    expect(formatQuantity(10)).toBe('10');
    expect(formatQuantity(1234.5)).toBe('1.234,5');
    expect(formatQuantity(0.00012345)).toBe('0,00012345');
    expect(formatQuantity(0.1 + 0.2)).toBe('0,3');
  });
});
