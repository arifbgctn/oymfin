import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { summaryWithChange } from '../domain/summary';
import type { Category, Transaction } from '../domain/types';
import { parseHash, hrefFor } from '../state/useHashRoute';
import { pwaState } from '../test/pwaRegisterMock';
import { renderWithApp } from '../test/render';
import { BudgetBar } from './BudgetBar';
import { DonutChart, TrendBars } from './charts';
import { MonthPicker } from './MonthPicker';
import { SummaryCards } from './SummaryCards';
import { UpdatePrompt } from './UpdatePrompt';

const cat: Category = { id: 'cat-market', name: 'Market', type: 'expense', color: '#eb6834', emoji: '🛒', archived: false, order: 1, isDefault: true, updatedAt: 0 };

const tx = (type: 'income' | 'expense', amountKurus: number, month = '2026-09'): Transaction => ({
  id: Math.random().toString(),
  type,
  amountKurus,
  categoryId: 'cat-market',
  description: '',
  date: `${month}-01`,
  month,
  createdAt: 1,
  updatedAt: 1,
});

describe('MonthPicker', () => {
  it('moves across year boundaries', async () => {
    const { user } = await renderWithApp(<MonthPicker />, '2026-01');
    expect(screen.getByTestId('month-label')).toHaveTextContent('Ocak 2026');
    await user.click(screen.getByRole('button', { name: 'Önceki ay' }));
    expect(screen.getByTestId('month-label')).toHaveTextContent('Aralık 2025');
    await user.click(screen.getByRole('button', { name: 'Sonraki ay' }));
    await user.click(screen.getByRole('button', { name: 'Sonraki ay' }));
    expect(screen.getByTestId('month-label')).toHaveTextContent('Şubat 2026');
  });
});

describe('SummaryCards', () => {
  it('shows formatted values and changes', () => {
    const s = summaryWithChange([tx('income', 2500000), tx('expense', 123456)], [tx('income', 2500000, '2026-08'), tx('expense', 100000, '2026-08')]);
    render(<SummaryCards s={s} />);
    expect(screen.getByTestId('card-income-value')).toHaveTextContent('25.000,00 ₺');
    expect(screen.getByTestId('card-expense-value')).toHaveTextContent('1.234,56 ₺');
    expect(screen.getByTestId('card-net-value')).toHaveTextContent('+23.765,44 ₺');
    expect(screen.getByTestId('card-savings-value')).toHaveTextContent('%95,1');
    // Gider arttı → kırmızı (kötü)
    const expenseChange = within(screen.getByTestId('card-expense')).getByText(/%23,5/);
    expect(expenseChange.closest('span')).toHaveClass('text-expense');
    expect(within(screen.getByTestId('card-income')).getByText('= geçen ay')).toBeInTheDocument();
  });

  it('shows a dash when last month had nothing', () => {
    render(<SummaryCards s={summaryWithChange([tx('expense', 500)], [])} />);
    expect(within(screen.getByTestId('card-expense')).getByText('— geçen ay')).toBeInTheDocument();
    expect(screen.getByTestId('card-savings-value')).toHaveTextContent('—');
  });
});

describe('BudgetBar', () => {
  it.each([
    [0.5, 'ok', 'Yolunda', 50],
    [0.85, 'warning', 'Sınıra yakın', 85],
    [1.2, 'over', 'Aşıldı', 100],
  ] as const)('ratio %d → %s', (ratio, status, label, now) => {
    render(<BudgetBar row={{ category: cat, limit: 100000, spent: ratio * 100000, ratio, status, remaining: 100000 - ratio * 100000 }} />);
    expect(screen.getByTestId('budget-row')).toHaveAttribute('data-status', status);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(now));
  });

  it('shows overspend amount', () => {
    render(<BudgetBar row={{ category: cat, limit: 100000, spent: 120000, ratio: 1.2, status: 'over', remaining: -20000 }} />);
    expect(screen.getByText(/200,00 ₺ fazla/)).toBeInTheDocument();
  });
});

describe('charts', () => {
  it('DonutChart renders slices, legend and hover details', async () => {
    const user = userEvent.setup();
    render(
      <DonutChart
        slices={[
          { id: 'a', name: 'Kira', color: '#2a78d6', value: 1500000, share: 0.75 },
          { id: '__other', name: 'Diğer', color: '#64748b', value: 500000, share: 0.25 },
        ]}
        centerLabel="Toplam gider"
        centerValue="20.000,00 ₺"
        ariaLabel="Gider dağılımı"
      />,
    );
    expect(screen.getAllByTestId('donut-slice')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Gider dağılımı' })).toBeInTheDocument();
    expect(screen.getByText('Toplam gider')).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: /Diğer/ }));
    expect(screen.getByText('5.000,00 ₺', { selector: 'span.font-bold' })).toBeInTheDocument();
  });

  it('TrendBars renders 6 month groups with a tooltip', async () => {
    const user = userEvent.setup();
    const data = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((month, i) => ({ month, income: 100000 * (i + 1), expense: 50000 }));
    render(<TrendBars data={data} selected="2026-09" />);
    expect(screen.getAllByTestId('trend-group')).toHaveLength(6);
    for (const l of ['Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl']) expect(screen.getByText(l)).toBeInTheDocument();
    await user.hover(screen.getByLabelText(/Eylül 2026: gelir 6.000,00 ₺/));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Eylül 2026');
    expect(tip).toHaveTextContent('5.500,00 ₺');
  });
});

describe('routing', () => {
  it('parses hashes', () => {
    expect(parseHash('')).toEqual({ name: 'ozet' });
    expect(parseHash('#/islemler')).toEqual({ name: 'islemler' });
    expect(parseHash('#/yatirim/abc%20d')).toEqual({ name: 'varlik', param: 'abc d' });
    expect(parseHash('#/bilinmeyen')).toEqual({ name: 'ozet' });
    expect(hrefFor('varlik', 'x y')).toBe('#/yatirim/x%20y');
    expect(hrefFor('ozet')).toBe('#/');
  });
});

describe('UpdatePrompt', () => {
  it('appears when a new version is ready', async () => {
    pwaState.needRefresh = false;
    const { unmount } = render(<UpdatePrompt />);
    expect(screen.queryByText('Yeni sürüm hazır.')).not.toBeInTheDocument();
    unmount();
    pwaState.needRefresh = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);
    await user.click(screen.getByRole('button', { name: 'Yenile' }));
    expect(pwaState.updateCalls).toBe(1);
    pwaState.needRefresh = false;
  });
});
