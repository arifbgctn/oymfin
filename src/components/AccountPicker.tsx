import { ACCOUNT_TYPE_EMOJI } from '../domain/accounts';
import type { Account } from '../domain/types';
import { hrefFor } from '../state/useHashRoute';

export const LAST_ACCOUNT_KEY = 'oymfin:lastAccount';

export function rememberAccount(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    /* yok say */
  }
}

/** Yeni kayıt için önerilen hesap: son kullanılan (aktifse) → varsayılan → boş. */
export function suggestedAccountId(accounts: Account[]): string {
  const active = accounts.filter((a) => !a.archived);
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    /* yok say */
  }
  if (last && active.some((a) => a.id === last)) return last;
  return active.find((a) => a.isDefault)?.id ?? '';
}

/** Hesap seçimi (isteğe bağlı): seçili olana tekrar dokununca seçim kalkar. */
export function AccountPicker({ accounts, value, onChange, label = 'Hesap' }: { accounts: Account[]; value: string; onChange: (id: string) => void; label?: string }) {
  const options = accounts.filter((a) => !a.archived || a.id === value);
  return (
    <div className="mb-3">
      <div className="mb-1 text-sm font-medium text-muted">{label}</div>
      {options.length === 0 ? (
        <p className="text-xs text-muted">
          Nakit, banka kartı veya kredi kartı ekleyerek bakiyeleri takip edebilirsiniz.{' '}
          <a href={hrefFor('hesaplar')} className="font-semibold text-accent">
            Hesap ekle
          </a>
        </p>
      ) : (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
          {options.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={value === a.id}
              onClick={() => onChange(value === a.id ? '' : a.id)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
                value === a.id ? 'border-accent bg-accent-soft text-text' : 'border-border bg-surface-2 text-muted'
              }`}
            >
              <span aria-hidden>{ACCOUNT_TYPE_EMOJI[a.type]}</span>
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
