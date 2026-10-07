import { Repeat } from 'lucide-react';
import { formatMoney } from '../domain/money';
import { dayHeading } from '../domain/month';
import { groupByDate } from '../domain/summary';
import { ACCOUNT_TYPE_EMOJI } from '../domain/accounts';
import type { Account, Category, Transaction } from '../domain/types';

export function TransactionRow({ tx, category, account, onClick }: { tx: Transaction; category?: Category; account?: Account; onClick: () => void }) {
  const income = tx.type === 'income';
  return (
    <li>
      <button type="button" onClick={onClick} data-testid="tx-row" className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg" aria-hidden>
          {category?.emoji ?? '❔'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate font-medium">
            {tx.description || category?.name}
            {tx.recurringId && <Repeat size={13} className="shrink-0 text-muted" aria-label="Düzenli işlem" />}
          </span>
          <span className="block truncate text-xs text-muted">
            {category?.name ?? 'Kategorisiz'}
            {account ? ` · ${ACCOUNT_TYPE_EMOJI[account.type]} ${account.name}` : ''}
            {tx.note ? ` · ${tx.note}` : ''}
          </span>
        </span>
        <span className={`tabular shrink-0 font-semibold ${income ? 'text-income' : 'text-expense'}`}>
          {income ? '+' : '−'}
          {formatMoney(tx.amountKurus)}
        </span>
      </button>
    </li>
  );
}

/** Güne göre gruplanmış liste. */
export function TransactionList({
  items,
  categories,
  accounts,
  onSelect,
  grouped = true,
}: {
  items: Transaction[];
  categories: Map<string, Category>;
  accounts?: Map<string, Account>;
  onSelect: (t: Transaction) => void;
  grouped?: boolean;
}) {
  const acc = (t: Transaction) => (t.accountId ? accounts?.get(t.accountId) : undefined);
  if (!grouped) {
    return (
      <ul>
        {items.map((t) => (
          <TransactionRow key={t.id} tx={t} category={categories.get(t.categoryId)} account={acc(t)} onClick={() => onSelect(t)} />
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-3">
      {groupByDate(items).map((g) => (
        <section key={g.date} aria-label={dayHeading(g.date)}>
          <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{dayHeading(g.date)}</h3>
          <ul>
            {g.items.map((t) => (
              <TransactionRow key={t.id} tx={t} category={categories.get(t.categoryId)} account={acc(t)} onClick={() => onSelect(t)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
