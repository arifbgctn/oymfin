import { Plus } from 'lucide-react';
import { useState } from 'react';
import { CategoryPicker } from '../components/TransactionForm';
import { AmountInput, Button, Card, ConfirmDialog, EmptyState, Field, inputClass, Modal, SegmentedTabs, useBusy } from '../components/ui';
import { runRecurring } from '../db/recurringRunner';
import { addRecurring, deleteRecurring, RepoError, setRecurringActive, updateRecurring } from '../db/repo';
import { formatAmountInput, formatTRY, parseTRY } from '../domain/money';
import { currentMonth, monthLabel } from '../domain/month';
import type { RecurringRule, TxType } from '../domain/types';
import { AccountPicker, suggestedAccountId } from '../components/AccountPicker';
import { useAccounts, useCategories, useCategoryMap, useRecurring } from '../hooks/data';
import { useApp } from '../state/AppContext';

interface FormState {
  type: TxType;
  amount: string;
  categoryId: string;
  description: string;
  day: string;
  startMonth: string;
  endMonth: string;
  accountId: string;
}

const toForm = (r: RecurringRule | undefined, defaultAccount: string): FormState =>
  r
    ? { type: r.type, amount: formatAmountInput(r.amountKurus), categoryId: r.categoryId, description: r.description, day: String(r.dayOfMonth), startMonth: r.startMonth, endMonth: r.endMonth ?? '', accountId: r.accountId ?? '' }
    : { type: 'expense', amount: '', categoryId: '', description: '', day: String(new Date().getDate()), startMonth: currentMonth(), endMonth: '', accountId: defaultAccount };

export function RecurringForm({ rule, onClose }: { rule?: RecurringRule; onClose: () => void }) {
  const { toast } = useApp();
  const categories = useCategories() ?? [];
  const accounts = useAccounts() ?? [];
  const [s, setS] = useState<FormState>(() => toForm(rule, ''));
  const [accountTouched, setAccountTouched] = useState(false);
  // Hesaplar yüklenince (kullanıcı seçmediyse) önerilen hesabı kullan
  const accountId = accountTouched || rule ? s.accountId : s.accountId || suggestedAccountId(accounts);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((p) => ({ ...p, [k]: v }));
  const options = categories.filter((c) => c.type === s.type && (!c.archived || c.id === s.categoryId));
  const day = Number(s.day);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountKurus = parseTRY(s.amount);
    if (amountKurus === null || amountKurus <= 0) return setError('Geçerli bir tutar girin');
    if (!options.some((c) => c.id === s.categoryId)) return setError('Kategori seçin');
    const cat = categories.find((c) => c.id === s.categoryId);
    const input = {
      type: s.type,
      amountKurus,
      categoryId: s.categoryId,
      description: s.description.trim() || cat?.name || '',
      dayOfMonth: day,
      startMonth: s.startMonth,
      endMonth: s.endMonth || undefined,
      accountId: accountId || undefined,
    };
    void run(async () => {
      try {
        if (rule) await updateRecurring(rule.id, input);
        else await addRecurring(input);
        const created = await runRecurring(currentMonth());
        toast(rule ? 'Düzenli işlem güncellendi' : created > 0 ? `Düzenli işlem eklendi (${created} kayıt oluşturuldu)` : 'Düzenli işlem eklendi');
        onClose();
      } catch (err) {
        setError(err instanceof RepoError ? err.message : 'Kaydedilemedi');
      }
    });
  };

  return (
    <Modal open onClose={onClose} title={rule ? 'Düzenli işlemi düzenle' : 'Yeni düzenli işlem'}>
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
        <Field label="Tutar">{(id) => <AmountInput id={id} value={s.amount} onChange={(v) => set('amount', v)} />}</Field>
        <div className="mb-3">
          <div className="mb-1 text-sm font-medium text-muted">Kategori</div>
          <CategoryPicker categories={options} value={s.categoryId} onChange={(id) => set('categoryId', id)} />
        </div>
        <AccountPicker
          accounts={accounts}
          value={accountId}
          onChange={(id) => {
            setAccountTouched(true);
            set('accountId', id);
          }}
          label={s.type === 'income' ? 'Hangi hesaba?' : 'Nereden ödenir?'}
        />
        <Field label="Açıklama">
          {(id) => <input id={id} className={inputClass} value={s.description} onChange={(e) => set('description', e.target.value)} placeholder="Örn. Kira, Maaş, Netflix" maxLength={80} />}
        </Field>
        <Field label="Ayın kaçında?" hint={day > 28 ? 'Kısa aylarda ayın son günü eklenir.' : undefined}>
          {(id) => (
            <select id={id} className={inputClass} value={s.day} onChange={(e) => set('day', e.target.value)}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlangıç ayı">
            {(id) => <input id={id} type="month" className={inputClass} value={s.startMonth} onChange={(e) => e.target.value && set('startMonth', e.target.value)} />}
          </Field>
          <Field label="Bitiş ayı (isteğe bağlı)">
            {(id) => <input id={id} type="month" className={inputClass} value={s.endMonth} onChange={(e) => set('endMonth', e.target.value)} />}
          </Field>
        </div>
        {rule && <p className="mb-3 text-xs text-muted">Değişiklikler henüz eklenmemiş aylara uygulanır; geçmiş kayıtlar değişmez.</p>}
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

export function RecurringPage() {
  const rules = useRecurring();
  const catMap = useCategoryMap();
  const { toast } = useApp();
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  if (!rules) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Kira, maaş, abonelik gibi her ay tekrarlayan işlemler ayın başında otomatik eklenir. Eklenen bir kaydı silerseniz o ay için tekrar eklenmez.</p>
      <Button onClick={() => setEditing('new')} className="w-full sm:w-auto">
        <Plus size={18} /> Düzenli işlem ekle
      </Button>
      <Card className="p-2!">
        {rules.length === 0 ? (
          <EmptyState icon="🔁" title="Henüz düzenli işlem yok" />
        ) : (
          <ul>
            {rules.map((r) => {
              const c = catMap.get(r.categoryId);
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5" data-testid="recurring-row">
                  <button type="button" onClick={() => setEditing(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg" aria-hidden>
                      {c?.emoji ?? '❔'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-medium ${r.active ? '' : 'text-muted line-through'}`}>{r.description}</span>
                      <span className="block truncate text-xs text-muted">
                        Her ayın {r.dayOfMonth}. günü · {monthLabel(r.startMonth)}
                        {r.endMonth ? ` – ${monthLabel(r.endMonth)}` : "'dan itibaren"}
                      </span>
                    </span>
                    <span className={`tabular shrink-0 font-semibold ${r.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {r.type === 'income' ? '+' : '−'}
                      {formatTRY(r.amountKurus)}
                    </span>
                  </button>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={r.active}
                      aria-label={`${r.description} aktif`}
                      onChange={async (e) => {
                        await setRecurringActive(r.id, e.target.checked);
                        if (e.target.checked) await runRecurring(currentMonth());
                      }}
                    />
                    <span className="h-7 w-12 rounded-full bg-surface-2 transition peer-checked:bg-accent after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
                  </label>
                  <Button variant="ghost" className="px-2! text-sm text-muted" onClick={() => setDeleting(r)} aria-label={`${r.description} sil`}>
                    Sil
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing && <RecurringForm rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title="Düzenli işlem silinsin mi?"
        message="Kural silinir; daha önce eklenmiş işlemler kalır."
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteRecurring(deleting.id);
          setDeleting(null);
          toast('Düzenli işlem silindi');
        }}
      />
    </div>
  );
}
