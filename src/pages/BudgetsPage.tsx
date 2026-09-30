import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BudgetBar } from '../components/BudgetBar';
import { AmountInput, Button, Card, EmptyState, Field, Modal, useBusy } from '../components/ui';
import { budgetRows, budgetStatus, resolveBudget } from '../domain/budget';
import { formatAmountInput, formatPercent, formatTRY, parseTRY } from '../domain/money';
import { monthLabel } from '../domain/month';
import type { Category } from '../domain/types';
import { setBudget } from '../db/repo';
import { useBudgets, useCategories, useMonthTransactions } from '../hooks/data';
import { useApp } from '../state/AppContext';

function BudgetModal({ category, current, onClose }: { category: Category | null; current: number | null; onClose: () => void }) {
  const { month, toast } = useApp();
  const [amount, setAmount] = useState(current ? formatAmountInput(current) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  if (!category) return null;

  const save = (kurus: number) =>
    void run(async () => {
      await setBudget(category.id, month, kurus);
      toast(kurus === 0 ? 'Bütçe kaldırıldı' : 'Bütçe kaydedildi');
      onClose();
    });

  return (
    <Modal open onClose={onClose} title={`${category.emoji} ${category.name} bütçesi`}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const k = parseTRY(amount);
          if (k === null || k <= 0) return setError('Geçerli bir tutar girin');
          save(k);
        }}
      >
        <Field label="Aylık limit" error={error} hint={`${monthLabel(month)} ve sonraki aylar için geçerli olur.`}>
          {(id) => <AmountInput id={id} value={amount} onChange={setAmount} invalid={!!error} />}
        </Field>
        <div className="mt-4 flex gap-2">
          {current !== null && (
            <Button variant="danger" onClick={() => save(0)} disabled={busy}>
              Kaldır
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={busy}>
            Kaydet
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function BudgetsPage() {
  const { month } = useApp();
  const categories = useCategories();
  const budgets = useBudgets();
  const txs = useMonthTransactions(month);
  const [editing, setEditing] = useState<Category | null>(null);

  const data = useMemo(() => {
    if (!categories || !budgets || !txs) return null;
    const rows = budgetRows(budgets, categories, txs, month);
    const withBudget = new Set(rows.map((r) => r.category.id));
    const others = categories.filter((c) => c.type === 'expense' && !c.archived && !withBudget.has(c.id));
    const limit = rows.reduce((s, r) => s + r.limit, 0);
    const spent = rows.reduce((s, r) => s + r.spent, 0);
    return { rows, others, limit, spent, total: budgetStatus(spent, limit) };
  }, [categories, budgets, txs, month]);

  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.rows.length > 0 && data.total && (
        <Card>
          <div className="text-xs font-medium text-muted">Toplam bütçe · {monthLabel(month)}</div>
          <div className="mt-1 text-2xl font-bold tabular">
            {formatTRY(data.spent)} <span className="text-base font-medium text-muted">/ {formatTRY(data.limit)}</span>
          </div>
          <div className="mt-1 text-sm text-muted">
            {data.total.remaining >= 0 ? `${formatTRY(data.total.remaining)} kaldı` : `${formatTRY(-data.total.remaining)} aşıldı`} · {formatPercent(data.total.ratio * 100, 0)} kullanıldı
          </div>
        </Card>
      )}
      <Card title="Kategori bütçeleri" className="p-2! [&>div:first-child]:px-2 [&>div:first-child]:pt-2">
        {data.rows.length === 0 ? (
          <EmptyState icon="🎯" title="Henüz bütçe yok">
            Aşağıdan bir kategori seçip aylık limit belirleyin. Bütçe sonraki aylara otomatik taşınır.
          </EmptyState>
        ) : (
          data.rows.map((r) => <BudgetBar key={r.category.id} row={r} onClick={() => setEditing(r.category)} />)
        )}
      </Card>
      {data.others.length > 0 && (
        <Card title="Bütçe ekle">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.others.map((c) => (
              <button key={c.id} type="button" onClick={() => setEditing(c)} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-left text-sm hover:bg-surface-2">
                <span aria-hidden>{c.emoji}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <Plus size={16} className="text-muted" />
              </button>
            ))}
          </div>
        </Card>
      )}
      {editing && (
        <BudgetModal key={editing.id} category={editing} current={resolveBudget(budgets ?? [], editing.id, month)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
