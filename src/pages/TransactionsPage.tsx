import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TransactionList } from '../components/TransactionList';
import { Card, EmptyState, IconButton, inputClass, SegmentedTabs } from '../components/ui';
import { formatMoney } from '../domain/money';
import { filterTransactions, monthSummary, sortTransactions, type SortDir, type SortKey, type TxFilter } from '../domain/summary';
import { useAccountMap, useAccounts, useCategories, useCategoryMap, useMonthTransactions } from '../hooks/data';
import { useApp } from '../state/AppContext';

export function TransactionsPage() {
  const { month, openTxForm } = useApp();
  const txs = useMonthTransactions(month);
  const cats = useCategories();
  const categories = useMemo(() => cats ?? [], [cats]);
  const catMap = useCategoryMap();
  const accounts = useAccounts() ?? [];
  const accMap = useAccountMap();
  const [accountFilter, setAccountFilter] = useState('');
  const [type, setType] = useState<TxFilter['type']>('all');
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [dir, setDir] = useState<SortDir>('desc');

  const list = useMemo(() => {
    const byAccount = accountFilter ? (txs ?? []).filter((t) => (accountFilter === '__none' ? !t.accountId : t.accountId === accountFilter)) : (txs ?? []);
    return sortTransactions(filterTransactions(byAccount, { type, q }, categories), sortKey, dir);
  }, [txs, type, q, categories, sortKey, dir, accountFilter]);
  const totals = useMemo(() => monthSummary(list), [list]);

  if (!txs) return null;

  return (
    <div className="space-y-3">
      <SegmentedTabs
        label="İşlem türü filtresi"
        value={type}
        onChange={setType}
        options={[
          { value: 'all', label: 'Tümü' },
          { value: 'income', label: 'Gelir' },
          { value: 'expense', label: 'Gider' },
        ]}
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className={`${inputClass} pl-9`} type="search" placeholder="Ara: açıklama, kategori, tutar" aria-label="İşlem ara" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Sırala" className={`${inputClass} w-auto`} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="date">Tarih</option>
          <option value="amount">Tutar</option>
          <option value="description">Açıklama</option>
        </select>
        <IconButton label={dir === 'desc' ? 'Azalan sıra (artana çevir)' : 'Artan sıra (azalana çevir)'} onClick={() => setDir((d) => (d === 'desc' ? 'asc' : 'desc'))} className="border border-border">
          {dir === 'desc' ? <ArrowDownWideNarrow size={20} /> : <ArrowUpNarrowWide size={20} />}
        </IconButton>
      </div>
      {accounts.length > 0 && (
        <select aria-label="Hesaba göre filtrele" className={inputClass} value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="">Tüm hesaplar</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.archived ? ' (arşiv)' : ''}
            </option>
          ))}
          <option value="__none">Hesap seçilmemiş</option>
        </select>
      )}
      {list.length > 0 && (
        <div className="flex justify-between px-1 text-sm text-muted tabular">
          <span>{list.length} işlem</span>
          <span>
            <span className="text-income">+{formatMoney(totals.income)}</span> · <span className="text-expense">−{formatMoney(totals.expense)}</span>
          </span>
        </div>
      )}
      <Card className="p-2!">
        {list.length === 0 ? (
          <EmptyState icon={q ? '🔍' : '🧾'} title={q || type !== 'all' ? 'Eşleşen işlem yok' : 'Bu ay işlem yok'}>
            {!q && (
              <button type="button" className="font-semibold text-accent" onClick={() => openTxForm()}>
                İşlem ekle
              </button>
            )}
          </EmptyState>
        ) : (
          <TransactionList items={list} categories={catMap} accounts={accMap} onSelect={(t) => openTxForm(t)} grouped={sortKey === 'date'} />
        )}
      </Card>
    </div>
  );
}
