import type { Budget, Category, MonthKey, Transaction } from './types';

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  ratio: number;
  status: BudgetState;
  remaining: number;
}

export const WARNING_RATIO = 0.8;

export function budgetId(categoryId: string, effectiveFrom: MonthKey): string {
  return `${categoryId}|${effectiveFrom}`;
}

/** Ay için geçerli bütçe: effectiveFrom ≤ ay olan en son kayıt. 0 veya yoksa null. */
export function resolveBudget(budgets: Budget[], categoryId: string, month: MonthKey): number | null {
  let best: Budget | undefined;
  for (const b of budgets) {
    if (b.categoryId !== categoryId || b.effectiveFrom > month) continue;
    if (!best || b.effectiveFrom > best.effectiveFrom) best = b;
  }
  return best && best.amountKurus > 0 ? best.amountKurus : null;
}

/** <%80 iyi · %80–%100 (dahil) uyarı · >%100 aşıldı. Limit ≤ 0 → null. */
export function budgetStatus(spent: number, limit: number): BudgetStatus | null {
  if (limit <= 0) return null;
  const ratio = spent / limit;
  const status: BudgetState = ratio > 1 ? 'over' : ratio >= WARNING_RATIO ? 'warning' : 'ok';
  return { ratio, status, remaining: limit - spent };
}

export interface BudgetRow extends BudgetStatus {
  category: Category;
  limit: number;
  spent: number;
}

export function budgetRows(budgets: Budget[], categories: Category[], monthTxs: Transaction[], month: MonthKey): BudgetRow[] {
  const spentBy = new Map<string, number>();
  for (const t of monthTxs) {
    if (t.type === 'expense') spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amountKurus);
  }
  const rows: BudgetRow[] = [];
  for (const c of categories) {
    if (c.type !== 'expense') continue;
    const limit = resolveBudget(budgets, c.id, month);
    if (limit === null) continue;
    const spent = spentBy.get(c.id) ?? 0;
    const st = budgetStatus(spent, limit)!;
    rows.push({ category: c, limit, spent, ...st });
  }
  return rows.sort((a, b) => b.ratio - a.ratio || a.category.order - b.category.order);
}
