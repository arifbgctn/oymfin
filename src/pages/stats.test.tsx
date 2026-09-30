import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LineChart, MonthBars, Sparkline } from '../components/statCharts';
import { seedIfNeeded } from '../db/bootstrap';
import { addTransaction } from '../db/repo';
import { addMonths, currentMonth } from '../domain/month';
import { renderApp } from '../test/render';

const m0 = currentMonth();
const m1 = addMonths(m0, -1);
const m2 = addMonths(m0, -2);

async function seedThreeMonths() {
  await seedIfNeeded();
  const add = (type: 'income' | 'expense', amountKurus: number, categoryId: string, date: string) =>
    addTransaction({ type, amountKurus, categoryId, description: categoryId, date });
  await add('income', 1000000, 'cat-maas', `${m2}-01`);
  await add('expense', 400000, 'cat-market', `${m2}-05`);
  await add('income', 1000000, 'cat-maas', `${m1}-01`);
  await add('expense', 800000, 'cat-market', `${m1}-05`);
  await add('income', 1000000, 'cat-maas', `${m0}-01`);
  await add('expense', 300000, 'cat-market', `${m0}-01`);
  await add('expense', 100000, 'cat-eglence', `${m0}-01`);
}

describe('StatsPage', () => {
  it('shows averages, charts and category trends', async () => {
    await seedThreeMonths();
    const { user } = await renderApp('#/istatistik');
    await user.click(await screen.findByRole('tab', { name: 'Son 3 ay' }));
    await waitFor(() => expect(screen.getByTestId('stat-avg-income-value')).toHaveTextContent('10.000,00 ₺'));
    expect(screen.getByTestId('stat-avg-expense-value')).toHaveTextContent('5.333,33 ₺');
    expect(screen.getByTestId('stat-total-net-value')).toHaveTextContent('+14.000,00 ₺');
    expect(screen.getAllByTestId('trend-group')).toHaveLength(3);
    expect(screen.getByTestId('max-expense-month')).toHaveTextContent('8.000,00 ₺');
    expect(screen.getByRole('img', { name: 'Aylara göre net birikim' })).toBeInTheDocument();
    expect(screen.getByTestId('pace-text')).toHaveTextContent('4.000,00 ₺');

    // Kategori trendleri: Market ilk sırada; Eğlence'ye tıklayınca detay değişir
    const rows = screen.getAllByTestId('category-trend-row');
    expect(rows[0]).toHaveTextContent('Market');
    expect(within(rows[0]!).getByText('▼', { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('selected-category')).toHaveTextContent('Market');
    await user.click(rows[1]!);
    expect(screen.getByTestId('selected-category')).toHaveTextContent('Eğlence');
    expect(rows[1]).toHaveAttribute('aria-pressed', 'true');

    // Aralık değişince çubuk sayısı değişir ve tercih saklanır
    await user.click(screen.getByRole('tab', { name: 'Son 12 ay' }));
    expect(screen.getAllByTestId('trend-group')).toHaveLength(12);
    expect(localStorage.getItem('oymfin:statsRange')).toBe('12');

    // Tablo görünümü
    await user.click(screen.getByText('Tablo olarak gör'));
    expect(screen.getAllByTestId('stats-table-row')).toHaveLength(12);
  });

  it('shows an empty state without data', async () => {
    await renderApp('#/istatistik');
    expect(await screen.findByText('Bu aralıkta veri yok')).toBeInTheDocument();
  });

  it('is reachable from the bottom navigation', async () => {
    const { user } = await renderApp('#/');
    await user.click(within(screen.getByRole('navigation', { name: 'Alt menü' })).getByRole('link', { name: 'İstatistik' }));
    expect(await screen.findByRole('tab', { name: 'Son 6 ay' })).toBeInTheDocument();
  });
});

describe('stat charts', () => {
  it('LineChart draws series, legend and tooltip', async () => {
    const user = userEvent.setup();
    render(
      <LineChart
        series={[
          { id: 'a', label: 'Bu ay', color: 'red', values: [100, 300, null] },
          { id: 'b', label: 'Geçen ay', color: 'gray', values: [-200, 50, 80], dashed: true },
        ]}
        xLabels={['1', '2', '3']}
        tooltipTitle={(i) => `${i + 1}. gün`}
        ariaLabel="deneme"
      />,
    );
    expect(screen.getAllByTestId('line-series')).toHaveLength(2);
    expect(screen.getByText('Geçen ay')).toBeInTheDocument();
    await user.hover(screen.getByLabelText(/3\. gün: Bu ay —, Geçen ay 0,80 ₺/));
    expect(screen.getByRole('tooltip')).toHaveTextContent('3. gün');
  });

  it('MonthBars shows average line and tooltip', async () => {
    const user = userEvent.setup();
    render(<MonthBars points={[{ month: '2026-08', value: 1000 }, { month: '2026-09', value: 3000 }]} color="blue" average={2000} ariaLabel="bars" />);
    expect(screen.getAllByTestId('month-bar')).toHaveLength(2);
    expect(screen.getByText(/ort\./)).toBeInTheDocument();
    await user.hover(screen.getByLabelText('Eylül 2026: 30,00 ₺'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Eylül 2026');
  });

  it('Sparkline renders with a label', () => {
    render(<Sparkline values={[1, 5, 3]} label="Market aylık eğilim" />);
    expect(screen.getByRole('img', { name: 'Market aylık eğilim' })).toBeInTheDocument();
  });
});
