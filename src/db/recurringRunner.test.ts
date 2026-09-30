import { describe, expect, it } from 'vitest';
import { seedIfNeeded } from './bootstrap';
import { db } from './db';
import { runRecurring } from './recurringRunner';
import { addRecurring, deleteTransaction, updateRecurring } from './repo';

const rent = { type: 'expense' as const, amountKurus: 1500000, categoryId: 'cat-kira', description: 'Kira', dayOfMonth: 31, startMonth: '2026-07' };

async function setup() {
  await seedIfNeeded();
  return addRecurring(rent);
}

describe('runRecurring', () => {
  it('fills missed months up to the horizon', async () => {
    const r = await setup();
    expect(await runRecurring('2026-09')).toBe(3);
    const txs = await db.transactions.orderBy('date').toArray();
    expect(txs.map((t) => t.date)).toEqual(['2026-07-31', '2026-08-31', '2026-09-30']);
    expect(txs.every((t) => t.recurringId === r.id)).toBe(true);
    expect((await db.recurring.get(r.id))?.lastGeneratedMonth).toBe('2026-09');
  });

  it('is idempotent', async () => {
    await setup();
    await runRecurring('2026-09');
    expect(await runRecurring('2026-09')).toBe(0);
    expect(await db.transactions.count()).toBe(3);
  });

  it('parallel runs never duplicate', async () => {
    await setup();
    await Promise.all([runRecurring('2026-09'), runRecurring('2026-09'), runRecurring('2026-09')]);
    expect(await db.transactions.count()).toBe(3);
  });

  it('a deleted instance does not come back', async () => {
    const r = await setup();
    await runRecurring('2026-09');
    await deleteTransaction(`rec:${r.id}:2026-08`);
    await runRecurring('2026-09');
    expect(await db.transactions.count()).toBe(2);
    // İmleç sıfırlansa bile (ör. başka cihazdan gelen eski kural) silme kaydı korur.
    await db.recurring.update(r.id, { lastGeneratedMonth: undefined });
    await runRecurring('2026-09');
    expect(await db.transactions.get(`rec:${r.id}:2026-08`)).toBeUndefined();
  });

  it('rule edits only affect future months', async () => {
    const r = await setup();
    await runRecurring('2026-09');
    await updateRecurring(r.id, { ...rent, amountKurus: 1700000 });
    await runRecurring('2026-10');
    const txs = await db.transactions.orderBy('date').toArray();
    expect(txs.map((t) => t.amountKurus)).toEqual([1500000, 1500000, 1500000, 1700000]);
  });

  it('does not generate future months', async () => {
    await seedIfNeeded();
    await addRecurring({ ...rent, startMonth: '2026-12' });
    expect(await runRecurring('2026-09')).toBe(0);
  });
});
