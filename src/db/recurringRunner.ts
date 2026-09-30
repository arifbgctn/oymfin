import { buildRecurringTx, planRecurring } from '../domain/recurring';
import type { MonthKey } from '../domain/types';
import { db } from './db';

/**
 * Düzenli işlemleri ufka (gerçek bu ay) kadar üretir. İdempotent:
 * deterministik id + imleç + silme kaydı kontrolü sayesinde çift kayıt oluşmaz
 * ve silinen bir örnek (başka cihazda silinmiş olsa bile) geri gelmez.
 */
export async function runRecurring(horizon: MonthKey): Promise<number> {
  let created = 0;
  const ruleIds = await db.recurring.toCollection().primaryKeys();
  for (const ruleId of ruleIds) {
    await db.transaction('rw', db.transactions, db.recurring, db.tombstones, async () => {
      const rule = await db.recurring.get(ruleId);
      if (!rule) return;
      const plan = planRecurring(rule, horizon);
      if (plan.length === 0) return;
      const ids = plan.map((p) => p.id);
      const [existing, tombs] = await Promise.all([
        db.transactions.bulkGet(ids),
        db.tombstones.bulkGet(ids.map((id) => `transactions:${id}`)),
      ]);
      const skip = new Set<string>();
      existing.forEach((t) => t && skip.add(t.id));
      tombs.forEach((t) => t && skip.add(t.id));
      const toAdd = plan.filter((p) => !skip.has(p.id)).map((p) => buildRecurringTx(rule, p));
      if (toAdd.length) await db.transactions.bulkPut(toAdd);
      // İmleç ilerletilir; bu bir kullanıcı düzenlemesi sayılmaz (updatedAt değişmez).
      await db.recurring.update(rule.id, { lastGeneratedMonth: plan[plan.length - 1]!.month });
      created += toAdd.length;
    });
  }
  return created;
}
