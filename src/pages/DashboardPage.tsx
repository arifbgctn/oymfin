import { useMemo } from 'react';
import { BudgetBar } from '../components/BudgetBar';
import { DonutChart, TrendBars } from '../components/charts';
import { InstallBanner } from '../components/InstallBanner';
import { SummaryCards } from '../components/SummaryCards';
import { TransactionList } from '../components/TransactionList';
import { Badge, Card, EmptyState } from '../components/ui';
import { ACCOUNT_TYPE_EMOJI, accountsSummary } from '../domain/accounts';
import { budgetRows } from '../domain/budget';
import { formatPercent, formatSignedMoney, formatMoney } from '../domain/money';
import { addMonths, currentMonth } from '../domain/month';
import { portfolioSummary } from '../domain/portfolio';
import { categoryBreakdown, sortTransactions, summaryWithChange, trend } from '../domain/summary';
import {
  priceOf,
  useAccountMap,
  useAccounts,
  useAccountTransactions,
  useAssets,
  useBudgets,
  useCategories,
  useCategoryMap,
  usePriceMap,
  useTrades,
  useTransactionsLastMonths,
  useTransfers,
} from '../hooks/data';
import { usePriceRefresh } from '../prices/usePriceRefresh';
import { useApp } from '../state/AppContext';
import { hrefFor } from '../state/useHashRoute';

function AccountsCard() {
  const accounts = useAccounts();
  const txs = useAccountTransactions();
  const transfers = useTransfers();
  const s = useMemo(() => accountsSummary(accounts ?? [], txs ?? [], transfers ?? []), [accounts, txs, transfers]);
  if (!accounts || !txs || !transfers) return null;
  if (s.views.length === 0) {
    return (
      <a href={hrefFor('hesaplar')} className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted hover:bg-surface">
        <span className="text-2xl" aria-hidden>
          👛
        </span>
        <span>
          <strong className="block text-text">Hesaplarını ekle</strong>
          Banka kartı, kredi kartı ve nakit bakiyelerini tek yerde takip et.
        </span>
      </a>
    );
  }
  return (
    <a href={hrefFor('hesaplar')} data-testid="accounts-card" className="block rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-muted">Hesaplardaki net para</div>
          <div className={`mt-1 text-2xl font-bold tracking-tight ${s.net < 0 ? 'text-expense' : ''}`} data-testid="accounts-card-net">
            {formatMoney(s.net)}
          </div>
        </div>
        {s.creditDebt > 0 && (
          <div className="text-right text-xs text-muted">
            Kart borcu
            <div className="text-sm font-semibold text-expense tabular">{formatMoney(s.creditDebt)}</div>
          </div>
        )}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {s.views.slice(0, 4).map((v) => (
          <li key={v.account.id} className="flex items-center gap-2">
            <span aria-hidden>{ACCOUNT_TYPE_EMOJI[v.account.type]}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{v.account.name}</span>
            <span className={`tabular font-medium ${v.debt > 0 || v.balance < 0 ? 'text-expense' : ''}`}>
              {v.account.type === 'credit' ? (v.debt > 0 ? `${formatMoney(v.debt)} borç` : 'Borç yok') : formatMoney(v.balance)}
            </span>
          </li>
        ))}
      </ul>
    </a>
  );
}

