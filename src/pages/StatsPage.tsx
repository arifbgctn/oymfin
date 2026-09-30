import { useMemo, useState } from 'react';
import { TrendBars } from '../components/charts';
import { StatCard } from '../components/SummaryCards';
import { LineChart, MonthBars, Sparkline } from '../components/statCharts';
import { Card, EmptyState, SegmentedTabs } from '../components/ui';
import { formatCompactTRY, formatPercent, formatSignedTRY, formatTRY } from '../domain/money';
import { addMonths, currentMonth, daysInMonth, monthLabel, shortMonthLabel, todayLocal } from '../domain/month';
import { chartColor } from '../domain/seed';
import { categoryTrends, cumulativeDaily, paceComparison, rangeStats, type CategoryTrend } from '../domain/stats';
import { useCategories, useTransactionsLastMonths } from '../hooks/data';
import { useApp } from '../state/AppContext';

type Range = '3' | '6' | '12';
const RANGE_KEY = 'oymfin:statsRange';

function loadRange(): Range {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    return v === '3' || v === '12' ? v : '6';
  } catch {
    return '6';
  }
}

function ChangeBadge({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) {
  if (value === null) return <span className="text-xs text-muted">yeni</span>;
  const r = Math.round(value);
  if (r === 0) return <span className="text-xs text-muted">ortalamada</span>;
  const up = r > 0;
  return (
    <span className={`text-xs font-semibold ${up === goodWhenUp ? 'text-income' : 'text-expense'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {formatPercent(Math.abs(r), 0)}
      <span className="sr-only"> ortalamaya göre {up ? 'fazla' : 'az'}</span>
    </span>
  );
}

function CategoryRow({ t, active, onClick }: { t: CategoryTrend; active: boolean; onClick: () => void }) {
  const name = t.category?.name ?? 'Kategorisiz';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        data-testid="category-trend-row"
        className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
      >
        <span className="text-lg" aria-hidden>
          {t.category?.emoji ?? '❔'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs whitespace-nowrap text-muted tabular">ort. {formatCompactTRY(t.average)}</span>
        </span>
        <Sparkline values={t.series} color={chartColor(t.category?.color ?? '#64748b')} label={`${name} aylık eğilim`} />
        <span className="w-24 text-right">
          <span className="block text-sm font-semibold tabular">{formatTRY(t.current)}</span>
          <ChangeBadge value={t.changeVsAverage} goodWhenUp={false} />
        </span>
      </button>
    </li>
  );
}

export function StatsPage() {
  const { month } = useApp();
  const [range, setRangeState] = useState<Range>(loadRange);
  const n = Number(range);
  const setRange = (r: Range) => {
    setRangeState(r);
    try {
      localStorage.setItem(RANGE_KEY, r);
    } catch {
      /* yok say */
    }
  };
  // Harcama hızı karşılaştırması için en az 2 ay gerekir.
  const txs = useTransactionsLastMonths(month, Math.max(n, 2));
  const categories = useCategories();
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const data = useMemo(() => {
    if (!txs || !categories) return null;
    const stats = rangeStats(txs, month, n);
    const cats = categoryTrends(txs, categories, month, n, 'expense');
    const today = todayLocal();
    const isCurrent = month === currentMonth();
    const isFuture = month > currentMonth();
    const upto = isCurrent ? Number(today.slice(8, 10)) : undefined;
    const prevMonth = addMonths(month, -1);
    const days = Math.max(daysInMonth(month), daysInMonth(prevMonth));
    const cur = isFuture ? [] : cumulativeDaily(txs, month, upto);
    const prev = cumulativeDaily(txs, prevMonth);
    const pad = (a: (number | null)[]) => Array.from({ length: days }, (_, i) => (i < a.length ? a[i]! : null));
    const paceDay = upto ?? daysInMonth(month);
    return { stats, cats, cur: pad(cur), prev: pad(prev), days, isFuture, pace: paceComparison(txs, month, paceDay), paceDay };
  }, [txs, categories, month, n]);

  if (!data) return null;
  const { stats } = data;
  const selected = data.cats.find((c) => c.categoryId === selectedCat) ?? data.cats[0];

  return (
    <div className="space-y-4">
      <SegmentedTabs
        label="Zaman aralığı"
        value={range}
        onChange={setRange}
        options={[
          { value: '3', label: 'Son 3 ay' },
          { value: '6', label: 'Son 6 ay' },
          { value: '12', label: 'Son 12 ay' },
        ]}
      />

      {stats.activeMonths === 0 ? (
        <Card>
          <EmptyState icon="📊" title="Bu aralıkta veri yok">
            İşlem ekledikçe aylar arası karşılaştırmalar burada görünür.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard testId="stat-avg-income" label="Ort. aylık gelir" value={formatTRY(stats.avgIncome)} change={<span className="text-xs text-muted">{stats.activeMonths} ay verisi</span>} />
            <StatCard testId="stat-avg-expense" label="Ort. aylık gider" value={formatTRY(stats.avgExpense)} change={<span className="text-xs text-muted">toplam {formatTRY(stats.totalExpense)}</span>} />
            <StatCard
              testId="stat-avg-savings"
              label="Ort. tasarruf oranı"
              value={stats.avgSavingsRate === null ? '—' : formatPercent(stats.avgSavingsRate)}
              change={<span className="text-xs text-muted">geliri olan aylar</span>}
            />
            <StatCard
              testId="stat-total-net"
              label={`${n} ayda birikim`}
              value={formatSignedTRY(stats.totalNet)}
              change={<span className="text-xs text-muted">ort. {formatSignedTRY(stats.avgNet)}/ay</span>}
            />
          </div>

          <Card title="Gelir ve gider">
            <TrendBars data={stats.months} selected={month} />
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {stats.maxExpenseMonth && (
                <div className="rounded-xl bg-surface-2 p-2">
                  <dt className="text-muted">En çok harcanan ay</dt>
                  <dd className="font-semibold" data-testid="max-expense-month">
                    {monthLabel(stats.maxExpenseMonth.month)} · {formatTRY(stats.maxExpenseMonth.expense)}
                  </dd>
                </div>
              )}
              {stats.minExpenseMonth && (
                <div className="rounded-xl bg-surface-2 p-2">
                  <dt className="text-muted">En az harcanan ay</dt>
                  <dd className="font-semibold">
                    {monthLabel(stats.minExpenseMonth.month)} · {formatTRY(stats.minExpenseMonth.expense)}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Aylık net (gelir − gider)">
              <LineChart
                series={[{ id: 'net', label: 'Net', color: 'var(--pal-0)', values: stats.months.map((m) => m.net) }]}
                xLabels={stats.months.map((m) => shortMonthLabel(m.month))}
                tooltipTitle={(i) => monthLabel(stats.months[i]!.month)}
                ariaLabel="Aylara göre net birikim"
              />
              {stats.bestMonth && stats.worstMonth && (
                <p className="mt-2 text-xs text-muted">
                  En iyi ay <strong className="text-text">{monthLabel(stats.bestMonth.month)}</strong> ({formatSignedTRY(stats.bestMonth.net)}), en zayıf ay{' '}
                  <strong className="text-text">{monthLabel(stats.worstMonth.month)}</strong> ({formatSignedTRY(stats.worstMonth.net)}).
                </p>
              )}
            </Card>

            <Card title="Harcama hızı: bu ay ve geçen ay">
              {data.isFuture ? (
                <p className="text-sm text-muted">Bu ay henüz başlamadı.</p>
              ) : (
                <>
                  <LineChart
                    series={[
                      { id: 'cur', label: monthLabel(month), color: 'var(--pal-0)', values: data.cur },
                      { id: 'prev', label: monthLabel(addMonths(month, -1)), color: 'var(--muted)', values: data.prev, dashed: true },
                    ]}
                    xLabels={Array.from({ length: data.days }, (_, i) => String(i + 1))}
                    tooltipTitle={(i) => `${i + 1}. gün (toplam gider)`}
                    ariaLabel="Güne göre kümülatif gider, bu ay ve geçen ay"
                    labelEvery={5}
                  />
                  <p className="mt-2 text-xs text-muted" data-testid="pace-text">
                    Ayın {data.paceDay}. gününe kadar <strong className="text-text">{formatTRY(data.pace.current)}</strong> harcandı
                    {data.pace.change === null ? '.' : (
                      <>
                        ; geçen ayın aynı gününe göre{' '}
                        <strong className={data.pace.change > 0 ? 'text-expense' : 'text-income'}>
                          {formatPercent(Math.abs(data.pace.change), 0)} {data.pace.change > 0 ? 'daha fazla' : 'daha az'}
                        </strong>
                        .
                      </>
                    )}
                  </p>
                </>
              )}
            </Card>
          </div>

          {data.cats.length > 0 && selected && (
            <Card title="Kategorilere göre aylık gider">
              <p className="mb-2 text-xs text-muted">Bir kategoriye dokunun; son ayı önceki ayların ortalamasıyla karşılaştırır (▲ ortalamadan fazla harcama).</p>
              <div className="mb-3 rounded-xl bg-surface-2 p-3">
                <div className="mb-1 text-sm font-semibold" data-testid="selected-category">
                  {selected.category?.emoji} {selected.category?.name ?? 'Kategorisiz'}
                </div>
                <MonthBars
                  points={stats.months.map((m, i) => ({ month: m.month, value: selected.series[i] ?? 0 }))}
                  color={chartColor(selected.category?.color ?? '#64748b')}
                  average={selected.average}
                  ariaLabel={`${selected.category?.name ?? 'Kategori'} aylık gider`}
                />
              </div>
              <ul>
                {data.cats.map((t) => (
                  <CategoryRow key={t.categoryId} t={t} active={t.categoryId === selected.categoryId} onClick={() => setSelectedCat(t.categoryId)} />
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Tablo olarak gör</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm tabular">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 pr-2 font-medium">Ay</th>
                      <th className="py-1 pr-2 text-right font-medium">Gelir</th>
                      <th className="py-1 pr-2 text-right font-medium">Gider</th>
                      <th className="py-1 pr-2 text-right font-medium">Net</th>
                      <th className="py-1 text-right font-medium">Tasarruf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.months].reverse().map((m) => (
                      <tr key={m.month} className="border-t border-border" data-testid="stats-table-row">
                        <td className="py-1.5 pr-2">{monthLabel(m.month)}</td>
                        <td className="py-1.5 pr-2 text-right">{formatTRY(m.income)}</td>
                        <td className="py-1.5 pr-2 text-right">{formatTRY(m.expense)}</td>
                        <td className={`py-1.5 pr-2 text-right ${m.net < 0 ? 'text-expense' : ''}`}>{formatSignedTRY(m.net)}</td>
                        <td className="py-1.5 text-right">{m.savingsRate === null ? '—' : formatPercent(m.savingsRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
