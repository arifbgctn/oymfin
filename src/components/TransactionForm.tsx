import { useEffect, useState } from 'react';
import { addTransaction, deleteTransaction, RepoError, updateTransaction } from '../db/repo';
import { formatAmountInput, parseTRY } from '../domain/money';
import { defaultDateFor, todayLocal } from '../domain/month';
import type { Category, Transaction, TxType } from '../domain/types';
import { useAccounts, useCategories } from '../hooks/data';
import { AccountPicker, rememberAccount, suggestedAccountId } from './AccountPicker';
import { useApp } from '../state/AppContext';
import { AmountInput, Button, ConfirmDialog, Field, inputClass, Modal, SegmentedTabs, useBusy } from './ui';

export function CategoryPicker({ categories, value, onChange }: { categories: Category[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Kategori" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          onClick={() => onChange(c.id)}
          className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 text-xs font-medium transition ${
            value === c.id ? 'border-accent bg-accent-soft text-text' : 'border-border bg-surface-2 text-muted'
          }`}
        >
          <span className="text-xl" aria-hidden>
            {c.emoji}
          </span>
          <span className="line-clamp-2 text-center leading-tight">{c.name}</span>
        </button>
      ))}
    </div>
  );
}

interface FormState {
  type: TxType;
  amount: string;
  categoryId: string;
  description: string;
  date: string;
  note: string;
  accountId: string;
}

function initialState(editing: Transaction | undefined, month: string, defaultAccount: string): FormState {
  if (editing) {
    return {
      type: editing.type,
      amount: formatAmountInput(editing.amountKurus),
      categoryId: editing.categoryId,
      description: editing.description,
      date: editing.date,
      note: editing.note ?? '',
      accountId: editing.accountId ?? '',
    };
  }
  return { type: 'expense', amount: '', categoryId: '', description: '', date: defaultDateFor(month, todayLocal()), note: '', accountId: defaultAccount };
}

export function TransactionForm() {
  const { txForm, closeTxForm, month, toast } = useApp();
  const categories = useCategories() ?? [];
  const accounts = useAccounts();
  const [s, setS] = useState<FormState>(() => initialState(txForm.editing, month, ''));
  const [errors, setErrors] = useState<{ amount?: string; category?: string; form?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, run] = useBusy();
  const editing = txForm.editing;

  const accountsLoaded = accounts !== undefined;
  useEffect(() => {
    if (txForm.open && accountsLoaded) {
      setS(initialState(txForm.editing, month, suggestedAccountId(accounts ?? [])));
      setErrors({});
    }
    // Hesap listesi her değiştiğinde formu sıfırlamamak için yalnızca yüklenme anı izlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txForm.open, txForm.editing, month, accountsLoaded]);

  const options = categories.filter((c) => c.type === s.type && (!c.archived || c.id === s.categoryId));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountKurus = parseTRY(s.amount);
    const errs: typeof errors = {};
    if (amountKurus === null || amountKurus <= 0) errs.amount = 'Geçerli bir tutar girin';
    if (!s.categoryId || !options.some((c) => c.id === s.categoryId)) errs.category = 'Kategori seçin';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const cat = categories.find((c) => c.id === s.categoryId);
    const input = {
      type: s.type,
      amountKurus: amountKurus!,
      categoryId: s.categoryId,
      description: s.description.trim() || cat?.name || '',
      note: s.note,
      date: s.date,
      accountId: s.accountId || undefined,
    };
    void run(async () => {
      try {
        if (editing) await updateTransaction(editing.id, input);
        else await addTransaction(input);
        rememberAccount(input.accountId);
        toast(editing ? 'İşlem güncellendi' : 'İşlem eklendi');
        closeTxForm();
      } catch (err) {
        setErrors({ form: err instanceof RepoError ? err.message : 'Kaydedilemedi' });
      }
    });
  };

  const doDelete = () =>
    void run(async () => {
      if (!editing) return;
      await deleteTransaction(editing.id);
      setConfirmDelete(false);
      toast('İşlem silindi');
      closeTxForm();
    });

  return (
    <>
      <Modal open={txForm.open && !confirmDelete} onClose={closeTxForm} title={editing ? 'İşlemi düzenle' : 'Yeni işlem'}>
        <form onSubmit={submit} noValidate>
          <div className="mb-4">
            <SegmentedTabs
              label="İşlem türü"
              value={s.type}
              onChange={(t) => setS((p) => ({ ...p, type: t, categoryId: p.type === t ? p.categoryId : '' }))}
              options={[
                { value: 'expense', label: 'Gider' },
                { value: 'income', label: 'Gelir' },
              ]}
            />
          </div>
          <Field label="Tutar" error={errors.amount}>
            {(id) => <AmountInput id={id} value={s.amount} onChange={(v) => set('amount', v)} invalid={!!errors.amount} />}
          </Field>
          <div className="mb-3">
            <div className="mb-1 text-sm font-medium text-muted">Kategori</div>
            <CategoryPicker categories={options} value={s.categoryId} onChange={(id) => set('categoryId', id)} />
            {errors.category && (
              <p role="alert" className="mt-1 text-sm text-expense">
                {errors.category}
              </p>
            )}
          </div>
          <AccountPicker accounts={accounts ?? []} value={s.accountId} onChange={(id) => set('accountId', id)} label={s.type === 'income' ? 'Hangi hesaba?' : 'Nereden ödendi?'} />
          <Field label="Açıklama">
            {(id) => <input id={id} className={inputClass} value={s.description} onChange={(e) => set('description', e.target.value)} placeholder="Örn. Haftalık market" maxLength={80} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarih">
              {(id) => <input id={id} type="date" className={inputClass} value={s.date} onChange={(e) => e.target.value && set('date', e.target.value)} required />}
            </Field>
            <Field label="Not (isteğe bağlı)">
              {(id) => <input id={id} className={inputClass} value={s.note} onChange={(e) => set('note', e.target.value)} maxLength={200} />}
            </Field>
          </div>
          {editing?.recurringId && <p className="mb-3 text-xs text-muted">🔁 Bu işlem bir düzenli işlemden eklendi. Burada yaptığınız değişiklik yalnızca bu ayı etkiler.</p>}
          {errors.form && (
            <p role="alert" className="mb-3 text-sm text-expense">
              {errors.form}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {editing && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Sil
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={busy}>
              {editing ? 'Kaydet' : 'Ekle'}
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="İşlem silinsin mi?"
        message="Bu işlem kalıcı olarak silinecek."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </>
  );
}