function WealthCard() {
  const assets = useAssets();
  const trades = useTrades();
  const prices = usePriceMap();
  usePriceRefresh(assets);
  const s = useMemo(() => portfolioSummary((assets ?? []).filter((a) => !a.archived), trades ?? [], (a) => priceOf(a, prices)), [assets, trades, prices]);
  if (!assets) return null;
  if (assets.length === 0) {
    return (
      <a href={hrefFor('yatirim')} className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted hover:bg-surface">
        <span className="text-2xl" aria-hidden>
          📈
        </span>
        <span>
          <strong className="block text-text">Yatırımlarını ekle</strong>
          Altın, döviz, kripto ve hisselerin toplam değerini burada gör.
        </span>
      </a>
    );
  }
  const up = s.unrealizedKurus >= 0;
  return (
    <a href={hrefFor('yatirim')} data-testid="wealth-card" className="block rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-muted">Toplam Servet (yatırımlar)</div>
          <div className="mt-1 text-2xl font-bold tracking-tight" data-testid="wealth-value">
            {formatMoney(s.totalValueKurus)}
          </div>
        </div>
        {s.missingPrices > 0 && <Badge tone="warn">{s.missingPrices} varlığın fiyatı yok</Badge>}
      </div>
      <div className={`mt-1 text-sm font-semibold ${up ? 'text-income' : 'text-expense'}`}>
        {formatSignedMoney(s.unrealizedKurus)}
        {s.unrealizedPct !== null && ` (${s.unrealizedPct >= 0 ? '+' : ''}${formatPercent(s.unrealizedPct)})`}
        <span className="font-normal text-muted"> kâr/zarar</span>
      </div>
    </a>
  );
}

export function DashboardPage() {
  const { month, openTxForm } = useApp();
  const txs = useTransactionsLastMonths(month, 6);
  const categories = useCategories();
  const catMap = useCategoryMap();
  const accMap = useAccountMap();
  const budgets = useBudgets();

  const data = useMemo(() => {
    if (!txs || !categories) return null;
    const cur = txs.filter((t) => t.month === month);
    const prev = txs.filter((t) => t.month === addMonths(month, -1));
    return {
      cur,
      summary: summaryWithChange(cur, prev),
      breakdown: categoryBreakdown(cur, categories, 'expense', 5),
      trend: trend(txs, month, 6),
      alerts: budgetRows(budgets ?? [], categories, cur, month).filter((r) => r.status !== 'ok'),
      recent: sortTransactions(cur, 'date', 'desc').slice(0, 5),
    };
  }, [txs, categories, budgets, month]);

  if (!data) return null;
  const empty = data.cur.length === 0;

  return (
    <div className="space-y-4">
      <InstallBanner />
      <SummaryCards s={data.summary} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountsCard />
        <WealthCard />
      </div>
      {empty ? (
        <Card>
          <EmptyState icon="🌱" title="Bu ay henüz işlem yok">
            {month > currentMonth() ? 'Düzenli işlemler ayı gelince eklenir.' : (
              <button type="button" className="font-semibold text-accent" onClick={() => openTxForm()}>
                İlk işlemi ekle
              </button>
            )}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Giderler (kategoriye göre)">
            {data.breakdown.length ? (
              <DonutChart
                slices={data.breakdown}
                centerLabel="Toplam gider"
                centerValue={formatMoney(data.summary.current.expense)}
                ariaLabel="Kategorilere göre gider dağılımı"
              />
            ) : (
              <p className="text-sm text-muted">Bu ay gider yok.</p>
            )}
          </Card>
          <Card title="Son 6 ay" action={<a href={hrefFor('istatistik')} className="text-sm font-semibold text-accent">İstatistikler</a>}>
            <TrendBars data={data.trend} selected={month} />
          </Card>
        </div>
      )}
      {data.alerts.length > 0 && (
        <Card title="Bütçe uyarıları" action={<a href={hrefFor('butce')} className="text-sm font-semibold text-accent">Tümü</a>}>
          {data.alerts.map((r) => (
            <BudgetBar key={r.category.id} row={r} onClick={() => (window.location.hash = hrefFor('butce'))} />
          ))}
        </Card>
      )}
      {!empty && (
        <Card title="Son işlemler" action={<a href={hrefFor('islemler')} className="text-sm font-semibold text-accent">Tümü</a>}>
          <TransactionList items={data.recent} categories={catMap} accounts={accMap} onSelect={(t) => openTxForm(t)} grouped={false} />
        </Card>
      )}
    </div>
  );
}
