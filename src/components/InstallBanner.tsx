import { X } from 'lucide-react';
import { useState } from 'react';
import { hrefFor } from '../state/useHashRoute';

const DISMISS_KEY = 'oymfin:installBannerDismissed';

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

export function isAppleDevice(ua = navigator.userAgent): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(ua);
}

/**
 * Safari sekmesinde açıldığında uyarır: ana ekrana / Dock'a eklenen uygulamanın deposu ayrıdır,
 * sekmede girilen veriler oraya taşınmaz.
 */
export function InstallBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || isStandalone() || !isAppleDevice()) return null;
  const mobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-3 text-sm" role="note">
      <span className="text-xl" aria-hidden>
        📲
      </span>
      <p className="flex-1">
        <strong>Önce {mobile ? 'Ana Ekrana' : "Dock'a"} ekleyin.</strong> Uygulama gibi açılır ve internetsiz çalışır. Bu sekmede girilen veriler eklenen uygulamaya taşınmaz.{' '}
        <a className="font-semibold text-accent underline" href={hrefFor('kurulum')}>
          Nasıl?
        </a>
      </p>
      <button
        type="button"
        aria-label="Kapat"
        className="text-muted"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            /* yok say */
          }
          setHidden(true);
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
