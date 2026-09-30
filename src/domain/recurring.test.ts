import { describe, expect, it } from 'vitest';
import { monthStartTs } from './month';
import { buildRecurringTx, planRecurring, recurringTxId } from './recurring';
import type { RecurringRule } from './types';

const rule = (p: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  type: 'expense',
  amountKurus: 1500000,
  categoryId: 'cat-kira',
  description: 'Kira',
  dayOfMonth: 31,
  startMonth: '2026-01',
  active: true,
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

describe('planRecurring', () => {
  it('clamps from the original day every month (no drift)', () => {
    expect(planRecurring(rule(), '2026-04').map((p) => p.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('handles leap years', () => {
    expect(planRecurring(rule({ dayOfMonth: 29, startMonth: '2028-02' }), '2028-02')[0]!.date).toBe('2028-02-29');
    expect(planRecurring(rule({ dayOfMonth: 29, startMonth: '2027-02' }), '2027-02')[0]!.date).toBe('2027-02-28');
  });

  it('continues from the cursor and fills missed months', () => {
    expect(planRecurring(rule({ lastGeneratedMonth: '2026-06' }), '2026-09').map((p) => p.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(planRecurring(rule({ lastGeneratedMonth: '2026-09' }), '2026-09')).toEqual([]);
  });

  it('respects end month, future start and inactive rules', () => {
    expect(planRecurring(rule({ endMonth: '2026-02' }), '2026-09').map((p) => p.month)).toEqual(['2026-01', '2026-02']);
    expect(planRecurring(rule({ startMonth: '2026-10' }), '2026-09')).toEqual([]);
    expect(planRecurring(rule({ active: false }), '2026-09')).toEqual([]);
  });

  it('ignores a cursor that is before the start month', () => {
    expect(planRecurring(rule({ startMonth: '2026-08', lastGeneratedMonth: '2026-02' }), '2026-09').map((p) => p.month)).toEqual(['2026-08', '2026-09']);
  });

  it('produces unique deterministic ids', () => {
    const plan = planRecurring(rule(), '2026-12');
    expect(new Set(plan.map((p) => p.id)).size).toBe(12);
    expect(plan[0]!.id).toBe('rec:r1:2026-01');
    expect(recurringTxId('x', '2026-05')).toBe('rec:x:2026-05');
  });
});

describe('buildRecurringTx', () => {
  it('copies rule fields and uses month-start timestamps', () => {
    const [inst] = planRecurring(rule({ dayOfMonth: 5 }), '2026-01');
    const t = buildRecurringTx(rule(), inst!);
    expect(t).toEqual({
      id: 'rec:r1:2026-01',
      type: 'expense',
      amountKurus: 1500000,
      categoryId: 'cat-kira',
      description: 'Kira',
      date: '2026-01-05',
      month: '2026-01',
      recurringId: 'r1',
      createdAt: monthStartTs('2026-01'),
      updatedAt: monthStartTs('2026-01'),
    });
  });
});
