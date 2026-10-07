import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, EmptyState } from '../components/ui';
import { db } from '../db/db';
import { deleteAccount, deleteTransfer, RepoError, setAccountArchived } from '../db/repo';
import { ACCOUNT_TYPE_EMOJI, ACCOUNT_TYPE_LABELS, accountMovements, accountView, openingToInput } from '../domain/accounts';
import { formatSignedMoney, formatMoney } from '../domain/money';
import { dayHeading, formatDate } from '../domain/month';
import type { Transfer } from '../domain/types';
import { useAccountMap, useAccounts, useAccountTransactions, useCategoryMap, useTransfers } from '../hooks/data';
import { useApp } from '../state/AppContext';
import { hrefFor } from '../state/useHashRoute';
import { AccountBalance, AccountForm, TransferForm } from './AccountsPage';

export function AccountDetailPage({ id }: { id: string }) {
  const { month, toast, openTxForm } = useApp();
  const account = useLiveQuery(() => db.accounts.get(id), [id], null);
  const accounts = useAccounts() ?? [];
  const accMap = useAccountMap();
  const txs = useAccountTransactions();
  const transfers = useTransfers();
  const catMap = useCategoryMap();
  const [editing, setEditing] = useState(false);
  const [transfer, setTransfer] = useState<Transfer | 'new' | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState<Transfer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const data = useMemo(() => {
    if (!account || !txs || !transfers) return null;
    return { view: accountView(account, txs, transfers, month), moves: accountMovements(account.id, txs, transfers) };
  }, [account, txs, transfers, month]);

  if (account === null) return null;
  if (!account) {
    return (
      <Card>
        <EmptyState icon="🤷" title="Hesap bulunamadı">
          <a className="font-semibold text-accent" href={hrefFor('hesaplar')}>
            Hesaplara dön
          </a>
        </EmptyState>
      </Card>
    );
  }
  if (!data) return null;
  const { view, moves } = data;
  const credit = account.type === 'credit';
  const preset = credit ? { to: account.id } : { from: account.id };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <span className="text-3xl" aria-hidden>
            {ACCOUNT_TYPE_EMOJI[account.type]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-lg font-bold">
              <span className="truncate">{account.name}</span>
              {account.isDefault && <Badge tone="accent">Varsayılan</Badge>}
              {account.archived && <Badge>Arşivde</Badge>}
            </div>
            <div className="text-xs text-muted">{ACCOUNT_TYPE_LABELS[account.type]}</div>
          </div>
          <AccountBalance v={view} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Bu ay giren</dt>
            <dd className="font-semibold text-income tabular">+{formatMoney(view.monthIn)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Bu ay çıkan</dt>
            <dd className="font-semibold text-expense tabular">−{formatMoney(view.monthOut)}</dd>
          </div>
          {credit && account.creditLimitKurus !== undefined && (
            <div>
              <dt className="text-xs text-muted">Limit</dt>
              <dd className="font-semibold tabular">{formatMoney(account.creditLimitKurus)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">{credit ? 'Başlangıç borcu' : 'Başlangıç bakiyesi'}</dt>
            <dd className="font-semibold tabular">
              {formatMoney(openingToInput(account))} <span className="text-xs font-normal text-muted">({formatDate(account.openingDate)})</span>
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {accounts.filter((a) => !a.archived).length >= 2 && !account.archived && (
            <Button onClick={() => setTransfer('new')}>
              <ArrowLeftRight size={18} /> {credit ? 'Borç öde' : 'Aktarım yap'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
        </div>
      </Card>

      <h2 className="text-[15px] font-semibold">Hareketler</h2>
      <Card className="p-2!">
        {moves.length === 0 ? (
          <EmptyState icon="🧾" title="Henüz hareket yok">
            İşlem eklerken bu hesabı seçtiğinizde burada görünür.
          </EmptyState>
        ) : (
          <ul>
            {moves.map((m, i) => {
              const showHeading = i === 0 || moves[i - 1]!.date !== m.date;
              const beforeOpening = m.date < account.openingDate;
              if (m.kind === 'tx') {
                const c = catMap.get(m.tx.categoryId);
                return (
                  <li key={`t-${m.tx.id}`}>
                    {showHeading && <h3 className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{dayHeading(m.date)}</h3>}
                    <button type="button" onClick={() => openTxForm(m.tx)} data-testid="account-move" className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                      <span className="flex size-9 items-center justify-center rounded-full bg-surface-2" aria-hidden>
                        {c?.emoji ?? '❔'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.tx.description || c?.name}</span>
                        <span className="block text-xs text-muted">
                          {c?.name ?? 'Kategorisiz'}
                          {beforeOpening ? ' · bakiye tarihinden önce (bakiyeye dahil değil)' : ''}
                        </span>
                      </span>
                      <span className={`tabular font-semibold ${m.delta > 0 ? 'text-income' : 'text-expense'}`}>{formatSignedMoney(m.delta)}</span>
                    </button>
                  </li>
                );
              }
              const other = accMap.get(m.delta > 0 ? m.transfer.fromAccountId : m.transfer.toAccountId);
              return (
                <li key={`tr-${m.transfer.id}-${m.delta > 0 ? 'in' : 'out'}`}>
                  {showHeading && <h3 className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{dayHeading(m.date)}</h3>}
                  <div className="flex items-center gap-2 rounded-xl px-2 py-2.5" data-testid="account-move">
                    <button type="button" onClick={() => setTransfer(m.transfer)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="flex size-9 items-center justify-center rounded-full bg-surface-2" aria-hidden>
                        ↔
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {m.delta > 0 ? `${other?.name ?? '?'} hesabından` : `${other?.name ?? '?'} hesabına`}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          Aktarım{m.transfer.note ? ` · ${m.transfer.note}` : ''}
                          {beforeOpening ? ' · bakiye tarihinden önce' : ''}
                        </span>
                      </span>
                      <span className={`tabular font-semibold ${m.delta > 0 ? 'text-income' : 'text-expense'}`}>{formatSignedMoney(m.delta)}</span>
                    </button>
                    <Button variant="ghost" className="px-2! text-sm text-muted" aria-label="Aktarımı sil" onClick={() => setDeletingTransfer(m.transfer)}>
                      Sil
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Hesap ayarları">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await setAccountArchived(account.id, !account.archived);
              toast(account.archived ? 'Hesap arşivden çıkarıldı' : 'Hesap arşivlendi');
            }}
          >
            {account.archived ? 'Arşivden çıkar' : 'Arşivle'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Hesabı sil
          </Button>
        </div>
      </Card>

      {editing && <AccountForm account={account} onClose={() => setEditing(false)} />}
      {transfer && (
        <TransferForm accounts={accounts} transfer={transfer === 'new' ? undefined : transfer} preset={transfer === 'new' ? preset : undefined} onClose={() => setTransfer(null)} />
      )}
      <ConfirmDialog
        open={!!deletingTransfer}
        title="Aktarım silinsin mi?"
        message="Bu aktarım iki hesaptan da kaldırılacak."
        onCancel={() => setDeletingTransfer(null)}
        onConfirm={async () => {
          if (deletingTransfer) await deleteTransfer(deletingTransfer.id);
          setDeletingTransfer(null);
          toast('Aktarım silindi');
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Hesap silinsin mi?"
        message="Yalnızca hiç işlemi olmayan hesaplar silinebilir; diğerlerini arşivleyebilirsiniz."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteAccount(account.id);
            toast('Hesap silindi');
            window.location.hash = hrefFor('hesaplar');
          } catch (err) {
            toast(err instanceof RepoError ? err.message : 'Silinemedi', 'error');
          }
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
