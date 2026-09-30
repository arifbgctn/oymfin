import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

/** Yeni sürüm hazır olduğunda kullanıcıya sorar (yarım kalan formu kaybetmemek için otomatik yenilemez). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+9rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xl md:bottom-6">
      <span className="flex-1 text-sm font-medium">Yeni sürüm hazır.</span>
      <Button variant="secondary" onClick={() => setNeedRefresh(false)}>
        Sonra
      </Button>
      <Button onClick={() => void updateServiceWorker(true)}>Yenile</Button>
    </div>
  );
}
