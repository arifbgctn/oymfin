import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedIfNeeded } from '../db/bootstrap';
import { db } from '../db/db';
import { addAccount, addTransaction } from '../db/repo';
import { todayLocal } from '../domain/month';
import { renderApp } from '../test/render';

const today = todayLocal();

describe('accounts page', () => {
  it('adds a bank account and a credit card with debt and limit', async () => {
    const { user } = await renderApp('#/hesaplar');
    expect(await screen.findByText('Henüz hesap yok')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Hesap ekle/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Yeni hesap' });
    await user.type(within(dialog).getByLabelText('Ad'), 'Ziraat');
    await user.type(within(dialog).getByLabelText('Güncel bakiye'), '10.000');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Hesap ekle/ }));
    dialog = await screen.findByRole('dialog', { name: 'Yeni hesap' });
    await user.click(within(dialog).getByRole('tab', { name: /Kredi/ }));
    await user.type(within(dialog).getByLabelText('Ad'), 'Bonus');
    await user.type(within(dialog).getByLabelText('Güncel kart borcu'), '2.500');
    await user.type(within(dialog).getByLabelText(/Kart limiti/), '20.000');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(screen.getAllByTestId('account-card')).toHaveLength(2));
    expect(screen.getByTestId('accounts-liquid')).toHaveTextContent('10.000,00 ₺');
    expect(screen.getByTestId('accounts-debt')).toHaveTextContent('2.500,00 ₺');
    expect(screen.getByTestId('accounts-net')).toHaveTextContent('7.500,00 ₺');
    const card = screen.getAllByTestId('account-card').find((c) => c.textContent?.includes('Bonus'))!;
    expect(card).toHaveTextContent('2.500,00 ₺ borç');
    expect(card).toHaveTextContent('kullanılabilir 17.500,00 ₺');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '13');
    const [cc] = await db.accounts.where('type').equals('credit').toArray();
    expect(cc).toMatchObject({ openingKurus: -250000, creditLimitKurus: 2000000 });
  });

  it('pays the credit card from the bank with a transfer', async () => {
    const bank = await addAccount({ name: 'Ziraat', type: 'bank', openingKurus: 1000000, openingDate: today });
    await addAccount({ name: 'Bonus', type: 'credit', openingKurus: -250000, openingDate: today });
    const { user } = await renderApp(`#/hesaplar/${bank.id}`);
    await user.click(await screen.findByRole('button', { name: /Aktarım yap/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Nereden')).toHaveValue(bank.id);
    await user.type(within(dialog).getByLabelText('Ödenen tutar'), '2.500');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Kart ödemesi kaydedildi')).toBeInTheDocument();
    expect(await screen.findByTestId('account-balance')).toHaveTextContent('7.500,00 ₺');
    expect(screen.getByText('Bonus hesabına')).toBeInTheDocument();
  });

  it('transaction form offers accounts and remembers the last one', async () => {
    await seedIfNeeded();
    await addAccount({ name: 'Ziraat', type: 'bank', openingKurus: 0, openingDate: today });
    const cash = await addAccount({ name: 'Cüzdan', type: 'cash', openingKurus: 50000, openingDate: today });
    const { user } = await renderApp('#/');
    await user.click(screen.getAllByRole('button', { name: 'İşlem ekle' })[0]!);
    let dialog = await screen.findByRole('dialog', { name: 'Yeni işlem' });
    // Varsayılan (ilk) hesap önerilir
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: /Ziraat/ })).toHaveAttribute('aria-checked', 'true'));
    await user.type(within(dialog).getByLabelText('Tutar'), '120');
    await user.click(within(dialog).getByRole('radio', { name: /Market/ }));
    await user.click(within(dialog).getByRole('radio', { name: /Cüzdan/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    await waitFor(async () => expect((await db.transactions.toArray())[0]?.accountId).toBe(cash.id));

    await user.click(screen.getAllByRole('button', { name: 'İşlem ekle' })[0]!);
    dialog = await screen.findByRole('dialog', { name: 'Yeni işlem' });
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: /Cüzdan/ })).toHaveAttribute('aria-checked', 'true'));
    // Seçili hesaba tekrar dokununca seçim kalkar
    await user.click(within(dialog).getByRole('radio', { name: /Cüzdan/ }));
    expect(within(dialog).getByRole('radio', { name: /Cüzdan/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('filters transactions by account and shows the account on rows', async () => {
    await seedIfNeeded();
    const bank = await addAccount({ name: 'Ziraat', type: 'bank', openingKurus: 0, openingDate: today });
    await addTransaction({ type: 'expense', amountKurus: 100, categoryId: 'cat-market', description: 'Kartla', date: today, accountId: bank.id });
    await addTransaction({ type: 'expense', amountKurus: 200, categoryId: 'cat-market', description: 'Hesapsız', date: today });
    const { user } = await renderApp('#/islemler');
    await screen.findAllByTestId('tx-row');
    expect(screen.getByRole('button', { name: /Kartla/ })).toHaveTextContent('Ziraat');
    await user.selectOptions(screen.getByLabelText('Hesaba göre filtrele'), bank.id);
    expect(screen.getAllByTestId('tx-row')).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Hesaba göre filtrele'), '__none');
    expect(screen.getAllByTestId('tx-row')[0]).toHaveTextContent('Hesapsız');
  });

  it('dashboard shows the accounts card', async () => {
    await addAccount({ name: 'Ziraat', type: 'bank', openingKurus: 1000000, openingDate: today });
    await addAccount({ name: 'Bonus', type: 'credit', openingKurus: -300000, openingDate: today });
    await renderApp('#/');
    expect(await screen.findByTestId('accounts-card-net')).toHaveTextContent('7.000,00 ₺');
    expect(screen.getByTestId('accounts-card')).toHaveTextContent('3.000,00 ₺ borç');
  });
});
