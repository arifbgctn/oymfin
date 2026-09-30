import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  accountMovements,
  accountsSummary,
  accountView,
  openingFromInput,
  openingToInput,
  sortAccounts,
  validateTransfer,
} from './accounts';
import type { Account, Transaction, Transfer } from './types';

const acc = (p: Partial<Account>): Account => ({
  id: 'bank',
  name: 'Ziraat',
  type: 'bank',
  openingKurus: 1000000,
  openingDate: '2026-09-01',
  isDefault: false,
  archived: false,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

let seq = 0;
const tx = (type: 'income' | 'expense', amountKurus: number, accountId: string | undefined, date = '2026-09-10'): Transaction => ({
  id: `t${++seq}`,
  type,
  amountKurus,
  categoryId: 'c',
  description: '',
  date,
  month: date.slice(0, 7),
  accountId,
  createdAt: seq,
  updatedAt: seq,
});

const tr = (fromAccountId: string, toAccountId: string, amountKurus: number, date = '2026-09-15'): Transfer => ({
  id: `tr${++seq}`,
  fromAccountId,
  toAccountId,
  amountKurus,
  date,
  createdAt: seq,
  updatedAt: seq,
});

const bank = acc({});
const credit = acc({ id: 'cc', name: 'Bonus', type: 'credit', openingKurus: -250000, creditLimitKurus: 2000000, order: 1 });
const cash = acc({ id: 'cash', name: 'Cüzdan', type: 'cash', openingKurus: 50000 });

describe('opening balance conversion', () => {
  it('stores credit card debt as negative', () => {
    expect(openingFromInput('credit', 250000)).toBe(-250000);
    expect(openingFromInput('bank', 250000)).toBe(250000);
    expect(openingFromInput('bank', -1000)).toBe(-1000); // eksi bakiye (KMH)
    expect(openingToInput(credit)).toBe(250000);
    expect(openingToInput(bank)).toBe(1000000);
  });
});

describe('accountBalance', () => {
  const txs = [
    tx('income', 2500000, 'bank'),
    tx('expense', 100000, 'bank'),
    tx('expense', 40000, 'cc'),
    tx('expense', 99999, 'bank', '2026-08-31'), // bakiye tarihinden önce → sayılmaz
    tx('expense', 5000, undefined),
  ];
  const transfers = [tr('bank', 'cc', 290000), tr('bank', 'cash', 10000, '2026-08-01')];

  it('applies transactions and transfers from the opening date on', () => {
    expect(accountBalance(bank, txs, transfers)).toBe(1000000 + 2500000 - 100000 - 290000);
    expect(accountBalance(credit, txs, transfers)).toBe(-250000 - 40000 + 290000);
    // Nakit: Ağustos aktarımı bakiye tarihinden önce
    expect(accountBalance(cash, txs, transfers)).toBe(50000);
  });

  it('builds views with debt, limit usage and monthly flows', () => {
    const v = accountView(credit, [tx('expense', 150000, 'cc')], [], '2026-09');
    expect(v).toMatchObject({ balance: -400000, debt: 400000, available: 1600000, monthIn: 0, monthOut: 150000 });
    expect(v.usage).toBeCloseTo(0.2);
    const b = accountView(bank, txs, transfers, '2026-09');
    expect(b).toMatchObject({ debt: 0, available: null, usage: null, monthIn: 2500000, monthOut: 100000 + 290000 });
  });

  it('summarizes liquid money, card debt and net', () => {
    const s = accountsSummary([bank, credit, cash, acc({ id: 'old', archived: true, openingKurus: 999 })], txs, transfers);
    expect(s.views.map((v) => v.account.id)).toEqual(['bank', 'cc', 'cash']);
    expect(s.liquid).toBe(3110000 + 50000);
    expect(s.creditDebt).toBe(0);
    expect(s.net).toBe(3110000 + 0 + 50000);
    const s2 = accountsSummary([bank, credit], [], []);
    expect(s2).toMatchObject({ liquid: 1000000, creditDebt: 250000, net: 750000 });
  });
});

describe('helpers', () => {
  it('validates transfers', () => {
    expect(validateTransfer('a', 'a', 100)).toMatch(/Aynı hesaba/);
    expect(validateTransfer('', 'a', 100)).toMatch(/seçin/);
    expect(validateTransfer('a', 'b', 0)).toMatch(/tutar/);
    expect(validateTransfer('a', 'b', 100)).toBeNull();
  });

  it('sorts bank, credit, cash', () => {
    expect(sortAccounts([cash, credit, bank]).map((a) => a.id)).toEqual(['bank', 'cc', 'cash']);
  });

  it('lists movements newest first with signed deltas', () => {
    const t1 = tx('expense', 100, 'bank', '2026-09-01');
    const t2 = tx('income', 500, 'bank', '2026-09-20');
    const x = tr('bank', 'cc', 300, '2026-09-10');
    const m = accountMovements('bank', [t1, t2, tx('expense', 1, 'cc')], [x]);
    expect(m.map((e) => [e.kind, e.delta])).toEqual([
      ['tx', 500],
      ['transfer', -300],
      ['tx', -100],
    ]);
    expect(accountMovements('cc', [], [x])[0]!.delta).toBe(300);
  });
});
