import { useLiveQuery } from 'dexie-react-hooks';
import { CloudDownload, CloudUpload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, inputClass, SegmentedTabs } from '../components/ui';
import { setMeta } from '../db/db';
import { isPersisted, requestPersist } from '../db/persist';
import { importSyncText, markExported, readDataset, replaceFromSyncText, serializeDataset, syncFileName } from '../db/syncIO';
import { db } from '../db/db';
import { formatDateTimeShort } from '../domain/month';
import { SYNC_TABLES } from '../domain/types';
import { useMeta } from '../hooks/data';
import { useApp } from '../state/AppContext';
import { useTheme, type ThemePref } from '../state/theme';
import { hrefFor } from '../state/useHashRoute';
import { prefersShareSheet, readFileText, saveFile } from '../sync/share';

/** Tabloların değişimini izleyip dışa aktarılacak veriyi hazır tutar (paylaşım tıklamada anında açılsın). */
function useLiveDataset() {
  return useLiveQuery(async () => {
    // Bağımlılık olarak tüm senkron tablolarını oku.
    await Promise.all([...SYNC_TABLES.map((t) => db[t].count()), db.tombstones.count()]);
    return readDataset();
  }, []);
}

function SyncCard() {
  const { toast } = useApp();
  const dataset = useLiveDataset();
  const deviceName = useMeta<string>('deviceName') ?? 'Cihaz';
  const dirtySince = useMeta<number>('dirtySince');
  const lastExport = useMeta<number>('lastSyncExportAt');
  const lastImport = useMeta<number>('lastSyncImportAt');
  const lastImportFrom = useMeta<string>('lastSyncImportFrom');
  const mergeInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const share = prefersShareSheet();

  const doExport = () => {
    if (!dataset) return;
    const now = Date.now();
    // Arada await yok: iOS paylaşım sayfası kullanıcı hareketi gerektirir.
    const promise = saveFile(serializeDataset(dataset, deviceName, now), syncFileName(deviceName, now));
    void promise.then(async (outcome) => {
      if (outcome === 'cancelled') return;
      await markExported(now);
      toast(outcome === 'shared' ? 'Dosya paylaşıldı. iCloud Drive / oymfin klasörüne kaydettiğinizden emin olun.' : 'Senkron dosyası indirildi');
    });
  };

  const onMergeFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await importSyncText(await readFileText(file));
      if (!r.ok) return toast(r.error, 'error');
      const { added, updated, deleted } = r.stats;
      const summary = added + updated + deleted === 0 ? 'Zaten güncel' : `${added} yeni, ${updated} güncellendi, ${deleted} silindi`;
      toast(`${r.deviceName} ile eşitlendi: ${summary}${r.needsExport ? '. Diğer cihaz için tekrar kaydedin.' : ''}`);
    } catch {
      toast('Dosya okunamadı', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="iCloud ile eşitleme" action={dirtySince !== undefined ? <Badge tone="warn">Kaydedilmemiş değişiklik</Badge> : <Badge tone="ok">Güncel</Badge>}>
      <p className="mb-3 text-sm text-muted">
        iPhone ve Mac arasında veri taşımak için: cihaza geçince önce <strong className="text-text">Eşitle</strong>, işiniz bitince <strong className="text-text">Kaydet</strong>. Dosyalar iCloud Drive'daki <strong className="text-text">oymfin</strong> klasöründe durur; hangi dosyayı seçerseniz seçin veri kaybolmaz.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => mergeInput.current?.click()} disabled={busy}>
          <CloudDownload size={18} /> iCloud'dan eşitle
        </Button>
        <Button variant="secondary" onClick={doExport} disabled={!dataset}>
          <CloudUpload size={18} /> iCloud'a kaydet
        </Button>
      </div>
      <input ref={mergeInput} type="file" accept=".json,application/json" className="hidden" aria-label="Eşitleme dosyası seç" data-testid="merge-input" onChange={(e) => { void onMergeFile(e.target.files?.[0]); e.target.value = ''; }} />
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
        <div>
          <dt>Son kaydetme</dt>
          <dd className="font-medium text-text">{lastExport ? formatDateTimeShort(lastExport) : '—'}</dd>
        </div>
        <div>
          <dt>Son eşitleme</dt>
          <dd className="font-medium text-text">{lastImport ? `${formatDateTimeShort(lastImport)}${lastImportFrom ? ` · ${lastImportFrom}` : ''}` : '—'}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        {share ? 'Kaydet → paylaşım menüsünde "Dosyalara Kaydet" → iCloud Drive → oymfin.' : "Mac'te Safari indirme konumunu iCloud Drive/oymfin yapabilirsiniz."}{' '}
        <a href={hrefFor('kurulum')} className="font-semibold text-accent">
          Ayrıntılı anlatım
        </a>
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Yedekten tamamen geri yükle</summary>
        <p className="my-2 text-xs text-muted">Bu cihazdaki tüm veriler silinir ve seçilen dosyadaki verilerle değiştirilir.</p>
        <Button variant="danger" onClick={() => restoreInput.current?.click()}>
          Dosya seç ve geri yükle
        </Button>
        <input
          ref={restoreInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Geri yükleme dosyası seç"
          data-testid="restore-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setPendingRestore(await readFileText(f));
          }}
        />
      </details>
      <ConfirmDialog
        open={pendingRestore !== null}
        title="Tüm veriler değiştirilsin mi?"
        message="Bu cihazdaki mevcut tüm veriler silinecek ve dosyadakilerle değiştirilecek."
        confirmLabel="Geri yükle"
        onCancel={() => setPendingRestore(null)}
        onConfirm={async () => {
          const r = await replaceFromSyncText(pendingRestore ?? '');
          setPendingRestore(null);
          toast(r.ok ? 'Yedek geri yüklendi' : r.error, r.ok ? 'ok' : 'error');
        }}
      />
    </Card>
  );
}

function DeviceNameField() {
  const deviceName = useMeta<string>('deviceName');
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? deviceName ?? '';
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">Bu cihazın adı (senkron dosyasında görünür)</span>
      <input
        className={inputClass}
        value={shown}
        maxLength={30}
        onChange={(e) => setValue(e.target.value)}
        onBlur={async () => {
          if (value !== null && value.trim()) await setMeta('deviceName', value.trim());
          setValue(null);
        }}
      />
    </label>
  );
}

function StorageStatus() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    void isPersisted().then(setPersisted);
  }, []);
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">Kalıcı depolama</span>
      {persisted === true ? (
        <Badge tone="ok">Açık</Badge>
      ) : persisted === false ? (
        <Button variant="secondary" className="min-h-9! text-sm" onClick={async () => setPersisted(await requestPersist())}>
          İzin iste
        </Button>
      ) : (
        <Badge>Bilinmiyor</Badge>
      )}
    </div>
  );
}

export function SettingsPage() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="space-y-4">
      <SyncCard />
      <Card title="Görünüm">
        <SegmentedTabs<ThemePref>
          label="Tema"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Sistem' },
            { value: 'light', label: 'Açık' },
            { value: 'dark', label: 'Koyu' },
          ]}
        />
      </Card>
      <Card title="Cihaz ve veriler">
        <div className="space-y-3">
          <DeviceNameField />
          <StorageStatus />
          <p className="text-xs text-muted">Verileriniz yalnızca bu cihazda saklanır; hiçbir sunucuya gönderilmez. Uygulama internete yalnızca yatırım fiyatlarını almak için bağlanır.</p>
        </div>
      </Card>
      <p className="text-center text-xs text-muted">oymfin · sürüm {__APP_VERSION__}</p>
    </div>
  );
}
