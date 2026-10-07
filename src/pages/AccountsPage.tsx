import { ArrowLeftRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AmountInput, Badge, Button, Card, EmptyState, Field, inputClass, Modal, SegmentedTabs, useBusy } from '../components/ui';
import { addAccount, addTransfer, RepoError, updateAccount, updateTransfer } from '../db/repo';
import { ACCOUNT_TYPE_EMOJI, ACCOUNT_TYPE_LABELS, accountsSummary, openingFromInput, openingToInput, type AccountView } from '../domain/accounts';
import { formatAmountInput, formatPercent, formatMoney, parseMoney } from '../domain/money';
import { todayLocal } from '../domain/month';
import type { Account, AccountType, Transfer } from '../domain/types';
import { useAccounts, useAccountTransactions, useTransfers } from '../hooks/data';
import { useApp } from '../state/AppContext';
import { hrefFor } from '../state/useHashRoute';

/** Nakit/banka için eksi girişe izin verir (KMH / ek hesap). */
function parseSigned(input: string): number | null {
  const t = input.trim();
  const neg = t.startsWith('-') || t.startsWith('−');
  const v = parseMoney(neg ? t.slice(1) : t);
  return v === null ? null : neg ? -v : v;
}

export function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { toast } = useApp();
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [name, setName] = useState(account?.name ?? '');
  const [amount, setAmount] = useState(account ? formatAmountInput(openingToInput(account)) : '');
  const [limit, setLimit] = useState(account?.creditLimitKurus ? formatAmountInput(account.creditLimitKurus) : '');
  const [date, setDate] = useState(account?.openingDate ?? todayLocal());
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const credit = type === 'credit';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = amount.trim() === '' ? 0 : credit ? parseMoney(amount) : parseSigned(amount);
    if (entered === null) return setError(credit ? 'Geçerli bir borç tutarı girin' : 'Geçerli bir bakiye girin');
    const limitKurus = limit.trim() ? parseMoney(limit) : undefined;
    if (limitKurus === null) return setError('Geçerli bir limit girin');
    const input = {
      name: name.trim() || ACCOUNT_TYPE_LABELS[type],
      type,
      openingKurus: openingFromInput(type, entered),
      openingDate: date,
      creditLimitKurus: credit ? limitKurus : undefined,
      isDefault: isDefault || undefined,
    };
    void run(async () => {
      try {
        if (account) await updateAccount(account.id, { ...input, isDefault });
        else await addAccount(input);
        toast(account ? 'Hesap güncellendi' : 'Hesap eklendi');
        onClose();
      } catch (err) {
        setError(err instanceof RepoError ? err.message : 'Kaydedilemedi');
      }
    });
  };

  return (
    <Modal open onClose={onClose} title={account ? 'Hesabı düzenle' : 'Yeni hesap'}>
      <form onSubmit={submit} noValidate>
        <div className="mb-4">
          <SegmentedTabs<AccountType>
            label="Hesap türü"
            value={type}
            onChange={setType}
            options={[
              { value: 'bank', label: '🏦 Banka' },
              { value: 'credit', label: '💳 Kredi' },
              { value: 'cash', label: '💵 Nakit' },
            ]}
          />
        </div>
        <Field label="Ad">
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder={credit ? 'Örn. Bonus Kart' : type === 'bank' ? 'Örn. Ziraat Bankkart' : 'Örn. Cüzdan'}
            />
          )}
        </Field>
        <Field
          label={credit ? 'Güncel kart borcu' : 'Güncel bakiye'}
          hint={credit ? 'Kartta şu an ödenmemiş toplam borç. Borç yoksa boş bırakın.' : 'Eksi bakiye için başına - yazın (ör. -500).'}
        >
          {(id) => <AmountInput id={id} value={amount} onChange={setAmount} />}
        </Field>
        {credit && <Field label="Kart limiti (isteğe bağlı)">{(id) => <AmountInput id={id} value={limit} onChange={setLimit} />}</Field>}
        <Field label="Bakiye tarihi" hint="Bu tarihten itibaren girilen işlemler bakiyeyi otomatik değiştirir; daha eski işlemler bakiyeyi etkilemez.">
          {(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}
        </Field>
        <label className="mb-4 flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Varsayılan hesap (yeni işlemlerde önce bu önerilir)
        </label>
        {error && (
          <p role="alert" className="mb-3 text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}

export function TransferForm({ accounts, transfer, preset, onClose }: { accounts: Account[]; transfer?: Transfer; preset?: { from?: string; to?: string }; onClose: () => void }) {
  const { toast } = useApp();
  const active = accounts.filter((a) => !a.archived || a.id === transfer?.fromAccountId || a.id === transfer?.toAccountId);
  const [from, setFrom] = useState(transfer?.fromAccountId ?? preset?.from ?? active.find((a) => a.type !== 'credit')?.id ?? '');
  const [to, setTo] = useState(transfer?.toAccountId ?? preset?.to ?? active.find((a) => a.type === 'credit')?.id ?? '');
  const [amount, setAmount] = useState(transfer ? formatAmountInput(transfer.amountKurus) : '');
  const [date, setDate] = useState(transfer?.date ?? todayLocal());
  const [note, setNote] = useState(transfer?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const toAcc = accounts.find((a) => a.id === to);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const k = parseMoney(amount);
    if (k === null || k <= 0) return setError('Geçerli bir tutar girin');
    const input = { fromAccountId: from, toAccountId: to, amountKurus: k, date, note };
    void run(async () => {
      try {
        if (transfer) await updateTransfer(transfer.id, input);
        else await addTransfer(input);
        toast(toAcc?.type === 'credit' ? 'Kart ödemesi kaydedildi' : 'Aktarım kaydedildi');
        onClose();
      } catch (err) {
        setError(err instanceof RepoError ? err.message : 'Kaydedilemedi');
      }
    });
  };

  const select = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label}>
      {(id) => (
        <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Seçin</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {ACCOUNT_TYPE_EMOJI[a.type]} {a.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <Modal open onClose={onClose} title={transfer ? 'Aktarımı düzenle' : 'Aktarım / kart borcu ödeme'}>
      <form onSubmit={submit} noValidate>
        <p className="mb-3 text-xs text-muted">Hesaplar arası para hareketi gelir veya gider sayılmaz; yalnızca bakiyeleri değiştirir. Örn. bankadan kredi kartı borcu ödemek, bankadan nakit çekmek.</p>
        {select('Nereden', from, setFrom)}
        {select('Nereye', to, setTo)}
        <Field label={toAcc?.type === 'credit' ? 'Ödenen tutar' : 'Tutar'}>{(id) => <AmountInput id={id} value={amount} onChange={setAmount} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarih">{(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
          <Field label="Not (isteğe bağlı)">{(id) => <input id={id} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />}</Field>
        </div>
        {error && (
          <p role="alert" className="mb-3 text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}

export function AccountBalance({ v }: { v: AccountView }) {
  if (v.account.type === 'credit') {
    return (
      <span className="text-right">
        <span className={`block font-bold tabular ${v.debt > 0 ? 'text-expense' : ''}`} data-testid="account-balance">
          {v.debt > 0 ? `${formatMoney(v.debt)} borç` : v.balance > 0 ? `${formatMoney(v.balance)} artı` : 'Borç yok'}
        </span>
        {v.available !== null && <span className="block text-xs text-muted tabular">kullanılabilir {formatMoney(v.available)}</span>}
      </span>
    );
  }
  return (
    <span className={`font-bold tabular ${v.balance < 0 ? 'text-expense' : ''}`} data-testid="account-balance">
      {formatMoney(v.balance)}
    </span>
  );
}

export function AccountsPage() {
  const accounts = useAccounts();
  const txs = useAccountTransactions();
  const transfers = useTransfers();
  const { month } = useApp();
  const [form, setForm] = useState<'new' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const s = useMemo(() => accountsSummary(accounts ?? [], txs ?? [], transfers ?? [], month), [accounts, txs, transfers, month]);
  if (!accounts || !txs || !transfers) return null;
  const archived = accounts.filter((a) => a.archived);

  return (
    <div className="space-y-4">
      {s.views.length > 0 && (
        <Card>
          <div className="text-xs font-medium text-muted">Hesaplardaki net para</div>
          <div className={`mt-1 text-3xl font-bold tracking-tight ${s.net < 0 ? 'text-expense' : ''}`} data-testid="accounts-net">
            {formatMoney(s.net)}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Nakit + banka</dt>
              <dd className="font-semibold tabular" data-testid="accounts-liquid">
                {formatMoney(s.liquid)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Kredi kartı borcu</dt>
              <dd className={`font-semibold tabular ${s.creditDebt > 0 ? 'text-expense' : ''}`} data-testid="accounts-debt">
                {formatMoney(s.creditDebt)}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setForm('new')}>
          <Plus size={18} /> Hesap ekle
        </Button>
        {s.views.length >= 2 && (
          <Button variant="secondary" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight size={18} /> Aktarım / kart ödeme
          </Button>
        )}
      </div>

      {s.views.length === 0 ? (
        <Card>
          <EmptyState icon="👛" title="Henüz hesap yok">
            Banka kartınızı, kredi kartınızı ve nakdinizi güncel bakiyeleriyle ekleyin. İşlem girerken hangi hesaptan ödediğinizi seçtikçe bakiyeler kendiliğinden güncellenir.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.views.map((v) => (
            <a key={v.account.id} href={hrefFor('hesap', v.account.id)} data-testid="account-card" className="block min-w-0 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>
                  {ACCOUNT_TYPE_EMOJI[v.account.type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{v.account.name}</span>
                    {v.account.isDefault && <Badge tone="accent">Varsayılan</Badge>}
                  </span>
                  <span className="block text-xs text-muted">{ACCOUNT_TYPE_LABELS[v.account.type]}</span>
                </span>
                <AccountBalance v={v} />
              </div>
              {v.usage !== null && (
                <div className="mt-3">
                  <div
                    role="progressbar"
                    aria-label={`${v.account.name} limit kullanımı`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(v.usage * 100))}
                    className="h-2 overflow-hidden rounded-full bg-surface-2"
                  >
                    <div className={`h-full rounded-full ${v.usage > 0.9 ? 'bg-[#d03b3b]' : v.usage > 0.7 ? 'bg-[#fab219]' : 'bg-[var(--pal-0)]'}`} style={{ width: `${Math.min(100, v.usage * 100)}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted">Limitin {formatPercent(v.usage * 100, 0)} kullanılıyor</div>
                </div>
              )}
              {(v.monthIn > 0 || v.monthOut > 0) && (
                <div className="mt-2 text-xs text-muted tabular">
                  Bu ay: <span className="text-income">+{formatMoney(v.monthIn)}</span> · <span className="text-expense">−{formatMoney(v.monthOut)}</span>
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button type="button" className="text-sm font-semibold text-muted" onClick={() => setShowArchived((x) => !x)}>
            {showArchived ? 'Arşivi gizle' : `Arşivdeki hesaplar (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-1">
              {archived.map((a) => (
                <li key={a.id}>
                  <a href={hrefFor('hesap', a.id)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted hover:bg-surface-2">
                    <span aria-hidden>{ACCOUNT_TYPE_EMOJI[a.type]}</span> {a.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {form && <AccountForm onClose={() => setForm(null)} />}
      {transferOpen && <TransferForm accounts={accounts} onClose={() => setTransferOpen(false)} />}
    </div>
  );
}
