import { addMonths, clampDate, monthRange, monthStartTs } from './month';
import type { DateKey, MonthKey, RecurringRule, Transaction } from './types';

export interface PlannedInstance {
  month: MonthKey;
  date: DateKey;
  /** Deterministik id: iki cihaz aynı ayı üretse bile tek kayıt olur. */
  id: string;
}

export function recurringTxId(ruleId: string, month: MonthKey): string {
  return `rec:${ruleId}:${month}`;
}

/**
 * Kuralın imlecinden (lastGeneratedMonth) sonra, ufka kadar üretilmesi gereken örnekler.
 * Gün her ay kuralın ORİJİNAL gününden kısılır (31 → 28 → 31, kayma yok).
 */
export function planRecurring(rule: RecurringRule, horizon: MonthKey): PlannedInstance[] {
  if (!rule.active) return [];
  const from = rule.lastGeneratedMonth ? addMonths(rule.lastGeneratedMonth, 1) : rule.startMonth;
  const start = from < rule.startMonth ? rule.startMonth : from;
  const end = rule.endMonth && rule.endMonth < horizon ? rule.endMonth : horizon;
  if (start > end) return [];
  return monthRange(start, end).map((month) => ({
    month,
    date: clampDate(month, rule.dayOfMonth),
    id: recurringTxId(rule.id, month),
  }));
}

/**
 * Örnekten işlem kaydı. Zaman damgaları ayın başı: iki cihazda üretilen kopya birebir aynı olur,
 * ve ay başladıktan sonra yapılan her silme/düzenleme üretimden yeni sayılır.
 */
export function buildRecurringTx(rule: RecurringRule, inst: PlannedInstance): Transaction {
  const ts = monthStartTs(inst.month);
  const tx: Transaction = {
    id: inst.id,
    type: rule.type,
    amountKurus: rule.amountKurus,
    categoryId: rule.categoryId,
    description: rule.description,
    date: inst.date,
    month: inst.month,
    recurringId: rule.id,
    createdAt: ts,
    updatedAt: ts,
  };
  if (rule.accountId) tx.accountId = rule.accountId;
  return tx;
}
